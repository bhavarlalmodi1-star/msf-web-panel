import { NextResponse } from "next/server";
import admin from "../db/firebaseAdmin";
import { verifyToken } from "../../../../middleware/authMiddleware";

const db = admin.firestore();
const INC = admin.firestore.FieldValue.increment;
const DEL = admin.firestore.FieldValue.delete;
const STS = admin.firestore.FieldValue.serverTimestamp;

// ─── helpers ──────────────────────────────────────────────────────────────────
const chunkArr = (arr, n) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) =>
    arr.slice(i * n, i * n + n)
  );

const parseDate = (d) => {
  if (!d) return null;
  // Firestore Timestamp — `new Date(timestampObject)` yields Invalid Date, so
  // this has to be unwrapped first. member_closed_at is stored as a Timestamp
  // and is the last-resort source for a member's own closing date.
  if (typeof d?.toDate === "function") {
    const t = d.toDate();
    return isNaN(t.getTime()) ? null : t;
  }
  if (typeof d !== "string") {
    const t = new Date(d);
    return isNaN(t.getTime()) ? null : t;
  }
  if (d.includes("T") || /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const t = new Date(d);
    return isNaN(t.getTime()) ? null : t;
  }
  const [day, month, year] = d.split("-").map(Number);
  const t = new Date(year, month - 1, day);
  return isNaN(t.getTime()) ? null : t;
};

// A member's OWN closing date, checked across every place it can live.
//
// This used to read only `closedStatus[].closed_date`, and that caused closed
// members to keep accruing instalments for closings that happened after them:
//
//  • Closing a member without a date stores `closed_date: null` in their
//    closedStatus entry. Setting the date later from /programs/closing-forms
//    goes through api/closing/update-date, which writes the TOP-LEVEL
//    closed_date — a field this function never looked at.
//  • closedStatus is appended with arrayUnion, so a member closed, marked
//    active, then closed again has several entries for one programme. find()
//    returned the first, which may be the dateless original.
//  • Members whose closedStatus is empty (older data, other close paths) had
//    no entry to sync at all.
//
// In each case ownClosedDate came back null, the "don't pay for events after
// this member closed" guard never fired, and they were charged for everything.
//
// Returns { date, closedNoDate } — closedNoDate flags a member who is closed
// but whose date cannot be established anywhere, so the caller can refuse to
// charge them rather than silently treating them as still-open.
const resolveOwnClosedDate = (m, programId) => {
  // Most specific first: a closedStatus entry for THIS programme that actually
  // carries a date. Scan all matching entries, don't just take the first.
  for (const cs of (m.closedStatus || [])) {
    if (cs?.programId !== programId) continue;
    const d = parseDate(cs.closed_date);
    if (d) return { date: d, closedNoDate: false };
  }

  // Then the top-level fields, which is where the closing-forms date editor and
  // the close operation itself write. member_closed_at is a server timestamp
  // set on every close, so it almost always resolves something.
  const top = parseDate(m.closed_date)
           || parseDate(m.marriageDate)
           || parseDate(m.member_closed_at);
  if (top) return { date: top, closedNoDate: false };

  return { date: null, closedNoDate: m.member_closed === true };
};

// Fetch member docs in parallel batches of 10, return id→data map
const fetchMemberMap = async (ids) => {
  const unique = [...new Set(ids)];
  if (!unique.length) return {};
  const snaps = await Promise.all(
    chunkArr(unique, 10).map((ch) =>
      db
        .collection("members")
        .where(admin.firestore.FieldPath.documentId(), "in", ch)
        .get()
    )
  );
  const map = {};
  snaps.forEach((s) =>
    s.forEach((d) => {
      if (d.exists) map[d.id] = { id: d.id, ...d.data() };
    })
  );
  return map;
};

// Multi-batch helper — auto-splits at 490 ops, commits all in parallel
class MultiBatch {
  constructor() {
    this._batches = [db.batch()];
    this._ops = 0;
  }
  _cur() {
    if (this._ops >= 490) {
      this._batches.push(db.batch());
      this._ops = 0;
    }
    return this._batches[this._batches.length - 1];
  }
  set(ref, data, opts) {
    this._cur().set(ref, data, opts || {});
    this._ops++;
  }
  update(ref, data) {
    this._cur().update(ref, data);
    this._ops++;
  }
  delete(ref) {
    this._cur().delete(ref);
    this._ops++;
  }
  // Commit SEQUENTIALLY and stop at the first failure.
  //
  // This used to be `Promise.all(batches.map(b => b.commit()))`, which fires
  // every batch in parallel. A Firestore batch is atomic only WITHIN itself, so
  // if one batch failed — a member doc deleted mid-run (update() throws when the
  // document is missing, and that kills the whole batch), contention, a deadline
  // — the other batches had already committed and still landed. The close was
  // then HALF APPLIED: members marked closed with no amounts, or agent totals
  // incremented for members whose own docs were never written. That is how a
  // member ends up with pending greater than total, and how an agent's closing
  // total drifts away from the sum of its members.
  //
  // Sequential commits can still leave earlier batches applied if a later one
  // fails, but the failure is now deterministic, reported, and tells the caller
  // exactly how far it got — instead of scattering writes unpredictably.
  async commit() {
    const committed = [];
    for (let i = 0; i < this._batches.length; i++) {
      try {
        await this._batches[i].commit();
        committed.push(i);
      } catch (e) {
        const err = new Error(
          `Closing write failed on batch ${i + 1} of ${this._batches.length} ` +
          `(${committed.length} already applied): ${e.message}. ` +
          `Run Settings → Closing System Check to repair the partial write.`
        );
        err.partial = { failedBatch: i, total: this._batches.length, committed: committed.length };
        throw err;
      }
    }
    return committed;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — Process closing + distribute payments
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req) {
  const auth = await verifyToken(req);
  if (!auth.success)
    return NextResponse.json(
      { success: false, message: auth.error },
      { status: auth.status }
    );

  const body = await req.json();
  const {
    programId,
    groupId,
    groupName,
    memberClosingList = [],
    memberIds = [],        // the newly-selected members being closed NOW
    closedBy,
    closedByName,
    ageGroups = [],
    memberGroups = [],
    closingGroupId,        // present only in add-to-existing mode
    includeInactive = false,
  } = body;

  if (!programId || !memberIds.length || !memberClosingList.length) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Missing required fields (programId, memberIds, or memberClosingList)",
      },
      { status: 400 }
    );
  }

  try {
    const isAddMode = !!closingGroupId;

    // In add-mode we reuse the existing group doc; in new-mode we create one.
    const groupRef = isAddMode
      ? db.collection("groupClosings").doc(closingGroupId)
      : db.collection("groupClosings").doc(groupId || db.collection("groupClosings").doc().id);

    const computedGroupId = groupRef.id;
    const ts = STS();
    const now = new Date().toISOString();
    const mb = new MultiBatch();

    // ── Add-mode: validate + load existing group ─────────────────────────
    let existingGroupData = null;
    // FIX: only skip members who are ALREADY CLOSED in this group,
    //      NOT members who already have payment entries — they must be
    //      re-evaluated against the NEW closings being added.
    let existingClosedIds = new Set();   // members already closed in this group

    if (isAddMode) {
      const snap = await groupRef.get();
      if (!snap.exists)
        return NextResponse.json(
          { success: false, message: "Closing group not found" },
          { status: 404 }
        );
      if (snap.data().status === "reversed")
        return NextResponse.json(
          { success: false, message: "Cannot add to a reversed group" },
          { status: 400 }
        );
      existingGroupData = snap.data();
      // Only prevent double-closing — do NOT block payment recalculation
      existingClosedIds = new Set(existingGroupData.closedMemberIds || []);
    }

    const resolvedGroupName = isAddMode
      ? (existingGroupData?.groupName || groupName || '')
      : (groupName || '');

    // ── 1. Fetch all members in this program ──────────────────────────────
    // By default only status 'active' members receive the closing pending
    // amount. includeInactive=true also distributes to status 'inactive'
    // members (e.g. currently-inactive members who joined before the event).
    let membersQuery = db.collection("members").where("programId", "==", programId);
    if (!includeInactive)
      membersQuery = membersQuery.where("status", "==", "active");

    const effectiveAgeGroups = isAddMode
      ? (existingGroupData?.ageGroupIds || ageGroups)
      : ageGroups;
    const effectiveMemberGroups = isAddMode
      ? (existingGroupData?.memberGroupIds || memberGroups)
      : memberGroups;

    // Firestore caps `in` at 30 values. This used to slice to 10 and say
    // nothing, so selecting more than ten age groups SILENTLY EXCLUDED every
    // member in groups 11+ from the paying set — they were eligible, were never
    // charged, and no one was told. Raised to the real limit, and anything
    // beyond it is now reported instead of dropped.
    const IN_LIMIT = 30;
    const droppedAgeGroups    = effectiveAgeGroups.slice(IN_LIMIT);
    const droppedMemberGroups = effectiveMemberGroups.slice(IN_LIMIT);

    if (effectiveAgeGroups.length)
      membersQuery = membersQuery.where(
        "ageGroupId",
        "in",
        effectiveAgeGroups.slice(0, IN_LIMIT)
      );
    if (effectiveMemberGroups.length)
      membersQuery = membersQuery.where(
        "memberGroupId",
        "in",
        effectiveMemberGroups.slice(0, IN_LIMIT)
      );

    if (droppedAgeGroups.length || droppedMemberGroups.length) {
      return NextResponse.json({
        success: false,
        message:
          `Too many groups selected: Firestore can filter on at most ${IN_LIMIT} at once. ` +
          `${droppedAgeGroups.length} age group(s) and ${droppedMemberGroups.length} member group(s) ` +
          `would be left out, so their members would never be charged. Close in smaller batches.`,
      }, { status: 400 });
    }

    const membersSnap = await membersQuery.get();
    const allProgramDocs = {};
    membersSnap.forEach((d) => {
      if (d.exists) allProgramDocs[d.id] = { id: d.id, ...d.data() };
    });
    const programMemberIds = Object.keys(allProgramDocs);

    // ── 2. Build lookup: closingMemberId → their closed_date ────────────
    const closingDateMap = {};
    for (const event of memberClosingList) {
      if (event.closed_memberId) {
        closingDateMap[event.closed_memberId] = parseDate(
          event.closed_date || event.marriageDate
        );
      }
    }

    // ── 3. Trackers ──────────────────────────────────────────────────────
    let totalPaymentAmount = 0;
    let totalPaymentCount = 0;
    const agentStats = {};
    // Exact per-agent movement, derived from how far each of their members
    // actually moved — see where it is filled in below.
    const agentDeltas = {};
    const agentClosedCounts = {};      // agentId → number of THEIR members closed this run
    const paymentUpdatedIds = [];      // members getting a NEW payment entry this run
    const paymentPerMember = {};
    const closedIds = [];              // members being closed (marked) this run
    const skippedClose = [];

    // One pending update per member, merged from the "mark closed" and "charge
    // for these closings" steps. Both used to be issued as separate batch
    // operations, which could land in different batches and be applied
    // independently; keeping them together makes each member all-or-nothing.
    const memberUpdates = new Map();   // memberId → update object
    const stageMemberUpdate = (memberId, patch) => {
      const prev = memberUpdates.get(memberId);
      memberUpdates.set(memberId, prev ? { ...prev, ...patch } : { ...patch });
    };
    // Already-closed members with no discoverable closing date — skipped rather
    // than charged, and surfaced in the response so the date can be filled in.
    const closedWithoutDate = [];
    // Members who could not be charged at all. Previously a silent `continue`,
    // which is why a member could be closed and still show zero pending.
    const noPayAmount = [];
    const noJoinDate  = [];

    // Load EVERY closing_payment doc for these members, across all groups —
    // not just this group's.
    //
    // Two jobs. First, the original one: knowing which events a member has
    // already been charged for in THIS group, so add-mode doesn't double-count.
    //
    // Second, and the reason a sync used to be needed afterwards: these docs are
    // the source of truth for a member's closing figures. The member's
    // closing_totalAmount / pendingAmount / counts used to be bumped with blind
    // increments, which assume the stored value was already right — so any
    // earlier error was carried forward for ever and only a full recalculation
    // could clear it. With every doc in hand we can instead write the member's
    // ABSOLUTE totals: the sum of their groups, including the one being written
    // now. That makes each close self-correcting.
    const allCpDocsByMember = {};      // memberId → [closing_payment docs]
    let existingPaymentDocsMap = {};   // memberId → THIS group's doc

    if (programMemberIds.length) {
      const cpSnaps = await Promise.all(
        chunkArr(programMemberIds, 30).map((chunk) =>
          db.collection("closing_payment").where("memberId", "in", chunk).get()
        )
      );
      cpSnaps.forEach((snap) =>
        snap.forEach((d) => {
          if (!d.exists) return;
          const data = { id: d.id, ...d.data() };
          if (data.isReversed === true) return;
          (allCpDocsByMember[data.memberId] ||= []).push(data);
          if (data.closingGroupId === computedGroupId) {
            existingPaymentDocsMap[data.memberId] = data;
          }
        })
      );
    }

    // A member's authoritative closing figures: the sum of their closing_payment
    // docs, with this group's doc replaced by what we are about to write.
    const absoluteMemberTotals = (memberId, thisGroupDoc) => {
      const docs = allCpDocsByMember[memberId] || [];
      let total = 0, paid = 0, count = 0, paidCount = 0;

      for (const d of docs) {
        if (d.closingGroupId === computedGroupId) continue;   // replaced below
        total     += Number(d.totalAmount  || 0);
        paid      += Number(d.paidAmount   || 0);
        count     += Number(d.closingCount || 0);
        if (d.status === "paid") paidCount += Number(d.closingCount || 0);
      }

      if (thisGroupDoc) {
        total     += Number(thisGroupDoc.totalAmount  || 0);
        paid      += Number(thisGroupDoc.paidAmount   || 0);
        count     += Number(thisGroupDoc.closingCount || 0);
        if (thisGroupDoc.status === "paid") paidCount += Number(thisGroupDoc.closingCount || 0);
      }

      const pending = Math.max(0, total - paid);
      return {
        closing_totalAmount:   total,
        closing_paidAmount:    paid,
        closing_pendingAmount: pending,      // always total − paid, never drifts
        totalClosingCount:     count,
        paidClosingCount:      Math.min(paidCount, count),
        pendingClosingCount:   Math.max(0, count - Math.min(paidCount, count)),
        closing_paymentPercentage: total > 0 ? Number(((paid / total) * 100).toFixed(2)) : 0,
      };
    };

    // ── 4. Main loop ─────────────────────────────────────────────────────
    for (const memberId of programMemberIds) {
      const m = allProgramDocs[memberId];
      if (!m) continue;

      const memberRef = db.collection("members").doc(memberId);
      const isBeingClosedNow = memberIds.includes(memberId);
      const payAmount = Number(m.payAmount || 0);

      // ── JOB 1: Mark member as closed (only for the selected memberIds) ──
      if (isBeingClosedNow) {
        // Skip if already marked closed in THIS group
        if (existingClosedIds.has(memberId)) {
          skippedClose.push({
            memberId,
            name: m.displayName || m.name,
            reason: "Already closed in this group",
          });
        } else {
          // Also check the member's own closedStatus array for this program
          const alreadyClosed = (m.closedStatus || []).some(
            (cs) => cs.programId === programId && cs.closingGroupId === computedGroupId
          );

          if (alreadyClosed) {
            skippedClose.push({
              memberId,
              name: m.displayName || m.name,
              reason: "Already closed",
            });
          } else {
            const detail =
              memberClosingList.find((c) => c.closed_memberId === memberId) || {};

            const newClosedEntry = {
              programId,
              closingGroupId: computedGroupId,
              closed_date: detail.closed_date || null,
              closed_note: detail.closed_note || "",
              closed_invitation_url: detail.closed_invitation_url || null,
              closed_at: now,
              closed_by: closedBy || null,
            };

            // Staged, not written yet. A member gets ONE update covering both
            // "you are closed" and "you owe this", so the two can never land in
            // different batches and leave the member half-updated.
            stageMemberUpdate(memberId, {
              programId,
              closingGroupId: computedGroupId,
              member_closed_at: now,
              member_closed_by: closedBy || null,
              member_closed_program: programId,
              closed_date: detail.closed_date || null,
              closed_note: detail.closed_note || "",
              closed_invitation_url: detail.closed_invitation_url || null,
              member_closed: true,
              updated_at: ts,
              closedStatus: admin.firestore.FieldValue.arrayUnion(newClosedEntry),
            });

            closedIds.push(memberId);
            if (m.agentId) {
              agentClosedCounts[m.agentId] = (agentClosedCounts[m.agentId] || 0) + 1;
            }
          }
        }
      }

      // ── JOB 2: Calculate payment for this member ─────────────────────────
      // A member with no payAmount cannot be charged anything — including for
      // their OWN closing. That is almost always an age-group mismatch (the
      // member's age group has no matching period, so payAmount was left 0),
      // not a deliberate exemption, and it used to happen silently: the member
      // was closed but no pending was ever raised for them. Report it instead.
      if (payAmount <= 0) {
        noPayAmount.push({
          memberId,
          name: m.displayName || m.name || '',
          registrationNumber: m.registrationNumber || '',
          ageGroupName: m.ageGroupName || '',
          beingClosedNow: isBeingClosedNow,
        });
        continue;
      }

      const joinDate = parseDate(m.dateJoin);
      if (!joinDate) {
        noJoinDate.push({
          memberId,
          name: m.displayName || m.name || '',
          registrationNumber: m.registrationNumber || '',
          beingClosedNow: isBeingClosedNow,
        });
        continue;
      }

      // Determine this member's own closing date (if they are being closed now,
      // or were already closed before in another group for this program)
      const resolved = resolveOwnClosedDate(m, programId);

      const ownClosedDate = isBeingClosedNow
        ? (closingDateMap[memberId] || resolved.date || null)
        : resolved.date;

      // Closed, but no closing date exists anywhere. We cannot prove any event
      // falls before their closing, so charging them would be a guess. Skip and
      // report it, rather than treating them as an open member (which is what
      // produced the "closed members keep getting pending" complaint).
      if (!isBeingClosedNow && resolved.closedNoDate) {
        closedWithoutDate.push({
          memberId,
          name: m.displayName || m.name || '',
          registrationNumber: m.registrationNumber || '',
        });
        continue;
      }

      // In add-mode: find which closing events this member has ALREADY been paid for
      // We track this via the closingDetails array on their existing closing_payment doc.
      const existingPaidEventIds = new Set();
      if (isAddMode && existingPaymentDocsMap[memberId]) {
        const existingDoc = existingPaymentDocsMap[memberId];
        (existingDoc.closingDetails || []).forEach((cd) => {
          if (cd.closed_memberId) existingPaidEventIds.add(cd.closed_memberId);
        });
      }

      // Filter closing events that should trigger payment for this member:
      // 1. Event date must be after member join date
      // 2. Event date must be on or before member's own closing date (if closed)
      // 3. Event must NOT have been previously paid for (in add-mode)
      // 4. Event date must be AFTER any previously paid events (no double-count)
      const matchingClosings = memberClosingList.filter((event) => {
        const eventDate = parseDate(event.closed_date || event.marriageDate);
        if (!eventDate) return false;
        // Must join before or on event date
        if (joinDate > eventDate) return false;
        // If member has their own closing date, don't pay for events after it
        if (ownClosedDate && eventDate > ownClosedDate) return false;
        // In add-mode: skip events already paid for this member in this group
        if (isAddMode && existingPaidEventIds.has(event.closed_memberId)) return false;
        return true;
      });

      if (matchingClosings.length === 0) continue;

      const memberPayment = matchingClosings.length * payAmount;
      const memberCount = matchingClosings.length;

      totalPaymentAmount += memberPayment;
      totalPaymentCount += memberCount;
      paymentUpdatedIds.push(memberId);
      paymentPerMember[memberId] = { amount: memberPayment, count: memberCount };

      if (m.agentId) {
        agentStats[m.agentId] ??= { amount: 0, count: 0, memberCount: 0 };
        agentStats[m.agentId].amount += memberPayment;
        agentStats[m.agentId].count += memberCount;
        agentStats[m.agentId].memberCount += isBeingClosedNow ? 1 : 0;
      }
      // Deltas are filled in just below, once the member's new absolute totals
      // are known, so the agent moves by exactly what its member moved by.

      // ── Update member doc counters ────────────────────────────────────────
      // ABSOLUTE values derived from this member's closing_payment docs, not
      // increments. An increment carries any pre-existing error forward for
      // ever, which is why the figures had to be re-synced after every close;
      // recomputing the totals makes the close correct on its own, and repairs
      // a member whose numbers were already wrong.
      const prior      = existingPaymentDocsMap[memberId];
      const priorTotal = Number(prior?.totalAmount  || 0);
      const priorPaid  = Number(prior?.paidAmount   || 0);
      const priorCount = Number(prior?.closingCount || 0);

      // What this group's doc will hold once the write below lands.
      const newGroupTotal = priorTotal + memberPayment;
      const newGroupCount = priorCount + memberCount;
      const thisGroupDoc = {
        totalAmount:  newGroupTotal,
        paidAmount:   priorPaid,
        closingCount: newGroupCount,
        status:       priorPaid >= newGroupTotal && newGroupTotal > 0 ? "paid"
                    : priorPaid > 0 ? "partial" : "pending",
      };

      const nextTotals = absoluteMemberTotals(memberId, thisGroupDoc);

      // The agent aggregate is meant to be the sum of its members, so move it by
      // exactly how much this member moved — new absolute minus what was stored.
      // Using the raw charge instead would re-apply any error the member was
      // already carrying, and leave the agent adrift from its members even after
      // the member itself had been corrected.
      if (m.agentId) {
        const d = (agentDeltas[m.agentId] ??= {
          total: 0, paid: 0, pending: 0, count: 0, paidCount: 0, pendingCount: 0,
        });
        d.total        += nextTotals.closing_totalAmount   - Number(m.closing_totalAmount   || 0);
        d.paid         += nextTotals.closing_paidAmount    - Number(m.closing_paidAmount    || 0);
        d.pending      += nextTotals.closing_pendingAmount - Number(m.closing_pendingAmount || 0);
        d.count        += nextTotals.totalClosingCount     - Number(m.totalClosingCount     || 0);
        d.paidCount    += nextTotals.paidClosingCount      - Number(m.paidClosingCount      || 0);
        d.pendingCount += nextTotals.pendingClosingCount   - Number(m.pendingClosingCount   || 0);
      }

      stageMemberUpdate(memberId, {
        ...nextTotals,
        updated_at: ts,
        closingGroupIds: admin.firestore.FieldValue.arrayUnion(computedGroupId),
        [`closingGroupAmounts.${computedGroupId}`]: newGroupTotal,
        [`closingGroupCounts.${computedGroupId}`]: newGroupCount,
      });

      // ── JOB 3: Write / merge closing_payment entry for this member ────────
      const closingPaymentRef = db
        .collection("closing_payment")
        .doc(`${memberId}_${computedGroupId}`);

      const closingMemberDetail =
        memberClosingList.find((c) => c.closed_memberId === memberId) || {};

      const closingDetails = matchingClosings.map((event) => {
        const eventDetail =
          memberClosingList.find((c) => c.closed_memberId === event.closed_memberId) || {};
        return {
          closed_memberId:              event.closed_memberId || null,
          closed_memberName:            eventDetail.closing_Name || event.closed_memberName || event.name || null,
          closed_fatherName:            eventDetail.closing_fatherName || null,
          closed_village:               eventDetail.closing_village || null,
          closingPhone:                 eventDetail.closingPhone || m.phone || null,
          closing_registrationNumber:   eventDetail.closing_registrationNumber || m.registrationNumber || null,
          closed_photoURL:              eventDetail.closed_photoURL || null,
          closed_date:                  event.closed_date || event.marriageDate || null,
          closed_note:                  event.closed_note || null,
          closed_invitation_url:        event.closed_invitation_url || null,
          marriageDate:                 event.marriageDate || null,
        };
      });

      if (isAddMode && existingPaymentDocsMap[memberId]) {
        // ── Add-mode: MERGE into the existing closing_payment doc ────────────
        // Append new closingDetails, increment amounts/counts
        mb.update(closingPaymentRef, {
          closingCount:   INC(memberCount),
          totalAmount:    INC(memberPayment),
          closingDetails: admin.firestore.FieldValue.arrayUnion(...closingDetails),
          updatedAt:      ts,
          updatedBy:      closedBy || null,
          updatedByName:  closedByName || null,
        });
      } else {
        // ── New-mode (or first-time entry in add-mode): CREATE the doc ───────
        mb.set(closingPaymentRef, {
          // identifiers
          memberId,
          closingGroupId: computedGroupId,
          closingGroupName: resolvedGroupName,
          programId,

          // member info snapshot
          memberName:       m.displayName || m.name || null,
          memberCode:       m.memberCode || m.code || null,
          agentId:          m.agentId || null,
          ageGroupId:       m.ageGroupId || null,
          memberGroupId:    m.memberGroupId || null,
          dateJoin:         m.dateJoin || null,

          // closing member snapshot (from frontend)
          closing_Name:                 closingMemberDetail.closing_Name || m.displayName || m.name || null,
          closing_fatherName:           closingMemberDetail.closing_fatherName || m.fatherName || null,
          closing_village:              closingMemberDetail.closing_village || m.village || null,
          closingPhone:                 closingMemberDetail.closingPhone || m.phone || null,
          closing_registrationNumber:   closingMemberDetail.closing_registrationNumber || m.registrationNumber || null,
          closed_photoURL:              closingMemberDetail.closed_photoURL || m.photoURL || null,

          // payment info
          payAmount,
          closingCount:  memberCount,
          totalAmount:   memberPayment,

          // per-event details
          closingDetails,

          // status & audit
          status:          "pending",
          createdAt:       ts,
          createdBy:       closedBy || null,
          createdByName:   closedByName || null,
          isReversed:      false,
          reversedAt:      null,
          reversedBy:      null,
          reversedByName:  null,
          reversalReason:  null,
        });
      }
    }

    // ── 4b. Flush the staged member updates ──────────────────────────────
    // One write per member, carrying both the close flags and the amounts.
    for (const [memberId, patch] of memberUpdates) {
      mb.update(db.collection("members").doc(memberId), patch);
    }

    // ── 5. Write / update group doc ──────────────────────────────────────
    if (isAddMode) {
      // Re-fetch the latest group doc to avoid stale merge
      const freshSnap = await groupRef.get();
      const freshData = freshSnap.data() || {};

      const existingClosedArr   = freshData.closedMemberIds   || [];
      const existingPaymentArr  = freshData.paymentMemberIds  || [];
      const existingBreakdown   = freshData.paymentBreakdown  || {};

      // Merge sets so we never duplicate IDs
      const mergedClosedArr   = [...new Set([...existingClosedArr, ...closedIds])];
      const mergedPaymentArr  = [...new Set([...existingPaymentArr, ...paymentUpdatedIds])];

      // Merge paymentBreakdown — add incremental amounts for existing members
      const mergedBreakdown = { ...existingBreakdown };
      for (const [mid, info] of Object.entries(paymentPerMember)) {
        if (mergedBreakdown[mid]) {
          mergedBreakdown[mid] = {
            amount: (mergedBreakdown[mid].amount || 0) + info.amount,
            count:  (mergedBreakdown[mid].count  || 0) + info.count,
          };
        } else {
          mergedBreakdown[mid] = info;
        }
      }

      mb.set(
        groupRef,
        {
          closedMemberIds:   mergedClosedArr,
          paymentMemberIds:  mergedPaymentArr,
          paymentBreakdown:  mergedBreakdown,
          memberCount:       mergedClosedArr.length,
          totalAmount:       (freshData.totalAmount       || 0) + totalPaymentAmount,
          totalClosingCount: (freshData.totalClosingCount || 0) + totalPaymentCount,
          ...(groupName ? { groupName } : {}),
          ageGroupIds:       existingGroupData?.ageGroupIds ?? (ageGroups.length ? ageGroups : []),
          memberGroupIds:    existingGroupData?.memberGroupIds ?? (memberGroups.length ? memberGroups : []),
          status:    "active",
          updatedAt: ts,
          updatedBy: closedBy || null,
        },
        { merge: true }
      );
    } else {
      // New group
      mb.set(groupRef, {
        id:                computedGroupId,
        programId,
        ...(groupName ? { groupName } : {}),
        ageGroupIds:       ageGroups.length ? ageGroups : [],
        memberGroupIds:    memberGroups.length ? memberGroups : [],
        closedMemberIds:   closedIds,
        paymentMemberIds:  paymentUpdatedIds,
        paymentBreakdown:  paymentPerMember,
        totalAmount:       totalPaymentAmount,
        totalClosingCount: totalPaymentCount,
        memberCount:       closedIds.length,
        status:            "active",
        closedAt:          ts,
        closedBy:          closedBy || null,
        closedByName:      closedByName || null,
      });
    }

    // ── 6. Agent / Program / Org stats ───────────────────────────────────
    // Mirror ALL the fields that the reversal/delete paths decrement
    // (programStats pending/counts + closedCount) so add & remove stay symmetric.
    const allAgentIds = new Set([
      ...Object.keys(agentStats),
      ...Object.keys(agentClosedCounts),
    ]);
    for (const agentId of allAgentIds) {
      // Move the agent by exactly how far its members moved, not by the raw
      // charge. When a member's figures were wrong and this run corrected them,
      // the delta carries that correction up, so the agent stays equal to the
      // sum of its members instead of needing a separate recalculation.
      const d = agentDeltas[agentId] || {
        total: 0, paid: 0, pending: 0, count: 0, paidCount: 0, pendingCount: 0,
      };
      const closedN = agentClosedCounts[agentId] || 0;

      const agentUpdate = {
        closedCount: INC(closedN),
        [`programStats.${programId}.closedCount`]: INC(closedN),
        [`programStats.${programId}.lastUpdated`]: ts,
        updated_at: ts,
      };

      // Skip zero movements so an unchanged field isn't rewritten needlessly.
      const bump = (field, progField, value) => {
        if (!value) return;
        agentUpdate[field] = INC(value);
        agentUpdate[`programStats.${programId}.${progField}`] = INC(value);
      };
      bump('closing_totalAmount',   'totalClosingAmount',        d.total);
      bump('closing_paidAmount',    'totalClosingPaidAmount',    d.paid);
      bump('closing_pendingAmount', 'totalClosingPendingAmount', d.pending);
      bump('totalClosingCount',     'totalClosingCount',         d.count);
      bump('paidClosingCount',      'paidClosingCount',          d.paidCount);
      bump('pendingClosingCount',   'pendingClosingCount',       d.pendingCount);

      mb.update(db.collection("agents").doc(agentId), agentUpdate);
    }

    const globalStats = {
      totalClosingPendingAmount: INC(totalPaymentAmount),
      totalClosingAmount:        INC(totalPaymentAmount),
      totalClosingCount:         INC(totalPaymentCount),
      pendingClosingCount:       INC(totalPaymentCount),
      closedCount:               INC(closedIds.length),
      updated_at:                ts,
    };
    mb.set(db.collection("programs").doc(programId),              globalStats, { merge: true });
    mb.set(db.collection("organizationStats").doc("current"),     globalStats, { merge: true });

    await mb.commit();

    return NextResponse.json({
      success: true,
      summary: {
        totalPaymentAmount,
        paymentUpdatedCount: paymentUpdatedIds.length,
        closedCount:         closedIds.length,
        skippedCount:        skippedClose.length,
        skipped:             skippedClose,
        closedWithoutDateCount: closedWithoutDate.length,
        closedWithoutDate,
        // Members who received nothing. `...ClosedNow` are the serious ones:
        // they were just closed but no pending was raised for them at all.
        noPayAmountCount:        noPayAmount.length,
        noPayAmount,
        noPayAmountClosedNow:    noPayAmount.filter(x => x.beingClosedNow),
        noJoinDateCount:         noJoinDate.length,
        noJoinDate,
        noJoinDateClosedNow:     noJoinDate.filter(x => x.beingClosedNow),
      },
    });
  } catch (err) {
    console.error("POST Error:", err);
    return NextResponse.json(
      { success: false, message: err.message },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE — Reverse a closing group
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req) {
  const auth = await verifyToken(req);
  if (!auth.success)
    return NextResponse.json(
      { success: false, message: auth.error },
      { status: auth.status }
    );

  const {
    closingGroupId,
    programId,
    reason = "Manual reversal",
    reversedBy,
    reversedByName,
  } = await req.json();

  if (!closingGroupId || !programId)
    return NextResponse.json(
      { success: false, message: "closingGroupId and programId are required" },
      { status: 400 }
    );

  try {
    const groupDoc = await db
      .collection("groupClosings")
      .doc(closingGroupId)
      .get();
    if (!groupDoc.exists)
      return NextResponse.json(
        { success: false, message: "Closing group not found" },
        { status: 404 }
      );

    const groupData = groupDoc.data();
    if (groupData.status === "reversed")
      return NextResponse.json(
        { success: false, message: "Already reversed" },
        { status: 400 }
      );

    const closedMemberIds  = groupData.closedMemberIds  || groupData.memberIds || [];
    const paymentMemberIds = groupData.paymentMemberIds || groupData.memberIds || [];
    const storedMemberCount =
      groupData.closedMemberCount || groupData.memberCount || closedMemberIds.length;
    const paymentBreakdown = groupData.paymentBreakdown || {};

    const ts = STS();
    const mb = new MultiBatch();
    const agentStats = {};
    const agentUnClosedCounts = {};   // agentId → number of THEIR members un-closed
    let totalRevAmount = 0;
    let totalRevCount  = 0;

    // ── Step 1: Un-close selected members ────────────────────────────────
    if (closedMemberIds.length) {
      const closedDocs = await fetchMemberMap(closedMemberIds);

      for (const memberId of closedMemberIds) {
        const m = closedDocs[memberId];
        if (!m) continue;

        const closedStatus = m.closedStatus || [];
        const entryIdx = closedStatus.findIndex(
          (cs) =>
            cs.programId === programId &&
            cs.closingGroupId === closingGroupId
        );

        const updatedStatus =
          entryIdx !== -1
            ? closedStatus.filter((_, i) => i !== entryIdx)
            : closedStatus;

        // Track per-agent un-closed count (mirrors POST's closedCount INC)
        if (entryIdx !== -1 && m.agentId) {
          agentUnClosedCounts[m.agentId] = (agentUnClosedCounts[m.agentId] || 0) + 1;
        }

        const stillClosed  = updatedStatus.length > 0;
        const latestEntry  = stillClosed
          ? updatedStatus[updatedStatus.length - 1]
          : null;

        const memberRef = db.collection("members").doc(memberId);
        const memberUpdate = { closedStatus: updatedStatus, updated_at: ts };

        if (!stillClosed) {
          Object.assign(memberUpdate, {
            member_closed:         false,
            member_closed_at:      DEL(),
            member_closed_by:      DEL(),
            member_closed_program: DEL(),
            closed_date:           DEL(),
            closed_note:           DEL(),
            closed_invitation_url: DEL(),
            closingGroupId:        DEL(),
          });
        } else {
          Object.assign(memberUpdate, {
            member_closed:         true,
            member_closed_program: latestEntry.programId,
            closed_date:           latestEntry.closed_date || null,
            closingGroupId:        latestEntry.closingGroupId,
          });
        }

        mb.update(memberRef, memberUpdate);
      }
    }

    // ── Step 2: Reverse payments ──────────────────────────────────────────
    if (paymentMemberIds.length) {
      const paymentDocs = await fetchMemberMap(paymentMemberIds);

      for (const memberId of paymentMemberIds) {
        const m = paymentDocs[memberId];
        if (!m) continue;

        // Prefer stored breakdown, fall back to member doc fields
        let amount = 0;
        let count  = 0;

        if (paymentBreakdown[memberId]) {
          amount = Number(paymentBreakdown[memberId].amount || 0);
          count  = Number(paymentBreakdown[memberId].count  || 0);
        }

        if (!amount) {
          // Try to read from the closing_payment doc
          try {
            const cpSnap = await db
              .collection("closing_payment")
              .doc(`${memberId}_${closingGroupId}`)
              .get();
            if (cpSnap.exists) {
              const cpData = cpSnap.data();
              amount = Number(cpData.totalAmount   || 0);
              count  = Number(cpData.closingCount  || 0);
            }
          } catch (_) {}
        }

        // Nothing to reverse for this member — but the closing_payment doc may
        // still exist (a zero breakdown with a real doc behind it). Deleting it
        // here stops it lingering as an orphan that the member's detail view
        // would keep listing after the group is gone.
        if (!amount && !count) {
          mb.delete(db.collection("closing_payment").doc(`${memberId}_${closingGroupId}`));
          continue;
        }

        totalRevAmount += amount;
        totalRevCount  += count;

        const memberRef = db.collection("members").doc(memberId);

        // How much has already been paid out for this group?
        let paidForThisGroup    = 0;
        let countForThisGroup   = count;
        try {
          const cpSnap = await db
            .collection("closing_payment")
            .doc(`${memberId}_${closingGroupId}`)
            .get();
          if (cpSnap.exists) {
            const cpData = cpSnap.data();
            paidForThisGroup  = Number(cpData.paidAmount    || 0);
            countForThisGroup = Number(cpData.closingCount  || count);
          }
        } catch (_) {}

        const pendingForThisGroup = Math.max(0, amount - paidForThisGroup);

        // Write ABSOLUTE values, not increments.
        //
        // This used to decrement closing_totalAmount by the full `amount` while
        // decrementing closing_pendingAmount by a CLAMPED amount
        // (Math.min(pendingForThisGroup, current)). Whenever the clamp bit, the
        // total fell further than the pending and the two stopped agreeing —
        // producing exactly the "total ₹400 but pending ₹600" members. Pending
        // is now always derived as total − paid, so the invariant cannot break.
        const newTotal   = Math.max(0, Number(m.closing_totalAmount || 0) - amount);
        const newPaid    = Math.max(0, Number(m.closing_paidAmount  || 0) - paidForThisGroup);
        const newPending = Math.max(0, newTotal - newPaid);

        const newTotalCount   = Math.max(0, Number(m.totalClosingCount  || 0) - count);
        const newPaidCount    = Math.max(0, Number(m.paidClosingCount   || 0) - Math.min(countForThisGroup, Number(m.paidClosingCount || 0)));
        const newPendingCount = Math.max(0, newTotalCount - newPaidCount);

        mb.update(memberRef, {
          closing_totalAmount:   newTotal,
          closing_paidAmount:    newPaid,
          closing_pendingAmount: newPending,
          totalClosingCount:     newTotalCount,
          paidClosingCount:      newPaidCount,
          pendingClosingCount:   newPendingCount,
          closing_paymentPercentage: newTotal > 0 ? Number(((newPaid / newTotal) * 100).toFixed(2)) : 0,
          updated_at:            ts,
          closingGroupIds:       admin.firestore.FieldValue.arrayRemove(closingGroupId),
          [`closingGroupAmounts.${closingGroupId}`]: DEL(),
          [`closingGroupCounts.${closingGroupId}`]:  DEL(),
        });

        if (m.agentId) {
          agentStats[m.agentId] ??= { amount: 0, count: 0, memberCount: 0 };
          agentStats[m.agentId].amount      += amount;
          agentStats[m.agentId].count       += count;
          agentStats[m.agentId].memberCount += 1;
        }

        // Hard-delete the closing_payment doc on reversal
        mb.delete(
          db.collection("closing_payment").doc(`${memberId}_${closingGroupId}`)
        );
      }
    }

    // ── Step 3: Hard-delete groupClosings doc ─────────────────────────────
    mb.delete(db.collection("groupClosings").doc(closingGroupId));

    // ── Step 4: Agent stats reversal (clamp to 0) ─────────────────────────
    const allRevAgentIds = new Set([
      ...Object.keys(agentStats),
      ...Object.keys(agentUnClosedCounts),
    ]);
    if (allRevAgentIds.size) {
      const agentSnaps = await Promise.all(
        [...allRevAgentIds].map((aid) =>
          db.collection("agents").doc(aid).get()
        )
      );
      const agentDataMap = {};
      agentSnaps.forEach((snap) => {
        if (snap.exists) agentDataMap[snap.id] = snap.data();
      });

      for (const agentId of allRevAgentIds) {
        if (!agentDataMap[agentId]) continue;
        const s  = agentStats[agentId] || { amount: 0, count: 0 };
        const unClosedN = agentUnClosedCounts[agentId] || 0;
        const a  = agentDataMap[agentId];
        const ps = (a.programStats || {})[programId] || {};

        mb.update(db.collection("agents").doc(agentId), {
          closing_pendingAmount: Math.max(0, Number(a.closing_pendingAmount || 0) - s.amount),
          closing_totalAmount:   Math.max(0, Number(a.closing_totalAmount   || 0) - s.amount),
          totalClosingCount:     Math.max(0, Number(a.totalClosingCount     || 0) - s.count),
          pendingClosingCount:   Math.max(0, Number(a.pendingClosingCount   || 0) - s.count),
          closedCount:           Math.max(0, Number(a.closedCount           || 0) - unClosedN),
          updated_at:            ts,
          [`programStats.${programId}.totalClosingAmount`]:        Math.max(0, Number(ps.totalClosingAmount        || 0) - s.amount),
          [`programStats.${programId}.totalClosingPendingAmount`]: Math.max(0, Number(ps.totalClosingPendingAmount || 0) - s.amount),
          [`programStats.${programId}.totalClosingCount`]:         Math.max(0, Number(ps.totalClosingCount         || 0) - s.count),
          [`programStats.${programId}.pendingClosingCount`]:       Math.max(0, Number(ps.pendingClosingCount       || 0) - s.count),
          [`programStats.${programId}.closedCount`]:               Math.max(0, Number(ps.closedCount               || 0) - unClosedN),
          [`programStats.${programId}.lastUpdated`]:               ts,
        });
      }
    }

    // ── Step 5 & 6: Program + Org stats reversal ─────────────────────────
    const [progSnap, orgSnap] = await Promise.all([
      db.collection("programs").doc(programId).get(),
      db.collection("organizationStats").doc("current").get(),
    ]);
    const pd = progSnap.exists ? progSnap.data() : {};
    const od = orgSnap.exists  ? orgSnap.data()  : {};

    const progStats = {
      closedCount:               Math.max(0, Number(pd.closedCount               || 0) - storedMemberCount),
      totalClosingPendingAmount: Math.max(0, Number(pd.totalClosingPendingAmount || 0) - totalRevAmount),
      totalClosingAmount:        Math.max(0, Number(pd.totalClosingAmount        || 0) - totalRevAmount),
      totalClosingCount:         Math.max(0, Number(pd.totalClosingCount         || 0) - totalRevCount),
      pendingClosingCount:       Math.max(0, Number(pd.pendingClosingCount       || 0) - totalRevCount),
      updated_at:                ts,
    };
    const orgStats = {
      closedCount:               Math.max(0, Number(od.closedCount               || 0) - storedMemberCount),
      totalClosingPendingAmount: Math.max(0, Number(od.totalClosingPendingAmount || 0) - totalRevAmount),
      totalClosingAmount:        Math.max(0, Number(od.totalClosingAmount        || 0) - totalRevAmount),
      totalClosingCount:         Math.max(0, Number(od.totalClosingCount         || 0) - totalRevCount),
      pendingClosingCount:       Math.max(0, Number(od.pendingClosingCount       || 0) - totalRevCount),
      updated_at:                ts,
    };
    mb.set(db.collection("programs").doc(programId),          progStats, { merge: true });
    mb.set(db.collection("organizationStats").doc("current"), orgStats,  { merge: true });

    await mb.commit();

    return NextResponse.json({
      success: true,
      message: `Reversed: ${closedMemberIds.length} members un-closed, ${paymentMemberIds.length} payments reversed`,
      summary: {
        closingGroupId,
        membersUnClosed:      closedMemberIds.length,
        paymentReversedFor:   paymentMemberIds.length,
        reversedAmount:       totalRevAmount,
        reversedCount:        totalRevCount,
        reason,
      },
    });
  } catch (err) {
    console.error("DELETE /closing error:", err);
    return NextResponse.json(
      { success: false, message: err.message },
      { status: 500 }
    );
  }
}