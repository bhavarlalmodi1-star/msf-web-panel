import { NextResponse } from "next/server";
import admin from "../../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../../middleware/authMiddleware";

const db  = admin.firestore();
const INC = admin.firestore.FieldValue.increment;
const STS = admin.firestore.FieldValue.serverTimestamp;

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/agents/recalculate-stats
// Body: { agentId }  — or omit to recalculate ALL agents
//
// Reads the ACTUAL member documents for each agent and rebuilds:
//   • agent.totalJoinFees / totalJoinFeesPaid / totalJoinFeesPending
//   • agent.memberCount
//   • agent.programStats.{pid}.totalJoinFees/Paid/Pending/memberCount
//   • agent.closing_totalAmount / closing_paidAmount / closing_pendingAmount
//   • agent.programStats.{pid}.totalClosingAmount/PaidAmount/PendingAmount
//
// Call this once after deploying the adjust-stats fix to repair stale data.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Only superadmin can recalculate stats' }, { status: 403 });

    const { agentId } = await req.json().catch(() => ({}));

    // ── Fetch agents to recalculate ───────────────────────────────────────────
    let agentDocs = [];
    if (agentId) {
      const snap = await db.collection('agents').doc(agentId).get();
      if (!snap.exists) return NextResponse.json({ success: false, message: 'Agent not found' }, { status: 404 });
      agentDocs = [{ id: snap.id, ...snap.data() }];
    } else {
      const snap = await db.collection('agents').where('delete_flag', '!=', true).get();
      agentDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    const results = [];

    for (const agent of agentDocs) {
      try {
        // ── Fetch only ACTIVE, non-deleted members for this agent ────────────
        // Two equality where() clauses work without a composite index in Firestore.
        // Only 'active' (accepted) members count — pending/rejected are excluded at DB level.
        const membersSnap = await db.collection('members')
          .where('agentId', '==', agent.id)
          .where('status',  '==', 'active')
          .get();

        // ── Accumulate stats per program ──────────────────────────────────────
        const programTotals = {}; // { [programId]: { ... } }
        let totalJoinFees = 0, totalJoinFeesPaid = 0, totalJoinFeesPending = 0;
        let closingTotal = 0, closingPaid = 0, closingPending = 0;
        let totalClosingCount = 0, paidClosingCount = 0, pendingClosingCount = 0, closedCount = 0;
        let memberCount = 0;

        membersSnap.forEach(doc => {
          const m = doc.data();
          // Extra guard: skip soft-deleted docs
          if (m.delete_flag === true) return;
          const pid = m.programId || '__none__';

          if (!programTotals[pid]) {
            programTotals[pid] = {
              programName:              m.programName || '',
              memberCount:              0,
              totalJoinFees:            0,
              totalJoinFeesPaid:        0,
              totalJoinFeesPending:     0,
              totalClosingAmount:       0,
              totalClosingPaidAmount:   0,
              totalClosingPendingAmount:0,
              totalClosingCount:        0,
              paidClosingCount:         0,
              pendingClosingCount:      0,
              closedCount:              0,
            };
          }

          // Migrated members: count them but NEVER add their join fee amounts
          // (migration intentionally only bumped memberCount, not amounts)
          const isMigrated = m.migratedData === true;

          const jf      = isMigrated ? 0 : Number(m.joinFees  || 0);
          const jfPaid  = isMigrated ? 0 : Number(m.paidAmount || 0);
          // Recompute pendingAmount from joinFees - paidAmount so bad stored
          // values (e.g. joinFees + fixedJoinFees written by agent apps) don't
          // corrupt the rebuilt stats.
          const jfPend  = isMigrated ? 0 : Math.max(0, jf - jfPaid);
          const cTotal  = Number(m.closing_totalAmount   || 0);
          const cPaid   = Number(m.closing_paidAmount    || 0);
          const cPend   = Number(m.closing_pendingAmount || 0);
          const cCntT   = Number(m.totalClosingCount     || 0);
          const cCntP   = Number(m.paidClosingCount      || 0);
          const cCntPd  = Number(m.pendingClosingCount   || 0);
          const closed  = m.member_closed === true ? 1 : 0;

          programTotals[pid].memberCount              += 1;
          programTotals[pid].totalJoinFees            += jf;
          programTotals[pid].totalJoinFeesPaid        += jfPaid;
          programTotals[pid].totalJoinFeesPending     += jfPend;
          programTotals[pid].totalClosingAmount       += cTotal;
          programTotals[pid].totalClosingPaidAmount   += cPaid;
          programTotals[pid].totalClosingPendingAmount+= cPend;
          programTotals[pid].totalClosingCount        += cCntT;
          programTotals[pid].paidClosingCount         += cCntP;
          programTotals[pid].pendingClosingCount      += cCntPd;
          programTotals[pid].closedCount              += closed;

          totalJoinFees        += jf;
          totalJoinFeesPaid    += jfPaid;
          totalJoinFeesPending += jfPend;
          closingTotal         += cTotal;
          closingPaid          += cPaid;
          closingPending       += cPend;
          totalClosingCount    += cCntT;
          paidClosingCount     += cCntP;
          pendingClosingCount  += cCntPd;
          closedCount          += closed;
          memberCount          += 1;
        });

        // ── Build the agent update ────────────────────────────────────────────
        const agentUpdate = {
          memberCount,
          totalJoinFees,
          totalJoinFeesPaid,
          totalJoinFeesPending,
          closing_totalAmount:    closingTotal,
          closing_paidAmount:     closingPaid,
          closing_pendingAmount:  closingPending,
          totalClosingCount,
          paidClosingCount,
          pendingClosingCount,
          closedCount,
          stats_recalculated_at:  STS(),
          updated_at:             STS(),
        };

        // Rebuild entire programStats map as a REAL nested object.
        // IMPORTANT: set({merge:true}) does NOT interpret dot-notation keys —
        // it creates literal top-level fields named "programStats.x.y".
        // Building a nested map and replacing programStats wholesale both
        // fixes that and clears stale program entries.
        const programStatsMap = {};
        for (const [pid, stats] of Object.entries(programTotals)) {
          if (pid === '__none__') continue;
          programStatsMap[pid] = {
            programName:               stats.programName,
            memberCount:               stats.memberCount,
            totalJoinFees:             stats.totalJoinFees,
            totalJoinFeesPaid:         stats.totalJoinFeesPaid,
            totalJoinFeesPending:      stats.totalJoinFeesPending,
            totalClosingAmount:        stats.totalClosingAmount,
            totalClosingPaidAmount:    stats.totalClosingPaidAmount,
            totalClosingPendingAmount: stats.totalClosingPendingAmount,
            totalClosingCount:         stats.totalClosingCount,
            paidClosingCount:          stats.paidClosingCount,
            pendingClosingCount:       stats.pendingClosingCount,
            closedCount:               stats.closedCount,
            lastUpdated:               STS(),
          };
        }

        const agentRef = db.collection('agents').doc(agent.id);

        // Clean up junk literal dotted fields written by the old set+merge bug
        // (top-level fields whose NAME contains a dot, e.g. "programStats.x.y")
        const junkKeys = Object.keys(agent).filter(k => k.includes('.'));
        if (junkKeys.length) {
          const deleteArgs = [];
          junkKeys.forEach(k => {
            deleteArgs.push(new admin.firestore.FieldPath(k), admin.firestore.FieldValue.delete());
          });
          const [firstField, firstValue, ...rest] = deleteArgs;
          await agentRef.update(firstField, firstValue, ...rest);
        }

        // update() replaces the whole programStats map (clears stale program
        // entries), unlike set+merge which would leave old entries behind.
        await agentRef.update({ ...agentUpdate, programStats: programStatsMap });

        results.push({
          agentId:      agent.id,
          agentName:    agent.name || agent.id,
          memberCount,
          totalJoinFees,
          totalJoinFeesPaid,
          totalJoinFeesPending,
          status: 'ok',
        });

        console.log(`✅ Recalculated stats for agent ${agent.id} (${agent.name}): members=${memberCount}, paid=${totalJoinFeesPaid}, pending=${totalJoinFeesPending}`);
      } catch (agentErr) {
        console.error(`❌ Failed for agent ${agent.id}:`, agentErr);
        results.push({ agentId: agent.id, status: 'error', error: agentErr.message });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Recalculated stats for ${results.length} agent(s)`,
      results,
    });

  } catch (error) {
    console.error('recalculate-stats error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
