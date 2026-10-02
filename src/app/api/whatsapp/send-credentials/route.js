// POST /api/whatsapp/send-credentials
//
// Sends members their app login ID and password over WhatsApp.
//
// ─── READ THIS BEFORE USING ──────────────────────────────────────────────────
// This sends a FREE-FORM ("session") message, which WhatsApp only delivers
// inside 24 hours of that member's last inbound message. Any member who has not
// messaged the trust recently CANNOT be reached this way — Meta rejects the
// send. For a genuine all-members broadcast an approved Gupshup template is
// required.
//
// So the route checks each recipient's session window BEFORE spending an API
// call, and reports `SESSION_CLOSED` for the rest instead of reporting a
// success that never arrived. Set `templateId` in the body to switch to a
// template send once one is approved — the rest of the flow is unchanged.
//
// Credentials: the login ID is the registration number and the password is the
// stored one, falling back to the same derivation the login itself accepts
// (generatePassword). Nothing is written to the member, so what is sent is
// always what already works.
//
// Body: {
//   memberIds: string[],       // max 200 per call
//   message?: string,          // template text with {name} {regNo} {password} …
//   dryRun?: boolean,          // resolve + check windows, send nothing
//   templateId?: string,       // optional: send as an approved template instead
//   templateParams?: string[], // parameter names, in order, for the template
// }

import { NextResponse } from 'next/server';
import admin from '../../db/firebaseAdmin';
import { checkRole, verifyToken } from '../../../../../middleware/authMiddleware';
import { generatePassword } from '../../members/route';
import {
  CHATS, normalisePhone, isSessionOpen, recordOutbound,
} from '../_lib/store';
import { getTrustServer } from '../../db/trustServer';

export const runtime = 'nodejs';
export const maxDuration = 60;

const db = admin.firestore();

const GUPSHUP_API_KEY = process.env.WHATSAPP_API_KEY;
const SOURCE_NO       = process.env.SOURCE_NO_WHATSAPP;
const SRC_NAME        = process.env.SRC_NAME_WHATSAPP;

// Trust name, Play Store link ({appLink}) and office number ({supportPhone})
// all come from Settings → Trust Details (settings/trustInfo) — see `fill`.
const DEFAULT_MESSAGE = `नमस्ते {name} जी,

{trustName} के ऐप में आपका लॉगिन विवरण:

आईडी : {regNo}
पासवर्ड : {password}

ऐप डाउनलोड करें :
{appLink}

कृपया यह जानकारी किसी और को न बताएं।

किसी भी समस्या के लिए संपर्क करें : {supportPhone}

धन्यवाद,
{trustShortName}`;

const fill = (tpl, m, trust = {}) => tpl
  .replace(/{appLink}/g,        trust.appLink || '')
  .replace(/{supportPhone}/g,   trust.officePhone || '')
  .replace(/{trustName}/g,      trust.name || '')
  .replace(/{trustShortName}/g, trust.shortName || '')
  .replace(/{name}/g,       m.displayName || '')
  .replace(/{fatherName}/g, m.fatherName || '')
  .replace(/{regNo}/g,      m.loginId || '')
  .replace(/{password}/g,   m.password || '')
  .replace(/{program}/g,    m.programName || '')
  .replace(/{village}/g,    m.village || '');

const chunk = (arr, n) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    // Sends passwords out — superadmin only.
    if (!checkRole(['superadmin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Only superadmin can send login credentials' }, { status: 403 });

    const {
      memberIds = [],
      message = DEFAULT_MESSAGE,
      dryRun = true,
      templateId = null,
      templateParams = [],
    } = await req.json().catch(() => ({}));

    if (!Array.isArray(memberIds) || memberIds.length === 0)
      return NextResponse.json({ success: false, message: 'No members selected' }, { status: 400 });

    // Trust name / app link / office phone for the message placeholders
    const trust = await getTrustServer();
    if (memberIds.length > 200)
      return NextResponse.json({ success: false, message: 'Send at most 200 members per call' }, { status: 400 });

    if (!dryRun && (!GUPSHUP_API_KEY || !SOURCE_NO || !SRC_NAME))
      return NextResponse.json({
        success: false,
        message: 'WhatsApp is not configured (WHATSAPP_API_KEY / SOURCE_NO_WHATSAPP / SRC_NAME_WHATSAPP)',
      }, { status: 500 });

    // ── Resolve members ──────────────────────────────────────────────────────
    const members = [];
    for (const c of chunk(memberIds, 30)) {
      const snap = await db.collection('members')
        .where(admin.firestore.FieldPath.documentId(), 'in', c)
        .get();
      snap.forEach(d => {
        const m = d.data();
        if (m.delete_flag === true) return;
        members.push({
          id: d.id,
          displayName: m.displayName || '',
          fatherName:  m.fatherName || '',
          phone:       m.phone || '',
          village:     m.village || '',
          programName: m.programName || '',
          loginId:     m.registrationNumber || '',
          // Same fallback the Firebase Auth account was created with, so the
          // password we send is the one that actually works.
          password:    m.password || generatePassword(m.displayName, m.dobDate) || '',
          hasStoredPassword: !!m.password,
        });
      });
    }

    if (!members.length)
      return NextResponse.json({ success: false, message: 'No members found' }, { status: 404 });

    // ── Session windows, in bulk ─────────────────────────────────────────────
    // One read per distinct phone rather than one per member, since families
    // share numbers here.
    const phones = [...new Set(members.map(m => normalisePhone(m.phone)).filter(Boolean))];
    const sessionOpen = {};
    await Promise.all(chunk(phones, 30).map(async (c) => {
      const snaps = await Promise.all(c.map(p => db.collection(CHATS).doc(p).get()));
      snaps.forEach((snap, i) => {
        sessionOpen[c[i]] = snap.exists ? isSessionOpen(snap.data().lastInboundAt) : false;
      });
    }));

    const results = [];
    const counts = {
      willSend: 0, sent: 0, failed: 0,
      noPhone: 0, noPassword: 0, sessionClosed: 0,
    };

    for (const m of members) {
      const base = {
        memberId: m.id,
        name: m.displayName,
        loginId: m.loginId,
        phone: m.phone,
        programName: m.programName,
        derivedPassword: !m.hasStoredPassword,
      };

      if (!m.phone || normalisePhone(m.phone).length < 10) {
        counts.noPhone++;
        results.push({ ...base, status: 'NO_PHONE', reason: 'No usable phone number' });
        continue;
      }
      if (!m.loginId) {
        counts.noPassword++;
        results.push({ ...base, status: 'NO_LOGIN_ID', reason: 'Member has no registration number' });
        continue;
      }
      if (!m.password) {
        counts.noPassword++;
        results.push({ ...base, status: 'NO_PASSWORD', reason: 'No password stored and none could be derived (missing name or DOB)' });
        continue;
      }

      const phone = normalisePhone(m.phone);

      // Free-form sends are refused by Meta outside the 24-hour window. Check
      // first so a member who cannot be reached is reported honestly rather
      // than counted as sent.
      if (!templateId && !sessionOpen[phone]) {
        counts.sessionClosed++;
        results.push({
          ...base,
          status: 'SESSION_CLOSED',
          reason: 'Member has not messaged in the last 24 hours — a free-form message cannot be delivered. An approved template is needed.',
        });
        continue;
      }

      const text = fill(message, m, trust);
      counts.willSend++;

      if (dryRun) {
        results.push({ ...base, status: 'WILL_SEND', preview: text });
        continue;
      }

      // ── Send ───────────────────────────────────────────────────────────────
      try {
        const body = new URLSearchParams({
          channel:    'whatsapp',
          source:     SOURCE_NO,
          destination: phone,
          'src.name': SRC_NAME,
        });

        if (templateId) {
          body.set('template', JSON.stringify({
            id: templateId,
            params: (templateParams.length ? templateParams : ['name', 'regNo', 'password'])
                      .map(k => fill(`{${k}}`, m, trust)),
          }));
        } else {
          body.set('message', JSON.stringify({ type: 'text', text }));
        }

        const endpoint = templateId
          ? 'https://api.gupshup.io/wa/api/v1/template/msg'
          : 'https://api.gupshup.io/wa/api/v1/msg';

        const res  = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'apikey': GUPSHUP_API_KEY,
          },
          body: body.toString(),
        });
        const raw  = await res.text();
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch { /* Gupshup sometimes returns text */ }

        if (!res.ok || parsed?.status === 'error') {
          counts.failed++; counts.willSend--;
          results.push({
            ...base, status: 'FAILED',
            reason: parsed?.message || raw?.slice(0, 200) || `HTTP ${res.status}`,
          });
          continue;
        }

        counts.sent++;
        const gsId = parsed?.messageId || null;

        // Mirror into the inbox so the conversation shows what was sent —
        // but NEVER store the password in the chat log. The thread records
        // that credentials were sent, not the credentials themselves.
        try {
          await recordOutbound(phone, {
            id: gsId,
            type: 'text',
            text: `🔐 लॉगिन विवरण भेजा गया (आईडी: ${m.loginId}) — पासवर्ड सुरक्षा कारणों से यहाँ सहेजा नहीं गया`,
            status: 'sent',
            sentBy: authResult.user.uid,
            memberId: m.id,
          });
        } catch (e) {
          console.warn('[SendCredentials] inbox mirror failed:', e.message);
        }

        results.push({ ...base, status: 'SENT', messageId: gsId });
      } catch (e) {
        counts.failed++; counts.willSend--;
        results.push({ ...base, status: 'FAILED', reason: e.message });
      }
    }

    // ── Audit ────────────────────────────────────────────────────────────────
    // Records WHO was sent credentials and when — never the passwords.
    if (!dryRun && counts.sent > 0) {
      try {
        await db.collection('credentialSendLogs').add({
          sentAt:    admin.firestore.FieldValue.serverTimestamp(),
          sentBy:    authResult.user.uid,
          mode:      templateId ? 'template' : 'session',
          templateId: templateId || null,
          total:     members.length,
          sent:      counts.sent,
          failed:    counts.failed,
          sessionClosed: counts.sessionClosed,
          memberIds: results.filter(r => r.status === 'SENT').map(r => r.memberId),
        });
      } catch (e) {
        console.warn('[SendCredentials] audit log failed:', e.message);
      }
    }

    // Mark who received it, so a later run can skip them.
    if (!dryRun && counts.sent > 0) {
      const sentIds = results.filter(r => r.status === 'SENT').map(r => r.memberId);
      const batch = db.batch();
      sentIds.forEach(id => batch.update(db.collection('members').doc(id), {
        credentialsSentAt: admin.firestore.FieldValue.serverTimestamp(),
        credentialsSentBy: authResult.user.uid,
      }));
      try { await batch.commit(); }
      catch (e) { console.warn('[SendCredentials] stamp failed:', e.message); }
    }

    console.log(
      `[SendCredentials] ${dryRun ? 'preview' : 'send'} ` +
      `resolved=${members.length} willSend=${counts.willSend} sent=${counts.sent} ` +
      `failed=${counts.failed} sessionClosed=${counts.sessionClosed} noPhone=${counts.noPhone}`
    );

    return NextResponse.json({ success: true, dryRun, counts, results });

  } catch (error) {
    console.error('send-credentials error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
