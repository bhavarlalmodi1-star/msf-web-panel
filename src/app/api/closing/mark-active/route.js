import { NextResponse } from "next/server";
import admin from "../../db/firebaseAdmin";
import { verifyToken } from "../../../../../middleware/authMiddleware";

const db = admin.firestore();
const DEL = admin.firestore.FieldValue.delete;

export async function POST(req) {
  const auth = await verifyToken(req);
  if (!auth.success)
    return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });

  try {
    const { memberId } = await req.json();
    if (!memberId)
      return NextResponse.json({ success: false, message: "memberId is required" }, { status: 400 });

    const memberRef = db.collection("members").doc(memberId);
    const snap = await memberRef.get();
    if (!snap.exists)
      return NextResponse.json({ success: false, message: "Member not found" }, { status: 404 });

    // Status-only revert: flip the member back to active and clear the closing
    // marker fields WITHOUT touching payment records/counters (closing_payment
    // docs and closing totals are left as-is by design).
    await memberRef.update({
      member_closed: false,
      member_closed_at: DEL(),
      member_closed_by: DEL(),
      member_closed_program: DEL(),
      closed_date: DEL(),
      closed_note: DEL(),
      closed_invitation_url: DEL(),
      closedStatus: DEL(),
      closingGroupId: DEL(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      message: "Member marked active",
      memberId,
    });
  } catch (err) {
    console.error("POST /closing/mark-active error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}