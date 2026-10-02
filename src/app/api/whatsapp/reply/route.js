// POST /api/whatsapp/reply
//
// Sends a free-form ("session") WhatsApp message to a member from the inbox.
//
// WhatsApp only permits free-form messages within 24 hours of the member's last
// inbound message. Outside that window the send is rejected by Meta, so we
// check the window server-side first and return a clear error rather than
// letting Gupshup fail opaquely.
//
// Body: { phone: "91XXXXXXXXXX" | "XXXXXXXXXX", text: string }

import { NextResponse } from 'next/server';
import admin from '../../db/firebaseAdmin';
import { checkRole, verifyToken } from '../../../../../middleware/authMiddleware';
import { db, CHATS, normalisePhone, recordOutbound, isSessionOpen } from '../_lib/store';

export const runtime = 'nodejs';

const GUPSHUP_API_KEY = process.env.WHATSAPP_API_KEY;
const SOURCE_NO       = process.env.SOURCE_NO_WHATSAPP;
const SRC_NAME        = process.env.SRC_NAME_WHATSAPP;

export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin', 'admin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

    const { phone: rawPhone, text } = await req.json();

    const phone = normalisePhone(rawPhone);
    if (!phone)
      return NextResponse.json({ success: false, message: 'Invalid phone number' }, { status: 400 });
    if (!text || !String(text).trim())
      return NextResponse.json({ success: false, message: 'Message text is required' }, { status: 400 });

    // ── Enforce the 24-hour session window ──────────────────────────────────
    const chatSnap = await db.collection(CHATS).doc(phone).get();
    const lastInboundAt = chatSnap.exists ? chatSnap.data().lastInboundAt : null;

    if (!isSessionOpen(lastInboundAt)) {
      return NextResponse.json({
        success: false,
        sessionClosed: true,
        message: 'The 24-hour reply window has closed. Only approved templates can be sent to this member now.',
      }, { status: 409 });
    }

    // ── Send via Gupshup ────────────────────────────────────────────────────
    const body = new URLSearchParams({
      channel:     'whatsapp',
      source:      SOURCE_NO,
      destination: phone,
      'src.name':  SRC_NAME,
      message:     JSON.stringify({ type: 'text', text: String(text) }),
    });

    const res = await fetch('https://api.gupshup.io/wa/api/v1/msg', {
      method: 'POST',
      headers: {
        'apikey':        GUPSHUP_API_KEY,
        'Content-Type':  'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache',
      },
      body: body.toString(),
    });

    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = { raw }; }

    if (!res.ok || data?.status === 'error') {
      console.error('[WA Reply] Gupshup rejected:', data);
      return NextResponse.json({
        success: false,
        message: data?.message || `Gupshup error (${res.status})`,
        gupshupResponse: data,
      }, { status: 502 });
    }

    // Gupshup returns the message id we'll later match delivery events against
    const gsMessageId = data?.messageId || data?.id || null;

    await recordOutbound(phone, {
      id:          gsMessageId || undefined,
      gsMessageId,
      type:        'text',
      text:        String(text),
      status:      'sent',
      sentBy:      authResult.user.uid,
      timestamp:   admin.firestore.Timestamp.now(),
    });

    console.log(`[WA Reply] ➡️  Sent to ${phone} (msgId=${gsMessageId})`);

    return NextResponse.json({ success: true, messageId: gsMessageId, gupshupResponse: data });

  } catch (error) {
    console.error('reply error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
