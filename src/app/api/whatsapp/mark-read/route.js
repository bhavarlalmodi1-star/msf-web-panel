// POST /api/whatsapp/mark-read
//
// Sends real WhatsApp read receipts (the member's blue ticks) when an admin
// opens a conversation in the inbox.
//
// Clearing `unreadCount` in Firestore only hides our own badge — WhatsApp has
// no idea the message was seen. Gupshup exposes a per-message read API:
//
//     PUT https://api.gupshup.io/wa/app/{appId}/msg/{msgId}/read
//
// so each unread inbound message has to be acknowledged individually.
//
// Body: { phone: "91XXXXXXXXXX" | "XXXXXXXXXX" }

import { NextResponse } from 'next/server';
import admin from '../../db/firebaseAdmin';
import { checkRole, verifyToken } from '../../../../../middleware/authMiddleware';
import { db, CHATS, normalisePhone } from '../_lib/store';

export const runtime = 'nodejs';

const GUPSHUP_API_KEY = process.env.WHATSAPP_API_KEY;
const APP_ID          = process.env.WHATSAPP_APP_ID;

// How far back to look for unacknowledged messages. WhatsApp rejects receipts
// for very old messages anyway, so scanning the whole thread is wasted effort.
const SCAN_LIMIT = 40;

const markOneRead = async (gsMessageId) => {
  const res = await fetch(
    `https://api.gupshup.io/wa/app/${APP_ID}/msg/${encodeURIComponent(gsMessageId)}/read`,
    {
      method: 'PUT',
      headers: { apikey: GUPSHUP_API_KEY, 'Cache-Control': 'no-cache' },
    },
  );
  const raw = await res.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = { raw }; }
  return { ok: res.ok && data?.status !== 'error', status: res.status, data };
};

export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin', 'admin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

    const { phone: rawPhone } = await req.json();
    const phone = normalisePhone(rawPhone);
    if (!phone)
      return NextResponse.json({ success: false, message: 'Invalid phone number' }, { status: 400 });

    const chatRef = db.collection(CHATS).doc(phone);

    // Always clear our own badge, even if the receipts below fail
    await chatRef.set(
      { unreadCount: 0, readAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );

    if (!APP_ID || !GUPSHUP_API_KEY) {
      console.warn('[WA MarkRead] WHATSAPP_APP_ID / WHATSAPP_API_KEY not configured — badge cleared only');
      return NextResponse.json({
        success: true, receiptsSent: 0,
        message: 'Badge cleared, but read receipts are not configured',
      });
    }

    // ── Find inbound messages we haven't acknowledged yet ──────────────────
    // Note: a `where('readReceiptSent', '!=', true)` query would silently skip
    // documents that don't have the field at all, which is most of them — so
    // we pull the recent window and filter in code instead.
    const snap = await chatRef.collection('messages')
      .orderBy('timestamp', 'desc')
      .limit(SCAN_LIMIT)
      .get();

    const pending = snap.docs.filter(d => {
      const m = d.data();
      return m.direction === 'in' && m.gsMessageId && m.readReceiptSent !== true;
    });

    if (pending.length === 0) {
      return NextResponse.json({ success: true, receiptsSent: 0, message: 'Nothing new to acknowledge' });
    }

    // ── Acknowledge each one ───────────────────────────────────────────────
    let sent = 0;
    const failures = [];

    await Promise.all(pending.map(async (docSnap) => {
      const m = docSnap.data();
      try {
        const res = await markOneRead(m.gsMessageId);
        if (res.ok) {
          sent++;
          await docSnap.ref.update({
            readReceiptSent: true,
            readReceiptAt:   admin.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          // Mark it anyway so a permanently-rejected message isn't retried on
          // every single chat open.
          failures.push({ id: m.gsMessageId, error: res.data?.message || `HTTP ${res.status}` });
          await docSnap.ref.update({
            readReceiptSent:  true,
            readReceiptError: res.data?.message || `HTTP ${res.status}`,
          });
        }
      } catch (e) {
        failures.push({ id: m.gsMessageId, error: e.message });
      }
    }));

    console.log(`[WA MarkRead] ${phone}: ${sent}/${pending.length} receipts sent${failures.length ? ` (${failures.length} failed)` : ''}`);

    return NextResponse.json({
      success: true,
      receiptsSent: sent,
      attempted: pending.length,
      failures: failures.length ? failures : undefined,
    });

  } catch (error) {
    console.error('mark-read error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
