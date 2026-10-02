// Late-payment accounting for closing instalments.
//
// RULE: a closing instalment is due 45 days after THAT closing's own date.
// Each event a member is charged for carries its own deadline, so a member
// billed for six closings in one group has six due dates, not one.
//
// Lateness is measured against the due date, not the closing date — paying on
// day 44 is on time, day 46 is one day late.
//
// The whole module is pure: it reads the member and their closing_payment docs
// and computes; nothing is written. That matters because these figures feed a
// receipt, and a receipt must not be able to change the data it reports on.

import dayjs from 'dayjs';

export const GRACE_DAYS = 45;

// Dates reach us as Firestore Timestamps, ISO strings or DD-MM-YYYY strings
// depending on which code path wrote them.
export const toDay = (v) => {
  if (!v) return null;
  if (typeof v?.toDate === 'function') {
    const d = dayjs(v.toDate());
    return d.isValid() ? d.startOf('day') : null;
  }
  if (typeof v === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(v)) {
    const d = dayjs(v, 'DD-MM-YYYY');
    return d.isValid() ? d.startOf('day') : null;
  }
  const d = dayjs(v);
  return d.isValid() ? d.startOf('day') : null;
};

export const dueDateFor = (closingDate) => {
  const d = toDay(closingDate);
  return d ? d.add(GRACE_DAYS, 'day') : null;
};

// Status of one charged closing event.
//
//  paidOn given   → PAID_ON_TIME | PAID_LATE (with daysLate)
//  not yet paid   → PENDING_DUE  | OVERDUE   (with daysLate so far)
//  no date        → UNKNOWN, rather than a guessed zero
export const eventLateness = (closingDate, paidOn = null, today = dayjs()) => {
  const closed = toDay(closingDate);
  if (!closed) return { status: 'UNKNOWN', daysLate: null, dueDate: null, closedOn: null };

  const due  = closed.add(GRACE_DAYS, 'day');
  const paid = toDay(paidOn);
  const now  = toDay(today) || dayjs().startOf('day');

  if (paid) {
    const daysLate = paid.diff(due, 'day');
    return daysLate > 0
      ? { status: 'PAID_LATE',    daysLate,    dueDate: due, closedOn: closed, paidOn: paid }
      : { status: 'PAID_ON_TIME', daysLate: 0, dueDate: due, closedOn: closed, paidOn: paid,
          daysEarly: Math.abs(daysLate) };
  }

  const overdueBy = now.diff(due, 'day');
  return overdueBy > 0
    ? { status: 'OVERDUE',     daysLate: overdueBy, dueDate: due, closedOn: closed,
        daysRemaining: 0 }
    : { status: 'PENDING_DUE', daysLate: 0,         dueDate: due, closedOn: closed,
        daysRemaining: Math.abs(overdueBy) };
};

// Every event on one closing_payment doc, with its own deadline.
//
// A doc records payments at DOC level (paidAmount, lastPaymentDate), not per
// event, so a part-paid doc cannot say which of its events were settled. Rather
// than invent an allocation, events are treated as paid oldest-first up to the
// amount actually paid — and `approximate` is set so the UI can say so.
export const docEventLateness = (cp, today = dayjs()) => {
  const details   = Array.isArray(cp?.closingDetails) ? cp.closingDetails : [];
  const payAmount = Number(cp?.payAmount || 0);
  const paid      = Number(cp?.paidAmount || 0);
  const lastPaid  = cp?.lastPaymentDate || null;

  // How many events the money covers, oldest first.
  const coveredCount = payAmount > 0 ? Math.floor(paid / payAmount) : (paid > 0 ? details.length : 0);

  const sorted = [...details].sort((a, b) => {
    const da = toDay(a?.closed_date || a?.marriageDate);
    const db = toDay(b?.closed_date || b?.marriageDate);
    if (!da || !db) return 0;
    return da.valueOf() - db.valueOf();
  });

  return sorted.map((ev, i) => {
    const isPaid = i < coveredCount;
    const res = eventLateness(ev?.closed_date || ev?.marriageDate, isPaid ? lastPaid : null, today);
    return {
      ...res,
      closedMemberId:   ev?.closed_memberId || null,
      closedMemberName: ev?.closed_memberName || '',
      amount:           payAmount,
      // True when the doc is part-paid, so which events are covered is inferred
      // from the amount rather than recorded.
      approximate: paid > 0 && paid < Number(cp?.totalAmount || 0),
    };
  });
};

// Roll the per-event view up to one member across all their groups.
export const memberLateness = (closingDocs = [], today = dayjs()) => {
  const events = [];
  for (const cp of closingDocs) {
    if (cp?.isReversed === true) continue;
    events.push(...docEventLateness(cp, today));
  }

  const paidLate   = events.filter(e => e.status === 'PAID_LATE');
  const overdue    = events.filter(e => e.status === 'OVERDUE');
  const onTime     = events.filter(e => e.status === 'PAID_ON_TIME');
  const pending    = events.filter(e => e.status === 'PENDING_DUE');

  const lateDays   = paidLate.map(e => e.daysLate);
  const nextDue    = pending
    .map(e => e.dueDate)
    .filter(Boolean)
    .sort((a, b) => a.valueOf() - b.valueOf())[0] || null;

  return {
    events,
    total:        events.length,
    paidOnTime:   onTime.length,
    paidLate:     paidLate.length,
    overdue:      overdue.length,
    pendingDue:   pending.length,
    unknown:      events.filter(e => e.status === 'UNKNOWN').length,
    maxDaysLate:  lateDays.length ? Math.max(...lateDays) : 0,
    avgDaysLate:  lateDays.length ? Math.round(lateDays.reduce((a, b) => a + b, 0) / lateDays.length) : 0,
    // Worst currently-unpaid overdue, which is what someone chasing money wants.
    maxOverdueDays: overdue.length ? Math.max(...overdue.map(e => e.daysLate)) : 0,
    nextDueDate:  nextDue,
    hasApproximate: events.some(e => e.approximate),
  };
};

export const LATE_LABEL = {
  PAID_ON_TIME: { text: 'समय पर',     color: 'success' },
  PAID_LATE:    { text: 'देर से भुगतान', color: 'warning' },
  OVERDUE:      { text: 'अतिदेय',     color: 'error'   },
  PENDING_DUE:  { text: 'बकाया',      color: 'processing' },
  UNKNOWN:      { text: 'तारीख नहीं',  color: 'default' },
};
