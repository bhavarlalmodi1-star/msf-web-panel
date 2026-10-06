// POST /api/members/rebuild-search
//
// Rebuilds `search_keywords` (the list of words a member can be found by) on
// members whose list is out of date.
//
// WHY: search asks Firestore for members whose list contains the typed text.
// Edit Member used to save a new name / phone / village without rebuilding the
// list, so an edited member could only be found by the OLD values. Members
// brought in from the old system have an older, shorter list too.
//
// A member is rebuilt when its `search_v` is not the current version
// (src/utils/memberSearch.js). `force: true` rebuilds everyone — use it if
// members were changed by something that does not maintain the list.
//
// Runs in resumable chunks: the Members page calls it repeatedly, passing back
// `nextCursor`, until `hasMore` is false. Only the search fields are written;
// nothing else on the member changes.
//
// Body: { cursor?: string, batchSize?: number, force?: boolean, dryRun?: boolean }

import { NextResponse } from 'next/server';
import admin from '../../db/firebaseAdmin';
import { checkRole, verifyToken } from '../../../../../middleware/authMiddleware';
import { buildMemberSearchKeywords, MEMBER_SEARCH_VERSION } from '@/utils/memberSearch';

export const runtime = 'nodejs';
export const maxDuration = 60;

const db = admin.firestore();

const sameList = (a, b) => {
  if (!Array.isArray(a) || a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
};

export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    // Admins too: this runs automatically for whoever opens the members page,
    // and it only derives a search list from details the member already has.
    if (!checkRole(['superadmin', 'admin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

    const {
      cursor = null,
      batchSize = 200,
      force = false,
      dryRun = false,
    } = await req.json().catch(() => ({}));

    const size = Math.min(Math.max(Number(batchSize) || 200, 1), 300);

    // Ordering by document id gives stable pagination that can't skip or repeat
    // rows as documents are written during the run.
    let q = db.collection('members')
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(size);
    if (cursor) q = q.startAfter(cursor);

    const snap = await q.get();

    let scanned = 0, updated = 0, skipped = 0;
    const batch = db.batch();
    let lastId = cursor;

    for (const docSnap of snap.docs) {
      scanned++;
      lastId = docSnap.id;
      const m = docSnap.data();

      if (!force && m.search_v === MEMBER_SEARCH_VERSION) { skipped++; continue; }

      const keywords = buildMemberSearchKeywords(m);
      const update = { search_v: MEMBER_SEARCH_VERSION };
      if (!sameList(m.search_keywords, keywords)) update.search_keywords = keywords;
      // "Sort by registration number" orders on this field, and Firestore leaves
      // out members that do not have it
      if (m.registrationNumber && m.search_registrationNumber !== m.registrationNumber)
        update.search_registrationNumber = m.registrationNumber;

      if (!dryRun) batch.update(docSnap.ref, update);
      updated++;
    }

    if (!dryRun && updated > 0) await batch.commit();

    // A short page means we've reached the end of the collection
    const hasMore = snap.size === size;

    console.log(`[RebuildSearch] chunk scanned=${scanned} updated=${updated} skipped=${skipped} hasMore=${hasMore}${dryRun ? ' (dry run)' : ''}`);

    return NextResponse.json({
      success: true,
      dryRun,
      scanned,
      updated,
      skipped,
      hasMore,
      nextCursor: hasMore ? lastId : null,
    });
  } catch (error) {
    console.error('rebuild-search error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
