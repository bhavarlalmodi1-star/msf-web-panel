// app/api/agents/advance/route.js
import { NextResponse } from "next/server";
import admin from "../../db/firebaseAdmin";
import { verifyToken, checkRole } from "../../../../../middleware/authMiddleware";

const db  = admin.firestore();
const INC = admin.firestore.FieldValue.increment;
const STS = admin.firestore.FieldValue.serverTimestamp;

// ─── GET — advance payment history for an agent ───────────────────────────────
export async function GET(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });

    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId");
    const page    = parseInt(searchParams.get("page")  || "1");
    const limit   = parseInt(searchParams.get("limit") || "50");

    if (!agentId)
      return NextResponse.json({ success: false, message: "agentId is required" }, { status: 400 });

    let q = db.collection("agentAdvancePayments")
      .where("agentId", "==", agentId)
      .orderBy("createdAt", "desc");

    const offset  = (page - 1) * limit;
    const snap    = await q.limit(limit).offset(offset).get();
    const data    = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const countSnap = await db.collection("agentAdvancePayments")
      .where("agentId", "==", agentId)
      .count().get();
    const total = countSnap.data().count;

    return NextResponse.json({
      success: true,
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (e) {
    console.error("GET advance error:", e);
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}

// ─── POST — record an advance payment from agent to organization ──────────────
export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });

    if (!checkRole(["superadmin", "admin"], authResult.user.role))
      return NextResponse.json({ success: false, message: "Insufficient permissions" }, { status: 403 });

    const body = await req.json();
    const { agentId, amount, description, note, paymentMode, utrId, action } = body;

    if (!agentId || !amount || Number(amount) <= 0)
      return NextResponse.json({ success: false, message: "agentId and a positive amount are required" }, { status: 400 });

    // ── Deduct from advance (used when payment is sourced from advance) ────────
    if (action === 'deduct') {
      const deductAmount = Math.round(Number(amount) * 100) / 100;
      const agentRef   = db.collection("agents").doc(agentId);
      const agentSnap  = await agentRef.get();
      if (!agentSnap.exists)
        return NextResponse.json({ success: false, message: "Agent not found" }, { status: 404 });

      const agentData      = agentSnap.data();
      const currentBalance = agentData.advanceBalance || 0;

      if (currentBalance < deductAmount)
        return NextResponse.json({ success: false, message: `Insufficient advance balance. Available: ₹${currentBalance}` }, { status: 400 });

      const batch  = db.batch();
      batch.update(agentRef, {
        advanceBalance: INC(-deductAmount),
        updated_at:     STS(),
      });

      const txRef = db.collection("agentAdvancePayments").doc();
      batch.set(txRef, {
        agentId,
        agentName:    agentData.name || "",
        type:         "deduction",
        amount:       deductAmount,
        description:  description || "Advance Deducted — Payment",
        note:         note        || "",
        paymentMode:  "advance",
        utrId:        "",
        balanceBefore: currentBalance,
        balanceAfter:  currentBalance - deductAmount,
        createdBy:    authResult.user.uid,
        createdAt:    STS(),
      });

      await batch.commit();
      return NextResponse.json({
        success: true,
        message: `Advance ₹${deductAmount.toLocaleString("en-IN")} deducted`,
        data: { deductAmount, newBalance: currentBalance - deductAmount },
      });
    }

    const depositAmount = Math.round(Number(amount) * 100) / 100;

    // Fetch agent
    const agentRef  = db.collection("agents").doc(agentId);
    const agentSnap = await agentRef.get();
    if (!agentSnap.exists)
      return NextResponse.json({ success: false, message: "Agent not found" }, { status: 404 });

    const agentData      = agentSnap.data();
    const currentBalance = agentData.advanceBalance || 0;

    const batch  = db.batch();

    // Update agent's advance balance
    batch.update(agentRef, {
      advanceBalance:    INC(depositAmount),
      totalAdvancePaid:  INC(depositAmount),
      updated_at:        STS(),
    });

    // Write advance payment record
    const txRef = db.collection("agentAdvancePayments").doc();
    batch.set(txRef, {
      agentId,
      agentName:    agentData.name || "",
      type:         "deposit",
      amount:       depositAmount,
      description:  description || "Advance Payment",
      note:         note        || "",
      paymentMode:  paymentMode === "online" ? "online" : "cash",
      utrId:        paymentMode === "online" ? (utrId || "") : "",
      balanceBefore: currentBalance,
      balanceAfter:  currentBalance + depositAmount,
      createdBy:    authResult.user.uid,
      createdAt:    STS(),
    });

    await batch.commit();

    return NextResponse.json({
      success: true,
      message: `Advance ₹${depositAmount.toLocaleString("en-IN")} recorded`,
      data: { txId: txRef.id, depositAmount, newBalance: currentBalance + depositAmount },
    });
  } catch (e) {
    console.error("POST advance error:", e);
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}
