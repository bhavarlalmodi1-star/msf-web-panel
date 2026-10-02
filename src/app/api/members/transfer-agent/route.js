// app/api/members/transfer-agent/route.js
//
// Transfers one or MULTIPLE members from their current agent to another agent.
// Everything that references the agent moves consistently:
//
//   1. Member doc      → agentId, addedBy, addedByName (+ transfer history)
//   2. FROM agent      → memberCount, join-fee totals (total/paid/pending),
//                        closing totals & counts, closedCount, and the
//                        per-program programStats.* — all DECREMENTED
//   3. TO agent        → same fields INCREMENTED
//   4. Transaction docs (memberJoinFees, memberClosingFees, closing_payment)
//                      → agentId updated so future reverts hit the right agent
//
// NOT touched (by design):
//   • paymentGroups — they can span many members of the old agent
//   • commissions/wallets — commission already earned stays with the agent
//     who collected the payment
//
// POST { memberIds: string[], toAgentId: string }
// Roles: superadmin, admin

import { NextResponse } from "next/server";
import admin from "../../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../../middleware/authMiddleware";

const db  = admin.firestore();
const INC = admin.firestore.FieldValue.increment;
const STS = admin.firestore.FieldValue.serverTimestamp;

// Build the full stats delta object for one member (sign = +1 or -1)
// Migrated members: only member count moves — join fee amounts stay out of stats
// (migration intentionally only bumped memberCount, never amounts)
const agentStatsUpdate = (m, programId, sign) => {
  const isMigrated = m.migratedData === true;
  const jf      = isMigrated ? 0 : Number(m.joinFees   || 0) * sign;
  const jfPaid  = isMigrated ? 0 : Number(m.paidAmount || 0) * sign;
  // Recompute pendingAmount from joinFees - paidAmount to avoid propagating bad
  // stored values (e.g. joinFees + fixedJoinFees) into the target agent's stats.
  const jfPend  = isMigrated ? 0 : Math.max(0, Number(m.joinFees || 0) - Number(m.paidAmount || 0)) * sign;
  const cTotal  = Number(m.closing_totalAmount || 0)   * sign;
  const cPaid   = Number(m.closing_paidAmount || 0)    * sign;
  const cPend   = Number(m.closing_pendingAmount || 0) * sign;
  const cCnt    = Number(m.totalClosingCount || 0)     * sign;
  const cCntP   = Number(m.paidClosingCount || 0)      * sign;
  const cCntPd  = Number(m.pendingClosingCount || 0)   * sign;
  const closed  = (m.member_closed === true ? 1 : 0)   * sign;

  const update = {
    memberCount:           INC(sign),
    totalJoinFees:         INC(jf),
    totalJoinFeesPaid:     INC(jfPaid),
    totalJoinFeesPending:  INC(jfPend),
    closing_totalAmount:   INC(cTotal),
    closing_paidAmount:    INC(cPaid),
    closing_pendingAmount: INC(cPend),
    totalClosingCount:     INC(cCnt),
    paidClosingCount:      INC(cCntP),
    pendingClosingCount:   INC(cCntPd),
    updated_at:            STS(),
  };
  if (closed !== 0) update.closedCount = INC(closed);

  if (programId) {
    update[`programStats.${programId}.memberCount`]               = INC(sign);
    update[`programStats.${programId}.totalJoinFees`]             = INC(jf);
    update[`programStats.${programId}.totalJoinFeesPaid`]         = INC(jfPaid);
    update[`programStats.${programId}.totalJoinFeesPending`]      = INC(jfPend);
    update[`programStats.${programId}.totalClosingAmount`]        = INC(cTotal);
    update[`programStats.${programId}.totalClosingPaidAmount`]    = INC(cPaid);
    update[`programStats.${programId}.totalClosingPendingAmount`] = INC(cPend);
    update[`programStats.${programId}.totalClosingCount`]         = INC(cCnt);
    update[`programStats.${programId}.paidClosingCount`]          = INC(cCntP);
    update[`programStats.${programId}.pendingClosingCount`]       = INC(cCntPd);
    if (closed !== 0) update[`programStats.${programId}.closedCount`] = INC(closed);
    update[`programStats.${programId}.lastUpdated`]               = STS();
  }
  return update;
};

// Update agentId on all of a member's transaction/closing docs
const retagMemberDocs = async (memberId, toAgentId) => {
  let updated = 0;
  for (const col of ["memberJoinFees", "memberClosingFees", "closing_payment"]) {
    const snap = await db.collection(col).where("memberId", "==", memberId).get();
    if (snap.empty) continue;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.update(d.ref, { agentId: toAgentId, updated_at: STS() }));
    await batch.commit();
    updated += snap.size;
  }
  return updated;
};

export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(["superadmin", "admin"], authResult.user.role))
      return NextResponse.json({ success: false, message: "Insufficient permissions" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const memberIds = Array.isArray(body.memberIds) ? body.memberIds.filter(Boolean) : [];
    const toAgentId = (body.toAgentId || "").trim();

    if (!memberIds.length || !toAgentId)
      return NextResponse.json({ success: false, message: "memberIds and toAgentId are required" }, { status: 400 });
    if (memberIds.length > 100)
      return NextResponse.json({ success: false, message: "Maximum 100 members per transfer" }, { status: 400 });

    // Target agent must exist and be usable
    const toAgentSnap = await db.collection("agents").doc(toAgentId).get();
    if (!toAgentSnap.exists)
      return NextResponse.json({ success: false, message: "Target agent not found" }, { status: 404 });
    const toAgent = toAgentSnap.data();
    if (toAgent.delete_flag === true)
      return NextResponse.json({ success: false, message: "Target agent is deleted" }, { status: 400 });

    const results = [];
    let transferred = 0;

    for (const memberId of memberIds) {
      try {
        const memberSnap = await db.collection("members").doc(memberId).get();
        if (!memberSnap.exists) {
          results.push({ memberId, status: "error", error: "Member not found" });
          continue;
        }
        const m = memberSnap.data();

        if (m.delete_flag === true) {
          results.push({ memberId, name: m.displayName, status: "skipped", reason: "Member is deleted (in trash)" });
          continue;
        }

        const fromAgentId = m.agentId || null;
        if (fromAgentId === toAgentId) {
          results.push({ memberId, name: m.displayName, status: "skipped", reason: "Already with this agent" });
          continue;
        }

        const programId = m.programId || "";

        // ── 1. Move stats: FROM agent (−) ────────────────────────────────────
        let fromAgentName = "";
        if (fromAgentId) {
          const fromSnap = await db.collection("agents").doc(fromAgentId).get();
          if (fromSnap.exists) {
            fromAgentName = fromSnap.data().name || "";
            await db.collection("agents").doc(fromAgentId)
              .update(agentStatsUpdate(m, programId, -1));
          }
        }

        // ── 2. Move stats: TO agent (+) ──────────────────────────────────────
        const toUpdate = agentStatsUpdate(m, programId, 1);
        if (programId) toUpdate[`programStats.${programId}.programName`] = m.programName || "";
        await db.collection("agents").doc(toAgentId).update(toUpdate);

        // ── 3. Update the member doc (+ transfer history) ────────────────────
        await memberSnap.ref.update({
          agentId: toAgentId,
          addedBy: "agent",
          addedByName: toAgent.name || "",
          adminId: null,
          agentTransferHistory: admin.firestore.FieldValue.arrayUnion({
            fromAgentId: fromAgentId || null,
            fromAgentName,
            toAgentId,
            toAgentName: toAgent.name || "",
            transferredAt: new Date().toISOString(),
            transferredBy: authResult.user.uid,
          }),
          updated_at: STS(),
        });

        // ── 4. Re-tag the member's transaction/closing docs ─────────────────
        const retagged = await retagMemberDocs(memberId, toAgentId);

        transferred++;
        console.log(`  🔁 [TRANSFER] ${m.displayName} (${m.registrationNumber || memberId}): ${fromAgentName || "no agent"} → ${toAgent.name} (${retagged} record(s) re-tagged)`);
        results.push({
          memberId, name: m.displayName, regNo: m.registrationNumber || "",
          status: "transferred", from: fromAgentName || "(no agent)", to: toAgent.name || "",
          recordsUpdated: retagged,
        });
      } catch (recErr) {
        console.error(`Transfer error for member ${memberId}:`, recErr);
        results.push({ memberId, status: "error", error: recErr.message });
      }
    }

    console.log(`🏁 [TRANSFER] Done — ${transferred}/${memberIds.length} member(s) transferred to ${toAgent.name}`);

    return NextResponse.json({
      success: true,
      message: `${transferred} member(s) transferred to ${toAgent.name}`,
      summary: { requested: memberIds.length, transferred, skipped: memberIds.length - transferred },
      results,
    });
  } catch (e) {
    console.error("POST transfer-agent error:", e);
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}
