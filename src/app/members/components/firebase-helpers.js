// lib/firebase-helpers.js

import {
  collection,
  query,
  getDocs,
  orderBy,
  where,
  limit,
  startAfter,
  getCountFromServer,
  Timestamp
} from "firebase/firestore";

import { db } from "../../../../lib/firbase-client";

/* =====================================================
   BUILD MEMBERS QUERY (SEARCH + FILTER + PAGINATION)
   Program is now a flat field (programId) on member doc
===================================================== */
export const buildMembersConstraints = (filters = {}) => {
  const {
    search              = "",
    programIds          = [],
    ageGroupIds         = [],
    agentId             = null,
    status              = "all",
    paymentStatus       = "all",
    closingPaymentStatus = "all",
    fromDate            = null,
    toDate              = null,
    sortField           = "createdAt",
    sortOrder           = "desc"
  } = filters;

  const membersRef = collection(db, "members");
  const conditions = [
    where("delete_flag", "==", false),
    where("status",      "==", "active")
  ];

  // ── Program filter (multi-select, flat field) ─────────────────────────────
  // Accept `programId: 'x'` as an alias for `programIds: ['x']`. A caller that
  // passed the singular key used to have it dropped during destructuring, which
  // applied NO programme condition at all and silently returned every yojna's
  // members — a filter that fails open is worse than one that errors.
  const singleProgramId =
    filters.programId && filters.programId !== 'all' ? [filters.programId] : [];
  const rawProgIds = Array.isArray(programIds) && programIds.length
    ? programIds
    : singleProgramId;
  const progIds = rawProgIds.filter(Boolean);
  if (progIds.length === 1) {
    conditions.push(where("programId", "==", progIds[0]));
  } else if (progIds.length > 1) {
    conditions.push(where("programId", "in", progIds.slice(0, 30)));
  }

  // ── Age group filter (multi-select) ───────────────────────────────────────
  // Matched on id rather than name: age group names get edited, ids don't.
  // Only meaningful alongside a program, since ids are scoped to a program.
  // Firestore caps `in` at 30 values — far more than any yojna has groups.
  const ageIds = Array.isArray(ageGroupIds) ? ageGroupIds.filter(Boolean) : [];
  if (ageIds.length === 1) {
    conditions.push(where("ageGroupId", "==", ageIds[0]));
  } else if (ageIds.length > 1) {
    conditions.push(where("ageGroupId", "in", ageIds.slice(0, 30)));
  }

  // ── Agent filter ──────────────────────────────────────────────────────────
  if (agentId && agentId !== "all") {
    conditions.push(where("agentId", "==", agentId));
  }

  // ── Status filter ─────────────────────────────────────────────────────────
  if (status === "active") {
    conditions.push(where("active_flag", "==", true));
  } else if (status === "inactive") {
    conditions.push(where("active_flag", "==", false));
  } else if (status === "closed") {
    conditions.push(where("member_closed", "==", true));
  }

  // ── Payment status filter ─────────────────────────────────────────────────
  if (paymentStatus === "paid") {
    conditions.push(where("paymentPercentage", "==", 100));
  } else if (paymentStatus === "pending") {
    conditions.push(where("paymentPercentage", "==", 0));
  }
  // "partial" handled client-side

  // ── Join date range ───────────────────────────────────────────────────────
  // Queries joinDateTs, NOT createdAt. createdAt is when the record was made,
  // so editing a member's join date had no effect on this filter at all.
  // dateJoin/programJoinDate are DD-MM-YYYY strings and don't sort
  // chronologically, hence the dedicated Timestamp field.
  if (fromDate) conditions.push(where("joinDateTs", ">=", Timestamp.fromDate(new Date(fromDate))));
  if (toDate)   conditions.push(where("joinDateTs", "<=", Timestamp.fromDate(new Date(toDate))));

  // ── Search ────────────────────────────────────────────────────────────────
  if (search && search.trim()) {
    const normalized = search.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    conditions.push(where("search_keywords", "array-contains", normalized));
  }

  // ── Sort ──────────────────────────────────────────────────────────────────
  // Firestore requires the FIRST orderBy to be the field carrying a range
  // filter. With a join-date range applied we must lead on joinDateTs or the
  // query is rejected outright.
  const hasDateRange = !!(fromDate || toDate);

  const orderByClauses = [];
  if (hasDateRange) {
    orderByClauses.push(orderBy("joinDateTs", sortOrder));
  }

  switch (sortField) {
    case "registrationNumber":
      orderByClauses.push(orderBy("search_registrationNumber", sortOrder)); break;
    case "payment":
      orderByClauses.push(orderBy("paymentPercentage", sortOrder)); break;
    case "dateJoin":
      // Already ordered by joinDateTs above when a range is active
      if (!hasDateRange) orderByClauses.push(orderBy("joinDateTs", sortOrder));
      break;
    default:
      // Skip a duplicate clause if the caller is already sorting by join date
      if (!(hasDateRange && sortField === "joinDateTs")) {
        orderByClauses.push(orderBy(sortField, sortOrder));
      }
  }

  return { membersRef, conditions, orderByClauses };
};

export const buildMembersQuery = (filters = {}) => {
  const { pageSize = 10, lastDoc = null } = filters;
  const { membersRef, conditions, orderByClauses } = buildMembersConstraints(filters);

  const queryConstraints = [...conditions, ...orderByClauses, limit(pageSize)];
  if (lastDoc) queryConstraints.push(startAfter(lastDoc));

  return query(membersRef, ...queryConstraints);
};

/* =====================================================
   FETCH ALL MEMBERS FOR EXPORT (no pagination)
   Mirrors the table exactly: the same query constraints as
   buildMembersQuery plus the same client-side filters, so an
   exported CSV/PDF contains precisely the filtered set on screen.
===================================================== */
export const fetchAllFilteredMembers = async (filters = {}) => {
  const { membersRef, conditions, orderByClauses } = buildMembersConstraints(filters);
  const snap = await getDocs(query(membersRef, ...conditions, ...orderByClauses));

  let data = snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    createdAt:  doc.data().createdAt?.toDate?.()  || null,
    updated_at: doc.data().updated_at?.toDate?.() || null
  }));

  // Client-side filters — identical to fetchMembersPaginated
  if (filters.paymentStatus === "partial") {
    data = data.filter(m => (m.paymentPercentage || 0) > 0 && (m.paymentPercentage || 0) < 100);
  }

  if (filters.gender && filters.gender !== "all") {
    data = data.filter(m => (m.gender || "").toLowerCase() === filters.gender);
  }

  if (filters.closingPaymentStatus === "closedPaid") {
    data = data.filter(m => (m.closing_paymentPercentage || 0) === 100 || ((m.closing_totalAmount || 0) > 0 && (m.closing_pendingAmount || 0) === 0));
  } else if (filters.closingPaymentStatus === "closedPending") {
    data = data.filter(m => (m.closing_totalAmount || 0) > 0 && (m.closing_paidAmount || 0) === 0);
  } else if (filters.closingPaymentStatus === "closedPartial") {
    data = data.filter(m => {
      const pct = m.closing_paymentPercentage || 0;
      return pct > 0 && pct < 100;
    });
  }

  return data;
};

/* =====================================================
   TOTAL COUNT (for pagination)
===================================================== */
export const getTotalMembersCount = async (filters = {}) => {
  const {
    search        = "",
    programIds    = [],
    ageGroupIds   = [],
    agentId       = null,
    status        = "all",
    paymentStatus = "all",
    fromDate      = null,
    toDate        = null
  } = filters;
  // Note: closingPaymentStatus is not applied to count (client-side filter)

  if (filters.closingPaymentStatus && filters.closingPaymentStatus !== 'all') {
    console.warn('[getTotalMembersCount] closingPaymentStatus not applied to count (client-side filter)');
  }

  const membersRef = collection(db, "members");
  const conditions = [
    where("delete_flag", "==", false),
    where("status",      "==", "active")
  ];

  // Same singular-key alias as buildMembersConstraints, so a count can never
  // disagree with the list it is counting.
  const singleForCount =
    filters.programId && filters.programId !== 'all' ? [filters.programId] : [];
  const progIdsForCount = (Array.isArray(programIds) && programIds.length
    ? programIds
    : singleForCount).filter(Boolean);
  if (progIdsForCount.length === 1)
    conditions.push(where("programId", "==", progIdsForCount[0]));
  else if (progIdsForCount.length > 1)
    conditions.push(where("programId", "in", progIdsForCount.slice(0, 30)));

  const ageIdsForCount = Array.isArray(ageGroupIds) ? ageGroupIds.filter(Boolean) : [];
  if (ageIdsForCount.length === 1)
    conditions.push(where("ageGroupId", "==", ageIdsForCount[0]));
  else if (ageIdsForCount.length > 1)
    conditions.push(where("ageGroupId", "in", ageIdsForCount.slice(0, 30)));

  if (agentId && agentId !== "all")
    conditions.push(where("agentId", "==", agentId));

  if (status === "active")   conditions.push(where("active_flag", "==", true));
  if (status === "inactive") conditions.push(where("active_flag", "==", false));
  if (status === "closed")   conditions.push(where("member_closed", "==", true));

  if (paymentStatus === "paid")    conditions.push(where("paymentPercentage", "==", 100));
  if (paymentStatus === "pending") conditions.push(where("paymentPercentage", "==", 0));

  // Join date, not record-creation date — see buildMembersQuery
  if (fromDate) conditions.push(where("joinDateTs", ">=", Timestamp.fromDate(new Date(fromDate))));
  if (toDate)   conditions.push(where("joinDateTs", "<=", Timestamp.fromDate(new Date(toDate))));

  if (search && search.trim()) {
    const normalized = search.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    conditions.push(where("search_keywords", "array-contains", normalized));
  }

  try {
    const snapshot = await getCountFromServer(query(membersRef, ...conditions));
    return snapshot.data().count;
  } catch (error) {
    console.error("❌ Error getting count:", error);
    return 0;
  }
};

/* =====================================================
   FETCH MEMBERS (PAGINATED)
===================================================== */
export const fetchMembersPaginated = async (filters = {}) => {
  try {
    const q             = buildMembersQuery(filters);
    const querySnapshot = await getDocs(q);

    let members = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt:  doc.data().createdAt?.toDate?.()  || null,
      updated_at: doc.data().updated_at?.toDate?.() || null
    }));

    // Client-side filter for partial (join fees)
    if (filters.paymentStatus === "partial") {
      members = members.filter(m => m.paymentPercentage > 0 && m.paymentPercentage < 100);
    }

    // Client-side filter for gender
    if (filters.gender && filters.gender !== "all") {
      members = members.filter(m => (m.gender || '').toLowerCase() === filters.gender);
    }

    // Client-side filter for closing payment status
    if (filters.closingPaymentStatus === "closedPaid") {
      members = members.filter(m => (m.closing_paymentPercentage || 0) === 100 || ((m.closing_totalAmount || 0) > 0 && (m.closing_pendingAmount || 0) === 0));
    } else if (filters.closingPaymentStatus === "closedPending") {
      members = members.filter(m => (m.closing_totalAmount || 0) > 0 && (m.closing_paidAmount || 0) === 0);
    } else if (filters.closingPaymentStatus === "closedPartial") {
      members = members.filter(m => {
        const pct = m.closing_paymentPercentage || 0;
        return pct > 0 && pct < 100;
      });
    }

    const lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];

    return {
      members,
      lastDoc:     lastVisible,
      hasNextPage: querySnapshot.docs.length === filters.pageSize
    };
  } catch (error) {
    console.error("❌ Error fetching members:", error);
    throw error;
  }
};

/* =====================================================
   SEARCH (without pagination)
===================================================== */
export const fetchAllMembersForSearch = async (searchTerm, agentId = null) => {
  if (!searchTerm || !searchTerm.trim()) return [];

  try {
    const membersRef = collection(db, "members");
    const conditions = [
      where("delete_flag", "==", false),
      where("status",      "==", "active")
    ];

    if (agentId && agentId !== "all")
      conditions.push(where("agentId", "==", agentId));

    const normalized = searchTerm.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    conditions.push(where("search_keywords", "array-contains", normalized));

    const q             = query(membersRef, ...conditions, orderBy("createdAt", "desc"), limit(100));
    const querySnapshot = await getDocs(q);

    const members = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt:  doc.data().createdAt?.toDate?.()  || null,
      updated_at: doc.data().updated_at?.toDate?.() || null
    }));

    // Multi-word client-side filter
    const keywords = searchTerm.trim().toLowerCase().split(" ").filter(w => w.length >= 2);
    if (keywords.length > 1) {
      return members.filter(member => {
        const text = [
          member.displayName, member.registrationNumber, member.phone,
          member.phoneAlt, member.aadhaarNo, member.village, member.city,
          member.fatherName, member.surname, member.programName,  // ← programName now searchable
          member.legacyApplicationNo                              // ← old system application no
        ].join(" ").toLowerCase();
        return keywords.every(k => text.includes(k));
      });
    }

    return members;
  } catch (error) {
    console.error("❌ Error searching members:", error);
    return [];
  }
};

/* =====================================================
   FETCH BY AGENT
===================================================== */
export const fetchMembersByAgent = async (agentId) => {
  if (!agentId || agentId === "all") return [];

  try {
    // IMPORTANT: only equality clauses on fields every member doc is guaranteed
    // to have. This used to also carry `where('delete_flag','==',false)` and
    // `orderBy('createdAt','desc')`, and BOTH silently dropped documents:
    // Firestore excludes a doc from an equality match when the field is absent,
    // and excludes it from an orderBy when the sort field is absent. So members
    // written before those fields existed never came back, and the agent detail
    // page showed LESS pending than the agent row on the list page — the
    // server-side rollup (api/agents/recalculate-stats) counts them because it
    // filters delete_flag in JS, not in the query.
    //
    // Deletion and ordering are therefore handled below, in JS, exactly the way
    // recalculate-stats does it, so both numbers agree.
    const q = query(
      collection(db, "members"),
      where("agentId", "==", agentId),
      where("status",  "==", "active")
    );

    const querySnapshot = await getDocs(q);
    const rows = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt:  doc.data().createdAt?.toDate?.()  || null,
      updated_at: doc.data().updated_at?.toDate?.() || null
    }));

    // Newest first; members with no createdAt sink to the bottom instead of
    // vanishing from the result altogether.
    rows.sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0));
    return rows;
  } catch (error) {
    console.error("❌ Error fetching agent members:", error);
    return [];
  }
};