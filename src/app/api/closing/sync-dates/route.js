// POST /api/closing/sync-dates
//
// Backfills the top-level `closed_date` on closed members who only carry their
// date inside `closedStatus[]` (or in marriageDate / member_closed_at).
//
// WHY THIS MATTERS BEYOND DISPLAY: the closed-members list filters by date with
//   where('closed_date', '>=', …)
// and a Firestore RANGE FILTER EXCLUDES documents where the field is absent.
// So a member whose date lives only in closedStatus is not merely shown as
// "not set" — they vanish entirely from any date-filtered view, export or
// report. Copying the date up makes those members queryable.
//
// Runs both ways: it also fills a missing closedStatus entry from the top-level
// field, because api/closed_payment_entry reads the member's own closing date
// from closedStatus first when deciding what they owe.
//
// Body: { cursor?, batchSize?, dryRun? }

import { NextResponse } from 'next/server';
import admin from '../../db/firebaseAdmin';
import { checkRole, verifyToken } from '../../../../../middleware/authMiddleware';

export const runtime = 'nodejs';
export const maxDuration = 60;

const db = admin.firestore();
const STS = admin.firestore.FieldValue.serverTimestamp;

const toDate = (v) => {
  if (!v) return null;
  if (typeof v?.toDate === 'function') { const t = v.toDate(); return isNaN(t.getTime()) ? null : t; }
  const t = new Date(v);
  return isNaN(t.getTime()) ? null : t;
};

const IST_OFFSET_MIN = 330;
const dayStr = (d) => (d ? new Date(d.getTime() + IST_OFFSET_MIN * 60000).toISOString().slice(0, 10) : '');

export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Only superadmin can sync closing dates' }, { status: 403 });

    const { cursor = null, batchSize = 300, dryRun = true } = await req.json().catch(() => ({}));
    const size = Math.min(Number(batchSize) || 300, 500);

    let q = db.collection('members')
      .where('member_closed', '==', true)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(size);
    if (cursor) q = q.startAfter(cursor);

    const snap = await q.get();

    let scanned = 0, filledTopLevel = 0, filledStatus = 0, alreadyOk = 0, noDate = 0;
    const rows = [];
    let batch = db.batch();
    let pending = 0;
    let lastId = cursor;

    for (const d of snap.docs) {
      scanned++;
      lastId = d.id;
      const m = d.data();
      if (m.delete_flag === true) continue;

      const prog = m.member_closed_program || m.programId || null;
      const statusArr = Array.isArray(m.closedStatus) ? m.closedStatus : [];

      // Best available date, most specific first
      let fromStatus = null;
      for (const cs of statusArr) {
        if (prog && cs?.programId !== prog) continue;
        const t = toDate(cs?.closed_date);
        if (t) { fromStatus = t; break; }
      }
      if (!fromStatus) {
        for (const cs of statusArr) {
          const t = toDate(cs?.closed_date);
          if (t) { fromStatus = t; break; }
        }
      }
      const fromTop = toDate(m.closed_date) || toDate(m.marriageDate) || toDate(m.member_closed_at);
      const best = fromStatus || fromTop;

      if (!best) {
        noDate++;
        rows.push({
          memberId: d.id, name: m.displayName || '', regNo: m.registrationNumber || '',
          action: 'NO_DATE', message: 'Closed but no date anywhere — set it on the Closed list',
        });
        continue;
      }

      const iso = best.toISOString();
      const update = {};
      let action = null;

      // 1. Top-level missing or unreadable → fill it (this is what unblocks the
      //    date-range filter and the exports).
      if (!toDate(m.closed_date)) {
        update.closed_date = iso;
        action = 'FILLED_TOP_LEVEL';
      }

      // 2. No closedStatus entry carrying a date for this programme → add one,
      //    so the charging logic can find it.
      const hasStatusDate = statusArr.some(cs =>
        (!prog || cs?.programId === prog) && toDate(cs?.closed_date)
      );
      if (!hasStatusDate) {
        const idx = statusArr.findIndex(cs => prog && cs?.programId === prog);
        const next = [...statusArr];
        if (idx >= 0) {
          next[idx] = { ...next[idx], closed_date: iso };
        } else {
          next.push({
            programId:             prog,
            closingGroupId:        m.closingGroupId || null,
            closed_date:           iso,
            closed_note:           m.closed_note || '',
            closed_invitation_url: m.closed_invitation_url || null,
            closed_at:             m.member_closed_at || null,
            closed_by:             m.member_closed_by || null,
          });
        }
        update.closedStatus = next;
        action = action ? 'FILLED_BOTH' : 'FILLED_STATUS';
      }

      if (!action) { alreadyOk++; continue; }

      if (action === 'FILLED_TOP_LEVEL' || action === 'FILLED_BOTH') filledTopLevel++;
      if (action === 'FILLED_STATUS'    || action === 'FILLED_BOTH') filledStatus++;

      rows.push({
        memberId: d.id,
        name: m.displayName || '',
        regNo: m.registrationNumber || '',
        programName: m.programName || '',
        action,
        date: dayStr(best),
        source: fromStatus ? 'closing history' : 'top-level field',
      });

      if (!dryRun) {
        update.closingDateSyncedAt = STS();
        update.updated_at = STS();
        batch.update(d.ref, update);
        pending++;
        if (pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
      }
    }

    if (!dryRun && pending > 0) await batch.commit();

    const hasMore = snap.size === size;

    console.log(`[SyncClosingDates] scanned=${scanned} topLevel=${filledTopLevel} status=${filledStatus} ok=${alreadyOk} noDate=${noDate}${dryRun ? ' (preview)' : ''}`);

    return NextResponse.json({
      success: true, dryRun,
      scanned, filledTopLevel, filledStatus, alreadyOk, noDate,
      rows,
      hasMore,
      nextCursor: hasMore ? lastId : null,
    });

  } catch (error) {
    console.error('sync-dates error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
