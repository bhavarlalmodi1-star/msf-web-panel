// POST   /api/members/migrate-close — close ONE member, no payment entry
// DELETE /api/members/migrate-close — undo that close
//
// The normal close (api/closed_payment_entry) does two jobs: it marks the
// member closed, AND it raises an instalment on every other eligible member of
// the yojna. This route does the first job only — for closings that happened in
// the old system, where the money was already collected outside this app.
//
// It writes nothing but the closed flags and the date. No closing_payment doc,
// no groupClosings doc, and not one rupee moved on any member, agent, programme
// or organisation total.
//
// The date is required. api/closed_payment_entry treats a closed member it
// cannot date as still open, so a dateless close would quietly keep charging
// them for future closings — the exact bug this area was fixed for.
//
// Body (POST):   { memberId, closedDate, note? }
// Body (DELETE): { memberId }

import { NextResponse } from 'next/server';
import admin from '../../db/firebaseAdmin';
import { checkRole, verifyToken } from '../../../../../middleware/authMiddleware';

export const runtime = 'nodejs';

const db  = admin.firestore();
const INC = admin.firestore.FieldValue.increment;
const DEL = admin.firestore.FieldValue.delete;
const STS = admin.firestore.FieldValue.serverTimestamp;

// A closing date is a CALENDAR DAY, not an instant. `new Date(y, m, d)` builds
// LOCAL midnight; on a server ahead of UTC (IST is +5:30) that lands on the
// previous day, so every date would be stored one day early.
const parseDay = (v) => {
  if (!v) return null;
  const s = String(v).trim();

  const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmy) {
    const d = new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    const d = new Date(Date.UTC(+ymd[1], +ymd[2] - 1, +ymd[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin', 'admin'], authResult.user.role))
      return NextResponse.json(
        { success: false, message: 'You are not allowed to close a member' },
        { status: 403 }
      );

    const { memberId, closedDate, note } = await req.json().catch(() => ({}));

    if (!memberId)
      return NextResponse.json({ success: false, message: 'memberId is required' }, { status: 400 });

    const closedOn = parseDay(closedDate);
    if (!closedOn)
      return NextResponse.json(
        { success: false, message: 'समापन दिनांक ज़रूरी है' },
        { status: 400 }
      );

    const ref  = db.collection('members').doc(memberId);
    const snap = await ref.get();
    if (!snap.exists)
      return NextResponse.json({ success: false, message: 'सदस्य नहीं मिला' }, { status: 404 });

    const m = snap.data();
    if (m.delete_flag === true)
      return NextResponse.json({ success: false, message: 'यह सदस्य हटाया जा चुका है' }, { status: 400 });
    if (m.member_closed === true)
      return NextResponse.json({ success: false, message: 'यह सदस्य पहले से बंद है' }, { status: 400 });

    const programId  = m.programId || null;
    const closedIso  = closedOn.toISOString();
    // An ISO string, not a Date — api/closed_payment_entry writes closedStatus
    // entries this way, and a Date inside arrayUnion comes back as a Timestamp,
    // giving two shapes for the same field.
    const now = new Date().toISOString();
    const ts  = STS();

    const batch = db.batch();

    batch.update(ref, {
      member_closed: true,
      member_closed_at: now,
      member_closed_by: authResult.user.uid || null,
      member_closed_program: programId,
      closed_date: closedIso,
      closed_note: note || 'बिना किस्त बंद किया गया',
      closed_invitation_url: null,
      // Marks a close with no money behind it: the undo below refuses to touch
      // anything else, and the closing audit knows why there is no payment doc.
      closed_migration: true,
      // closedStatus is what api/closed_payment_entry reads first to find a
      // member's own closing date, so it has to be written too — without it the
      // member keeps getting charged for later closings.
      closedStatus: admin.firestore.FieldValue.arrayUnion({
        programId,
        closingGroupId: null,          // no group — nobody was charged
        closed_date: closedIso,
        closed_note: note || 'बिना किस्त बंद किया गया',
        closed_invitation_url: null,
        closed_at: now,
        closed_by: authResult.user.uid || null,
        migration: true,
      }),
      updated_at: ts,
      // Deliberately absent: closing_totalAmount, closing_pendingAmount,
      // closing_paidAmount, totalClosingCount, closingGroupIds and every other
      // money field. Nothing was charged, so nothing moves.
    });

    // Head-counts only — the member really is closed, so these are true. No
    // amount field is touched.
    if (m.agentId) {
      batch.update(db.collection('agents').doc(m.agentId), {
        closedCount: INC(1),
        ...(programId ? {
          [`programStats.${programId}.closedCount`]: INC(1),
          [`programStats.${programId}.lastUpdated`]: ts,
        } : {}),
        updated_at: ts,
      });
    }
    if (programId) {
      batch.set(db.collection('programs').doc(programId),
        { closedCount: INC(1), updated_at: ts }, { merge: true });
    }
    batch.set(db.collection('organizationStats').doc('current'),
      { closedCount: INC(1), updated_at: ts }, { merge: true });

    await batch.commit();

    return NextResponse.json({
      success: true,
      message: 'सदस्य बंद कर दिया गया — कोई किस्त नहीं जोड़ी गई',
      data: { memberId, closedDate: closedIso, programId },
    });
  } catch (err) {
    console.error('migrate-close POST error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// ── Undo ─────────────────────────────────────────────────────────────────────
// Refuses any member whose close was NOT this kind. A real close has money
// behind it — closing_payment docs, agent totals, programme pending — and
// undoing it needs api/closed_payment_entry's reversal, which unwinds all of
// that. Reopening such a member here would leave the charges standing.
export async function DELETE(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin', 'admin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'You are not allowed to reopen a member' }, { status: 403 });

    const { memberId } = await req.json().catch(() => ({}));
    if (!memberId)
      return NextResponse.json({ success: false, message: 'memberId is required' }, { status: 400 });

    const ref  = db.collection('members').doc(memberId);
    const snap = await ref.get();
    if (!snap.exists)
      return NextResponse.json({ success: false, message: 'सदस्य नहीं मिला' }, { status: 404 });

    const m = snap.data();
    if (m.member_closed !== true)
      return NextResponse.json({ success: false, message: 'यह सदस्य पहले से खुला है' }, { status: 400 });
    if (m.closed_migration !== true)
      return NextResponse.json({
        success: false,
        message: 'यह असली क्लोजिंग है (किस्त जुड़ी हुई है) — इसे Closing Group से ही रिवर्स करें',
      }, { status: 400 });

    const programId = m.member_closed_program || m.programId || null;
    const ts = STS();
    const batch = db.batch();

    batch.update(ref, {
      member_closed: false,
      member_closed_at: DEL(),
      member_closed_by: DEL(),
      member_closed_program: DEL(),
      closed_date: DEL(),
      closed_note: DEL(),
      closed_invitation_url: DEL(),
      closed_migration: DEL(),
      closedStatus: (m.closedStatus || []).filter(cs => cs.migration !== true),
      updated_at: ts,
    });

    // Mirror of the increments above, so the counts return to where they were.
    if (m.agentId) {
      batch.update(db.collection('agents').doc(m.agentId), {
        closedCount: INC(-1),
        ...(programId ? {
          [`programStats.${programId}.closedCount`]: INC(-1),
          [`programStats.${programId}.lastUpdated`]: ts,
        } : {}),
        updated_at: ts,
      });
    }
    if (programId) {
      batch.set(db.collection('programs').doc(programId),
        { closedCount: INC(-1), updated_at: ts }, { merge: true });
    }
    batch.set(db.collection('organizationStats').doc('current'),
      { closedCount: INC(-1), updated_at: ts }, { merge: true });

    await batch.commit();

    return NextResponse.json({ success: true, message: 'सदस्य वापस खोल दिया गया' });
  } catch (err) {
    console.error('migrate-close DELETE error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
