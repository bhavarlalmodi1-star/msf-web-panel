// POST /api/members/fix-age-groups
//
// Repairs members whose age group no longer matches what their DOB and join
// date imply, and resets payAmount from the correct period.
//
// SCOPE: age group + payAmount ONLY. joinFees and fixedJoinFees are left as
// they are — members have already been billed and have paid against those
// figures, so changing them would shift pending amounts, payment status and
// every agent/program/org aggregate built from them.
//
// The age group is resolved exactly the way AddMember does it:
//   age    = joinDate.diff(dob, 'year')        ← age ON THE JOIN DATE, not today
//   group  = ageGroups.find(age between startAge..endAge)
//   period = group.periods.find(joinDate between startDate..endDate)
// then payAmount is taken from that period.
//
// Runs in resumable chunks — the client calls repeatedly with `nextCursor`
// until `hasMore` is false, so it can't time out on a large collection.
//
// Body: {
//   programId?  : string | 'all',
//   cursor?     : string,
//   batchSize?  : number,
//   dryRun?     : boolean    // report what WOULD change, write nothing
// }

import { NextResponse } from 'next/server';
import admin from '../../db/firebaseAdmin';
import { checkRole, verifyToken } from '../../../../../middleware/authMiddleware';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import isBetween from 'dayjs/plugin/isBetween';

dayjs.extend(customParseFormat);
dayjs.extend(isBetween);

export const runtime = 'nodejs';
export const maxDuration = 60;

const db = admin.firestore();
const D  = 'DD-MM-YYYY';

const parse = (v) => {
  if (!v) return null;
  if (v?.toDate) return dayjs(v.toDate());
  const d = dayjs(String(v), D, true);
  if (d.isValid()) return d;
  const loose = dayjs(String(v));
  return loose.isValid() ? loose : null;
};

const num = (v) => Number(v || 0);

export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    // Changes fee amounts across many members — superadmin only
    if (!checkRole(['superadmin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Only superadmin can run this repair' }, { status: 403 });

    const {
      programId = 'all',
      cursor    = null,
      batchSize = 300,
      dryRun    = true,
    } = await req.json().catch(() => ({}));

    // ── Load programs once per chunk ────────────────────────────────────────
    const progSnap = await db.collection('programs').get();
    const programs = {};
    progSnap.docs.forEach(d => { programs[d.id] = { id: d.id, ...d.data() }; });

    // ── Page through members, ordered by id for stable pagination ───────────
    const size = Math.min(Number(batchSize) || 300, 500);
    let q = db.collection('members')
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(size);
    if (cursor) q = q.startAfter(cursor);

    const snap = await q.get();

    let scanned = 0, considered = 0, changed = 0, alreadyOk = 0, skipped = 0;
    const problems = [];
    const samples  = [];
    let batch = db.batch();
    let pending = 0;
    let lastId = cursor;

    for (const docSnap of snap.docs) {
      scanned++;
      lastId = docSnap.id;
      const m = docSnap.data();

      if (m.delete_flag === true) { skipped++; continue; }
      if (programId !== 'all' && m.programId !== programId) { skipped++; continue; }
      if (!m.programId) { skipped++; continue; }

      considered++;

      const program = programs[m.programId];
      const label = `${m.displayName || '—'} (${m.registrationNumber || docSnap.id})`;

      // Shared identity fields so a problem row carries as much detail as a
      // changed row — the CSV is the record someone actually works from.
      const identity = {
        id: docSnap.id,
        member: label,
        name: m.displayName || '',
        fatherName: m.fatherName || '',
        regNo: m.registrationNumber || '',
        phone: m.phone || '',
        village: m.village || '',
        programName: m.programName || program?.name || '',
        dob: m.dobDate || '',
        joinDate: m.programJoinDate || m.dateJoin || '',
        currentAgeGroup: m.ageGroupName || '',
        payAmount: num(m.payAmount),
        joinFees: num(m.joinFees),
      };

      if (!program?.ageGroups?.length) {
        problems.push({ ...identity, reason: 'Program has no age groups configured' });
        continue;
      }

      const dob  = parse(m.dobDate);
      const join = parse(m.programJoinDate || m.dateJoin || m.joinDateTs);

      if (!dob || !join) {
        problems.push({ ...identity, reason: !dob ? 'Missing or unreadable DOB' : 'Missing or unreadable join date' });
        continue;
      }

      // Age ON the join date — this is what decides the bracket
      const age = join.diff(dob, 'year');

      const ageGroup = program.ageGroups.find(ag => age >= num(ag.startAge) && age <= num(ag.endAge));
      if (!ageGroup) {
        problems.push({
          ...identity, age,
          reason: `No age group for age ${age} (available: ${program.ageGroups.map(a => `${a.startAge}-${a.endAge}`).join(', ')})`,
        });
        continue;
      }

      const period = (ageGroup.periods || []).find(p => {
        try {
          return join.isBetween(dayjs(p.startDate, D), dayjs(p.endDate, D), null, '[]');
        } catch { return false; }
      });

      if (!period) {
        problems.push({
          ...identity, age,
          reason: `Age group "${ageGroup.ageGroupName}" has no period covering ${join.format(D)}`,
        });
        continue;
      }

      // ── Correct values ────────────────────────────────────────────────────
      // ONLY the age group and payAmount are corrected. joinFees and
      // fixedJoinFees are deliberately left as they are — members have already
      // been billed and have paid against those figures, so changing them would
      // move pending amounts, payment status and agent stats for everyone.
      const want = {
        ageGroupId:   ageGroup.id || '',
        ageGroupName: ageGroup.ageGroupName || '',
        payAmount:    num(period.payAmount),
      };

      const has = {
        ageGroupId:   m.ageGroupId || '',
        ageGroupName: m.ageGroupName || '',
        payAmount:    num(m.payAmount),
      };

      const diffKeys = Object.keys(want).filter(k => want[k] !== has[k]);
      if (diffKeys.length === 0) { alreadyOk++; continue; }

      const update = {
        ...want,
        ageGroupFixedAt: admin.firestore.FieldValue.serverTimestamp(),
        updated_at:      admin.firestore.FieldValue.serverTimestamp(),
      };

      // Every changed member is returned, not a sample — the client accumulates
      // these across chunks so the CSV is a complete record of what was touched.
      samples.push({
        id: docSnap.id,
        member: label,
        name: m.displayName || '',
        fatherName: m.fatherName || '',
        regNo: m.registrationNumber || '',
        phone: m.phone || '',
        village: m.village || '',
        programName: m.programName || program.name || '',
        age,
        dob: dob.format(D),
        joinDate: join.format(D),
        from: { ageGroup: has.ageGroupName || '', payAmount: has.payAmount },
        to:   { ageGroup: want.ageGroupName,      payAmount: want.payAmount },
        fields: diffKeys,
        // Context only — this run does not touch them
        joinFees: num(m.joinFees),
        paid:     num(m.paidAmount),
      });

      if (!dryRun) {
        batch.update(docSnap.ref, update);
        pending++;
        if (pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
      }
      changed++;
    }

    if (!dryRun && pending > 0) await batch.commit();

    const hasMore = snap.size === size;

    console.log(`[FixAgeGroups] chunk scanned=${scanned} considered=${considered} changed=${changed} ok=${alreadyOk} problems=${problems.length}${dryRun ? ' (dry run)' : ''}`);

    return NextResponse.json({
      success: true,
      dryRun,
      scanned,
      considered,
      changed,
      alreadyOk,
      skipped,
      problemCount: problems.length,
      problems,
      samples,
      hasMore,
      nextCursor: hasMore ? lastId : null,
    });

  } catch (error) {
    console.error('fix-age-groups error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
