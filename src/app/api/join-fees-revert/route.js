import { NextResponse } from "next/server";
import admin from "../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../middleware/authMiddleware";
import { reverseCommissionForPayment } from "../commission/route";

const db = admin.firestore();
const INC = admin.firestore.FieldValue.increment;
const STS = admin.firestore.FieldValue.serverTimestamp;

const chunkArr = (arr, n) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) =>
    arr.slice(i * n, i * n + n)
  );

class MultiBatch {
  constructor() { this._batches = [db.batch()]; this._ops = 0; }
  _cur() {
    if (this._ops >= 490) { this._batches.push(db.batch()); this._ops = 0; }
    return this._batches[this._batches.length - 1];
  }
  set(ref, data, opts) { this._cur().set(ref, data, opts || {}); this._ops++; }
  update(ref, data) { this._cur().update(ref, data); this._ops++; }
  delete(ref) { this._cur().delete(ref); this._ops++; }
  commit() { return Promise.all(this._batches.map((b) => b.commit())); }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/join-fees-revert
// Body: { paymentGroupId }
// Atomically reverses a join-fees payment group:
//   1. Reverses each member's paidAmount / pendingAmount / paymentStatus
//   2. Reverses agent's totalJoinFeesPaid / totalJoinFeesPending / programStats
//   3. Reverses program & org totalJoinFeesPaid / totalJoinFeesPending
//   4. Deletes all memberJoinFees docs for this group
//   5. Deletes the paymentGroups doc
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req) {
  const auth = await verifyToken(req);
  if (!auth.success)
    return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });

  if (!checkRole(['superadmin'], auth.user.role))
    return NextResponse.json({ success: false, message: 'Only superadmin can revert payments' }, { status: 403 });

  const { paymentGroupId } = await req.json();
  if (!paymentGroupId)
    return NextResponse.json({ success: false, message: 'paymentGroupId is required' }, { status: 400 });

  try {
    // ── 1. Read the payment group doc ─────────────────────────────────────
    const groupRef = db.collection('paymentGroups').doc(paymentGroupId);
    const groupSnap = await groupRef.get();
    if (!groupSnap.exists)
      return NextResponse.json({ success: false, message: 'Payment group not found' }, { status: 404 });

    const groupData = groupSnap.data();
    if (groupData.paymentType !== 'joinFees')
      return NextResponse.json({ success: false, message: 'Not a join-fees payment group' }, { status: 400 });

    if (groupData.reverted)
      return NextResponse.json({ success: false, message: 'Payment group already reverted' }, { status: 400 });

    const { agentId } = groupData;

    // ── 2. Fetch all memberJoinFees docs for this group ───────────────────
    const feesSnap = await db.collection('memberJoinFees')
      .where('groupId', '==', paymentGroupId)
      .get();

    if (feesSnap.empty)
      return NextResponse.json({ success: false, message: 'No transactions found for this group' }, { status: 404 });

    const feesDocs = feesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // ── 3. Batch-fetch all unique member docs ─────────────────────────────
    const memberIds = [...new Set(feesDocs.map(f => f.memberId).filter(Boolean))];
    const memberSnaps = await Promise.all(
      chunkArr(memberIds, 10).map(chunk =>
        db.collection('members')
          .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
          .get()
      )
    );
    const memberMap = {};
    memberSnaps.forEach(s => s.forEach(d => { if (d.exists) memberMap[d.id] = { id: d.id, ...d.data() }; }));

    // ── 4. Accumulate deltas per member and per program ───────────────────
    // Per member: total amount to reverse
    const memberDeltas = {}; // { [memberId]: { totalAmount, programId } }
    const programDeltas = {}; // { [programId]: number }

    for (const fee of feesDocs) {
      const { memberId, amount, programId } = fee;
      if (!memberId || !amount) continue;

      if (!memberDeltas[memberId]) memberDeltas[memberId] = { totalAmount: 0, programId };
      memberDeltas[memberId].totalAmount += Number(amount);

      if (programId) {
        programDeltas[programId] = (programDeltas[programId] || 0) + Number(amount);
      }
    }

    const mb = new MultiBatch();
    const ts = STS();
    let grandTotal = 0;

    // ── 5. Update each member doc ─────────────────────────────────────────
    for (const [memberId, delta] of Object.entries(memberDeltas)) {
      const member = memberMap[memberId];
      if (!member) continue;

      const { totalAmount } = delta;
      grandTotal += totalAmount;

      const currentPaid    = Number(member.paidAmount    || 0);
      const currentPending = Number(member.pendingAmount || 0);
      const joinFees       = Number(member.joinFees      || 0);

      const newPaid    = Math.max(0, currentPaid - totalAmount);
      const newPending = currentPending + totalAmount;
      const paymentPct = joinFees > 0 ? Math.min((newPaid / joinFees) * 100, 100) : 0;
      const paymentStatus = paymentPct >= 100 ? 'paid' : paymentPct > 0 ? 'partial' : 'pending';

      mb.update(db.collection('members').doc(memberId), {
        paidAmount:         newPaid,
        pendingAmount:      newPending,
        paymentPercentage:  Number(paymentPct.toFixed(2)),
        paymentStatus,
        hasPendingPayments: newPending > 0,
        updated_at:         ts,
      });
    }

    // ── 6. Reverse program stats ──────────────────────────────────────────
    for (const [programId, amount] of Object.entries(programDeltas)) {
      mb.set(db.collection('programs').doc(programId), {
        totalJoinFeesPaid:    INC(-amount),
        totalJoinFeesPending: INC(amount),
        updated_at:           ts,
      }, { merge: true });
    }

    // ── 7. Reverse agent stats ────────────────────────────────────────────
    if (agentId && grandTotal > 0) {
      const agentRef = db.collection('agents').doc(agentId);
      const agentSnap = await agentRef.get();
      const agentData = agentSnap.exists ? agentSnap.data() : {};

      const agentUpdate = {
        totalJoinFeesPaid:    Math.max(0, Number(agentData.totalJoinFeesPaid || 0) - grandTotal),
        totalJoinFeesPending: Number(agentData.totalJoinFeesPending || 0) + grandTotal,
        updated_at:           ts,
      };
      // Reverse per-program programStats
      for (const [programId, amount] of Object.entries(programDeltas)) {
        const ps = (agentData.programStats || {})[programId] || {};
        agentUpdate[`programStats.${programId}.totalJoinFeesPaid`]    = Math.max(0, Number(ps.totalJoinFeesPaid || 0) - amount);
        agentUpdate[`programStats.${programId}.totalJoinFeesPending`] = Number(ps.totalJoinFeesPending || 0) + amount;
        agentUpdate[`programStats.${programId}.lastUpdated`]          = ts;
      }
      // NOTE: update() (not set+merge) — dot-notation paths are only
      // interpreted by update(); set() would write literal "a.b.c" fields.
      if (agentSnap.exists) mb.update(agentRef, agentUpdate);
    }

    // ── 8. Reverse org stats ──────────────────────────────────────────────
    if (grandTotal > 0) {
      mb.set(db.collection('organizationStats').doc('current'), {
        totalJoinFeesPaid:    INC(-grandTotal),
        totalJoinFeesPending: INC(grandTotal),
        updated_at:           ts,
      }, { merge: true });
    }

    // ── 9. Delete all memberJoinFees docs ─────────────────────────────────
    for (const fee of feesDocs) {
      mb.delete(db.collection('memberJoinFees').doc(fee.id));
    }

    // ── 10. Delete the paymentGroups doc ──────────────────────────────────
    mb.delete(groupRef);

    await mb.commit();

    // ── 11. Reverse commissions credited for this payment group ───────────
    // Exact match by paymentGroupId first; legacy fallback per member+amount.
    let commissionReversed = 0;
    const exact = await reverseCommissionForPayment({
      paymentGroupId, reason: 'payment_reverted', createdBy: auth.user.uid,
    });
    commissionReversed += exact.reversedAmount || 0;
    if (!exact.count) {
      for (const fee of feesDocs) {
        if (!fee.memberId || !fee.amount) continue;
        const r = await reverseCommissionForPayment({
          memberId: fee.memberId, source: 'joinFees', amount: Number(fee.amount),
          reason: 'payment_reverted', createdBy: auth.user.uid,
        });
        commissionReversed += r.reversedAmount || 0;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Payment group reverted. ₹${grandTotal} reversed across ${memberIds.length} member(s).${commissionReversed > 0 ? ` Commission ₹${commissionReversed} reversed from agent wallet.` : ''}`,
      summary: {
        paymentGroupId,
        membersReverted: memberIds.length,
        feesDocsDeleted: feesDocs.length,
        totalReversed: grandTotal,
      },
    });

  } catch (err) {
    console.error('❌ join-fees-revert error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
