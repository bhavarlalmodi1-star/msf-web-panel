// POST /api/members/join-certificate
//
// Fires when a member joins — either added directly (AddMember) or when an
// agent's request is approved (ApproveModal).
//
// Steps:
//   1. Read the member doc + its program doc from Firestore
//   2. Render the membership certificate to a PDF buffer (@react-pdf/renderer)
//   3. Upload the PDF to Firebase Storage and make it publicly readable
//   4. Save `certificateUrl` back onto the member doc
//   5. Send the Gupshup WhatsApp template (document header + 9 body params)
//
// Body: { memberId: string, skipWhatsApp?: boolean }
//
// Failures are non-fatal for the caller: the response always reports what
// succeeded so member creation is never rolled back by a WhatsApp/PDF error.

import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import admin from '../../db/firebaseAdmin';
import { checkRole, verifyToken } from '../../../../../middleware/authMiddleware';
import { generatePassword } from '../route';
import { recordOutbound } from '../../whatsapp/_lib/store';
import CertificateCom from '@/app/members/components/MemberPdf/CertificateCom';
import { getTrustServer, isWhatsAppOn } from '../../db/trustServer';

export const runtime = 'nodejs';

const db = admin.firestore();

// ── Gupshup config ──────────────────────────────────────────────────────────
const GUPSHUP_API_KEY = process.env.WHATSAPP_API_KEY;
const SOURCE_NO       = process.env.SOURCE_NO_WHATSAPP;   // e.g. 919227105345
const SRC_NAME        = process.env.SRC_NAME_WHATSAPP;    // e.g. ssgmswhatsapp
const TEMPLATE_ID     = 'ab8bbbde-5342-4bfa-b902-375d1cfe7777';
const TEMPLATE_NAME   = 'member_join_certificate';

// ── Helpers ─────────────────────────────────────────────────────────────────

// Normalise an Indian mobile number to Gupshup's 91XXXXXXXXXX format
const normalisePhone = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  const withCc = digits.startsWith('91') ? digits : `91${digits}`;
  return withCc.length === 12 ? withCc : null;
};

// Safe filename fragment
const slug = (v) => String(v || '').replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 40);

// ── 1. Generate + upload the certificate ────────────────────────────────────
const generateAndUploadCertificate = async (memberId, memberData, memberProgram) => {
  // Trust header / logos come from Settings → Trust Details
  const trust = await getTrustServer({ withImages: true });

  // Render the certificate PDF to a Buffer
  const buffer = await renderToBuffer(
    <CertificateCom data={memberData} memberProgram={memberProgram} trust={trust} />
  );
  console.log(`[JoinCert] PDF rendered for ${memberId} — ${buffer.length} bytes`);

  const bucket = admin.storage().bucket();

  // Filename pattern: {timestamp}_{Name}_{RegNo}_certificate.pdf
  const regNo    = slug(memberData.registrationNumber || memberId);
  const name     = slug(memberData.displayName || 'member');
  const fileName = `${Date.now()}_${name}_${regNo}_certificate.pdf`;
  const filePath = `certificates/${fileName}`;
  const file     = bucket.file(filePath);

  await file.save(buffer, {
    metadata: {
      contentType: 'application/pdf',
      cacheControl: 'public, max-age=31536000',
    },
    resumable: false,
  });

  // Gupshup must be able to fetch this URL anonymously.
  // Try makePublic() first; if the bucket has uniform bucket-level access with
  // public-access prevention, fall back to a long-lived signed URL.
  let certificateUrl;
  try {
    await file.makePublic();
    certificateUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
    console.log(`[JoinCert] Public URL → ${certificateUrl}`);
  } catch (pubErr) {
    console.warn(`[JoinCert] makePublic() failed (${pubErr.message}) — falling back to signed URL`);
    const [signed] = await file.getSignedUrl({
      action:  'read',
      expires: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000, // ~10 years
    });
    certificateUrl = signed;
    console.log(`[JoinCert] Signed URL → ${certificateUrl}`);
  }

  return { certificateUrl, filePath, fileName, size: buffer.length };
};

// ── 2. Send the Gupshup template with document header ───────────────────────
const sendJoinTemplate = async ({ destination, params, certificateUrl, fileName }) => {
  const body = new URLSearchParams({
    channel:    'whatsapp',
    source:     SOURCE_NO,
    destination,
    'src.name': SRC_NAME,
    template:   JSON.stringify({
      id:     TEMPLATE_ID,
      params: params.map(p => String(p ?? '')),
    }),
  });

  // Document header — arrives as the PDF attached to the template message
  if (certificateUrl) {
    body.set('message', JSON.stringify({
      type: 'document',
      document: {
        link:     certificateUrl,
        filename: fileName || 'membership-certificate.pdf',
      },
    }));
  }

  const res = await fetch('https://api.gupshup.io/wa/api/v1/template/msg', {
    method: 'POST',
    headers: {
      'apikey':        GUPSHUP_API_KEY,
      'Content-Type':  'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache',
    },
    body: body.toString(),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  return { ok: res.ok && data?.status !== 'error', status: res.status, data };
};

// ── Route ───────────────────────────────────────────────────────────────────
export async function POST(req) {
  const result = {
    success:        true,
    certificate:    { generated: false, url: null, error: null },
    whatsapp:       { sent: false, destination: null, error: null, response: null },
    agentWhatsapp:  { sent: false, destination: null, error: null, skipped: true },
  };

  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin', 'admin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

    const {
      memberId,
      skipWhatsApp = false,   // skip both recipients (certificate only)
      sendToMember = true,    // deliver to the member's own number
      sendToAgent  = false,   // also deliver the same message to the agent
    } = await req.json();

    if (!memberId)
      return NextResponse.json({ success: false, message: 'memberId is required' }, { status: 400 });

    // ── Load member ─────────────────────────────────────────────────────────
    const memberSnap = await db.collection('members').doc(memberId).get();
    if (!memberSnap.exists)
      return NextResponse.json({ success: false, message: 'Member not found' }, { status: 404 });

    const m = { id: memberSnap.id, ...memberSnap.data() };

    // ── Load program (for certificate scheme name + rules) ───────────────────
    let memberProgram = null;
    if (m.programId) {
      const progSnap = await db.collection('programs').doc(m.programId).get();
      if (progSnap.exists) memberProgram = { id: progSnap.id, ...progSnap.data() };
    }

    // ── Load the agent: name for the certificate footer, phone for the copy ──
    let agentName  = m.addedByName || '';
    let agentPhone = null;
    if (m.agentId) {
      const agentSnap = await db.collection('agents').doc(m.agentId).get();
      if (agentSnap.exists) {
        const a = agentSnap.data();
        if (!agentName) agentName = a.name || '';
        agentPhone = a.phone1 || a.phone || null;
      }
    }

    // Shape the data exactly the way CertificateCom expects it
    const certData = {
      ...m,
      agentName,
      dateJoin: m.programJoinDate || m.dateJoin || '',
    };

    // ── Generate + upload the certificate ───────────────────────────────────
    let certificateUrl  = null;
    let certificateName = null;
    try {
      const uploaded  = await generateAndUploadCertificate(memberId, certData, memberProgram);
      certificateUrl  = uploaded.certificateUrl;
      certificateName = uploaded.fileName;
      result.certificate = { generated: true, url: certificateUrl, error: null, size: uploaded.size };

      // Persist the URL on the member doc
      await memberSnap.ref.update({
        certificateUrl,
        certificateGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
        updated_at:             admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (certErr) {
      console.error('[JoinCert] Certificate generation failed:', certErr);
      result.certificate = { generated: false, url: null, error: certErr.message };
    }

    // ── Send the WhatsApp template ──────────────────────────────────────────
    // WhatsApp can be switched off for the whole panel (Settings → Trust Details).
    // The certificate above is still generated and saved either way.
    const whatsappOn = await isWhatsAppOn();
    if (!skipWhatsApp && !whatsappOn) {
      result.whatsapp.error = 'WhatsApp messages are turned off (Settings → Trust Details)';
      result.whatsapp.skipped = true;
    }
    if (!skipWhatsApp && whatsappOn) {
      const programName = m.programName || memberProgram?.name || '';
      const ageGroup    = m.ageGroupName || m.memberGroupName || m.ageGroup || '';

      // App login password — same fallback used when the Firebase Auth account
      // is created in /api/members, so what we send always matches what works.
      const loginPassword = m.password || generatePassword(m.displayName, m.dobDate) || '';

      // {{6}} carries reg no + app login password, e.g. "MEM00012024-Password:lalit2005"
      const regNoWithPassword = loginPassword
        ? `${m.registrationNumber || ''}-Password:${loginPassword}`
        : (m.registrationNumber || '');

      // Template body params, in order {{1}}…{{9}}.
      // The agent receives exactly the same member details, so one set is built
      // and reused for both recipients.
      const params = [
        m.displayName || '',                            // {{1}} नमस्कार <name>
        programName,                                    // {{2}} योजना
        m.displayName || '',                            // {{3}} सदस्य नाम
        m.fatherName || '',                             // {{4}} पिता का नाम
        ageGroup,                                       // {{5}} आयु वर्ग
        regNoWithPassword,                              // {{6}} रजिस्ट्रेशन नंबर + पासवर्ड
        programName,                                    // {{7}} योजना (भुगतान राशि)
        String(m.payAmount || 0),                       // {{8}} भुगतान राशि
        String(m.joinFees || 0),                        // {{9}} जुड़ने का शुल्क
      ];

      const fileName = certificateName || `${slug(m.registrationNumber || memberId)}_certificate.pdf`;

      // Shared send + inbox-mirror for one recipient
      const deliverTo = async (destination, label) => {
        const sendRes = await sendJoinTemplate({ destination, params, certificateUrl, fileName });

        console.log(`[JoinCert] WhatsApp → ${label} ${destination}: ${sendRes.ok ? 'SENT' : 'FAILED'}`, sendRes.data);

        // Mirror into the inbox thread so the join message + certificate show up
        // in the conversation alongside anything they send back.
        if (sendRes.ok) {
          const gsMessageId = sendRes.data?.messageId || sendRes.data?.id || null;
          try {
            await recordOutbound(destination, {
              id:          gsMessageId || undefined,
              gsMessageId,
              type:        'document',
              text:        label === 'agent'
                ? `New member registered — ${m.displayName || ''} (${m.registrationNumber || ''})`
                : `Welcome message sent — ${m.registrationNumber || ''}`,
              mediaUrl:    certificateUrl,
              mediaType:   'application/pdf',
              fileName,
              templateId:  TEMPLATE_ID,
              status:      'sent',
              sentBy:      authResult.user.uid,
            });
          } catch (recErr) {
            console.warn('[JoinCert] Failed to mirror into inbox (non-critical):', recErr);
          }
        }
        return sendRes;
      };

      // ── Member ────────────────────────────────────────────────────────────
      const destination = normalisePhone(m.phone);
      result.whatsapp.destination = destination;

      if (!sendToMember) {
        result.whatsapp.skipped = true;
        console.log(`[JoinCert] Member send not requested for ${memberId}`);
      } else if (!destination) {
        result.whatsapp.error = 'Member has no valid phone number';
        console.warn(`[JoinCert] Skipping member WhatsApp for ${memberId} — invalid phone: ${m.phone}`);
      } else {
        try {
          const sendRes = await deliverTo(destination, 'member');
          result.whatsapp.sent     = sendRes.ok;
          result.whatsapp.response = sendRes.data;
          if (!sendRes.ok) result.whatsapp.error = sendRes.data?.message || `Gupshup error (${sendRes.status})`;
        } catch (waErr) {
          console.error('[JoinCert] Member WhatsApp send failed:', waErr);
          result.whatsapp.error = waErr.message;
        }
      }

      // ── Agent copy ────────────────────────────────────────────────────────
      if (sendToAgent) {
        result.agentWhatsapp.skipped = false;
        const agentDest = normalisePhone(agentPhone);
        result.agentWhatsapp.destination = agentDest;

        if (!agentDest) {
          result.agentWhatsapp.error = m.agentId
            ? 'Agent has no valid phone number'
            : 'Member has no agent assigned';
          console.warn(`[JoinCert] Skipping agent WhatsApp — ${result.agentWhatsapp.error}`);
        } else if (sendToMember && result.whatsapp.sent && agentDest === destination) {
          // Agent and member share a number and the member copy already went —
          // no point sending the identical message to the same phone twice.
          result.agentWhatsapp.error = 'Agent shares the member\'s number — copy skipped';
          console.log('[JoinCert] Agent number matches member, not sending twice');
        } else {
          try {
            const sendRes = await deliverTo(agentDest, 'agent');
            result.agentWhatsapp.sent = sendRes.ok;
            if (!sendRes.ok) {
              result.agentWhatsapp.error = sendRes.data?.message || `Gupshup error (${sendRes.status})`;
            }
          } catch (waErr) {
            console.error('[JoinCert] Agent WhatsApp send failed:', waErr);
            result.agentWhatsapp.error = waErr.message;
          }
        }
      }
    }

    // ── Log the attempt ─────────────────────────────────────────────────────
    try {
      await db.collection('whatsappLogs').add({
        type:           'member_join_certificate',
        templateId:     TEMPLATE_ID,
        templateName:   TEMPLATE_NAME,
        memberId,
        memberName:     m.displayName || '',
        registrationNumber: m.registrationNumber || '',
        destination:    result.whatsapp.destination,
        certificateUrl,
        sent:           result.whatsapp.sent,
        agentDestination: result.agentWhatsapp.destination,
        agentSent:        result.agentWhatsapp.sent,
        agentError:       result.agentWhatsapp.error || null,
        error:          result.whatsapp.error || result.certificate.error || null,
        sentBy:         authResult.user.uid,
        sentAt:         admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (logErr) {
      console.error('[JoinCert] Log write failed (non-critical):', logErr);
    }

    return NextResponse.json({
      ...result,
      message: result.whatsapp.sent
        ? 'Certificate generated and WhatsApp message sent'
        : result.certificate.generated
          ? 'Certificate generated, WhatsApp not sent'
          : 'Certificate generation failed',
    });

  } catch (error) {
    console.error('join-certificate error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
