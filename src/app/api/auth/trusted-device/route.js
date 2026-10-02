// Trusted device registry — lets a browser that has already passed OTP skip it
// on subsequent logins.
//
// POST { action: 'check',    email, deviceId }  → { trusted: boolean }
// POST { action: 'register', email, deviceId }  → registers this browser
// POST { action: 'revoke',   email, deviceId }  → forget this browser
//
// The record lives server-side, so clearing/forging localStorage alone can't
// skip OTP: a deviceId with no matching (unexpired) document is not trusted.
// The deviceId is only an opaque handle to that record.
//
// Registration is only ever called right after a successful OTP verification —
// see the guard below, which requires the OTP for that email to be verified.

import { NextResponse } from 'next/server';
import admin from '../../db/firebaseAdmin';

const db = admin.firestore();

// How long a browser stays trusted before OTP is required again
const TRUST_DAYS = 30;

const docId = (email, deviceId) =>
  `${String(email).toLowerCase().trim()}__${String(deviceId).trim()}`;

export async function POST(req) {
  try {
    const { action, email, deviceId } = await req.json();

    if (!email || !deviceId) {
      return NextResponse.json({ success: false, message: 'email and deviceId required' }, { status: 400 });
    }

    const ref = db.collection('trustedDevices').doc(docId(email, deviceId));

    // ── Is this browser already trusted? ────────────────────────────────────
    if (action === 'check') {
      const snap = await ref.get();
      if (!snap.exists) return NextResponse.json({ success: true, trusted: false });

      const d = snap.data();
      const expired = d.expiresAt?.toDate ? d.expiresAt.toDate() < new Date() : true;
      if (expired || d.revoked === true) {
        return NextResponse.json({ success: true, trusted: false, reason: expired ? 'expired' : 'revoked' });
      }

      // Sliding window — an actively used device stays trusted
      await ref.update({
        lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt:  admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + TRUST_DAYS * 24 * 60 * 60 * 1000)),
      });

      return NextResponse.json({ success: true, trusted: true });
    }

    // ── Remember this browser ───────────────────────────────────────────────
    if (action === 'register') {
      // Only after a genuine OTP pass. Without this a caller could register any
      // browser as trusted and never face OTP at all.
      const otpSnap = await db.collection('emailOtps').doc(email).get();
      if (!otpSnap.exists || otpSnap.data()?.verified !== true) {
        return NextResponse.json(
          { success: false, message: 'Device can only be trusted right after OTP verification' },
          { status: 403 }
        );
      }

      await ref.set({
        email:      String(email).toLowerCase().trim(),
        deviceId:   String(deviceId).trim(),
        userAgent:  req.headers.get('user-agent') || '',
        createdAt:  admin.firestore.FieldValue.serverTimestamp(),
        lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt:  admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + TRUST_DAYS * 24 * 60 * 60 * 1000)),
        revoked: false,
      }, { merge: true });

      return NextResponse.json({ success: true, trusted: true, days: TRUST_DAYS });
    }

    // ── Forget this browser ─────────────────────────────────────────────────
    if (action === 'revoke') {
      await ref.set({ revoked: true, revokedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return NextResponse.json({ success: true, trusted: false });
    }

    return NextResponse.json({ success: false, message: 'Unknown action' }, { status: 400 });

  } catch (error) {
    console.error('trusted-device error:', error);
    // Never hard-fail login on this — the caller treats an error as "not
    // trusted", which just means OTP is asked for.
    return NextResponse.json({ success: false, trusted: false, message: error.message }, { status: 500 });
  }
}
