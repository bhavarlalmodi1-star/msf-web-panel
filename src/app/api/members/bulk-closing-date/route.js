// POST /api/members/bulk-closing-date
//
// Sets the closing date on already-closed members in bulk, from a sheet the
// client supplied (Application No / New Registration Number / Name / Mobile /
// Closing Date).
//
// MATCHING is by registration number first, then by legacyApplicationNo — the
// old system's number, which is what the sheet's "Application No" column holds.
// A row that matches nothing, or matches more than one member, is reported and
// never guessed at.
//
// The phone number is used as a CONFIRMATION, not as a matcher: when the sheet's
// mobile disagrees with the member's, the row is flagged `phoneMismatch` and is
// only applied if the caller explicitly opts in. Writing a closing date onto the
// wrong member is far worse than leaving a row for someone to check by hand.
//
// Writes closed_date AND the matching closedStatus entry (creating that entry if
// the member has none), because api/closed_payment_entry resolves a member's own
// closing date from closedStatus first. Updating only one of the two is what let
// closed members keep accruing instalments.
//
// NOTE: changing a closing date changes which closings that member should have
// been charged for. This route deliberately does NOT recompute charges — run
// Settings → Closing System Check afterwards to see and fix the consequences.
//
// Body: {
//   rows: [{ rowNo, applicationNo, registrationNumber, name, phone, closingDate }],
//   dryRun?: boolean,              // default true
//   allowPhoneMismatch?: boolean,  // default false
//   allowNotClosed?: boolean,      // default false — members not marked closed
// }

import { NextResponse } from 'next/server';
import admin from '../../db/firebaseAdmin';
import { checkRole, verifyToken } from '../../../../../middleware/authMiddleware';

export const runtime = 'nodejs';
export const maxDuration = 60;

const db = admin.firestore();
const STS = admin.firestore.FieldValue.serverTimestamp;

// A closing date is a CALENDAR DAY, not an instant, so every branch below
// builds UTC midnight for that day.
//
// `new Date(2026, 3, 29)` builds LOCAL midnight; on a server running ahead of
// UTC (IST is +5:30) that instant is 2026-04-28T18:30Z, and every date in the
// sheet would land a day early. Date.UTC avoids that entirely.
const parseIncoming = (v) => {
  if (v === null || v === undefined || v === '') return null;

  if (typeof v === 'number' && Number.isFinite(v)) {
    // Excel serial day 1 = 1900-01-01, with the well-known 1900 leap-year bug,
    // so the epoch offset is 25569 days back from 1970-01-01. Already UTC.
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(v).trim();
  if (!s) return null;

  const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmy) {
    const d = new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
    return isNaN(d.getTime()) ? null : d;
  }

  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    const d = new Date(Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])));
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

// Compare on the last 10 digits so +91 / 0 prefixes and spacing don't matter.
const normPhone = (v) => String(v ?? '').replace(/\D/g, '').slice(-10);
// Identifier comparison key: case- and punctuation-insensitive, and with any
// leading zeros dropped from a purely numeric value, so "0103177", "103177" and
// 103177 all land on the same key.
const normReg = (v) => {
  const s = String(v ?? '').trim().toUpperCase().replace(/[\s\-_/.]/g, '');
  return /^\d+$/.test(s) ? String(Number(s)) : s;
};
// Name key for disambiguating shared phone numbers. Hindi names in the sheet
// carry trailing spaces and inconsistent spacing.
const normName = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// Which calendar day an instant falls on, as the trust would read it.
//
// Existing closing dates were written by the app as LOCAL midnight converted to
// UTC (`dayjs(picked).toISOString()`), so a date picked as 29 April in India is
// stored as 2026-04-28T18:30:00Z. Reading that back with plain toISOString()
// would call it the 28th. Shifting by the India offset before taking the date
// parts makes both that form and the UTC-midnight form this importer writes
// resolve to the same, correct day.
const IST_OFFSET_MIN = 330;   // +05:30
const dayStr = (d) => {
  if (!d) return '';
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
};
// Compare on that calendar day, so "already correct" isn't reported as a change
// merely because the two values use different midnights.
const sameDay = (a, b) => !!a && !!b && dayStr(a) === dayStr(b);

const parseStored = (v) => {
  if (!v) return null;
  if (typeof v?.toDate === 'function') { const t = v.toDate(); return isNaN(t.getTime()) ? null : t; }
  const t = new Date(v);
  return isNaN(t.getTime()) ? null : t;
};

// One lookup per row, but batched: Firestore `in` caps at 30 values.
const chunk = (arr, n) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Only superadmin can bulk-update closing dates' }, { status: 403 });

    const {
      rows = [],
      dryRun = true,
      allowPhoneMismatch = false,
      allowNotClosed = false,
    } = await req.json().catch(() => ({}));

    if (!Array.isArray(rows) || rows.length === 0)
      return NextResponse.json({ success: false, message: 'No rows supplied' }, { status: 400 });
    if (rows.length > 400)
      return NextResponse.json({ success: false, message: 'Send at most 400 rows per request' }, { status: 400 });

    // ── Resolve every row to a member ────────────────────────────────────────
    //
    // Firestore string equality is CASE- AND WHITESPACE-SENSITIVE, and it has no
    // OR across fields, so a single `where('registrationNumber','in',[…])` with
    // tidied-up values matches nothing whenever the stored value is shaped even
    // slightly differently. That is why an earlier version found no members at
    // all. So: query every identifier field the migration might have used, with
    // every plausible shape of the value, and index the results by a normalised
    // key so the final comparison is shape-insensitive.
    const ID_FIELDS = [
      'registrationNumber',
      'legacyApplicationNo',
      'oldRegistrationNumber', 'oldRegNo', 'old_reg_no', 'oldRegno',
      'old_registration_number', 'previousRegistrationNumber', 'previousRegNo',
      'prevRegNo', 'legacyRegistrationNumber', 'legacyRegNo', 'oldMemberId', 'oldId',
    ];

    // Every shape a sheet value might be stored as: exact, trimmed, upper,
    // lower, and numeric when it looks like a number.
    const variants = (v) => {
      const s = String(v ?? '').trim();
      if (!s) return [];
      const out = new Set([s, s.toUpperCase(), s.toLowerCase()]);
      if (/^\d+$/.test(s)) {
        out.add(String(Number(s)));        // drops any leading zeros
        const n = Number(s);
        if (Number.isSafeInteger(n)) out.add(n);
      }
      return [...out];
    };

    const idValues = [...new Set(
      rows.flatMap(r => [...variants(r.registrationNumber), ...variants(r.applicationNo)])
    )];
    const phoneValues = [...new Set(rows.map(r => normPhone(r.phone)).filter(p => p.length === 10))];

    const byId    = new Map();   // normalised identifier → [member]
    const byPhone = new Map();   // 10-digit phone       → [member]
    const seenIds = new Set();   // de-dupe across overlapping queries

    const addToIndex = (data) => {
      if (data.delete_flag === true) return;
      if (seenIds.has(data.id)) return;
      seenIds.add(data.id);

      // Index this member under EVERY identifier they carry, so a later lookup
      // hits regardless of which column the sheet used.
      for (const f of ID_FIELDS) {
        const k = normReg(data[f]);
        if (!k) continue;
        if (!byId.has(k)) byId.set(k, []);
        if (!byId.get(k).some(x => x.id === data.id)) byId.get(k).push(data);
      }
      const p = normPhone(data.phone);
      if (p.length === 10) {
        if (!byPhone.has(p)) byPhone.set(p, []);
        byPhone.get(p).push(data);
      }
    };

    // Firestore rejects an `in` array holding mixed types on some field types,
    // so strings and numbers are queried separately. A field that does not
    // exist simply returns nothing — harmless.
    const runQueries = async (field, values) => {
      const strs = values.filter(v => typeof v === 'string');
      const nums = values.filter(v => typeof v === 'number');
      await Promise.all([
        ...chunk(strs, 30).map(async c => {
          try {
            const snap = await db.collection('members').where(field, 'in', c).get();
            snap.forEach(d => addToIndex({ id: d.id, ...d.data() }));
          } catch (e) { /* field absent or unindexed — ignore */ }
        }),
        ...chunk(nums, 30).map(async c => {
          try {
            const snap = await db.collection('members').where(field, 'in', c).get();
            snap.forEach(d => addToIndex({ id: d.id, ...d.data() }));
          } catch (e) { /* ignore */ }
        }),
      ]);
    };

    await Promise.all([
      ...ID_FIELDS.map(f => runQueries(f, idValues)),
      // Phone is the fallback matcher when no identifier lands, and is what
      // makes the sheet usable even where the numbering scheme changed.
      runQueries('phone', phoneValues),
    ]);

    const results = [];
    const counts = {
      willUpdate: 0, unchanged: 0, notFound: 0, ambiguous: 0,
      noDate: 0, phoneMismatch: 0, notClosed: 0, updated: 0, failed: 0,
    };

    let batch = db.batch();
    let pending = 0;

    for (const r of rows) {
      const base = {
        rowNo: r.rowNo ?? null,
        applicationNo: r.applicationNo ?? '',
        registrationNumber: r.registrationNumber ?? '',
        sheetName: r.name ?? '',
        sheetPhone: r.phone ?? '',
      };

      const wanted = parseIncoming(r.closingDate);
      if (!wanted) {
        counts.noDate++;
        results.push({ ...base, status: 'NO_DATE', message: 'No usable closing date in this row' });
        continue;
      }

      const regKey   = normReg(r.registrationNumber);
      const appKey   = normReg(r.applicationNo);
      const phoneKey = normPhone(r.phone);

      // Registration number first — it is the current, authoritative identifier.
      let candidates = (regKey && byId.get(regKey)) || [];
      let matchedBy  = 'registrationNumber';

      // Then the old application number, under any of the legacy field names.
      if (!candidates.length && appKey) {
        candidates = byId.get(appKey) || [];
        matchedBy  = 'applicationNo';
      }

      // Last resort: phone. Only trusted when it identifies exactly ONE member,
      // since families here routinely share a number — the sheet itself has
      // three rows on 6367288354. A shared number resolves to several members
      // and is reported as ambiguous rather than guessed.
      if (!candidates.length && phoneKey.length === 10) {
        const byPhoneHits = byPhone.get(phoneKey) || [];
        if (byPhoneHits.length === 1) {
          candidates = byPhoneHits;
          matchedBy  = 'phone';
        } else if (byPhoneHits.length > 1) {
          // Narrow by name before giving up on them.
          const wantName = normName(r.name);
          const named = wantName
            ? byPhoneHits.filter(m => normName(m.displayName) === wantName)
            : [];
          if (named.length === 1) {
            candidates = named;
            matchedBy  = 'phone+name';
          } else {
            counts.ambiguous++;
            results.push({
              ...base, status: 'AMBIGUOUS', wantedDate: dayStr(wanted),
              message: `Number not found; ${byPhoneHits.length} members share this phone and the name did not single one out`,
              memberIds: byPhoneHits.map(c => c.id),
              candidates: byPhoneHits.slice(0, 5).map(c => ({
                id: c.id, name: c.displayName || '', regNo: c.registrationNumber || '',
                appNo: c.legacyApplicationNo ?? '',
              })),
            });
            continue;
          }
        }
      }

      if (!candidates.length) {
        counts.notFound++;
        results.push({
          ...base, status: 'NOT_FOUND', wantedDate: dayStr(wanted),
          message: phoneKey.length === 10
            ? 'No member with this registration number, application number, or phone'
            : 'No member with this registration or application number (row has no usable phone to fall back on)',
        });
        continue;
      }
      if (candidates.length > 1) {
        counts.ambiguous++;
        results.push({
          ...base, status: 'AMBIGUOUS', wantedDate: dayStr(wanted),
          message: `${candidates.length} members share this number — resolve by hand`,
          memberIds: candidates.map(c => c.id),
        });
        continue;
      }

      const m = candidates[0];
      const row = {
        ...base,
        memberId: m.id,
        memberName: m.displayName || '',
        memberPhone: m.phone || '',
        memberRegNo: m.registrationNumber || '',
        memberAppNo: m.legacyApplicationNo ?? '',
        programId: m.programId || '',
        programName: m.programName || '',
        matchedBy,
        wantedDate: dayStr(wanted),
        currentDate: dayStr(parseStored(m.closed_date || m.marriageDate)),
        memberClosed: m.member_closed === true,
      };

      const phoneOk = !r.phone || !m.phone || normPhone(r.phone) === normPhone(m.phone);
      if (!phoneOk) {
        counts.phoneMismatch++;
        if (!allowPhoneMismatch) {
          results.push({ ...row, status: 'PHONE_MISMATCH', message: `Sheet says ${normPhone(r.phone)}, member has ${normPhone(m.phone)}` });
          continue;
        }
        row.phoneMismatch = true;
      }

      if (m.member_closed !== true) {
        counts.notClosed++;
        if (!allowNotClosed) {
          results.push({ ...row, status: 'NOT_CLOSED', message: 'Member is not marked closed — skipped' });
          continue;
        }
        row.wasNotClosed = true;
      }

      if (sameDay(parseStored(m.closed_date), wanted)) {
        counts.unchanged++;
        results.push({ ...row, status: 'UNCHANGED', message: 'Already set to this date' });
        continue;
      }

      counts.willUpdate++;

      if (!dryRun) {
        try {
          const iso = wanted.toISOString();

          // Keep closedStatus in step with the top-level field, creating the
          // entry when the member has none — closed_payment_entry reads the
          // date from there first.
          const targetProgram = m.member_closed_program || m.programId || null;
          const existing = Array.isArray(m.closedStatus) ? m.closedStatus : [];

          let closedStatus = existing.map(cs =>
            (targetProgram && cs?.programId === targetProgram) ? { ...cs, closed_date: iso } : cs
          );
          const hasTarget = targetProgram
            ? closedStatus.some(cs => cs?.programId === targetProgram)
            : closedStatus.length > 0;

          if (!hasTarget) {
            closedStatus = [...closedStatus, {
              programId:             targetProgram,
              closingGroupId:        m.closingGroupId || null,
              closed_date:           iso,
              closed_note:           m.closed_note || '',
              closed_invitation_url: m.closed_invitation_url || null,
              closed_at:             m.member_closed_at || null,
              closed_by:             m.member_closed_by || null,
            }];
          }

          const update = {
            closed_date:            iso,
            closedStatus,
            closingDateImportedAt:  STS(),
            closingDateImportedBy:  authResult.user.uid,
            updated_at:             STS(),
          };
          // Only claim someone is closed if the caller opted into that.
          if (m.member_closed !== true && allowNotClosed) update.member_closed = true;

          batch.update(db.collection('members').doc(m.id), update);
          pending++;
          if (pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }

          counts.updated++;
          results.push({ ...row, status: 'UPDATED' });
        } catch (e) {
          counts.failed++;
          results.push({ ...row, status: 'FAILED', message: e.message });
        }
      } else {
        results.push({ ...row, status: 'WILL_UPDATE' });
      }
    }

    if (!dryRun && pending > 0) await batch.commit();

    // ── Diagnostics ──────────────────────────────────────────────────────────
    // When a lot of rows fail to match, the useful question is "what DOES the
    // database hold?". Sample a few real members and report which identifier
    // fields they actually carry, so a naming mismatch is obvious instead of
    // being guessed at.
    let diagnostics = null;
    if (counts.notFound > 0) {
      try {
        const sampleSnap = await db.collection('members').limit(5).get();
        const fieldUse = {};
        const samples = [];
        sampleSnap.forEach(d => {
          const m = d.data();
          const present = {};
          for (const f of ID_FIELDS) {
            if (m[f] !== undefined && m[f] !== null && String(m[f]).trim() !== '') {
              present[f] = String(m[f]);
              fieldUse[f] = (fieldUse[f] || 0) + 1;
            }
          }
          samples.push({
            name: m.displayName || '',
            phone: m.phone || '',
            identifiers: present,
          });
        });
        diagnostics = {
          note: 'Sample of members as actually stored — compare these identifier shapes with your sheet.',
          fieldsInUse: fieldUse,
          samples,
          sheetExamples: rows.slice(0, 3).map(r => ({
            registrationNumber: r.registrationNumber, applicationNo: r.applicationNo, phone: r.phone,
          })),
        };
      } catch (e) {
        diagnostics = { error: e.message };
      }
    }

    console.log(
      `[BulkClosingDate] rows=${rows.length} willUpdate=${counts.willUpdate} updated=${counts.updated} ` +
      `notFound=${counts.notFound} ambiguous=${counts.ambiguous} phoneMismatch=${counts.phoneMismatch} ` +
      `notClosed=${counts.notClosed}${dryRun ? ' (preview)' : ''}`
    );

    return NextResponse.json({ success: true, dryRun, counts, results, diagnostics });

  } catch (error) {
    console.error('bulk-closing-date error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
