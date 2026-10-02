import { NextResponse } from "next/server";
import { sendToAgent } from "../../db/fcm";
import { verifyToken } from "../../../../../middleware/authMiddleware";

export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });

    const { agentId, title, body, data } = await req.json();
    if (!agentId || !title) {
      return NextResponse.json({ success: false, message: "agentId and title are required" }, { status: 400 });
    }

    const result = await sendToAgent(agentId, title, body, data || {});
    if (!result.success) {
      return NextResponse.json({ success: false, message: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Notification sent" });
  } catch (error) {
    console.error("POST /api/notifications/send error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
