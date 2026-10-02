// POST /api/members/edit-join-fees
//
// Directly corrects a member's join-fee figures. This bypasses the normal
// payment flow — no memberJoinFees transaction is written — so it is superadmin
// only and every call is recorded in `joinFeesEdits`.
//
// CONTRACT: only `joinFees` (total) and `paidAmount` are supplied. Pending is
// always derived as total − paid and never accepted from the client. Storing a
// pending that disagrees with total − paid is exactly what made the agent list
// and the agent detail page report different numbers.
//
// Every write is a delta (INC), never an absolute overwrite, so a concurrent
// real payment landing at the same moment is not clobbered. The member doc is
// read and written inside a transaction so two admins editing the same member
// can't both compute their delta from the same stale "before" values.
//
// Cascade — the same four places api/agents/recalculate-stats maintains:
//   member.{joinFees, paidAmount, pendingAmount, paymentPercentage}
//   agent.{totalJoinFees, totalJoinFeesPaid, totalJoinFeesPending}
//   agent.programStats.{programId}.{same three}
//   programs/{programId} and organizationStats/current
//
// Body: { memberId, joinFees, paidAmount, note? }

import { NextResponse } from 'next/server';
import admin from '../../db/firebaseAdmin';
import { checkRole, verifyToken } from '../../../../../middleware/authMiddleware';

export const runtime = 'nodejs';

const db  = admin.firestore();
const INC = admin.firestore.FieldValue.increment;
const STS = admin.firestore.FieldValue.serverTimestamp;

const money = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  // Whole rupees only — the rest of the system stores integers, and a stray
  // 0.01 here would make every downstream total look "almost right".
  return Math.round(n);
};

export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });

    // Rewrites money outside the payment trail — superadmin only.
    if (!checkRole(['superadmin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Only superadmin can edit join fee amounts' }, { status: 403 });

    const { memberId, joinFees, paidAmount, note = '' } = await req.json().catch(() => ({}));

    if (!memberId)
      return NextResponse.json({ success: false, message: 'memberId is required' }, { status: 400 });

    const newTotal = money(joinFees);
    const newPaid  = money(paidAmount);

    if (newTotal === null || newPaid === null)
      return NextResponse.json({ success: false, message: 'joinFees and paidAmount must be numbers' }, { status: 400 });
    if (newTotal < 0 || newPaid < 0)
      return NextResponse.json({ success: false, message: 'Amounts cannot be negative' }, { status: 400 });
    if (newPaid > newTotal)
      return NextResponse.json({
        success: false,
        message: `Paid (₹${newPaid.toLocaleString('en-IN')}) cannot exceed total join fees (₹${newTotal.toLocaleString('en-IN')})`,
      }, { status: 400 });

    const memberRef = db.collection('members').doc(memberId);

    // ── Transaction: read-compute-write so concurrent edits can't both base
    //    their delta on the same "before" snapshot ────────────────────────────
    const result = await db.runTransaction(async (txn) => {
      // ALL reads first — Firestore rejects a transaction that reads after it
      // has written, so the agent doc has to be fetched up front even though it
      // is only needed further down.
      const snap = await txn.get(memberRef);
      if (!snap.exists) throw new Error('Member not found');

      const m = snap.data();
      if (m.delete_flag === true) throw new Error('Cannot edit a deleted member');

      const agentId   = m.agentId   || null;
      const programId = m.programId || null;

      const agentRef  = agentId ? db.collection('agents').doc(agentId) : null;
      const agentSnap = agentRef ? await txn.get(agentRef) : null;

      const oldTotal   = Number(m.joinFees   || 0);
      const oldPaid    = Number(m.paidAmount || 0);
      // Recompute rather than trusting the stored field, so an already-corrupt
      // pendingAmount is repaired by this edit instead of being carried forward.
      const oldPending = Math.max(0, oldTotal - oldPaid);

      const newPending = newTotal - newPaid;

      const dTotal   = newTotal   - oldTotal;
      const dPaid    = newPaid    - oldPaid;
      const dPending = newPending - oldPending;

      if (dTotal === 0 && dPaid === 0) {
        return { unchanged: true, oldTotal, oldPaid, oldPending };
      }

      const pct = newTotal > 0 ? Math.round((newPaid / newTotal) * 100) : 0;

      txn.update(memberRef, {
        joinFees:          newTotal,
        paidAmount:        newPaid,
        pendingAmount:     newPending,
        paymentPercentage: pct,
        joinFeesEditedAt:  STS(),
        joinFeesEditedBy:  authResult.user.uid,
        updated_at:        STS(),
      });

      // Agent totals — top-level AND programStats, because processAgentStats
      // falls back to the programStats rollup when a top-level field is absent.
      if (agentRef && agentSnap?.exists) {
        const agentUpdate = {
          totalJoinFees:        INC(dTotal),
          totalJoinFeesPaid:    INC(dPaid),
          totalJoinFeesPending: INC(dPending),
          updated_at:           STS(),
        };
        if (programId) {
          agentUpdate[`programStats.${programId}.totalJoinFees`]        = INC(dTotal);
          agentUpdate[`programStats.${programId}.totalJoinFeesPaid`]    = INC(dPaid);
          agentUpdate[`programStats.${programId}.totalJoinFeesPending`] = INC(dPending);
          agentUpdate[`programStats.${programId}.lastUpdated`]          = STS();
        }
        txn.update(agentRef, agentUpdate);
      }

      if (programId) {
        txn.set(db.collection('programs').doc(programId), {
          totalJoinFees:        INC(dTotal),
          totalJoinFeesPaid:    INC(dPaid),
          totalJoinFeesPending: INC(dPending),
          updated_at:           STS(),
        }, { merge: true });
      }

      txn.set(db.collection('organizationStats').doc('current'), {
        totalJoinFees:        INC(dTotal),
        totalJoinFeesPaid:    INC(dPaid),
        totalJoinFeesPending: INC(dPending),
        updated_at:           STS(),
      }, { merge: true });

      // Audit — written in the same transaction, so a recorded edit always
      // corresponds to an applied one.
      txn.set(db.collection('joinFeesEdits').doc(), {
        memberId,
        memberName:         m.displayName        || '',
        fatherName:         m.fatherName         || '',
        registrationNumber: m.registrationNumber || '',
        phone:              m.phone              || '',
        village:            m.village            || '',
        agentId,
        programId,
        programName:        m.programName || '',
        before: { joinFees: oldTotal, paidAmount: oldPaid, pendingAmount: oldPending },
        after:  { joinFees: newTotal, paidAmount: newPaid, pendingAmount: newPending },
        delta:  { joinFees: dTotal,   paidAmount: dPaid,   pendingAmount: dPending },
        note:        String(note || '').slice(0, 500),
        editedBy:    authResult.user.uid,
        editedByName: authResult.user.name || authResult.user.email || '',
        createdAt:   STS(),
      });

      return {
        unchanged: false,
        oldTotal, oldPaid, oldPending,
        newTotal, newPaid, newPending,
        dTotal, dPaid, dPending,
        paymentPercentage: pct,
        agentId, programId,
      };
    });

    if (result.unchanged) {
      return NextResponse.json({ success: true, unchanged: true, message: 'No change — values are already these amounts' });
    }

    console.log(
      `[EditJoinFees] ${memberId} by ${authResult.user.uid}: ` +
      `total ${result.oldTotal}→${result.newTotal}, paid ${result.oldPaid}→${result.newPaid}`
    );

    return NextResponse.json({
      success: true,
      message: 'Join fee amounts updated',
      data: result,
    });

  } catch (error) {
    console.error('edit-join-fees error:', error);
    const notFound = /not found/i.test(error.message);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: notFound ? 404 : 500 }
    );
  }
}

// GET /api/members/edit-join-fees?memberId=xxx — recent edits for one member,
// or the latest edits overall when no memberId is given.
export async function GET(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Only superadmin can view join fee edit history' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get('memberId');
    const max      = Math.min(Number(searchParams.get('limit')) || 50, 200);

    // Single equality + orderBy on one field needs only a simple index; when no
    // memberId is given it's a plain ordered read.
    let q = db.collection('joinFeesEdits');
    if (memberId) q = q.where('memberId', '==', memberId);
    const snap = await q.orderBy('createdAt', 'desc').limit(max).get();

    return NextResponse.json({
      success: true,
      data: snap.docs.map(d => {
        const v = d.data();
        return { id: d.id, ...v, createdAt: v.createdAt?.toDate?.()?.toISOString() || null };
      }),
    });
  } catch (error) {
    console.error('edit-join-fees history error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
