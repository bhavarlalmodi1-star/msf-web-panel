import { NextResponse } from "next/server";
import admin from "../../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../../middleware/authMiddleware";

const db  = admin.firestore();
const STS = admin.firestore.FieldValue.serverTimestamp;

const SETTINGS_REF = () => db.collection("settings").doc("commission");

// Default rates (used if Firestore doc doesn't exist yet)
export const DEFAULT_RATES = {
  joinFeesRate:        25,   // percent (25%)
  closingPaymentRate:  5,    // percent (5%)
};

// ─── GET — read current commission settings ───────────────────────────────────
export async function GET(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });

    const snap = await SETTINGS_REF().get();
    const data = snap.exists ? snap.data() : DEFAULT_RATES;

    return NextResponse.json({
      success: true,
      data: {
        joinFeesRate:       data.joinFeesRate       ?? DEFAULT_RATES.joinFeesRate,
        closingPaymentRate: data.closingPaymentRate ?? DEFAULT_RATES.closingPaymentRate,
        updatedAt:          data.updatedAt          ?? null,
        updatedBy:          data.updatedBy          ?? null,
      },
    });
  } catch (e) {
    console.error("GET /api/settings/commission error:", e);
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}

// ─── PUT — save commission settings ──────────────────────────────────────────
export async function PUT(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });

    if (!checkRole(["superadmin", "admin"], authResult.user.role))
      return NextResponse.json({ success: false, message: "Insufficient permissions" }, { status: 403 });

    const body = await req.json();
    const joinFeesRate       = Number(body.joinFeesRate);
    const closingPaymentRate = Number(body.closingPaymentRate);

    if (isNaN(joinFeesRate) || joinFeesRate < 0 || joinFeesRate > 100)
      return NextResponse.json({ success: false, message: "joinFeesRate must be 0–100" }, { status: 400 });
    if (isNaN(closingPaymentRate) || closingPaymentRate < 0 || closingPaymentRate > 100)
      return NextResponse.json({ success: false, message: "closingPaymentRate must be 0–100" }, { status: 400 });

    await SETTINGS_REF().set({
      joinFeesRate,
      closingPaymentRate,
      updatedAt: STS(),
      updatedBy: authResult.user.uid,
    }, { merge: true });

    return NextResponse.json({
      success: true,
      message: "Commission settings saved",
      data: { joinFeesRate, closingPaymentRate },
    });
  } catch (e) {
    console.error("PUT /api/settings/commission error:", e);
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}
