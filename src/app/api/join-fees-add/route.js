import { NextResponse } from "next/server";
import admin from "../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../middleware/authMiddleware";
import { creditCommissionStandalone } from "../commission/route";
import { sendToAgent } from "../db/fcm";

const db = admin.firestore();

// Auto-generate a cash reference ID so cash payments are searchable
const generateCashId = () => {
  const d   = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `CSH-${date}-${time}-${rand}`;
};

export async function POST(req) {
  // Hoisted so the catch block can release the claim. The request body is
  // already consumed by then, so it can't be re-read there.
  let idemRefOuter = null;
  let committed    = false;

  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });

    const currentUser = authResult.user;

    if (!checkRole(['superadmin', 'admin'], currentUser.role)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient permissions to create payment entry' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      memberPayments, paymentDate, paymentMethod, paymentNote,
      totalAmount, transactionId, fileUrl, agentId, idempotencyKey
    } = body;

    // ── Idempotency guard ─────────────────────────────────────────────────────
    // The UTR check below only fires when the user typed a transaction ID, so
    // CASH payments had no duplicate protection at all — a double-click, a
    // browser retry, or clicking again after a slow response wrote a second
    // payment group and deducted twice. Claiming a key atomically closes that
    // for every payment method, and is immune to the read-then-write race the
    // UTR check has.
    const idemRef = idempotencyKey
      ? db.collection('paymentIdempotency').doc(String(idempotencyKey))
      : null;
    idemRefOuter = idemRef;

    if (idemRef) {
      const prior = await db.runTransaction(async (txn) => {
        const snap = await txn.get(idemRef);
        if (snap.exists) return snap.data();       // someone already claimed it
        txn.set(idemRef, {
          status:    'in_progress',
          type:      'joinFees',
          agentId:   agentId || null,
          createdBy: currentUser.uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return null;
      });

      if (prior) {
        console.warn(`[JoinFeesAdd] Duplicate submission blocked (key=${idempotencyKey}, status=${prior.status})`);
        return NextResponse.json({
          success: true,
          alreadyProcessed: true,
          paymentGroupId: prior.paymentGroupId || null,
          message: prior.status === 'completed'
            ? 'This payment was already recorded — no duplicate was created.'
            : 'This payment is already being processed. Please wait a moment and refresh.',
        });
      }
    }

    // Release the claim if we bail out, so a genuine retry isn't blocked forever
    const releaseIdempotency = async () => {
      if (!idemRef) return;
      try { await idemRef.delete(); } catch (e) { console.error('Failed to release idempotency key:', e); }
    };

    const batch        = db.batch();
    const numTotalAmount = Number(totalAmount);

    // ── Resolve final transaction ID (auto-generate for cash) ─────────────────
    // Online payments provide a UTR; cash payments get an auto-generated CSH-... ID
    // so they are searchable in payment history.
    const finalTxId = (transactionId && transactionId.trim())
      ? transactionId.trim()
      : paymentMethod === 'cash' ? generateCashId() : '';

    // ── Duplicate UTR / transaction ID check (online only) ───────────────────
    if (transactionId && transactionId.trim() !== '') {
      const utrSnap = await db.collection('paymentGroups')
        .where('transactionId', '==', transactionId.trim())
        .limit(1)
        .get();
      if (!utrSnap.empty) {
        const existing = utrSnap.docs[0].data();
        const existingDate = existing.paymentDate?.toDate
          ? existing.paymentDate.toDate().toLocaleDateString('en-IN')
          : existing.paymentDate || '';
        await releaseIdempotency();
        return NextResponse.json({
          success: false,
          message: `Duplicate transaction: UTR/Transaction ID "${transactionId.trim()}" was already used in a ${existing.paymentType === 'joinFees' ? 'Join Fees' : 'Closing'} payment on ${existingDate}. Please verify and use a different ID.`,
          duplicate: true,
          existingPaymentGroupId: utrSnap.docs[0].id,
        }, { status: 409 });
      }
    }

    // ── Agent doc ─────────────────────────────────────────────────────────────

    // A member with no agent would reach db.collection('agents').doc('') below,
    // which Firestore rejects with the opaque "documentPath is not a valid
    // resource path" — an error that says nothing about the real problem. Fail
    // early with something the user can act on.
    if (!agentId || typeof agentId !== 'string' || !agentId.trim()) {
      // Release the already-claimed idempotency key so a retry isn't blocked.
      await releaseIdempotency();
      return NextResponse.json({
        success: false,
        message: 'This member has no agent assigned, so the payment cannot be recorded against one. Assign an agent to the member first.',
      }, { status: 400 });
    }

    const agentRef = db.collection('agents').doc(agentId);
    const agentDoc = await agentRef.get();
    if (!agentDoc.exists) throw new Error("Agent not found");

    // Accumulate per-program deltas — will be written as dot-notation INC()
    // to avoid overwriting the entire programStats map (race condition).
    const programDeltas = {}; // { [programId]: { paid: number, pending: number } }

    // Track actual deduction sum — some members may be skipped, so body.totalAmount
    // may be larger than what is actually deducted.
    let actualTotalPaid = 0;

    // ── Payment group (one record per batch) ──────────────────────────────────
    const paymentGroupRef = db.collection('paymentGroups').doc();
    batch.set(paymentGroupRef, {
      agentId,
      totalAmount:   numTotalAmount,
      paymentMethod,
      transactionId: finalTxId,
      paymentDate:   new Date(paymentDate),
      createdBy:     authResult.user.uid,
      paymentNote,
      fileUrl:       fileUrl || '',
      paymentType:   'joinFees',
      createdAt:     admin.firestore.FieldValue.serverTimestamp()
    });

    // ── Process each member ───────────────────────────────────────────────────
    const commissionMembers = [];
    for (const payment of memberPayments) {
      const { memberId, memberName, amount } = payment;

      const memberRef = db.collection('members').doc(memberId);
      const memberDoc = await memberRef.get();
      if (!memberDoc.exists) {
        console.warn(`Member ${memberId} not found — skipping`);
        continue;
      }

      const memberData = memberDoc.data();

      // Guard: never accept payments for soft-deleted (trashed) members —
      // their amounts were already removed from agent/program/org aggregates,
      // so paying them would double-count on restore.
      if (memberData.delete_flag === true) {
        console.warn(`Member ${memberId} is deleted (in trash) — skipping payment`);
        continue;
      }

      // ── Single-program fields live flat on the member doc ─────────────────
      const programId      = memberData.programId      || '';
      const programName    = memberData.programName    || '';
      const pendingAmount  = memberData.pendingAmount  || 0;
      const currentPaid    = memberData.paidAmount     || 0;
      const joinFees       = memberData.joinFees       || 0;

      // Guard: nothing to pay
      if (pendingAmount <= 0) {
        console.warn(`Member ${memberId} already fully paid — skipping`);
        continue;
      }

      // ── Deduction = min(what they sent, what is actually pending) ─────────
      const requestedAmount  = Number(amount);
      const deduction        = Math.min(requestedAmount, pendingAmount);

      if (deduction <= 0) {
        console.warn(`Deduction is 0 for member ${memberId} — skipping`);
        continue;
      }

      const newPaid        = currentPaid + deduction;
      const newPending     = Math.max(0, pendingAmount - deduction);
      const paymentPct     = joinFees > 0 ? Math.min((newPaid / joinFees) * 100, 100) : 0;
      const paymentStatus  = paymentPct >= 100 ? 'paid' : paymentPct > 0 ? 'partial' : 'pending';

      // ── Update member doc (all financial + payment status fields) ──────────
      batch.update(memberRef, {
        paidAmount:         admin.firestore.FieldValue.increment(deduction),
        pendingAmount:      admin.firestore.FieldValue.increment(-deduction),
        paymentPercentage:  Number(paymentPct.toFixed(2)),
        paymentStatus,
        hasPendingPayments: newPending > 0,
        updated_at:         admin.firestore.FieldValue.serverTimestamp()
      });

      // ── Update global program stats ────────────────────────────────────────
      if (programId) {
        const globalProgramRef = db.collection('programs').doc(programId);
        batch.set(globalProgramRef, {
          totalJoinFeesPaid:    admin.firestore.FieldValue.increment(deduction),
          totalJoinFeesPending: admin.firestore.FieldValue.increment(-deduction),
          updated_at:           admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // ── Accumulate per-program deltas for agent programStats ─────────────
        if (!programDeltas[programId]) programDeltas[programId] = { paid: 0, pending: 0 };
        programDeltas[programId].paid    += deduction;
        programDeltas[programId].pending -= deduction;
      }

      actualTotalPaid += deduction;

    // ── Transaction record ────────────────────────────────────────────────
    const fatherName = memberData.fatherName || '';
    const phone = memberData.phone || '';
    const regNo = memberData.registrationNumber || '';
    const aadhaarNo = memberData.aadhaarNo || '';
    const displayName = memberData.displayName || memberName;
    const keyword = [displayName, regNo, fatherName, phone, aadhaarNo]
      .filter(Boolean).join(' ').toLowerCase();

    const feeRef = db.collection('memberJoinFees').doc();
    batch.set(feeRef, {
      memberId,
      memberName: displayName,
      memberFatherName: fatherName,
      memberPhone: phone,
      memberRegNo: regNo,
      memberAadhaar: aadhaarNo,
      programId,
      programName,
      amount:           deduction,          // actual applied amount
      requestedAmount,                       // original requested amount
      paymentMode:      paymentMethod,
      transactionId:    finalTxId,
      transactionDate:  paymentDate,
      status:           'completed',
      createdBy:        authResult.user.uid,
      paymentNote,
      fileUrl:          fileUrl || '',      // screenshot / receipt URL
      groupId:          paymentGroupRef.id,
      agentId:          agentId || '',
      createdAt:        admin.firestore.FieldValue.serverTimestamp(),
      search_keyword: keyword
    });

    commissionMembers.push({
      memberId,
      memberName: memberData.displayName || memberName,
      memberFatherName: memberData.fatherName || '',
      memberRegNo: memberData.registrationNumber || '',
      deduction, programId, programName
    });
  }

    // ── Guard: nothing was actually applied — don't write a phantom group ────
    if (actualTotalPaid <= 0) {
      await releaseIdempotency();
      return NextResponse.json({
        success: false,
        message: "No payment applied — all selected members were skipped (fully paid, deleted, or not found).",
      }, { status: 400 });
    }

    // ── Agent totals — use dot-notation INC per programId (atomic, no race) ──
    // NOTE: must use update(), NOT set({merge:true}) — the Admin SDK only
    // interprets dot-notation field paths in update(); set() would create
    // literal top-level fields named "programStats.x.y" (stats mismatch bug).
    const agentUpdate = {
      totalJoinFeesPaid:    admin.firestore.FieldValue.increment(actualTotalPaid),
      totalJoinFeesPending: admin.firestore.FieldValue.increment(-actualTotalPaid),
      updated_at:           admin.firestore.FieldValue.serverTimestamp(),
    };
    for (const [pid, delta] of Object.entries(programDeltas)) {
      agentUpdate[`programStats.${pid}.totalJoinFeesPaid`]    = admin.firestore.FieldValue.increment(delta.paid);
      agentUpdate[`programStats.${pid}.totalJoinFeesPending`] = admin.firestore.FieldValue.increment(delta.pending);
      agentUpdate[`programStats.${pid}.lastUpdated`]          = admin.firestore.FieldValue.serverTimestamp();
    }
    batch.update(agentRef, agentUpdate);

    // ── Keep the payment group's amount equal to what was ACTUALLY applied ───
    batch.update(paymentGroupRef, {
      totalAmount:      actualTotalPaid,
      requestedAmount:  numTotalAmount,
      actualTotalPaid,
    });

    // ── Org totals ────────────────────────────────────────────────────────────
    const orgRef = db.collection('organizationStats').doc('current');
    batch.set(orgRef, {
      totalJoinFeesPaid:    admin.firestore.FieldValue.increment(actualTotalPaid),
      totalJoinFeesPending: admin.firestore.FieldValue.increment(-actualTotalPaid),
      updated_at:           admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await batch.commit();
    committed = true;

    // Payment is durable from here — mark the key so any replay of this exact
    // submission returns the existing group instead of writing another one.
    if (idemRef) {
      try {
        await idemRef.update({
          status:         'completed',
          paymentGroupId: paymentGroupRef.id,
          actualTotalPaid,
          completedAt:    admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        console.error('Failed to mark idempotency key completed:', e);
      }
    }

    // ── Commission processing — 5% of each payment credited to agent wallet ──
    const agentSnap = await agentRef.get();
    const agentName = agentSnap.exists ? agentSnap.data().name || '' : '';
    const commissionPromises = commissionMembers.map(c =>
      creditCommissionStandalone({
        agentId, agentName,
        amount: c.deduction,
        source: 'joinFees',
        sourceId: c.memberId,
        memberName: c.memberName,
        memberFatherName: c.memberFatherName,
        memberRegNo: c.memberRegNo,
        programId: c.programId,
        programName: c.programName,
        createdBy: authResult.user.uid,
        paymentGroupId: paymentGroupRef.id,
      })
    );
    await Promise.allSettled(commissionPromises);

    // ── Notify agent ──────────────────────────────────────────
    const memberNames = commissionMembers.map(m => m.memberName).join(', ');
    await sendToAgent(
      agentId,
      "Join Fee Payment Received",
      `₹${actualTotalPaid} received for ${commissionMembers.length} member(s): ${memberNames || agentName}`,
      { type: 'joinFee', amount: String(actualTotalPaid), memberCount: String(commissionMembers.length) }
    );

    return NextResponse.json({
      success: true,
      message: "Payment processed successfully",
      paymentGroupId: paymentGroupRef.id,
    });

  } catch (error) {
    console.error("❌ Error:", error);
    // Free the key so a genuine retry isn't blocked by a failed attempt — but
    // only if nothing was written. If the batch committed and a later step
    // (commission, FCM) threw, the payment exists and must stay claimed.
    if (idemRefOuter && !committed) {
      try { await idemRefOuter.delete(); }
      catch (e) { console.error('Failed to release idempotency key after error:', e); }
    }
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}