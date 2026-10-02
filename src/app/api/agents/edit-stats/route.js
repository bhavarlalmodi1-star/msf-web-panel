// /api/agents/edit-stats
//
// Manual correction of an agent's join-fee and closing totals, per yojna.
//
// WHY PER-YOJNA: processAgentStats prefers the agent's top-level totals, but the
// expanded per-programme rows on the Join Fees and Closing pages read
// programStats.{programId}. Correcting only the top-level number leaves those
// rows showing the old wrong figures, so the two views disagree again — the
// exact problem this screen exists to fix. So the caller edits each yojna and
// the top-level totals are RECOMPUTED as the sum across every programStats
// entry (including ones not touched by this edit), never typed directly.
//
// Pending is always derived as total − paid and is never accepted from the
// client, for the same reason as the member-level editor.
//
// This writes agent aggregates ONLY. Member documents are untouched — so these
// values can drift from the members again, and a later "Sync Stats" (or the
// per-agent Recalculate) will overwrite them from member data. The UI says so.
//
// GET  ?agentId=x  → current agent stats, the member-derived truth, and history
// POST { agentId, programs: [...], note? }

import { NextResponse } from 'next/server';
import admin from '../../db/firebaseAdmin';
import { checkRole, verifyToken } from '../../../../../middleware/authMiddleware';

export const runtime = 'nodejs';
export const maxDuration = 60;

const db  = admin.firestore();
const STS = admin.firestore.FieldValue.serverTimestamp;

const money = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
};

// The member-derived truth, using exactly the rules api/agents/recalculate-stats
// applies — migrated members contribute no join-fee amounts, join-fee pending is
// recomputed from total − paid, soft-deleted members are skipped.
const deriveFromMembers = async (agentId) => {
  const snap = await db.collection('members')
    .where('agentId', '==', agentId)
    .where('status',  '==', 'active')
    .get();

  const byProgram = {};
  const totals = {
    memberCount: 0,
    totalJoinFees: 0, totalJoinFeesPaid: 0, totalJoinFeesPending: 0,
    closing_totalAmount: 0, closing_paidAmount: 0, closing_pendingAmount: 0,
  };

  snap.forEach(doc => {
    const m = doc.data();
    if (m.delete_flag === true) return;
    const pid = m.programId || '__none__';
    if (!byProgram[pid]) {
      byProgram[pid] = {
        programId: pid,
        programName: m.programName || '',
        memberCount: 0,
        totalJoinFees: 0, totalJoinFeesPaid: 0, totalJoinFeesPending: 0,
        totalClosingAmount: 0, totalClosingPaidAmount: 0, totalClosingPendingAmount: 0,
      };
    }

    const isMigrated = m.migratedData === true;
    const jf     = isMigrated ? 0 : Number(m.joinFees   || 0);
    const jfPaid = isMigrated ? 0 : Number(m.paidAmount || 0);
    const jfPend = isMigrated ? 0 : Math.max(0, jf - jfPaid);

    const cTot  = Number(m.closing_totalAmount   || 0);
    const cPaid = Number(m.closing_paidAmount    || 0);
    const cPend = Number(m.closing_pendingAmount || 0);

    const p = byProgram[pid];
    p.memberCount += 1;
    p.totalJoinFees += jf; p.totalJoinFeesPaid += jfPaid; p.totalJoinFeesPending += jfPend;
    p.totalClosingAmount += cTot; p.totalClosingPaidAmount += cPaid; p.totalClosingPendingAmount += cPend;

    totals.memberCount += 1;
    totals.totalJoinFees += jf; totals.totalJoinFeesPaid += jfPaid; totals.totalJoinFeesPending += jfPend;
    totals.closing_totalAmount += cTot; totals.closing_paidAmount += cPaid; totals.closing_pendingAmount += cPend;
  });

  return { byProgram, totals };
};

// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Only superadmin can view agent stat corrections' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get('agentId');
    if (!agentId)
      return NextResponse.json({ success: false, message: 'agentId is required' }, { status: 400 });

    const agentSnap = await db.collection('agents').doc(agentId).get();
    if (!agentSnap.exists)
      return NextResponse.json({ success: false, message: 'Agent not found' }, { status: 404 });

    const agent    = agentSnap.data();
    const derived  = await deriveFromMembers(agentId);
    const progStats = agent.programStats || {};

    // Union of programmes the agent doc knows about and programmes the members
    // actually belong to — a yojna present in only one of the two is precisely
    // the kind of gap this screen needs to surface.
    const pids = [...new Set([
      ...Object.keys(progStats),
      ...Object.keys(derived.byProgram),
    ])].filter(p => p && p !== '__none__');

    const programs = pids.map(pid => {
      const s = progStats[pid] || {};
      const d = derived.byProgram[pid] || {};
      return {
        programId: pid,
        programName: s.programName || d.programName || '',
        stored: {
          memberCount:               Number(s.memberCount               || 0),
          totalJoinFees:             Number(s.totalJoinFees             || 0),
          totalJoinFeesPaid:         Number(s.totalJoinFeesPaid         || 0),
          totalJoinFeesPending:      Number(s.totalJoinFeesPending      || 0),
          totalClosingAmount:        Number(s.totalClosingAmount        || 0),
          totalClosingPaidAmount:    Number(s.totalClosingPaidAmount    || 0),
          totalClosingPendingAmount: Number(s.totalClosingPendingAmount || 0),
        },
        derived: {
          memberCount:               Number(d.memberCount               || 0),
          totalJoinFees:             Number(d.totalJoinFees             || 0),
          totalJoinFeesPaid:         Number(d.totalJoinFeesPaid         || 0),
          totalJoinFeesPending:      Number(d.totalJoinFeesPending      || 0),
          totalClosingAmount:        Number(d.totalClosingAmount        || 0),
          totalClosingPaidAmount:    Number(d.totalClosingPaidAmount    || 0),
          totalClosingPendingAmount: Number(d.totalClosingPendingAmount || 0),
        },
      };
    }).sort((a, b) => (a.programName || '').localeCompare(b.programName || ''));

    let history = [];
    try {
      const hSnap = await db.collection('agentStatsEdits')
        .where('agentId', '==', agentId)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();
      history = hSnap.docs.map(d => {
        const v = d.data();
        return { id: d.id, ...v, createdAt: v.createdAt?.toDate?.()?.toISOString() || null };
      });
    } catch (e) {
      // Missing index shouldn't block the editor itself
      console.warn('[EditAgentStats] history unavailable:', e.message);
    }

    return NextResponse.json({
      success: true,
      data: {
        agentId,
        agentName: agent.name || '',
        storedTotals: {
          memberCount:           Number(agent.memberCount           || 0),
          totalJoinFees:         Number(agent.totalJoinFees         || 0),
          totalJoinFeesPaid:     Number(agent.totalJoinFeesPaid     || 0),
          totalJoinFeesPending:  Number(agent.totalJoinFeesPending  || 0),
          closing_totalAmount:   Number(agent.closing_totalAmount   || 0),
          closing_paidAmount:    Number(agent.closing_paidAmount    || 0),
          closing_pendingAmount: Number(agent.closing_pendingAmount || 0),
        },
        derivedTotals: derived.totals,
        programs,
        history,
      },
    });
  } catch (error) {
    console.error('edit-stats GET error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Only superadmin can correct agent totals' }, { status: 403 });

    const { agentId, programs = [], note = '' } = await req.json().catch(() => ({}));

    if (!agentId)
      return NextResponse.json({ success: false, message: 'agentId is required' }, { status: 400 });
    if (!Array.isArray(programs) || programs.length === 0)
      return NextResponse.json({ success: false, message: 'No programme amounts supplied' }, { status: 400 });

    // Validate before touching anything, so a bad row can't leave a half-applied
    // edit behind.
    for (const p of programs) {
      if (!p?.programId)
        return NextResponse.json({ success: false, message: 'Each row needs a programId' }, { status: 400 });
      if (money(p.totalJoinFeesPaid) > money(p.totalJoinFees))
        return NextResponse.json({
          success: false,
          message: `${p.programName || p.programId}: join fees paid cannot exceed total`,
        }, { status: 400 });
      if (money(p.totalClosingPaidAmount) > money(p.totalClosingAmount))
        return NextResponse.json({
          success: false,
          message: `${p.programName || p.programId}: closing paid cannot exceed total`,
        }, { status: 400 });
    }

    const agentRef = db.collection('agents').doc(agentId);

    const result = await db.runTransaction(async (txn) => {
      const snap = await txn.get(agentRef);
      if (!snap.exists) throw new Error('Agent not found');

      const agent = snap.data();
      const before = {
        totalJoinFees:         Number(agent.totalJoinFees         || 0),
        totalJoinFeesPaid:     Number(agent.totalJoinFeesPaid     || 0),
        totalJoinFeesPending:  Number(agent.totalJoinFeesPending  || 0),
        closing_totalAmount:   Number(agent.closing_totalAmount   || 0),
        closing_paidAmount:    Number(agent.closing_paidAmount    || 0),
        closing_pendingAmount: Number(agent.closing_pendingAmount || 0),
      };

      // Start from the existing map so untouched programmes and the fields this
      // editor doesn't own (memberCount, closing counts, closedCount) survive.
      const nextStats = { ...(agent.programStats || {}) };
      const changes = [];

      for (const p of programs) {
        const pid  = p.programId;
        const prev = nextStats[pid] || {};

        const jfTotal = money(p.totalJoinFees);
        const jfPaid  = money(p.totalJoinFeesPaid);
        const cTotal  = money(p.totalClosingAmount);
        const cPaid   = money(p.totalClosingPaidAmount);

        const row = {
          ...prev,
          programName:               p.programName || prev.programName || '',
          totalJoinFees:             jfTotal,
          totalJoinFeesPaid:         jfPaid,
          totalJoinFeesPending:      jfTotal - jfPaid,
          totalClosingAmount:        cTotal,
          totalClosingPaidAmount:    cPaid,
          totalClosingPendingAmount: cTotal - cPaid,
          lastUpdated:               STS(),
        };

        const touched =
          Number(prev.totalJoinFees          || 0) !== row.totalJoinFees          ||
          Number(prev.totalJoinFeesPaid      || 0) !== row.totalJoinFeesPaid      ||
          Number(prev.totalClosingAmount     || 0) !== row.totalClosingAmount     ||
          Number(prev.totalClosingPaidAmount || 0) !== row.totalClosingPaidAmount;

        if (touched) {
          changes.push({
            programId: pid,
            programName: row.programName,
            before: {
              totalJoinFees:          Number(prev.totalJoinFees          || 0),
              totalJoinFeesPaid:      Number(prev.totalJoinFeesPaid      || 0),
              totalClosingAmount:     Number(prev.totalClosingAmount     || 0),
              totalClosingPaidAmount: Number(prev.totalClosingPaidAmount || 0),
            },
            after: {
              totalJoinFees:          row.totalJoinFees,
              totalJoinFeesPaid:      row.totalJoinFeesPaid,
              totalClosingAmount:     row.totalClosingAmount,
              totalClosingPaidAmount: row.totalClosingPaidAmount,
            },
          });
        }

        nextStats[pid] = row;
      }

      if (changes.length === 0) return { unchanged: true };

      // Top-level totals are the SUM of every programme, never a typed value —
      // that is what keeps the agent row and the expanded rows in agreement.
      const sum = (key) => Object.entries(nextStats)
        .filter(([pid]) => pid && pid !== '__none__')
        .reduce((s, [, v]) => s + Number(v?.[key] || 0), 0);

      const after = {
        totalJoinFees:         sum('totalJoinFees'),
        totalJoinFeesPaid:     sum('totalJoinFeesPaid'),
        totalJoinFeesPending:  sum('totalJoinFeesPending'),
        closing_totalAmount:   sum('totalClosingAmount'),
        closing_paidAmount:    sum('totalClosingPaidAmount'),
        closing_pendingAmount: sum('totalClosingPendingAmount'),
      };

      txn.update(agentRef, {
        ...after,
        programStats:          nextStats,
        stats_edited_at:       STS(),
        stats_edited_by:       authResult.user.uid,
        updated_at:            STS(),
      });

      txn.set(db.collection('agentStatsEdits').doc(), {
        agentId,
        agentName:    agent.name || '',
        agentCode:    agent.agentCode || '',
        before, after,
        programChanges: changes,
        note:         String(note || '').slice(0, 500),
        editedBy:     authResult.user.uid,
        editedByName: authResult.user.name || authResult.user.email || '',
        createdAt:    STS(),
      });

      return { unchanged: false, before, after, changes };
    });

    if (result.unchanged)
      return NextResponse.json({ success: true, unchanged: true, message: 'No change — values are already these amounts' });

    console.log(`[EditAgentStats] ${agentId} by ${authResult.user.uid}: ${result.changes.length} programme(s) corrected`);

    return NextResponse.json({ success: true, message: 'Agent totals corrected', data: result });

  } catch (error) {
    console.error('edit-stats POST error:', error);
    const notFound = /not found/i.test(error.message);
    return NextResponse.json({ success: false, message: error.message }, { status: notFound ? 404 : 500 });
  }
}
