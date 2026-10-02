// POST /api/whatsapp/webhook
//
// Gupshup callback URL. Set this in the Gupshup dashboard under your app's
// "Callback URL" setting:
//     https://<your-domain>/api/whatsapp/webhook
//
// Gupshup sends two event families:
//
//   type: "message"        → an inbound message from a member
//        payload.type: text | image | document | video | audio | location | contact
//
//   type: "message-event"  → delivery status for something we sent
//        payload.type: enqueued | sent | delivered | read | failed
//
// This route is intentionally UNAUTHENTICATED (Gupshup cannot send a Firebase
// token). It is protected instead by an optional shared secret — set
// WHATSAPP_WEBHOOK_SECRET and append ?secret=... to the callback URL.
//
// It always returns 200: Gupshup retries aggressively on non-2xx, and a retry
// storm on a malformed payload is worse than dropping one event.

import { NextResponse } from 'next/server';
import {
  normalisePhone,
  mirrorMedia,
  recordInbound,
  updateMessageStatus,
} from '../_lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WEBHOOK_SECRET = process.env.WHATSAPP_WEBHOOK_SECRET || '';

// Gupshup pings the callback URL with a GET when you save it
export async function GET() {
  return NextResponse.json({ success: true, message: 'SSGMS WhatsApp webhook is live' });
}

export async function POST(req) {
  try {
    // ── Optional shared-secret check ────────────────────────────────────────
    if (WEBHOOK_SECRET) {
      const url = new URL(req.url);
      const provided = url.searchParams.get('secret') || req.headers.get('x-webhook-secret');
      if (provided !== WEBHOOK_SECRET) {
        console.warn('[WA Webhook] Rejected — bad secret');
        return NextResponse.json({ success: false }, { status: 401 });
      }
    }

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ success: true, ignored: 'empty body' });

    const { type, payload } = body;
    console.log(`[WA Webhook] type=${type} payload.type=${payload?.type}`);

    // ── Inbound message from a member ───────────────────────────────────────
    if (type === 'message' && payload) {
      const phone = normalisePhone(payload.sender?.phone || payload.source);
      if (!phone) {
        console.warn('[WA Webhook] Inbound with no resolvable phone — ignoring');
        return NextResponse.json({ success: true, ignored: 'no phone' });
      }

      const msgId      = payload.id || `in_${Date.now()}`;
      const senderName = payload.sender?.name || '';
      const inner      = payload.payload || {};
      const kind       = payload.type;

      const msg = {
        id:          msgId,
        gsMessageId: msgId,
        type:        kind,
        senderName,
        timestamp:   body.timestamp ? new Date(Number(body.timestamp)) : new Date(),
      };

      if (kind === 'text') {
        msg.text = inner.text || '';
      } else if (['image', 'document', 'video', 'audio', 'file', 'sticker'].includes(kind)) {
        // Copy the media into our own storage — Gupshup's URLs expire
        const mirrored = await mirrorMedia(inner.url, phone, msgId, inner.contentType);
        msg.type      = kind === 'file' ? 'document' : kind;
        msg.mediaUrl  = mirrored?.url || inner.url || null;
        msg.mediaType = mirrored?.mime || inner.contentType || null;
        msg.fileName  = inner.name || inner.filename || null;
        msg.caption   = inner.caption || '';
        msg.text      = inner.caption || '';
      } else if (kind === 'location') {
        msg.text = `📍 ${inner.name || ''} ${inner.address || ''}`.trim();
        msg.meta = { latitude: inner.latitude, longitude: inner.longitude };
      } else if (kind === 'contact') {
        msg.text = '👤 Contact card';
      } else {
        msg.text = inner.text || `[${kind}]`;
      }

      await recordInbound(phone, msg);
      console.log(`[WA Webhook] ⬅️  Inbound ${kind} from ${phone} (${senderName})`);
      return NextResponse.json({ success: true, recorded: 'inbound' });
    }

    // ── Delivery / read status for something we sent ────────────────────────
    if (type === 'message-event' && payload) {
      const phone       = normalisePhone(payload.destination);
      const gsMessageId = payload.id;
      const status      = payload.type;   // enqueued|sent|delivered|read|failed

      if (!phone || !gsMessageId) {
        return NextResponse.json({ success: true, ignored: 'incomplete event' });
      }

      const normalised = status === 'enqueued' ? 'sent' : status;
      const reason = payload.payload?.reason || payload.reason || null;

      await updateMessageStatus(phone, gsMessageId, normalised, { reason });
      console.log(`[WA Webhook] ✅ ${phone} → ${normalised}${reason ? ` (${reason})` : ''}`);
      return NextResponse.json({ success: true, recorded: 'status' });
    }

    // Anything else (user-event, billing-event, template-event…) — acknowledge
    return NextResponse.json({ success: true, ignored: type || 'unknown' });

  } catch (error) {
    // Swallow the error: returning 500 makes Gupshup retry the same bad payload
    console.error('[WA Webhook] error:', error);
    return NextResponse.json({ success: true, error: error.message });
  }
}
