import { NextResponse } from "next/server";
import admin from "../db/firebaseAdmin";
import { verifyToken } from "../../../../middleware/authMiddleware";

const db = admin.firestore();
const INC = admin.firestore.FieldValue.increment;
const STS = admin.firestore.FieldValue.serverTimestamp;

// ─── helpers (identical to closing/route.js) ──────────────────────────────────
const chunkArr = (arr, n) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) =>
    arr.slice(i * n, i * n + n)
  );

// Handles Firestore Timestamp, ISO string, or "DD-MM-YYYY"
const parseDate = (d) => {
  if (!d) return null;
  if (d?.toDate) return d.toDate();                        // Firestore Timestamp
  if (typeof d !== "string") return new Date(d);
  if (d.includes("T") || /^\d{4}-\d{2}-\d{2}$/.test(d)) return new Date(d);
  const [day, month, year] = d.split("-").map(Number);
  return new Date(year, month - 1, day);
};

// Batch-fetch member docs (max 10 per Firestore IN query), return id→data map
const fetchMemberMap = async (ids) => {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return {};
  const snaps = await Promise.all(
    chunkArr(unique, 10).map((chunk) =>
      db.collection("members")
        .where(admin.firestore.FieldPath.documentId(), "in", chunk)
        .get()
    )
  );
  const map = {};
  snaps.forEach((s) =>
    s.forEach((d) => { if (d.exists) map[d.id] = { id: d.id, ...d.data() }; })
  );
  return map;
};

class MultiBatch {
  constructor() { this._batches = [db.batch()]; this._ops = 0; }
  _cur() {
    if (this._ops >= 490) { this._batches.push(db.batch()); this._ops = 0; }
    return this._batches[this._batches.length - 1];
  }
  set(ref, data, opts) { this._cur().set(ref, data, opts || {}); this._ops++; }
  update(ref, data) { this._cur().update(ref, data); this._ops++; }
  commit() { return Promise.all(this._batches.map((b) => b.commit())); }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/closing/backfill-member
//
// Call this right after a new member is created (or whenever you need to
// retroactively assign closing payments for a single member).
//
// Mirrors the payment logic of the main closing POST exactly:
//
//   Main POST loop (per existing member, per group):
//     - joinDate <= eventDate                           → member was active at event
//     - prevClosedDate && eventDate <= prevClosedDate   → skip already-paid events
//     - ownClosedDate  && eventDate >  ownClosedDate    → skip events after own close
//
//   This backfill (per group, for the ONE new member):
//     - joinDate <= eventDate                           → same rule
//     - no prevClosedDate  (brand new member, never paid before for this group)
//     - ownClosedDate from member's closedStatus if they are already closed
//
// The "event list" for each group is reconstructed by fetching each
// closedMember's closedStatus[] entry that matches { programId, closingGroupId }
// and reading its closed_date — that IS the event date.
//
// Body:     { memberId: string }
// Response: { success, message, summary }
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req) {
  const auth = await verifyToken(req);
  if (!auth.success)
    return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });

  const { memberId } = await req.json();
  if (!memberId)
    return NextResponse.json(
      { success: false, message: "memberId is required" },
      { status: 400 }
    );

  try {
    // ── 1. Fetch the new member ───────────────────────────────────────────
    const memberRef = db.collection("members").doc(memberId);
    const memberSnap = await memberRef.get();

    if (!memberSnap.exists)
      return NextResponse.json({ success: false, message: "Member not found" }, { status: 404 });

    const member = { id: memberId, ...memberSnap.data() };
    const { programId, payAmount: rawPay, dateJoin: rawJoin, agentId } = member;

    if (!programId)
      return NextResponse.json({ success: false, message: "Member has no programId" }, { status: 400 });

    const payAmount = Number(rawPay || 0);
    if (payAmount <= 0)
      return NextResponse.json(
        { success: false, message: "Member payAmount is 0 — nothing to backfill" },
        { status: 400 }
      );

    const joinDate = parseDate(rawJoin);
    if (!joinDate)
      return NextResponse.json(
        { success: false, message: "Member has no valid dateJoin" },
        { status: 400 }
      );

    // ── 2. Fetch all ACTIVE groupClosings for this program ────────────────
    const groupsSnap = await db
      .collection("groupClosings")
      .where("programId", "==", programId)
      .where("status", "==", "active")
      .get();

    if (groupsSnap.empty)
      return NextResponse.json({
        success: true,
        message: "No active closing groups found for this program",
        summary: { memberId, programId, groupsChecked: 0, groupsMatched: 0, totalAmount: 0, totalCount: 0 },
      });

    // ── 3. Batch-fetch ALL closedMember docs across every group at once ───
    // We read their closedStatus[] to reconstruct event dates per group.
    // closedStatus is NOT modified here — read only.
    const allClosedIds = new Set();
    groupsSnap.docs.forEach((gd) =>
      (gd.data().closedMemberIds || []).forEach((id) => allClosedIds.add(id))
    );
    const closedMemberMap = await fetchMemberMap([...allClosedIds]);

    // ── 4. Loop every group ───────────────────────────────────────────────
    const ts = STS();
    const mb = new MultiBatch();

    let totalAmount = 0;
    let totalCount  = 0;
    let groupsMatched = 0;
    let groupsChecked = 0;
    const agentTotals = { amount: 0, count: 0 };

    for (const groupDoc of groupsSnap.docs) {
      groupsChecked++;
      const group = groupDoc.data();
      const closingGroupId = groupDoc.id;

      // ── Idempotency: skip if this member is already in paymentMemberIds ──
      if ((group.paymentMemberIds || []).includes(memberId)) continue;

      // ── Age/Group filter: skip if member has a specific age/member group
      //    and it doesn't match the group's stored filters ────────────────
      const ageGroupIds = group.ageGroupIds || [];
      const memberGroupIds = group.memberGroupIds || [];
      if (ageGroupIds.length && member.ageGroupId && !ageGroupIds.includes(member.ageGroupId)) continue;
      if (memberGroupIds.length && member.memberGroupId && !memberGroupIds.includes(member.memberGroupId)) continue;

      const closedMemberIds = group.closedMemberIds || [];
      if (!closedMemberIds.length) continue;

      // ── Reconstruct event list for this group ─────────────────────────
      // Each closedMember has a closedStatus[] entry like:
      //   { programId, closingGroupId, closed_date, ... }
      // That closed_date is the event date used in the main POST's
      // memberClosingList filter.
      const events = [];
      for (const closedId of closedMemberIds) {
        const cm = closedMemberMap[closedId];
        if (!cm) continue;

        // Find the status entry that belongs to THIS group
        const entry = (cm.closedStatus || []).find(
          (cs) =>
            cs.programId     === programId &&
            cs.closingGroupId === closingGroupId
        );
        if (!entry) continue;

        const eventDate = parseDate(entry.closed_date);
        if (eventDate) events.push({ date: eventDate, closedId, closedMember: cm });
      }

      if (!events.length) continue;

      // ── Apply payment rules (same as main POST JOB 2) ─────────────────
      //
      // For this new member:
      //   prevClosedDate = null  (never been paid for this group before)
      //   ownClosedDate  = their own closed_date for this program (if closed)
      //
      // Rule: joinDate <= eventDate  AND  eventDate <= ownClosedDate (if set)

      const ownClosedEntry = (member.closedStatus || []).find(
        (cs) => cs.programId === programId
      );
      const ownClosedDate = ownClosedEntry ? parseDate(ownClosedEntry.closed_date) : null;

      const matchingEvents = events.filter((ev) => {
        if (joinDate > ev.date) return false;
        if (ownClosedDate && ev.date > ownClosedDate) return false;
        return true;
      });

      if (!matchingEvents.length) continue;

      // ── Build closingDetails (mirrors main POST closingDetails) ────────
      const closingDetails = matchingEvents.map(ev => ({
        closed_memberId:            ev.closedId,
        closed_memberName:          ev.closedMember?.displayName || ev.closedMember?.name || null,
        closed_fatherName:          ev.closedMember?.fatherName || null,
        closed_village:             ev.closedMember?.village || null,
        closingPhone:               ev.closedMember?.phone || null,
        closing_registrationNumber: ev.closedMember?.registrationNumber || null,
        closed_photoURL:            ev.closedMember?.photoURL || null,
        closed_date:                ev.date ? ev.date.toISOString() : null,
        marriageDate:               null,
        closed_note:                '',
        closed_invitation_url:      null,
      }));

      // ── Calculate ─────────────────────────────────────────────────────
      const memberPayment = matchingEvents.length * payAmount;
      const memberCount   = matchingEvents.length;

      totalAmount += memberPayment;
      totalCount  += memberCount;
      groupsMatched++;

      if (agentId) {
        agentTotals.amount += memberPayment;
        agentTotals.count  += memberCount;
      }

      // ── Write: member doc (mirrors main POST paymentUpdates exactly) ──
      mb.update(memberRef, {
        closing_totalAmount:   INC(memberPayment),
        closing_pendingAmount: INC(memberPayment),
        totalClosingCount:     INC(memberCount),
        pendingClosingCount:   INC(memberCount),
        updated_at: ts,
        closingGroupIds: admin.firestore.FieldValue.arrayUnion(closingGroupId),
        [`closingGroupAmounts.${closingGroupId}`]: memberPayment,
        [`closingGroupCounts.${closingGroupId}`]:  memberCount,
      });

      // ── Write: groupClosings doc — add member to paymentMemberIds ─────
      mb.update(groupDoc.ref, {
        paymentMemberIds: admin.firestore.FieldValue.arrayUnion(memberId),
        [`paymentBreakdown.${memberId}`]: { amount: memberPayment, count: memberCount },
        totalAmount:       INC(memberPayment),
        totalClosingCount: INC(memberCount),
      });

      // ── Write: closing_payment doc (was MISSING — this is the entry!) ─
      const firstEvent = matchingEvents[0];
      mb.set(
        db.collection("closing_payment").doc(`${memberId}_${closingGroupId}`),
        {
          // identifiers
          memberId,
          closingGroupId,
          closingGroupName: groupDoc.data()?.groupName || '',
          programId,

          // member info snapshot (the NEW member getting the payment)
          memberName:           member.displayName || member.name || null,
          memberCode:           member.memberCode || member.code || null,
          registrationNumber:   member.registrationNumber || null,
          agentId:              member.agentId || null,
          ageGroupId:           member.ageGroupId || null,
          memberGroupId:        member.memberGroupId || null,
          dateJoin:             member.dateJoin || null,

          // closing member snapshot (from the first closed member in this group)
          closing_Name:                 firstEvent?.closedMember?.displayName || firstEvent?.closedMember?.name || null,
          closing_fatherName:           firstEvent?.closedMember?.fatherName || null,
          closing_village:              firstEvent?.closedMember?.village || null,
          closingPhone:                 firstEvent?.closedMember?.phone || null,
          closing_registrationNumber:   firstEvent?.closedMember?.registrationNumber || null,
          closed_photoURL:              firstEvent?.closedMember?.photoURL || null,

          // payment info
          payAmount,
          closingCount:  memberCount,
          totalAmount:   memberPayment,

          // per-event details
          closingDetails,

          // status & audit
          status:        "pending",
          createdAt:     ts,
          isReversed:    false,
          reversedAt:    null,
          reversedBy:    null,
          reversalReason: null,
        }
      );
    }

    // Nothing matched — nothing to commit
    if (!groupsMatched)
      return NextResponse.json({
        success: true,
        message: "Member is not eligible for any active closing group",
        summary: { memberId, programId, groupsChecked, groupsMatched: 0, totalAmount: 0, totalCount: 0 },
      });

    // ── 5. Agent stats ────────────────────────────────────────────────────
    if (agentId && agentTotals.amount > 0) {
      mb.update(db.collection("agents").doc(agentId), {
        closing_pendingAmount: INC(agentTotals.amount),
        closing_totalAmount:   INC(agentTotals.amount),
        totalClosingCount:     INC(agentTotals.count),
        pendingClosingCount:   INC(agentTotals.count),
        [`programStats.${programId}.totalClosingAmount`]:        INC(agentTotals.amount),
        [`programStats.${programId}.totalClosingPendingAmount`]: INC(agentTotals.amount),
        [`programStats.${programId}.totalClosingCount`]:         INC(agentTotals.count),
        [`programStats.${programId}.pendingClosingCount`]:       INC(agentTotals.count),
        [`programStats.${programId}.lastUpdated`]:               ts,
        updated_at: ts,
      });
    }

    // ── 6. Program + Org stats ────────────────────────────────────────────
    const globalStats = {
      totalClosingPendingAmount: INC(totalAmount),
      totalClosingAmount:        INC(totalAmount),
      totalClosingCount:         INC(totalCount),
      pendingClosingCount:       INC(totalCount),
      updated_at: ts,
    };
    mb.set(db.collection("programs").doc(programId), globalStats, { merge: true });
    mb.set(db.collection("organizationStats").doc("current"), globalStats, { merge: true });

    // ── 7. Commit all writes in one go ────────────────────────────────────
    await mb.commit();

    return NextResponse.json({
      success: true,
      message: `Backfill complete for member ${memberId}`,
      summary: { memberId, programId, groupsChecked, groupsMatched, totalAmount, totalCount },
    });

  } catch (err) {
    console.error("POST /closing/backfill-member error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}