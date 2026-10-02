import {
  collection, query, where, orderBy, limit, startAfter, getDocs, getCountFromServer
} from 'firebase/firestore'
import { db } from '../../../../../lib/firbase-client'
import dayjs from 'dayjs'

// member_closed_date is stored as an ISO-8601 UTC string (e.g. ...T18:30:00.000Z).
// The table displays dates in IST (UTC+05:30), so a stored day D rolls over to
// the next displayed day once the UTC time is >= 18:30. To make server-side
// date-range filters match what the user sees, convert displayed days back to
// UTC string bounds:
//   - from F  ->  closed_date >= (F-1) 18:30:00.000Z
//   - to   T  ->  closed_date <  T    18:30:00.000Z
const isoBound = (day, subtractOne = false) => {
  const base = subtractOne ? day.subtract(1, 'day') : day
  return `${base.format('YYYY-MM-DD')}T18:30:00.000Z`
}

const normalizeSearch = (s) => (s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')

/* Build the where-clauses for a CLOSED-members query (server-side filters).
   filters: {
     programId, agentId, closingGroupId  ('' or 'all' = no filter)
     fromDate, toDate (dayjs objects, local start-of-day)
     search (string -> search_keywords array-contains)
   }
   No orderBy here so getCountFromServer works with just equality filters. */
export const buildClosedConditions = (filters = {}) => {
  const {
    programId, agentId, closingGroupId, fromDate, toDate, search
  } = filters

  const conditions = [
    where('delete_flag', '==', false),
    where('status',      '==', 'active'),
    where('member_closed', '==', true),
  ]

  // Filter on `programId`, NOT `member_closed_program`.
  //
  // member_closed_program is only written by api/closed_payment_entry when it
  // closes a member. Members closed by any other path, and every migrated
  // member, simply don't have the field — and a Firestore equality match
  // EXCLUDES documents where the field is absent, so the programme filter
  // returned almost nothing. Every member doc has programId, and the close
  // operation sets it to the closing programme anyway, so it is both always
  // present and equally correct.
  if (programId && programId !== 'all')
    conditions.push(where('programId', '==', programId))
  if (agentId && agentId !== 'all')
    conditions.push(where('agentId', '==', agentId))
  if (closingGroupId && closingGroupId !== 'all')
    conditions.push(where('closingGroupId', '==', closingGroupId))

  if (fromDate) conditions.push(where('closed_date', '>=', isoBound(fromDate, true)))
  if (toDate)   conditions.push(where('closed_date', '<',  isoBound(toDate, false)))

  const normalized = normalizeSearch(search)
  if (normalized) conditions.push(where('search_keywords', 'array-contains', normalized))

  return conditions
}

/* stable ordering + cursor support for the closed table.
   With a date-range active Firestore requires the range field to lead the
   ordering; otherwise we order by creation time (matches the members page). */
const buildClosedOrderClauses = (filters = {}) => {
  const hasDateRange = !!(filters.fromDate || filters.toDate)
  if (hasDateRange) return [orderBy('closed_date', 'asc'), orderBy('createdAt', 'asc')]
  return [orderBy('createdAt', 'desc')]
}

const toRow = (doc) => ({ id: doc.id, key: doc.id, ...doc.data() })

/* ── Closed table page (limit pageSize, cursor-aware) ──────────────────────── */
export const fetchClosedPage = async (filters = {}, lastDoc = null, pageSize = 100, withTotal = true) => {
  const conditions   = buildClosedConditions(filters)
  const orderClauses = buildClosedOrderClauses(filters)

  const constraints = [...conditions, ...orderClauses, limit(pageSize + 1)]
  if (lastDoc) constraints.push(startAfter(lastDoc))

  const snap = await getDocs(query(collection(db, 'members'), ...constraints))

  let docs = snap.docs
  const hasNextPage = docs.length > pageSize
  if (hasNextPage) docs = docs.slice(0, pageSize)

  return {
    rows: docs.map(toRow),
    lastDoc: docs[docs.length - 1] || null,
    hasNextPage,
    total: withTotal
      ? await getCountFromServer(query(collection(db, 'members'), ...conditions)).then(r => r.data().count).catch(() => null)
      : null,
  }
}

/* ── Closed count for stats cards (no member_closed for the "total active") ── */
export const getClosedStats = async () => {
  const base = [
    where('delete_flag', '==', false),
    where('status',      '==', 'active'),
  ]
  const closed = [...base, where('member_closed', '==', true)]

  const countOf = (conds) =>
    getCountFromServer(query(collection(db, 'members'), ...conds))
      .then(r => r.data().count)
      .catch(() => null)

  const [totalActive, closedCount] = await Promise.all([countOf(base), countOf(closed)])

  let inviteCount = null
  try {
    // Needs a (member_closed + closed_invitation_url) composite index;
    // degrade gracefully to null until that index exists.
    inviteCount = await countOf([...closed, where('closed_invitation_url', '>', '')])
  } catch (e) { console.warn('[getClosedStats] invite index missing?', e.message) }

  return {
    totalActive: totalActive ?? 0,
    closedCount: closedCount ?? 0,
    activeCount: (totalActive ?? 0) - (closedCount ?? 0),
    inviteCount,
  }
}

/* ── ALL closed members for CSV/PDF export (scrolled from the backend) ────── */
export const fetchAllClosedForExport = async (filters = {}) => {
  const conditions   = buildClosedConditions(filters)
  const orderClauses = buildClosedOrderClauses(filters)

  let all = []
  let lastDoc = null
  let done = false

  const PAGE = 300
  while (!done) {
    const constraints = [...conditions, ...orderClauses, limit(PAGE)]
    if (lastDoc) constraints.push(startAfter(lastDoc))
    const snap = await getDocs(query(collection(db, 'members'), ...constraints))
    snap.forEach(d => all.push(toRow(d)))
    if (snap.size < PAGE) done = true
    else lastDoc = snap.docs[snap.docs.length - 1]
  }

  // Fallback for legacy docs that may store closed_date as a Date object
  // (breaks server-side string comparison): filter those out client-side.
  if (filters.fromDate || filters.toDate) {
    try {
      const lower = filters.fromDate ? isoBound(dayjs(filters.fromDate), true) : null
      const upper = filters.toDate ? isoBound(dayjs(filters.toDate), false) : null
      all = all.filter(m => {
        const s = typeof m.closed_date === 'string' ? m.closed_date : ''
        return (!lower || s >= lower) && (!upper || s < upper)
      })
    } catch (e) { /* keep server-filtered result */ }
  }

  return all
}