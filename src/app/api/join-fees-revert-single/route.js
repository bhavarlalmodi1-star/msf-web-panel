import { NextResponse } from "next/server";
import admin from "../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../middleware/authMiddleware";
import { reverseCommissionForPayment } from "../commission/route";

const db = admin.firestore();
const INC = admin.firestore.FieldValue.increment;
const STS = admin.firestore.FieldValue.serverTimestamp;

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/join-fees-revert-single
// Body: { feeDocId }
//
// Reverses ONE memberJoinFees record:
//   1. Reads the memberJoinFees doc → amount, memberId, programId, groupId, agentId
//   2. Reverses member paidAmount / pendingAmount / paymentStatus
//   3. Reverses agent totalJoinFeesPaid / totalJoinFeesPending / programStats
//   4. Reverses program + org totalJoinFeesPaid / totalJoinFeesPending
//   5. Decrements paymentGroups.totalAmount by this fee's amount
//   6. Deletes the memberJoinFees doc
//   7. If no more memberJoinFees docs remain for the group → deletes paymentGroups doc
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
    // ── 1. Read the memberJoinFees doc ────────────────────────────────────
    const feeRef  = db.collection('memberJoinFees').doc(feeDocId);
    const feeSnap = await feeRef.get();
    if (!feeSnap.exists)
      return NextResponse.json({ success: false, message: 'Fee record not found' }, { status: 404 });

    const fee = feeSnap.data();
    const { memberId, amount: rawAmount, programId, groupId, agentId } = fee;
    const amount = Number(rawAmount || 0);

    if (!memberId || amount <= 0)
      return NextResponse.json({ success: false, message: 'Invalid fee record' }, { status: 400 });

    // ── 2. Read member doc ────────────────────────────────────────────────
    const memberRef  = db.collection('members').doc(memberId);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists)
      return NextResponse.json({ success: false, message: 'Member not found' }, { status: 404 });

    const member = memberSnap.data();

    // ── 3. Read payment group doc ─────────────────────────────────────────
    let groupSnap = null;
    if (groupId) {
      groupSnap = await db.collection('paymentGroups').doc(groupId).get();
    }

    // ── 4. Check remaining fees in this group BEFORE deleting ─────────────
    let remainingCount = 0;
    if (groupId) {
      const remainingSnap = await db.collection('memberJoinFees')
        .where('groupId', '==', groupId)
        .get();
      // -1 because we're about to delete feeDocId
      remainingCount = remainingSnap.size - 1;
    }

    // ── 5. Compute updated member payment fields ──────────────────────────
    const currentPaid    = Number(member.paidAmount    || 0);
    const currentPending = Number(member.pendingAmount || 0);
    const joinFees       = Number(member.joinFees      || 0);

    const newPaid    = Math.max(0, currentPaid - amount);
    const newPending = currentPending + amount;
    const paymentPct = joinFees > 0 ? Math.min((newPaid / joinFees) * 100, 100) : 0;
    const paymentStatus = paymentPct >= 100 ? 'paid' : paymentPct > 0 ? 'partial' : 'pending';

    const ts = db.batch();

    // ── 6. Update member doc ──────────────────────────────────────────────
    ts.update(memberRef, {
      paidAmount:         newPaid,
      pendingAmount:      newPending,
      paymentPercentage:  Number(paymentPct.toFixed(2)),
      paymentStatus,
      hasPendingPayments: newPending > 0,
      updated_at:         STS(),
    });

    // ── 7. Update program stats ───────────────────────────────────────────
    if (programId) {
      ts.set(db.collection('programs').doc(programId), {
        totalJoinFeesPaid:    INC(-amount),
        totalJoinFeesPending: INC(amount),
        updated_at:           STS(),
      }, { merge: true });
    }

    // ── 8. Update or delete paymentGroups doc ─────────────────────────────
    if (groupId && groupSnap?.exists) {
      if (remainingCount <= 0) {
        // No more transactions — delete the whole group
        ts.delete(db.collection('paymentGroups').doc(groupId));
      } else {
        // Still has other transactions — just decrement totalAmount
        ts.update(db.collection('paymentGroups').doc(groupId), {
          totalAmount: INC(-amount),
          updated_at:  STS(),
        });
      }
    }

    // ── 9. Org stats ──────────────────────────────────────────────────────
    ts.set(db.collection('organizationStats').doc('current'), {
      totalJoinFeesPaid:    INC(-amount),
      totalJoinFeesPending: INC(amount),
      updated_at:           STS(),
    }, { merge: true });

    // ── 10. Delete the memberJoinFees doc ─────────────────────────────────
    ts.delete(feeRef);

    await ts.commit();

    // ── 11. Reverse agent stats (read-then-write for clamping) ────────────
    if (agentId) {
      const agentRef  = db.collection('agents').doc(agentId);
      const agentSnap = await agentRef.get();
      const agentData = agentSnap.exists ? agentSnap.data() : {};
      const ps = (agentData.programStats || {})[programId] || {};

      const agentUpdate = {
        totalJoinFeesPaid:    Math.max(0, Number(agentData.totalJoinFeesPaid || 0) - amount),
        totalJoinFeesPending: Number(agentData.totalJoinFeesPending || 0) + amount,
        updated_at:           STS(),
      };
      if (programId) {
        agentUpdate[`programStats.${programId}.totalJoinFeesPaid`]    = Math.max(0, Number(ps.totalJoinFeesPaid || 0) - amount);
        agentUpdate[`programStats.${programId}.totalJoinFeesPending`] = Number(ps.totalJoinFeesPending || 0) + amount;
        agentUpdate[`programStats.${programId}.lastUpdated`]          = STS();
      }
      // update() (not set+merge) — dot-notation only works with update()
      if (agentSnap.exists) await agentRef.update(agentUpdate);
    }

    // ── 12. Reverse the commission credited for this single payment ────────
    const commissionResult = await reverseCommissionForPayment({
      paymentGroupId: groupId || null,
      memberId,
      source: 'joinFees',
      amount,
      reason: 'payment_reverted',
      createdBy: auth.user.uid,
    });

    return NextResponse.json({
      success: true,
      message: `₹${amount} payment reversed for member.${(commissionResult?.reversedAmount || 0) > 0 ? ` Commission ₹${commissionResult.reversedAmount} reversed from agent wallet.` : ''} ${remainingCount <= 0 ? 'Payment group deleted (no remaining transactions).' : `${remainingCount} transaction(s) remain in the group.`}`,
      groupDeleted: remainingCount <= 0,
      groupId,
    });

  } catch (err) {
    console.error('❌ join-fees-revert-single error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
