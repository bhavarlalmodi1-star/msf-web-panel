import { NextResponse } from "next/server";
import admin from "../../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../../middleware/authMiddleware";

const db = admin.firestore();
const INC = admin.firestore.FieldValue.increment;

export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin', 'admin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

    const { agentId, programId, paidDelta, type } = await req.json();
    const delta = Number(paidDelta) || 0;
    if (delta === 0) return NextResponse.json({ success: true, message: 'No change' });

    const batch = db.batch();

    const ts = admin.firestore.FieldValue.serverTimestamp();

    // Agent doc existence check — dot-notation field paths only work with
    // update() (set+merge writes literal "a.b.c" fields), and update() throws
    // on missing docs.
    let agentExists = false;
    if (agentId) {
      const agentSnap = await db.collection('agents').doc(agentId).get();
      agentExists = agentSnap.exists;
    }

    if (type === 'joinFees' || !type) {
      if (agentId && agentExists) {
        // Update both top-level agent fields AND programStats.{pid} so that
        // processAgentStats (which prefers programStats) shows correct numbers.
        const agentUpdate = {
          totalJoinFeesPaid:    INC(delta),
          totalJoinFeesPending: INC(-delta),
          updated_at:           ts,
        };
        if (programId) {
          agentUpdate[`programStats.${programId}.totalJoinFeesPaid`]    = INC(delta);
          agentUpdate[`programStats.${programId}.totalJoinFeesPending`] = INC(-delta);
          agentUpdate[`programStats.${programId}.lastUpdated`]          = ts;
        }
        batch.update(db.collection('agents').doc(agentId), agentUpdate);
      }
      if (programId) {
        batch.set(db.collection('programs').doc(programId), {
          totalJoinFeesPaid:    INC(delta),
          totalJoinFeesPending: INC(-delta),
          updated_at:           ts,
        }, { merge: true });
      }
      batch.set(db.collection('organizationStats').doc('current'), {
        totalJoinFeesPaid:    INC(delta),
        totalJoinFeesPending: INC(-delta),
        updated_at:           ts,
      }, { merge: true });
    }

    if (type === 'closingPayment') {
      if (agentId && agentExists) {
        // Same: update both top-level and programStats closing fields.
        const agentUpdate = {
          closing_paidAmount:    INC(delta),
          closing_pendingAmount: INC(-delta),
          updated_at:            ts,
        };
        if (programId) {
          agentUpdate[`programStats.${programId}.totalClosingPaidAmount`]    = INC(delta);
          agentUpdate[`programStats.${programId}.totalClosingPendingAmount`] = INC(-delta);
          agentUpdate[`programStats.${programId}.lastUpdated`]               = ts;
        }
        batch.update(db.collection('agents').doc(agentId), agentUpdate);
      }
      if (programId) {
        batch.set(db.collection('programs').doc(programId), {
          totalClosingPaidAmount:    INC(delta),
          totalClosingPendingAmount: INC(-delta),
          updated_at:                ts,
        }, { merge: true });
      }
      batch.set(db.collection('organizationStats').doc('current'), {
        totalClosingPaidAmount:    INC(delta),
        totalClosingPendingAmount: INC(-delta),
        updated_at:                ts,
      }, { merge: true });
    }

    await batch.commit();
    return NextResponse.json({ success: true, message: 'Stats adjusted' });
  } catch (error) {
    console.error('Adjust stats error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
