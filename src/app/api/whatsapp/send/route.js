import { NextResponse } from "next/server";
import admin from "../../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../../middleware/authMiddleware";
import { getTrustServer } from "../../db/trustServer";

const db = admin.firestore();

// ── Message template builder ──────────────────────────────────────────────
// {trustName} / {trustShortName} come from Settings → Trust Details
function buildMessage(member, template, trust = {}) {
  return template
    .replace(/{trustName}/g, trust.name || '')
    .replace(/{trustShortName}/g, trust.shortName || '')
    .replace(/{name}/g, member.displayName || '')
    .replace(/{fatherName}/g, member.fatherName || '')
    .replace(/{regNo}/g, member.registrationNumber || '')
    .replace(/{amount}/g, (member.closing_pendingAmount || 0).toLocaleString('en-IN'))
    .replace(/{pendingCount}/g, String(member.pendingClosingCount || 0))
    .replace(/{program}/g, member.programName || '');
}

const DEFAULT_TEMPLATE = `नमस्ते {name} जी,

आपके {program} कार्यक्रम में {pendingCount} किस्तें बकाया हैं। कुल ₹{amount} का भुगतान शेष है।

कृपया जल्द से जल्द भुगतान करें।

धन्यवाद,
{trustShortName}`;

export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin', 'admin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

    const { memberIds, template, testMode } = await req.json();
    const messageTemplate = template || DEFAULT_TEMPLATE;
    const trust = await getTrustServer();

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return NextResponse.json({ success: false, message: 'No members selected' }, { status: 400 });
    }

    // ── Firestore in-query limit is 30, so chunk member lookups ──────────
    const CHUNK = 30;
    const members = [];
    for (let i = 0; i < memberIds.length; i += CHUNK) {
      const chunk = memberIds.slice(i, i + CHUNK);
      const snap = await db.collection('members')
        .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
        .get();
      snap.forEach(d => {
        const m = d.data();
        members.push({
          id: d.id,
          displayName: m.displayName || '',
          fatherName: m.fatherName || '',
          phone: m.phone || '',
          registrationNumber: m.registrationNumber || '',
          programName: m.programName || '',
          closing_pendingAmount: m.closing_pendingAmount || 0,
          pendingClosingCount: m.pendingClosingCount || 0,
        });
      });
    }

    if (members.length === 0) {
      return NextResponse.json({ success: false, message: 'No members found' }, { status: 404 });
    }

    // ── Build results ────────────────────────────────────────────────────
    const results = members.map(member => {
      const message = buildMessage(member, messageTemplate, trust);
      const hasPhone = !!member.phone;

      // ── TODO: Replace with actual WhatsApp API call ────────────────────
      // The phone is a 10-digit number; prepend 91 for India.
      // const to = `91${member.phone}`;
      //
      // Twilio:   POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json
      //   Body: { To: `whatsapp:${to}`, From: `whatsapp:${from}`, Body: message }
      //
      // WABA:     POST https://graph.facebook.com/v18.0/{phone-number-id}/messages
      //   Body: { messaging_product: 'whatsapp', to, type: 'template',
      //           template: { name: 'payment_reminder', language: { code: 'hi' },
      //             components: [{ type: 'body', parameters: [
      //               { type: 'text', text: member.displayName },
      //               { type: 'text', text: String(member.pendingClosingCount) },
      //               { type: 'text', text: String(member.closing_pendingAmount) },
      //             ]}]}}

      console.log(`[WhatsApp] To: ${member.phone} (${member.displayName}) | Pending: ${member.pendingClosingCount} count, ₹${member.closing_pendingAmount}`);

      return {
        memberId: member.id,
        memberName: member.displayName,
        phone: member.phone,
        message: testMode ? message : undefined,
        status: hasPhone ? 'sent' : 'skipped',
        reason: hasPhone ? undefined : 'No phone number',
      };
    });

    const sent = results.filter(r => r.status === 'sent').length;
    const skipped = results.filter(r => r.status === 'skipped').length;

    // ── Log to Firestore ─────────────────────────────────────────────────
    if (!testMode) {
      await db.collection('whatsappLogs').add({
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        sentBy: authResult.user.uid,
        totalMembers: members.length,
        sent,
        skipped,
        memberIds,
        template: messageTemplate,
      });
    }

    return NextResponse.json({
      success: true,
      message: testMode
        ? `Preview ready: ${members.length} members`
        : `Messages processed: ${sent} sent, ${skipped} skipped (no phone)`,
      total: members.length,
      sent,
      skipped,
      results: testMode ? results : undefined,
    });

  } catch (error) {
    console.error("WhatsApp send error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
