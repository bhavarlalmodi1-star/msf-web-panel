import { NextResponse } from "next/server";
import admin from "../../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../../middleware/authMiddleware";

const db = admin.firestore();

export async function GET(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin', 'admin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

    const url    = new URL(req.url);
    const period = url.searchParams.get('period') || 'monthly';
    const metric = url.searchParams.get('metric') || 'overall';

    // ── Date range ────────────────────────────────────────────────────────────
    const nowDate = new Date();
    let startDate;
    switch (period) {
      case 'daily':
        startDate = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
        break;
      case 'weekly': {
        const dow  = nowDate.getDay();
        const diff = dow === 0 ? 6 : dow - 1;
        startDate  = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - diff);
        break;
      }
      case 'monthly':
        startDate = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1);
        break;
      case 'yearly':
        startDate = new Date(nowDate.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(2000, 0, 1);
    }
    const startTS = admin.firestore.Timestamp.fromDate(startDate);
    const endTS   = admin.firestore.Timestamp.fromDate(nowDate);

    // ── Fetch all active agents ───────────────────────────────────────────────
    const agentsSnap = await db.collection('agents')
      .where('active_flag', '==', true)
      .where('delete_flag', '==', false)
      .get();

    if (agentsSnap.empty)
      return NextResponse.json({ success: true, agents: [], summary: {}, period, metric,
        dateRange: { start: startDate.toISOString(), end: nowDate.toISOString() } });

    const agentMap = {};
    agentsSnap.forEach(d => {
      const a = d.data();
      agentMap[d.id] = {
        id: d.id,
        name: a.name || '',
        fatherName: a.fatherName || '',
        phone1:   a.phone1   || '',
        village:  a.village  || '',
        district: a.district || '',
        photoUrl: a.photoUrl || '',
        lifetimeMembers:         a.memberCount           || 0,
        lifetimeJoinFeesPaid:    a.totalJoinFeesPaid     || 0,
        lifetimeJoinFeesPending: a.totalJoinFeesPending  || 0,
        lifetimeClosingPaid:     a.closing_paidAmount    || 0,
        lifetimeClosingPending:  a.closing_pendingAmount || 0,
        lifetimeCommission:      a.totalCommissionEarned || 0,
        walletBalance:           a.walletBalance         || 0,
      };
    });

    const chunkArr = (arr, n) =>
      Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

    // ── 1. Members created in period (all statuses) ───────────────────────────
    const membersPeriodSnap = await db.collection('members')
      .where('createdAt', '>=', startTS)
      .where('createdAt', '<=', endTS)
      .get();

    const periodNewMembers = {}, periodRequests = {};
    membersPeriodSnap.forEach(d => {
      const m = d.data();
      if (!m.agentId || !agentMap[m.agentId] || m.delete_flag) return;
      const aid = m.agentId;
      if (m.status === 'pending_approval' || m.status === 'rejected') {
        periodRequests[aid] = (periodRequests[aid] || 0) + 1;
      } else {
        periodNewMembers[aid] = (periodNewMembers[aid] || 0) + 1;
      }
    });

    // ── 2. All-time pending requests per agent ────────────────────────────────
    // NOTE: do NOT add .where('delete_flag', '!=', true) — Firestore inequality
    // on a different field needs a composite index AND silently drops docs where
    // the field doesn't exist. Filter in JS instead.
    const pendingSnap = await db.collection('members')
      .where('status', '==', 'pending_approval')
      .get();
    const pendingRequests = {};
    pendingSnap.forEach(d => {
      const m = d.data();
      if (m.delete_flag === true) return; // skip deleted in JS
      if (m.agentId && agentMap[m.agentId])
        pendingRequests[m.agentId] = (pendingRequests[m.agentId] || 0) + 1;
    });

    // ── 3. All-time rejected per agent ────────────────────────────────────────
    const rejectedSnap = await db.collection('members')
      .where('status', '==', 'rejected')
      .get();
    const rejectedRequests = {};
    rejectedSnap.forEach(d => {
      const m = d.data();
      if (m.delete_flag === true) return; // skip deleted in JS
      if (m.agentId && agentMap[m.agentId])
        rejectedRequests[m.agentId] = (rejectedRequests[m.agentId] || 0) + 1;
    });

    // ── 4. Join fees in period ────────────────────────────────────────────────
    const joinFeesSnap = await db.collection('memberJoinFees')
      .where('createdAt', '>=', startTS)
      .where('createdAt', '<=', endTS)
      .get();
    const periodJoinFees = {};
    const unresolvedIds  = new Set();
    joinFeesSnap.forEach(d => {
      const data = d.data();
      if (data.agentId && agentMap[data.agentId]) {
        periodJoinFees[data.agentId] = (periodJoinFees[data.agentId] || 0) + (data.amount || 0);
      } else if (data.memberId) unresolvedIds.add(data.memberId);
    });

    // ── 5. Closing fees in period ─────────────────────────────────────────────
    const closingSnap = await db.collection('memberClosingFees')
      .where('createdAt', '>=', startTS)
      .where('createdAt', '<=', endTS)
      .get();
    const periodClosing = {};
    closingSnap.forEach(d => {
      const data = d.data();
      if (data.agentId && agentMap[data.agentId]) {
        periodClosing[data.agentId] = (periodClosing[data.agentId] || 0) + (data.amount || 0);
      } else if (data.memberId) unresolvedIds.add(data.memberId);
    });

    // ── 6. Resolve memberId → agentId for orphaned txns ──────────────────────
    if (unresolvedIds.size > 0) {
      const midToAid = {};
      for (const ids of chunkArr([...unresolvedIds], 30)) {
        const snap = await db.collection('members')
          .where(admin.firestore.FieldPath.documentId(), 'in', ids).get();
        snap.forEach(d => { midToAid[d.id] = d.data().agentId || null; });
      }
      joinFeesSnap.forEach(d => {
        const data = d.data();
        if (!data.agentId) {
          const aid = midToAid[data.memberId];
          if (aid && agentMap[aid])
            periodJoinFees[aid] = (periodJoinFees[aid] || 0) + (data.amount || 0);
        }
      });
      closingSnap.forEach(d => {
        const data = d.data();
        if (!data.agentId) {
          const aid = midToAid[data.memberId];
          if (aid && agentMap[aid])
            periodClosing[aid] = (periodClosing[aid] || 0) + (data.amount || 0);
        }
      });
    }

    // ── 7. Commission in period ───────────────────────────────────────────────
    const commSnap = await db.collection('commissionTransactions')
      .where('createdAt', '>=', startTS)
      .where('createdAt', '<=', endTS)
      .where('type', '==', 'credit')
      .get();
    const periodCommission = {};
    commSnap.forEach(d => {
      const data = d.data();
      if (data.agentId && agentMap[data.agentId])
        periodCommission[data.agentId] = (periodCommission[data.agentId] || 0) + (data.amount || 0);
    });

    // ── Build results ─────────────────────────────────────────────────────────
    const results = Object.values(agentMap).map(agent => {
      const nM   = periodNewMembers[agent.id]  || 0;
      const jF   = periodJoinFees[agent.id]    || 0;
      const cF   = periodClosing[agent.id]     || 0;
      const comm = periodCommission[agent.id]  || 0;
      const pReq = pendingRequests[agent.id]   || 0;
      const rReq = rejectedRequests[agent.id]  || 0;
      const prReq= periodRequests[agent.id]    || 0;

      const totalRequested = agent.lifetimeMembers + rReq + pReq;
      const approvalRate   = totalRequested > 0
        ? Math.round((agent.lifetimeMembers / totalRequested) * 100) : 100;

      const totalCollected = agent.lifetimeJoinFeesPaid + agent.lifetimeClosingPaid;
      const totalExpected  = totalCollected + agent.lifetimeJoinFeesPending + agent.lifetimeClosingPending;
      const efficiency     = totalExpected > 0
        ? Math.round((totalCollected / totalExpected) * 10000) / 100 : 0;

      return {
        id: agent.id, name: agent.name, fatherName: agent.fatherName,
        phone1: agent.phone1, village: agent.village, district: agent.district,
        photoUrl: agent.photoUrl,
        periodNewMembers: nM, periodJoinFees: jF, periodClosing: cF,
        periodCommission: comm, periodRequests: prReq,
        pendingRequests: pReq, rejectedRequests: rReq, approvalRate,
        lifetimeMembers: agent.lifetimeMembers,
        lifetimeJoinFeesPaid: agent.lifetimeJoinFeesPaid,
        lifetimeJoinFeesPending: agent.lifetimeJoinFeesPending,
        lifetimeClosingPaid: agent.lifetimeClosingPaid,
        lifetimeClosingPending: agent.lifetimeClosingPending,
        lifetimeCommission: agent.lifetimeCommission,
        walletBalance: agent.walletBalance,
        efficiency, score: 0,
      };
    });

    // ── Score (weighted 0-100) ────────────────────────────────────────────────
    const maxM    = Math.max(1, ...results.map(r => r.periodNewMembers));
    const maxJF   = Math.max(1, ...results.map(r => r.periodJoinFees));
    const maxCF   = Math.max(1, ...results.map(r => r.periodClosing));
    const maxComm = Math.max(1, ...results.map(r => r.periodCommission));
    const maxEff  = Math.max(1, ...results.map(r => r.efficiency));
    const maxAR   = Math.max(1, ...results.map(r => r.approvalRate));

    results.forEach(r => {
      r.score = Math.round((
        (r.periodNewMembers / maxM)    * 25 +
        (r.periodJoinFees   / maxJF)   * 25 +
        (r.periodClosing    / maxCF)   * 20 +
        (r.periodCommission / maxComm) * 15 +
        (r.efficiency       / maxEff)  * 10 +
        (r.approvalRate     / maxAR)   *  5
      ) * 100) / 100;
    });

    const sortKey = {
      members: 'periodNewMembers', joinFees: 'periodJoinFees',
      closing: 'periodClosing', commission: 'periodCommission',
      efficiency: 'efficiency', requests: 'pendingRequests',
    }[metric] || 'score';
    results.sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));

    const summary = {
      totalAgents:          results.length,
      totalNewMembers:      results.reduce((s, r) => s + r.periodNewMembers, 0),
      totalJoinFees:        results.reduce((s, r) => s + r.periodJoinFees, 0),
      totalClosing:         results.reduce((s, r) => s + r.periodClosing, 0),
      totalCommission:      results.reduce((s, r) => s + r.periodCommission, 0),
      totalPendingRequests: results.reduce((s, r) => s + r.pendingRequests, 0),
      totalRejected:        results.reduce((s, r) => s + r.rejectedRequests, 0),
      totalLifetimeMembers: results.reduce((s, r) => s + r.lifetimeMembers, 0),
    };

    return NextResponse.json({
      success: true, agents: results, summary, period, metric,
      dateRange: { start: startDate.toISOString(), end: nowDate.toISOString() },
    });

  } catch (error) {
    console.error('Agent performance error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
