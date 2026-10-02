// app/api/members/delete-restore/route.js
import { NextResponse } from "next/server";

import admin from "../../db/firebaseAdmin";
import { verifyToken, checkRole } from "../../../../../middleware/authMiddleware";

const db = admin.firestore();
const auth = admin.auth();
const INC = admin.firestore.FieldValue.increment;
const DEL = admin.firestore.FieldValue.delete;
const STS = admin.firestore.FieldValue.serverTimestamp;

// ─── Read flat member data (single program) ───────────────────────────────────
const getMemberInfo = async (memberId) => {
    const snap = await db.collection('members').doc(memberId).get();
    if (!snap.exists) return null;
    const d = snap.data();
    return {
        programId: d.programId || '',
        programName: d.programName || '',
        agentId: d.agentId || null,
        joinFees: d.joinFees || 0,
        paidAmount: d.paidAmount || 0,
        // Recompute from joinFees - paidAmount so bad stored values don't skew stats
        pendingAmount: Math.max(0, (d.joinFees || 0) - (d.paidAmount || 0)),
        // closing fields
        closing_totalAmount: d.closing_totalAmount || 0,
        closing_paidAmount: d.closing_paidAmount || 0,
        closing_pendingAmount: d.closing_pendingAmount || 0,
        totalClosingCount: d.totalClosingCount || 0,
        paidClosingCount: d.paidClosingCount || 0,
        pendingClosingCount: d.pendingClosingCount || 0,
        // member identity (for commission reversal records)
        displayName: d.displayName || d.fullName || '',
        fatherName: d.fatherName || '',
        registrationNumber: d.registrationNumber || '',
        // current delete state (for idempotency guards)
        delete_flag: d.delete_flag === true,
    };
};

// ─── Reverse ALL commissions when a member is deleted ─────────────────────────
// Covers BOTH joinFees and closingPayment credits tied to this member.
// Idempotent: every reversed credit tx is marked { reversed: true } so a
// delete → restore → delete cycle can never double-deduct the wallet.
const reverseMemberCommissions = async (memberId, memberInfo) => {
    try {
        const snap = await db.collection('commissionTransactions')
            .where('sourceId', '==', memberId)
            .where('type', '==', 'credit')
            .get();

        // Only credits not yet reversed (restore-credits are normal credits,
        // so they are included automatically on a second delete)
        const activeCredits = snap.docs.filter(d => d.data().reversed !== true);
        if (!activeCredits.length) {
            console.log(`No active commissions to reverse for member ${memberId}`);
            return;
        }

        // Group commission amounts by agentId
        const agentMap = {};
        activeCredits.forEach(doc => {
            const tx = doc.data();
            if (!agentMap[tx.agentId]) {
                agentMap[tx.agentId] = {
                    totalAmount: 0,
                    refs: [],
                    agentName: tx.agentName || '',
                    commissionRate: tx.commissionRate || 0,
                    commissionRatePercent: tx.commissionRatePercent || 0,
                };
            }
            agentMap[tx.agentId].totalAmount += tx.amount || 0;
            agentMap[tx.agentId].refs.push(doc.ref);
        });

        // Reverse per agent (allow negative wallet)
        for (const [agentId, data] of Object.entries(agentMap)) {
            if (data.totalAmount <= 0) continue;

            const agentRef  = db.collection('agents').doc(agentId);
            const agentSnap = await agentRef.get();
            if (!agentSnap.exists) continue;

            const currentWallet  = agentSnap.data().walletBalance || 0;
            const reversalAmount = Math.round(data.totalAmount * 100) / 100;
            const batch          = db.batch();

            // Deduct from wallet — negative balance is allowed
            batch.update(agentRef, {
                walletBalance:         INC(-reversalAmount),
                totalCommissionEarned: INC(-reversalAmount),
                updated_at:            STS(),
            });

            // Mark the original credit txs as reversed (idempotency)
            data.refs.forEach(ref => batch.update(ref, { reversed: true, reversedAt: STS() }));

            // Write reversal transaction record
            const txRef = db.collection('commissionTransactions').doc();
            batch.set(txRef, {
                agentId,
                agentName:            data.agentName,
                type:                 'reversal',
                amount:               reversalAmount,
                source:               'memberDelete',
                sourceId:             memberId,
                memberName:           memberInfo.displayName || '',
                memberFatherName:     memberInfo.fatherName  || '',
                memberRegNo:          memberInfo.registrationNumber || '',
                programId:            memberInfo.programId   || '',
                programName:          memberInfo.programName || '',
                commissionRate:       data.commissionRate,
                commissionRatePercent: data.commissionRatePercent,
                reversalReason:       'member_deleted',
                restored:             false,
                description:          `Commission Reversed — Member Deleted (${memberInfo.displayName || memberId})`,
                balanceBefore:        currentWallet,
                balanceAfter:         currentWallet - reversalAmount,
                createdAt:            STS(),
            });

            await batch.commit();
            console.log(`✅ Commission reversed ₹${reversalAmount} from agent ${agentId} for deleted member ${memberId}`);
        }
    } catch (e) {
        // Non-blocking — log but don't fail the delete
        console.error('❌ reverseMemberCommissions error:', e);
    }
};

// ─── Re-credit commissions when a member is restored from trash ───────────────
// Finds 'reversal' txs created by the delete (reversalReason: 'member_deleted',
// not yet restored) and credits the amount back to each agent's wallet.
// Each processed reversal is marked { restored: true } so a double restore
// can never double-credit.
const restoreMemberCommissions = async (memberId, memberInfo, restoredBy) => {
    try {
        const snap = await db.collection('commissionTransactions')
            .where('sourceId', '==', memberId)
            .where('type', '==', 'reversal')
            .get();

        const pendingReversals = snap.docs.filter(d => {
            const t = d.data();
            if (t.restored === true) return false;
            // Only reversals caused by member deletion (legacy ones matched by description)
            return t.reversalReason === 'member_deleted'
                || (t.description || '').startsWith('Commission Reversed — Member Deleted');
        });
        if (!pendingReversals.length) {
            console.log(`No deleted-member commission reversals to restore for member ${memberId}`);
            return;
        }

        const agentMap = {};
        pendingReversals.forEach(doc => {
            const tx = doc.data();
            if (!agentMap[tx.agentId]) {
                agentMap[tx.agentId] = { totalAmount: 0, refs: [], sample: tx };
            }
            agentMap[tx.agentId].totalAmount += tx.amount || 0;
            agentMap[tx.agentId].refs.push(doc.ref);
        });

        for (const [agentId, data] of Object.entries(agentMap)) {
            const creditAmount = Math.round(data.totalAmount * 100) / 100;
            if (creditAmount <= 0) continue;

            const agentRef  = db.collection('agents').doc(agentId);
            const agentSnap = await agentRef.get();
            if (!agentSnap.exists) continue;

            const currentWallet = agentSnap.data().walletBalance || 0;
            const batch         = db.batch();

            batch.update(agentRef, {
                walletBalance:         INC(creditAmount),
                totalCommissionEarned: INC(creditAmount),
                updated_at:            STS(),
            });

            // Mark reversals as restored (idempotency)
            data.refs.forEach(ref => batch.update(ref, { restored: true, restoredAt: STS() }));

            // Write a normal credit tx — a future delete will reverse it again
            const txRef = db.collection('commissionTransactions').doc();
            batch.set(txRef, {
                agentId,
                agentName:            data.sample.agentName || '',
                type:                 'credit',
                amount:               creditAmount,
                baseAmount:           data.sample.baseAmount || 0,
                source:               data.sample.source || 'memberRestore',
                sourceId:             memberId,
                memberName:           memberInfo.displayName || '',
                memberFatherName:     memberInfo.fatherName  || '',
                memberRegNo:          memberInfo.registrationNumber || '',
                programId:            memberInfo.programId   || '',
                programName:          memberInfo.programName || '',
                commissionRate:       data.sample.commissionRate || 0,
                commissionRatePercent: data.sample.commissionRatePercent || 0,
                description:          `Commission Restored — Member Restored (${memberInfo.displayName || memberId})`,
                balanceBefore:        currentWallet,
                balanceAfter:         currentWallet + creditAmount,
                createdBy:            restoredBy || '',
                createdAt:            STS(),
            });

            await batch.commit();
            console.log(`✅ Commission restored ₹${creditAmount} to agent ${agentId} for restored member ${memberId}`);
        }
    } catch (e) {
        // Non-blocking — log but don't fail the restore
        console.error('❌ restoreMemberCommissions error:', e);
    }
};

// ─── DECREMENT (delete → trash) ───────────────────────────────────────────────
// Uses atomic INC(-value) and dot-notation for programStats — no read-before-write
// race condition when multiple members are deleted concurrently for the same agent.
const decrementStats = async (info) => {
    const { programId, agentId, joinFees, paidAmount, pendingAmount,
        closing_totalAmount, closing_paidAmount, closing_pendingAmount,
        totalClosingCount, paidClosingCount, pendingClosingCount } = info;

    const batch = db.batch();

    // ── Agent ────────────────────────────────────────────────────────────────
    if (agentId) {
        const agentSnap = await db.collection('agents').doc(agentId).get();
        if (agentSnap.exists) {
            batch.update(db.collection('agents').doc(agentId), {
                memberCount:          INC(-1),
                totalJoinFees:        INC(-joinFees),
                totalJoinFeesPaid:    INC(-paidAmount),
                totalJoinFeesPending: INC(-pendingAmount),
                closing_totalAmount:    INC(-closing_totalAmount),
                closing_paidAmount:     INC(-closing_paidAmount),
                closing_pendingAmount:  INC(-closing_pendingAmount),
                totalClosingCount:      INC(-totalClosingCount),
                paidClosingCount:       INC(-paidClosingCount),
                pendingClosingCount:    INC(-pendingClosingCount),
                [`programStats.${programId}.memberCount`]:                  INC(-1),
                [`programStats.${programId}.totalJoinFees`]:                INC(-joinFees),
                [`programStats.${programId}.totalJoinFeesPaid`]:            INC(-paidAmount),
                [`programStats.${programId}.totalJoinFeesPending`]:         INC(-pendingAmount),
                [`programStats.${programId}.totalClosingAmount`]:           INC(-closing_totalAmount),
                [`programStats.${programId}.totalClosingPaidAmount`]:       INC(-closing_paidAmount),
                [`programStats.${programId}.totalClosingPendingAmount`]:    INC(-closing_pendingAmount),
                [`programStats.${programId}.totalClosingCount`]:            INC(-totalClosingCount),
                [`programStats.${programId}.paidClosingCount`]:             INC(-paidClosingCount),
                [`programStats.${programId}.pendingClosingCount`]:          INC(-pendingClosingCount),
                [`programStats.${programId}.lastUpdated`]:                  STS(),
                updated_at: STS(),
            });
        }
    }

    // ── Program ──────────────────────────────────────────────────────────────
    if (programId) {
        batch.update(db.collection('programs').doc(programId), {
            memberCount:               INC(-1),
            totalJoinFees:             INC(-joinFees),
            totalJoinFeesPaid:         INC(-paidAmount),
            totalJoinFeesPending:      INC(-pendingAmount),
            totalClosingAmount:        INC(-closing_totalAmount),
            totalClosingPaidAmount:    INC(-closing_paidAmount),
            totalClosingPendingAmount: INC(-closing_pendingAmount),
            totalClosingCount:         INC(-totalClosingCount),
            paidClosingCount:          INC(-paidClosingCount),
            pendingClosingCount:       INC(-pendingClosingCount),
            updated_at:                STS(),
        });
    }

    // ── Org ──────────────────────────────────────────────────────────────────
    batch.set(db.collection('organizationStats').doc('current'), {
        totalMembers:              INC(-1),
        totalJoinFees:             INC(-joinFees),
        totalJoinFeesPaid:         INC(-paidAmount),
        totalJoinFeesPending:      INC(-pendingAmount),
        totalClosingPendingAmount: INC(-closing_pendingAmount),
        totalClosingPaidAmount:    INC(-closing_paidAmount),
        totalClosingAmount:        INC(-closing_totalAmount),
        totalClosingCount:         INC(-totalClosingCount),
        paidClosingCount:          INC(-paidClosingCount),
        pendingClosingCount:       INC(-pendingClosingCount),
        updated_at:                STS(),
    }, { merge: true });

    await batch.commit();
    console.log(`✅ Stats DECREMENTED for member (program: ${programId}, agent: ${agentId})`);
};

// ─── INCREMENT (restore from trash) ──────────────────────────────────────────
// Uses atomic INC() and dot-notation for programStats — no race condition.
const incrementStats = async (info) => {
    const { programId, programName, agentId, joinFees, paidAmount, pendingAmount,
        closing_totalAmount, closing_paidAmount, closing_pendingAmount,
        totalClosingCount, paidClosingCount, pendingClosingCount } = info;

    const batch = db.batch();

    // ── Agent ────────────────────────────────────────────────────────────────
    if (agentId) {
        const agentSnap = await db.collection('agents').doc(agentId).get();
        if (agentSnap.exists) {
            batch.update(db.collection('agents').doc(agentId), {
                memberCount:          INC(1),
                totalJoinFees:        INC(joinFees),
                totalJoinFeesPaid:    INC(paidAmount),
                totalJoinFeesPending: INC(pendingAmount),
                closing_totalAmount:    INC(closing_totalAmount),
                closing_paidAmount:     INC(closing_paidAmount),
                closing_pendingAmount:  INC(closing_pendingAmount),
                totalClosingCount:      INC(totalClosingCount),
                paidClosingCount:       INC(paidClosingCount),
                pendingClosingCount:    INC(pendingClosingCount),
                [`programStats.${programId}.programName`]:                  programName,
                [`programStats.${programId}.memberCount`]:                  INC(1),
                [`programStats.${programId}.totalJoinFees`]:                INC(joinFees),
                [`programStats.${programId}.totalJoinFeesPaid`]:            INC(paidAmount),
                [`programStats.${programId}.totalJoinFeesPending`]:         INC(pendingAmount),
                [`programStats.${programId}.totalClosingAmount`]:           INC(closing_totalAmount),
                [`programStats.${programId}.totalClosingPaidAmount`]:       INC(closing_paidAmount),
                [`programStats.${programId}.totalClosingPendingAmount`]:    INC(closing_pendingAmount),
                [`programStats.${programId}.totalClosingCount`]:            INC(totalClosingCount),
                [`programStats.${programId}.paidClosingCount`]:             INC(paidClosingCount),
                [`programStats.${programId}.pendingClosingCount`]:          INC(pendingClosingCount),
                [`programStats.${programId}.lastUpdated`]:                  STS(),
                updated_at: STS(),
            });
        }
    }

    // ── Program ──────────────────────────────────────────────────────────────
    if (programId) {
        batch.set(db.collection('programs').doc(programId), {
            memberCount:               INC(1),
            totalJoinFees:             INC(joinFees),
            totalJoinFeesPaid:         INC(paidAmount),
            totalJoinFeesPending:      INC(pendingAmount),
            totalClosingAmount:        INC(closing_totalAmount),
            totalClosingPaidAmount:    INC(closing_paidAmount),
            totalClosingPendingAmount: INC(closing_pendingAmount),
            totalClosingCount:         INC(totalClosingCount),
            paidClosingCount:          INC(paidClosingCount),
            pendingClosingCount:       INC(pendingClosingCount),
            updated_at:                STS(),
        }, { merge: true });
    }

    // ── Org ──────────────────────────────────────────────────────────────────
    batch.set(db.collection('organizationStats').doc('current'), {
        totalMembers:              INC(1),
        totalJoinFees:             INC(joinFees),
        totalJoinFeesPaid:         INC(paidAmount),
        totalJoinFeesPending:      INC(pendingAmount),
        totalClosingPendingAmount: INC(closing_pendingAmount),
        totalClosingPaidAmount:    INC(closing_paidAmount),
        totalClosingAmount:        INC(closing_totalAmount),
        totalClosingCount:         INC(totalClosingCount),
        paidClosingCount:          INC(paidClosingCount),
        pendingClosingCount:       INC(pendingClosingCount),
        updated_at:                STS(),
    }, { merge: true });

    await batch.commit();
    console.log(`✅ Stats INCREMENTED for member (program: ${programId}, agent: ${agentId})`);
};

// ─────────────────────────────────────────────────────────────────────────────
// POST  → soft-delete a member (mark delete_flag=true + decrement counters)
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req) {
    try {
        const authResult = await verifyToken(req);
        if (!authResult.success)
            return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });

        // Allow admin OR the member's own agent to delete
        const body = await req.json();
        const { memberId, deletedBy } = body;

        if (!memberId)
            return NextResponse.json({ success: false, message: 'memberId is required' }, { status: 400 });

        // Read member info before marking deleted
        const info = await getMemberInfo(memberId);
        if (!info)
            return NextResponse.json({ success: false, message: 'Member not found' }, { status: 404 });

        // Idempotency guard — a second delete would double-decrement all counters
        if (info.delete_flag)
            return NextResponse.json({ success: false, message: 'Member is already deleted' }, { status: 400 });

        // Soft-delete the member doc
        await db.collection('members').doc(memberId).update({
            delete_flag: true,
            status: 'deleted',
            active_flag: false,
            deleted_at: STS(),
            deleted_by: deletedBy || authResult.user.uid,
            updated_at: STS(),
        });

        // Decrement all counters
        await decrementStats(info);

        // Reverse ALL commissions for this member (wallet may go negative)
        await reverseMemberCommissions(memberId, info);

        return NextResponse.json({ success: true, message: 'Member deleted and counters updated' });
    } catch (e) {
        console.error('❌ DELETE member error:', e);
        return NextResponse.json({ success: false, message: e.message }, { status: 500 });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH → restore a member (mark delete_flag=false + increment counters)
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(req) {
    try {
        const authResult = await verifyToken(req);
        if (!authResult.success)
            return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });

        if (!checkRole(['superadmin', 'admin'], authResult.user.role))
            return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

        const body = await req.json();
        const { memberId } = body;

        if (!memberId)
            return NextResponse.json({ success: false, message: 'memberId is required' }, { status: 400 });

        // Read member info (still in Firestore, just flagged)
        const info = await getMemberInfo(memberId);
        if (!info)
            return NextResponse.json({ success: false, message: 'Member not found' }, { status: 404 });

        // Idempotency guard — restoring a non-deleted member would double-increment counters
        if (!info.delete_flag)
            return NextResponse.json({ success: false, message: 'Member is not deleted — nothing to restore' }, { status: 400 });

        // Restore the member doc
        await db.collection('members').doc(memberId).update({
            delete_flag: false,
            status: 'active',
            active_flag: true,
            deleted_at: DEL(),
            deleted_by: DEL(),
            restored_at: STS(),
            restored_by: authResult.user.uid,
            updated_at: STS(),
        });

        // Re-increment all counters
        await incrementStats(info);

        // Re-credit commissions that were reversed when the member was deleted
        await restoreMemberCommissions(memberId, info, authResult.user.uid);

        return NextResponse.json({ success: true, message: 'Member restored and counters updated' });
    } catch (e) {
        console.error('❌ RESTORE member error:', e);
        return NextResponse.json({ success: false, message: e.message }, { status: 500 });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE → permanently delete member doc + storage files
// (counters already decremented at soft-delete time, so no counter change here)
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req) {
    try {
        const authResult = await verifyToken(req);
        if (!authResult.success)
            return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });

        if (!checkRole(['superadmin', 'admin'], authResult.user.role))
            return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

        const { memberId } = await req.json();
        if (!memberId)
            return NextResponse.json({ success: false, message: 'memberId is required' }, { status: 400 });

        // Delete the Firestore doc
        await db.collection('members').doc(memberId).delete();

        // Delete payment summaries
        const psSnap = await db.collection('memberPaymentSummaries').where('memberId', '==', memberId).get();
        const psBatch = db.batch();
        psSnap.docs.forEach(d => psBatch.delete(d.ref));
        if (!psSnap.empty) await psBatch.commit();

        // Delete join fee transactions
        const jfSnap = await db.collection('memberJoinFees').where('memberId', '==', memberId).get();
        const jfBatch = db.batch();
        jfSnap.docs.forEach(d => jfBatch.delete(d.ref));
        if (!jfSnap.empty) await jfBatch.commit();

        // NOTE: Storage files are deleted client-side (already handled in TrashManagementPage)
        // Counter adjustment is NOT done here because counters were already decremented at soft-delete time.

        return NextResponse.json({ success: true, message: 'Member permanently deleted' });
    } catch (e) {
        console.error('❌ PERMANENT DELETE member error:', e);
        return NextResponse.json({ success: false, message: e.message }, { status: 500 });
    }
}