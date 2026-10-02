// api/auth/verify-otp.js
import { NextResponse } from "next/server";
import admin from "../../db/firebaseAdmin";

const db = admin.firestore();

export async function POST(req) {
  try {
    const { email, otp } = await req.json();

    if (!email || !otp) {
      return NextResponse.json({ error: "Email & OTP required", success: false }, { status: 400 });
    }

    const doc = await db.collection("emailOtps").doc(email).get();

    if (!doc.exists) {
      return NextResponse.json({ error: "OTP not found", success: false }, { status: 404 });
    }

    const data = doc.data();

    if (data.verified) {
      return NextResponse.json({ error: "OTP already used", success: false }, { status: 400 });
    }

    if (data.otp !== otp) {
      return NextResponse.json({ error: "Invalid OTP", success: false }, { status: 400 });
    }

    if (new Date() > data.expiresAt.toDate()) {
      return NextResponse.json({ error: "OTP expired", success: false }, { status: 400 });
    }

    // Mark verified
    await db.collection("emailOtps").doc(email).update({
      verified: true,
      verifiedAt: new Date()
    });

    return NextResponse.json({ 
      success: true, 
      message: "OTP verified" 
    });

  } catch (err) {
    return NextResponse.json({ 
      error: "Verification failed", 
      success: false 
    }, { status: 500 });
  }
}