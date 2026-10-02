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
// POST /api/closing-fees-revert
// Body: { paymentGroupId }
// Atomically reverses a closing-payment group:
//   1. Reads paymentGroups doc (paymentType: 'closingPayment')
//   2. Reads all memberClosingFees docs for this group
//   3. Reverses member closing_paidAmount / closing_pendingAmount / etc.
//   4. Reverts closing_payment docs back toward 'pending' (removes the paid amount)
//   5. Reverses agent closing stats
//   6. Reverses program & org stats
//   7. Deletes memberClosingFees docs + paymentGroups doc
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
    if (groupData.paymentType !== 'closingPayment')
      return NextResponse.json({ success: false, message: 'Not a closing-payment group' }, { status: 400 });

    if (groupData.reverted)
      return NextResponse.json({ success: false, message: 'Payment group already reverted' }, { status: 400 });

    const { agentId } = groupData;

    // ── 2. Fetch all memberClosingFees docs for this group ────────────────
    const feesSnap = await db.collection('memberClosingFees')
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

    // ── 4. Accumulate per-member and per-program deltas ───────────────────
    // memberDeltas[memberId] = { totalAmount, paidDocsCount, programId, closingGroupIds }
    const memberDeltas = {};
    const programDeltas = {}; // { [programId]: { paid, count } }

    for (const fee of feesDocs) {
      const { memberId, amount, programId, closingGroupId } = fee;
      if (!memberId || !amount) continue;

      if (!memberDeltas[memberId]) {
        memberDeltas[memberId] = { totalAmount: 0, paidDocsCount: 0, programId, closingGroupIds: new Set() };
      }
      memberDeltas[memberId].totalAmount += Number(amount);
      memberDeltas[memberId].paidDocsCount += 1;
      if (closingGroupId) memberDeltas[memberId].closingGroupIds.add(closingGroupId);

      if (programId) {
        if (!programDeltas[programId]) programDeltas[programId] = { paid: 0, count: 0 };
        programDeltas[programId].paid  += Number(amount);
        programDeltas[programId].count += 1;
      }
    }

    const mb = new MultiBatch();
    const ts = STS();
    let grandTotal = 0;
    let grandCount = 0;

    // ── 5. Update each member doc + revert closing_payment docs ──────────
    for (const [memberId, delta] of Object.entries(memberDeltas)) {
      const member = memberMap[memberId];
      if (!member) continue;

      const { totalAmount, paidDocsCount, closingGroupIds } = delta;
      grandTotal += totalAmount;
      grandCount += paidDocsCount;

      // Revert member closing payment fields
      const memberRef = db.collection('members').doc(memberId);
      const currentPaid    = Number(member.closing_paidAmount    || 0);
      const currentPending = Number(member.closing_pendingAmount || 0);
      const closingTotal   = Number(member.closing_totalAmount   || 0);

      const newPaid    = Math.max(0, currentPaid - totalAmount);
      // Derive pending from total − paid rather than growing it by the reverted
      // amount. The unbounded `currentPending + totalAmount` could push pending
      // above total (member showing total ₹400, pending ₹600) whenever the
      // charge behind the payment no longer existed. A payment reversal never
      // changes total, so this is equivalent on sound data and self-correcting
      // on unsound data.
      const newPending = Math.max(0, closingTotal - newPaid);
      const paymentPct = closingTotal > 0 ? Math.min((newPaid / closingTotal) * 100, 100) : 0;

      const newPaidCount    = Math.max(0, Number(member.paidClosingCount || 0) - paidDocsCount);
      const totalCount      = Number(member.totalClosingCount || 0);
      const newPendingCount = totalCount > 0
        ? Math.max(0, totalCount - newPaidCount)
        : Number(member.pendingClosingCount || 0) + paidDocsCount;

      if (currentPending !== closingTotal - currentPaid) {
        console.warn(
          `[ClosingRevert] member ${memberId} pending was inconsistent before revert ` +
          `(stored ${currentPending}, expected ${closingTotal - currentPaid}) — corrected to ${newPending}`
        );
      }

      const memberUpdate = {
        closing_paidAmount:        newPaid,
        closing_pendingAmount:     newPending,
        closing_paymentPercentage: Number(paymentPct.toFixed(2)),
        paidClosingCount:          newPaidCount,
        pendingClosingCount:       newPendingCount,
        updated_at:                ts,
      };
      mb.update(memberRef, memberUpdate);

      // Revert each closing_payment doc this member is in (for this payment group)
      for (const closingGroupId of closingGroupIds) {
        const cpRef = db.collection('closing_payment').doc(`${memberId}_${closingGroupId}`);
        try {
          const cpSnap = await cpRef.get();
          if (cpSnap.exists) {
            const cpData = cpSnap.data();
            // How much did this paymentGroup pay toward this closing_payment doc?
            // Use the fee docs to sum up amount for this member+closingGroup combo
            const paidViaThisGroup = feesDocs
              .filter(f => f.memberId === memberId && f.closingGroupId === closingGroupId)
              .reduce((sum, f) => sum + Number(f.amount || 0), 0);

            if (paidViaThisGroup > 0) {
              const cpPaid    = Number(cpData.paidAmount    || 0);
              const cpTotal   = Number(cpData.totalAmount   || 0);
              const newCpPaid = Math.max(0, cpPaid - paidViaThisGroup);
              const newCpPending = Math.max(0, cpTotal - newCpPaid);
              const newStatus    = newCpPaid <= 0 ? 'pending' : newCpPaid < cpTotal ? 'partial' : 'paid';
              const newPct       = cpTotal > 0 ? Number(((newCpPaid / cpTotal) * 100).toFixed(2)) : 0;

              mb.update(cpRef, {
                paidAmount:        newCpPaid,
                pendingAmount:     newCpPending,
                status:            newStatus,
                paymentPercentage: newPct,
                updated_at:        ts,
              });
            }
          }
        } catch (e) {
          console.warn(`closing_payment revert skipped for ${memberId}_${closingGroupId}:`, e.message);
        }
      }
    }

    // ── 6. Reverse program stats ──────────────────────────────────────────
    for (const [programId, delta] of Object.entries(programDeltas)) {
      mb.set(db.collection('programs').doc(programId), {
        totalClosingPaidAmount:    INC(-delta.paid),
        totalClosingPendingAmount: INC(delta.paid),
        paidClosingCount:          INC(-delta.count),
        pendingClosingCount:       INC(delta.count),
        updated_at:                ts,
      }, { merge: true });
    }

    // ── 7. Reverse agent stats ────────────────────────────────────────────
    if (agentId && grandTotal > 0) {
      const agentRef = db.collection('agents').doc(agentId);
      const agentSnap = await agentRef.get();
      const agentData = agentSnap.exists ? agentSnap.data() : {};

      const agentUpdate = {
        closing_paidAmount:    Math.max(0, Number(agentData.closing_paidAmount    || 0) - grandTotal),
        closing_pendingAmount: Number(agentData.closing_pendingAmount || 0) + grandTotal,
        paidClosingCount:      Math.max(0, Number(agentData.paidClosingCount      || 0) - grandCount),
        pendingClosingCount:   Number(agentData.pendingClosingCount   || 0) + grandCount,
        updated_at:            ts,
      };
      for (const [programId, delta] of Object.entries(programDeltas)) {
        const ps = (agentData.programStats || {})[programId] || {};
        agentUpdate[`programStats.${programId}.totalClosingPaidAmount`]    = Math.max(0, Number(ps.totalClosingPaidAmount || 0) - delta.paid);
        agentUpdate[`programStats.${programId}.totalClosingPendingAmount`] = Number(ps.totalClosingPendingAmount || 0) + delta.paid;
        agentUpdate[`programStats.${programId}.paidClosingCount`]          = Math.max(0, Number(ps.paidClosingCount || 0) - delta.count);
        agentUpdate[`programStats.${programId}.pendingClosingCount`]       = Number(ps.pendingClosingCount || 0) + delta.count;
        agentUpdate[`programStats.${programId}.lastUpdated`]               = ts;
      }
      // update() (not set+merge) — dot-notation only works with update()
      if (agentSnap.exists) mb.update(agentRef, agentUpdate);
    }

    // ── 8. Reverse org stats ──────────────────────────────────────────────
    if (grandTotal > 0) {
      mb.set(db.collection('organizationStats').doc('current'), {
        totalClosingPaidAmount:    INC(-grandTotal),
        totalClosingPendingAmount: INC(grandTotal),
        paidClosingCount:          INC(-grandCount),
        pendingClosingCount:       INC(grandCount),
        updated_at:                ts,
      }, { merge: true });
    }

    // ── 9. Delete all memberClosingFees docs ──────────────────────────────
    for (const fee of feesDocs) {
      mb.delete(db.collection('memberClosingFees').doc(fee.id));
    }

    // ── 10. Delete the paymentGroups doc ──────────────────────────────────
    mb.delete(groupRef);

    await mb.commit();

    // ── 11. Reverse commissions credited for this payment group ───────────
    let commissionReversed = 0;
    const exact = await reverseCommissionForPayment({
      paymentGroupId, reason: 'payment_reverted', createdBy: auth.user.uid,
    });
    commissionReversed += exact.reversedAmount || 0;
    if (!exact.count) {
      for (const fee of feesDocs) {
        if (!fee.memberId || !fee.amount) continue;
        const r = await reverseCommissionForPayment({
          memberId: fee.memberId, source: 'closingPayment', amount: Number(fee.amount),
          reason: 'payment_reverted', createdBy: auth.user.uid,
        });
        commissionReversed += r.reversedAmount || 0;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Closing payment group reverted. ₹${grandTotal} reversed across ${memberIds.length} member(s).${commissionReversed > 0 ? ` Commission ₹${commissionReversed} reversed from agent wallet.` : ''}`,
      summary: {
        paymentGroupId,
        membersReverted: memberIds.length,
        feesDocsDeleted: feesDocs.length,
        totalReversed: grandTotal,
      },
    });

  } catch (err) {
    console.error('❌ closing-fees-revert error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
