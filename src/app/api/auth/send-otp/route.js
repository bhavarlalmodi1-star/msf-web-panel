import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import admin from "../../db/firebaseAdmin";
const db = admin.firestore();

export async function POST(req) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const expiresAt = new Date(Date.now() + 60 * 1000); // 1 minute

    // Save OTP
    await db.collection("emailOtps").doc(email).set({
      email,
      otp,
      verified: false,
      createdAt: new Date(),
      expiresAt,
    });

    // Send Email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
console.log(otp,"otp")
    await transporter.sendMail({
      from: `"My App" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your OTP Code",
      html: `<h3>Your OTP is <b>${otp}</b></h3><p>Valid for 1 minute</p>`,
    });

    return NextResponse.json({ success: true, message: "OTP sent" });

  } catch (err) {
    return NextResponse.json({ error: "OTP send failed" }, { status: 500 });
  }
}
