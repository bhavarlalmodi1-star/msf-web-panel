import { NextResponse } from "next/server";
import admin from "../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../middleware/authMiddleware";
import { creditCommissionStandalone } from "../commission/route";
import { sendToAgent } from "../db/fcm";

const db = admin.firestore();
const INC = admin.firestore.FieldValue.increment;
const STS = admin.firestore.FieldValue.serverTimestamp;

// Auto-generate a cash reference ID so cash payments are searchable
const generateCashId = () => {
  const d   = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `CSH-${date}-${time}-${rand}`;
};

// ─── helpers ──────────────────────────────────────────────────────────────────
const chunkArr = (arr, n) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) =>
    arr.slice(i * n, i * n + n)
  );

// Fetch closing_payment docs for a member — returns pending or partially-paid docs
const fetchClosingPaymentDocs = async (memberId) => {
  const snap = await db.collection("closing_payment")
    .where("memberId", "==", memberId)
    .where("status", "in", ["pending", "partial"])
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

// ─────────────────────────────────────────────────────────────────────────────
// POST — Closing Payment
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req) {
  // Hoisted so the catch block can release the claim — the request body is
  // already consumed by then and can't be re-read.
  let idemRefOuter = null;
  let committed    = false;

  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });

    const currentUser = authResult.user;
    if (!checkRole(['superadmin', 'admin'], currentUser.role))
      return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

    const body = await req.json();
    const {
      closingPayments, memberPayments, paymentDate, paymentMethod, paymentNote,
      totalAmount, transactionId, fileUrl, agentId, programId, idempotencyKey,
    } = body;

    // ── Idempotency guard ─────────────────────────────────────────────────────
    // The UTR check below only fires when the user typed a transaction ID, so
    // CASH closing payments had no duplicate protection at all — a double-click,
    // a browser retry, or a second click after a slow response wrote a second
    // payment group and deducted the member twice. Claiming a key atomically
    // closes that for every payment method.
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
          type:      'closingPayment',
          agentId:   agentId || null,
          createdBy: currentUser.uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return null;
      });

      if (prior) {
        console.warn(`[ClosingPayment] Duplicate submission blocked (key=${idempotencyKey}, status=${prior.status})`);
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

    const batch = db.batch();
    const numTotalAmount = Number(totalAmount);
    const timestamp = STS();
    const now = new Date().toISOString();

    // ── Resolve final transaction ID (auto-generate for cash) ─────────────────
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

    // ── Agent ──────────────────────────────────────────────────────────────

    // A member with no agent would reach db.collection('agents').doc('') below,
    // which Firestore rejects with the opaque "documentPath is not a valid
    // resource path" — an error that says nothing about the real problem. Fail
    // early with something the user can act on.
    if (!agentId || typeof agentId !== 'string' || !agentId.trim()) {
      // The idempotency key was already claimed above; release it so a genuine
      // retry (once an agent is assigned) isn't rejected as a duplicate.
      await releaseIdempotency();
      return NextResponse.json({
        success: false,
        message: 'This member has no agent assigned, so the payment cannot be recorded against one. Assign an agent to the member first.',
      }, { status: 400 });
    }

    const agentRef = db.collection('agents').doc(agentId);
    const agentDoc = await agentRef.get();
    if (!agentDoc.exists) throw new Error('Agent not found');
    // Accumulate per-program deltas — written as dot-notation INC() to avoid
    // overwriting the entire programStats map (race condition).
    const programDeltas = {}; // { [programId]: { paid, pending, paidCount, pendingCount } }

    // ── Payment group ──────────────────────────────────────────────────────
    const paymentGroupRef = db.collection('paymentGroups').doc();
    batch.set(paymentGroupRef, {
      agentId, totalAmount: numTotalAmount, paymentMethod, transactionId: finalTxId,
      paymentDate: new Date(paymentDate), createdBy: authResult.user.uid,
      paymentNote, fileUrl: fileUrl || '', paymentType: 'closingPayment',
      createdAt: timestamp,
    });

    // ── Resolve which format was sent ──────────────────────────────────────
    // new format: closingPayments = [{ memberId, closingGroupId, amount, memberName }]
    // old format: memberPayments = [{ memberId, memberName, amount }] — auto-distribute
    const useNewFormat = closingPayments && closingPayments.length > 0;
    const paymentEntries = useNewFormat ? closingPayments : (memberPayments || []);

    let grandTotalPaid  = 0;
    let grandTotalCount = 0;
    const memberAllocations = {};
    const commissionMembers = [];

    // ── Helper: update single closing_payment doc ──────────────────────────
    const updateClosingPaymentDoc = (cpDoc, coverAmount) => {
      const docTotal     = Number(cpDoc.totalAmount || 0);
      const docPaidSoFar = Number(cpDoc.paidAmount  || 0);
      const newDocPaid   = docPaidSoFar + coverAmount;
      const docFullyPaid = newDocPaid >= docTotal;
      const cpRef        = db.collection("closing_payment").doc(cpDoc.id);

      batch.update(cpRef, {
        paidAmount:        newDocPaid,
        pendingAmount:     Math.max(0, docTotal - newDocPaid),
        status:            docFullyPaid ? "paid" : "partial",
        paymentPercentage: docTotal > 0 ? Number(((newDocPaid / docTotal) * 100).toFixed(2)) : 100,
        lastPaymentAmount:   coverAmount,
        lastPaymentDate:     paymentDate || now,
        lastPaymentMethod:   paymentMethod,
        lastPaymentGroupId:  paymentGroupRef.id,
        lastPaymentNote:     paymentNote     || null,
        lastTransactionId:   finalTxId || null,
        lastFileUrl:         fileUrl   || null,
        lastPaidBy:          authResult.user.uid,
        lastPaidByName:      authResult.user.displayName || null,
        lastUpdatedAt:       timestamp,
        paymentHistory: admin.firestore.FieldValue.arrayUnion({
          amount: coverAmount, paymentDate: paymentDate || now, paymentMethod,
          paymentGroupId: paymentGroupRef.id, transactionId: finalTxId || null,
          fileUrl: fileUrl || null, note: paymentNote || null,
          paidBy: authResult.user.uid, paidAt: now,
        }),
      });

      return { docFullyPaid, wasPending: cpDoc.status === 'pending', closingGroupId: cpDoc.closingGroupId };
    };

    // ── Per-member/per-group loop ────────────────────────────────────────────
    for (const payment of paymentEntries) {
      const { memberId, memberName, amount } = payment;
      const requestedAmount = Number(amount);
      if (requestedAmount <= 0) continue;

      const memberRef = db.collection('members').doc(memberId);
      const memberDoc = await memberRef.get();
      if (!memberDoc.exists) continue;

      const memberData     = memberDoc.data();

      // Guard: never accept payments for soft-deleted (trashed) members
      if (memberData.delete_flag === true) {
        console.warn(`[closingPayment] Member ${memberId} is deleted (in trash) — skipping`);
        continue;
      }

      const pId            = memberData.programId   || '';
      const programName    = memberData.programName || '';
      const closingPending = Number(memberData.closing_pendingAmount || 0);
      const pendingCnt     = Number(memberData.pendingClosingCount  || 0);

      if (closingPending <= 0) {
        console.warn(`[closingPayment] Member ${memberId} has no closing_pendingAmount — skipping`);
        continue;
      }

      const deduction = Math.min(requestedAmount, closingPending);
      if (deduction <= 0) continue;

      let paidDocsCount = 0;
      const paidGroupIds = [];

      try {
        if (useNewFormat && payment.closingGroupId) {
          // ── NEW FORMAT: pay a specific closing group ───────────────────────
          const cpDocId = `${memberId}_${payment.closingGroupId}`;
          const cpSnap = await db.collection("closing_payment").doc(cpDocId).get();
          if (cpSnap.exists) {
            const cpData = { id: cpDocId, ...cpSnap.data() };
            const docPending = Number(cpData.totalAmount || 0) - Number(cpData.paidAmount || 0);
            const coverAmount = Math.min(deduction, docPending);
            if (coverAmount > 0) {
              const result = updateClosingPaymentDoc(cpData, coverAmount);
              if (result.wasPending) paidDocsCount += 1;
              paidGroupIds.push({ closingGroupId: result.closingGroupId, amount: coverAmount });
            }
          }
        } else {
          // ── OLD FORMAT: auto-distribute across pending docs oldest-first ──
          const pendingClosingDocs = await fetchClosingPaymentDocs(memberId);
          let remainingDeduction = deduction;

          for (const cpDoc of pendingClosingDocs) {
            if (remainingDeduction <= 0) break;
            const docPending = Number(cpDoc.totalAmount || 0) - Number(cpDoc.paidAmount || 0);
            if (docPending <= 0) continue;
            const coverAmount = Math.min(remainingDeduction, docPending);
            const result = updateClosingPaymentDoc(cpDoc, coverAmount);
            remainingDeduction -= coverAmount;
            if (result.wasPending) paidDocsCount += 1;
            paidGroupIds.push({ closingGroupId: result.closingGroupId, amount: coverAmount });
          }
        }
      } catch (cpErr) {
        console.error(`[closingPayment] closing_payment update failed for ${memberId}:`, cpErr);
      }

      // ── Build per-group update map for member doc ────────────────────────
      const groupUpdates = {};
      for (const g of paidGroupIds) {
        const gId = g.closingGroupId;
        if (!gId) continue;
        // Read current per-group values from member doc (or default 0)
        const currPaid   = Number((memberData.closingGroupPaidAmounts || {})[gId] || 0);
        const currPending = Number((memberData.closingGroupPendingAmounts || {})[gId] || 0);
        const oldTotal    = currPaid + currPending;
        const newPaidAmt  = currPaid + g.amount;
        const newPending  = Math.max(0, oldTotal - newPaidAmt);
        groupUpdates[`closingGroupPaidAmounts.${gId}`]    = newPaidAmt;
        groupUpdates[`closingGroupPendingAmounts.${gId}`] = newPending;
        groupUpdates[`closingGroupPaidCounts.${gId}`]     = INC(1);
        groupUpdates[`closingGroupStatus.${gId}`]         = newPending <= 0 ? "paid" : "partial";
      }

      // ── Update member doc ────────────────────────────────────────────────
      const closingTotal = memberData.closing_totalAmount || 0;
      const newPaid      = (memberData.closing_paidAmount || 0) + deduction;
      const paymentPct   = closingTotal > 0 ? Math.min((newPaid / closingTotal) * 100, 100) : 0;
      const decrementCnt = Math.min(paidDocsCount, pendingCnt);

      batch.update(memberRef, {
        closing_paidAmount:         INC(deduction),
        closing_pendingAmount:      INC(-deduction),
        closing_paymentPercentage:  Number(paymentPct.toFixed(2)),
        paidClosingCount:           INC(paidDocsCount),
        pendingClosingCount:        decrementCnt > 0 ? INC(-decrementCnt) : INC(0),
        updated_at:                 timestamp,
        ...groupUpdates,
      });

      // ── Program stats ────────────────────────────────────────────────────
      if (pId) {
        batch.set(db.collection('programs').doc(pId), {
          totalClosingPaidAmount:    INC(deduction),
          totalClosingPendingAmount: INC(-deduction),
          paidClosingCount:          INC(paidDocsCount),
          pendingClosingCount:       decrementCnt > 0 ? INC(-decrementCnt) : INC(0),
          updated_at:                timestamp,
        }, { merge: true });

        if (!programDeltas[pId]) programDeltas[pId] = { paid: 0, pending: 0, paidCount: 0, pendingCount: 0 };
        programDeltas[pId].paid        += deduction;
        programDeltas[pId].pending     -= deduction;
        programDeltas[pId].paidCount   += paidDocsCount;
        programDeltas[pId].pendingCount -= decrementCnt;
      }

      // ── Commission ──────────────────────────────────────────────────────
      commissionMembers.push({
        memberId,
        memberName: memberData.displayName || memberName,
        memberFatherName: memberData.fatherName || '',
        memberRegNo: memberData.registrationNumber || '',
        deduction, programId: pId, programName
      });

      const closingGroupIdsStr = paidGroupIds.map(g => g.closingGroupId).filter(Boolean).join(',');
      memberAllocations[memberId] = { programId: pId, programName, amount: deduction, paidDocsCount, closingGroupIds: closingGroupIdsStr };
      grandTotalPaid  += deduction;
      grandTotalCount += paidDocsCount;

      // ── Transaction record ─────────────────────────────────────────────
      const fatherName = memberData.fatherName || '';
      const phone = memberData.phone || '';
      const regNo = memberData.registrationNumber || '';
      const aadhaarNo = memberData.aadhaarNo || '';
      const displayName = memberData.displayName || memberName;
      const keyword = [displayName, regNo, fatherName, phone, aadhaarNo]
        .filter(Boolean).join(' ').toLowerCase();

      batch.set(db.collection('memberClosingFees').doc(), {
        memberId, memberName: displayName,
        memberFatherName: fatherName,
        memberPhone: phone,
        memberRegNo: regNo,
        memberAadhaar: aadhaarNo,
        programId: pId, programName,
        amount: deduction, requestedAmount,
        paymentMode:     paymentMethod,
        transactionId:   finalTxId,
        transactionDate: paymentDate,
        status:          'completed',
        createdBy:       authResult.user.uid,
        paymentNote,
        groupId:         paymentGroupRef.id,
        closingGroupId:  paidGroupIds.map(g => g.closingGroupId).filter(Boolean)[0] || '',
        paymentType:     'closingPayment',
        agentId:         agentId || '',
        createdAt:       timestamp,
        search_keyword: keyword,
      });
    }

    // ── Guard: nothing was actually applied — don't write a phantom group ────
    if (grandTotalPaid <= 0) {
      return NextResponse.json({
        success: false,
        message: 'No payment applied — all selected members were skipped (nothing pending, deleted, or not found).',
      }, { status: 400 });
    }

    // ── Agent main doc — use dot-notation INC per programId (atomic, no race) ──
    // NOTE: must use update(), NOT set({merge:true}) — the Admin SDK only
    // interprets dot-notation field paths in update(); set() would create
    // literal top-level fields named "programStats.x.y" (stats mismatch bug).
    // Clamp the decrements so the agent can never go negative.
    //
    // INC(-grandTotalPaid) has no floor: whenever the agent's stored pending was
    // already lower than the payment being applied — a member charged without
    // the agent aggregate being updated, a half-applied close, a stat that was
    // rebuilt in between — the subtraction ran straight past zero. That is how
    // an agent ends up showing closing pending of -12,000. Reading the agent doc
    // first and writing an absolute floor costs one read and makes the field
    // impossible to corrupt this way.
    const agentSnapNow  = await agentRef.get();
    const agentNow      = agentSnapNow.exists ? agentSnapNow.data() : {};
    const curPending    = Number(agentNow.closing_pendingAmount || 0);
    const curPendCount  = Number(agentNow.pendingClosingCount   || 0);

    if (curPending < grandTotalPaid) {
      console.warn(
        `[ClosingPayment] agent ${agentId} pending (${curPending}) is less than the ` +
        `payment being applied (${grandTotalPaid}) — clamping to 0. Agent stats have ` +
        `drifted from their members; run Sync Stats.`
      );
    }

    const agentUpdate = {
      closing_paidAmount:    INC(grandTotalPaid),
      closing_pendingAmount: Math.max(0, curPending   - grandTotalPaid),
      paidClosingCount:      INC(grandTotalCount),
      pendingClosingCount:   Math.max(0, curPendCount - grandTotalCount),
      updated_at:            timestamp,
    };
    for (const [pid, delta] of Object.entries(programDeltas)) {
      agentUpdate[`programStats.${pid}.totalClosingPaidAmount`]    = INC(delta.paid);
      agentUpdate[`programStats.${pid}.totalClosingPendingAmount`] = INC(delta.pending);
      agentUpdate[`programStats.${pid}.paidClosingCount`]          = INC(delta.paidCount);
      agentUpdate[`programStats.${pid}.pendingClosingCount`]       = INC(delta.pendingCount);
      agentUpdate[`programStats.${pid}.lastUpdated`]               = timestamp;
    }
    batch.update(agentRef, agentUpdate);

    // ── Finalize payment group — keep totalAmount equal to actual applied ────
    batch.update(paymentGroupRef, {
      status:          'completed',
      paidAt:          timestamp,
      memberAllocations,
      totalAmount:     grandTotalPaid,
      requestedAmount: numTotalAmount,
      actualTotalPaid: grandTotalPaid,
    });

    // ── Org stats ──────────────────────────────────────────────────────────
    batch.set(db.collection('organizationStats').doc('current'), {
      totalClosingPaidAmount:    INC(grandTotalPaid),
      totalClosingPendingAmount: INC(-grandTotalPaid),
      paidClosingCount:          INC(grandTotalCount),
      pendingClosingCount:       INC(-grandTotalCount),
      updated_at:                timestamp,
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
          actualTotalPaid: grandTotalPaid,
          completedAt:    admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        console.error('Failed to mark idempotency key completed:', e);
      }
    }

    // ── Commission — 5% of each closing payment credited to agent wallet ──
    const agentSnap = await agentRef.get();
    const agentName = agentSnap.exists ? agentSnap.data().name || '' : '';
    const commissionPromises = commissionMembers.map(c =>
      creditCommissionStandalone({
        agentId, agentName,
        amount: c.deduction,
        source: 'closingPayment',
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
    const closingMemberNames = commissionMembers.map(m => m.memberName).join(', ');
    await sendToAgent(
      agentId,
      "Closing Payment Received",
      `₹${grandTotalPaid} received for ${grandTotalCount} member(s): ${closingMemberNames || agentName}`,
      { type: 'closingPayment', amount: String(grandTotalPaid), memberCount: String(grandTotalCount) }
    );

    return NextResponse.json({
      success: true,
      message: 'Closing payment processed successfully',
      data: {
        paymentGroupId:       paymentGroupRef.id,
        totalAmount:          grandTotalPaid,
        totalClosingEntries:  grandTotalCount,
        allocations:          memberAllocations,
      },
    });

  } catch (error) {
    console.error('❌ Error processing closing payment:', error);
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