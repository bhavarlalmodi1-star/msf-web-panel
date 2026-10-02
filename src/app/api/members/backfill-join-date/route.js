// POST /api/members/backfill-join-date
//
// Populates `joinDateTs` (a sortable Timestamp) on members that don't have it.
//
// The join date has always been stored as `dateJoin` / `programJoinDate` in
// DD-MM-YYYY form. Those strings don't sort chronologically ("05-01-2026" is
// alphabetically less than "10-12-2025"), so they can't back a range filter.
// The members page filters on `joinDateTs` — and Firestore range queries
// SILENTLY SKIP documents that lack the field, so any member without it simply
// never appears in a date range.
//
// Runs in resumable chunks: an earlier version read the whole members
// collection in one go, which timed out on large datasets and left nothing
// written. The client calls this repeatedly, passing back `nextCursor`, until
// `hasMore` is false.
//
// Body: { cursor?: string, batchSize?: number, force?: boolean, dryRun?: boolean }

import { NextResponse } from 'next/server';
import admin from '../../db/firebaseAdmin';
import { checkRole, verifyToken } from '../../../../../middleware/authMiddleware';

export const runtime = 'nodejs';
export const maxDuration = 60;

const db = admin.firestore();

// Parse DD-MM-YYYY into a Date at local midnight
const parseJoinDate = (value) => {
  if (!value || typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return Number.isNaN(d.getTime()) ? null : d;
};

export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    // Admins too: this runs automatically for whoever opens the members page,
    // and it only derives an existing date into a queryable form — it never
    // changes a member's actual join date.
    if (!checkRole(['superadmin', 'admin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

    const {
      cursor = null,
      batchSize = 400,
      force = false,
      dryRun = false,
    } = await req.json().catch(() => ({}));

    // Ordering by document id gives stable pagination that can't skip or repeat
    // rows as documents are written during the run.
    let q = db.collection('members')
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(Math.min(Number(batchSize) || 400, 500));

    if (cursor) q = q.startAfter(cursor);

    const snap = await q.get();

    let scanned = 0, updated = 0, skipped = 0, unparseable = 0;
    const problems = [];
    const batch = db.batch();
    let pending = 0;
    let lastId = cursor;

    for (const docSnap of snap.docs) {
      scanned++;
      lastId = docSnap.id;
      const m = docSnap.data();

      if (m.joinDateTs && !force) { skipped++; continue; }

      // Prefer the member-facing join date, then the program copy
      let date = parseJoinDate(m.dateJoin) || parseJoinDate(m.programJoinDate);

      // Fall back to createdAt so the member still appears in date filters
      // rather than dropping out entirely
      if (!date && m.createdAt?.toDate) {
        date = m.createdAt.toDate();
        unparseable++;
        problems.push({
          id: docSnap.id,
          registrationNumber: m.registrationNumber || '',
          reason: 'No parseable join date — used createdAt',
          dateJoin: m.dateJoin || null,
        });
      }

      if (!date) {
        unparseable++;
        problems.push({
          id: docSnap.id,
          registrationNumber: m.registrationNumber || '',
          reason: 'No join date and no createdAt — skipped',
          dateJoin: m.dateJoin || null,
        });
        continue;
      }

      if (!dryRun) {
        batch.update(docSnap.ref, { joinDateTs: admin.firestore.Timestamp.fromDate(date) });
        pending++;
      }
      updated++;
    }

    if (!dryRun && pending > 0) await batch.commit();

    // A short page means we've reached the end of the collection
    const hasMore = snap.size === Math.min(Number(batchSize) || 400, 500);

    console.log(`[BackfillJoinDate] chunk scanned=${scanned} updated=${updated} skipped=${skipped} hasMore=${hasMore}${dryRun ? ' (dry run)' : ''}`);

    return NextResponse.json({
      success: true,
      dryRun,
      scanned,
      updated,
      skipped,
      unparseable,
      hasMore,
      nextCursor: hasMore ? lastId : null,
      problems: problems.slice(0, 20),
    });

  } catch (error) {
    console.error('backfill-join-date error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
