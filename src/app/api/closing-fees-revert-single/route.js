import { NextResponse } from "next/server";
import admin from "../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../middleware/authMiddleware";
import { reverseCommissionForPayment } from "../commission/route";

const db = admin.firestore();
const INC = admin.firestore.FieldValue.increment;
const STS = admin.firestore.FieldValue.serverTimestamp;

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
// POST /api/closing-fees-revert-single
// Body: { feeDocId }
// Reverses ONE memberClosingFees record:
//   1. Reads the memberClosingFees doc
//   2. Reverses member closing stats
//   3. Reverts closing_payment doc (paidAmount, status)
//   4. Reverses program, agent, org stats
//   5. Deletes the memberClosingFees doc
//   6. If last doc in group → deletes paymentGroups doc too
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req) {
  const auth = await verifyToken(req);
  if (!auth.success)
    return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });

  if (!checkRole(['superadmin'], auth.user.role))
    return NextResponse.json({ success: false, message: 'Only superadmin can revert payments' }, { status: 403 });

  const { feeDocId } = await req.json();
  if (!feeDocId)
    return NextResponse.json({ success: false, message: 'feeDocId is required' }, { status: 400 });

  try {
    // ── 1. Read the memberClosingFees doc ─────────────────────────────────
    const feeRef = db.collection('memberClosingFees').doc(feeDocId);
    const feeSnap = await feeRef.get();
    if (!feeSnap.exists)
      return NextResponse.json({ success: false, message: 'Closing fee transaction not found' }, { status: 404 });

    const fee = { id: feeSnap.id, ...feeSnap.data() };
    const { memberId, amount, programId, closingGroupId, groupId: paymentGroupId, agentId: feeAgentId } = fee;
    const revertAmount = Number(amount || 0);

    if (!memberId || revertAmount <= 0)
      return NextResponse.json({ success: false, message: 'Invalid fee document data' }, { status: 400 });

    // ── 2. Read the paymentGroups doc for agentId ─────────────────────────
    let agentId = feeAgentId;
    let groupData = null;
    if (paymentGroupId) {
      const groupSnap = await db.collection('paymentGroups').doc(paymentGroupId).get();
      if (groupSnap.exists) {
        groupData = groupSnap.data();
        agentId = agentId || groupData.agentId;
      }
    }

    // ── 3. Check remaining docs in the group ──────────────────────────────
    let groupDeleted = false;
    let remainingCount = 0;
    if (paymentGroupId) {
      const remaining = await db.collection('memberClosingFees')
        .where('groupId', '==', paymentGroupId)
        .get();
      remainingCount = remaining.size; // includes the current doc before deletion
    }

    // ── 4. Read member doc ────────────────────────────────────────────────
    const memberRef = db.collection('members').doc(memberId);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists)
      return NextResponse.json({ success: false, message: 'Member not found' }, { status: 404 });
    const member = memberSnap.data();

    const mb = new MultiBatch();
    const ts = STS();

    // ── 5. Update member closing stats ────────────────────────────────────
    const currentPaid    = Number(member.closing_paidAmount    || 0);
    const currentPending = Number(member.closing_pendingAmount || 0);
    const closingTotal   = Number(member.closing_totalAmount   || 0);
    const newPaid        = Math.max(0, currentPaid - revertAmount);
    // Pending is DERIVED from total − paid, not grown by the reverted amount.
    // `currentPending + revertAmount` had no ceiling, so reverting a payment
    // whose charge no longer exists (an orphaned fee doc, or a total that was
    // reduced elsewhere) pushed pending ABOVE total — a member showing total
    // ₹400 with pending ₹600. Total is not changed by a payment reversal, so
    // deriving pending here is exactly equivalent when the data is sound and
    // self-correcting when it isn't.
    const newPending     = Math.max(0, closingTotal - newPaid);
    const paymentPct     = closingTotal > 0 ? Math.min((newPaid / closingTotal) * 100, 100) : 0;

    const newPaidCount    = Math.max(0, Number(member.paidClosingCount || 0) - 1);
    const totalCount      = Number(member.totalClosingCount || 0);
    const newPendingCount = totalCount > 0
      ? Math.max(0, totalCount - newPaidCount)
      : Number(member.pendingClosingCount || 0) + 1;

    if (currentPending !== closingTotal - currentPaid) {
      console.warn(
        `[ClosingRevertSingle] member ${memberId} pending was inconsistent before revert ` +
        `(stored ${currentPending}, expected ${closingTotal - currentPaid}) — corrected to ${newPending}`
      );
    }

    mb.update(memberRef, {
      closing_paidAmount:        newPaid,
      closing_pendingAmount:     newPending,
      closing_paymentPercentage: Number(paymentPct.toFixed(2)),
      paidClosingCount:          newPaidCount,
      pendingClosingCount:       newPendingCount,
      updated_at:                ts,
    });

    // ── 6. Revert the closing_payment doc ─────────────────────────────────
    if (closingGroupId) {
      const cpRef = db.collection('closing_payment').doc(`${memberId}_${closingGroupId}`);
      try {
        const cpSnap = await cpRef.get();
        if (cpSnap.exists) {
          const cpData    = cpSnap.data();
          const cpPaid    = Number(cpData.paidAmount    || 0);
          const cpTotal   = Number(cpData.totalAmount   || 0);
          const newCpPaid = Math.max(0, cpPaid - revertAmount);
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
      } catch (e) {
        console.warn(`closing_payment revert skipped for ${memberId}_${closingGroupId}:`, e.message);
      }
    }

    // ── 7. Reverse program stats ──────────────────────────────────────────
    if (programId) {
      mb.set(db.collection('programs').doc(programId), {
        totalClosingPaidAmount:    INC(-revertAmount),
        totalClosingPendingAmount: INC(revertAmount),
        paidClosingCount:          INC(-1),
        pendingClosingCount:       INC(1),
        updated_at:                ts,
      }, { merge: true });
    }

    // ── 8. Reverse agent stats ────────────────────────────────────────────
    if (agentId) {
      const agentRef = db.collection('agents').doc(agentId);
      const agentSnap = await agentRef.get();
      const agentData = agentSnap.exists ? agentSnap.data() : {};

      const agentUpdate = {
        closing_paidAmount:    Math.max(0, Number(agentData.closing_paidAmount    || 0) - revertAmount),
        closing_pendingAmount: Number(agentData.closing_pendingAmount || 0) + revertAmount,
        paidClosingCount:      Math.max(0, Number(agentData.paidClosingCount      || 0) - 1),
        pendingClosingCount:   Number(agentData.pendingClosingCount   || 0) + 1,
        updated_at:            ts,
      };
      if (programId) {
        const ps = (agentData.programStats || {})[programId] || {};
        agentUpdate[`programStats.${programId}.totalClosingPaidAmount`]    = Math.max(0, Number(ps.totalClosingPaidAmount || 0) - revertAmount);
        agentUpdate[`programStats.${programId}.totalClosingPendingAmount`] = Number(ps.totalClosingPendingAmount || 0) + revertAmount;
        agentUpdate[`programStats.${programId}.paidClosingCount`]          = Math.max(0, Number(ps.paidClosingCount || 0) - 1);
        agentUpdate[`programStats.${programId}.pendingClosingCount`]       = Number(ps.pendingClosingCount || 0) + 1;
        agentUpdate[`programStats.${programId}.lastUpdated`]               = ts;
      }
      // update() (not set+merge) — dot-notation only works with update()
      if (agentSnap.exists) mb.update(agentRef, agentUpdate);
    }

    // ── 9. Reverse org stats ──────────────────────────────────────────────
    mb.set(db.collection('organizationStats').doc('current'), {
      totalClosingPaidAmount:    INC(-revertAmount),
      totalClosingPendingAmount: INC(revertAmount),
      paidClosingCount:          INC(-1),
      pendingClosingCount:       INC(1),
      updated_at:                ts,
    }, { merge: true });

    // ── 10. Delete the memberClosingFees doc ──────────────────────────────
    mb.delete(feeRef);

    // ── 11. Delete paymentGroups doc if this was the last transaction ──────
    if (paymentGroupId && remainingCount <= 1) {
      mb.delete(db.collection('paymentGroups').doc(paymentGroupId));
      groupDeleted = true;
    } else if (paymentGroupId) {
      mb.update(db.collection('paymentGroups').doc(paymentGroupId), {
        totalAmount: INC(-revertAmount),
        updated_at:  ts,
      });
    }

    await mb.commit();

    // ── 12. Reverse the commission credited for this single payment ────────
    const commissionResult = await reverseCommissionForPayment({
      paymentGroupId: paymentGroupId || null,
      memberId,
      source: 'closingPayment',
      amount: revertAmount,
      reason: 'payment_reverted',
      createdBy: auth.user.uid,
    });

    return NextResponse.json({
      success: true,
      message: `₹${revertAmount} closing payment reverted for member.${(commissionResult?.reversedAmount || 0) > 0 ? ` Commission ₹${commissionResult.reversedAmount} reversed from agent wallet.` : ''}`,
      groupDeleted,
      groupId: paymentGroupId,
    });

  } catch (err) {
    console.error('❌ closing-fees-revert-single error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
