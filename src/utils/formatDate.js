// Tolerant date formatting for payment records.
//
// `transactionDate` is written in two different shapes by two different code
// paths, both of which are live:
//
//   api/join-fees-add, api/closed_payment_update  →  'YYYY-MM-DD'
//   components/JoinFeeTransactions.js             →  'DD-MM-YYYY'
//
// Rendering either one raw gives a date the reader has to decode ('2026-09-28'),
// and passing 'DD-MM-YYYY' to dayjs() without a format hint yields Invalid Date
// — which is what the join-fee history table was showing.
//
// This parses both, plus Firestore Timestamps and JS Dates, and always prints
// DD/MM/YYYY.

import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

// Order matters: strict parsing tries each until one matches.
const ACCEPTED = ['YYYY-MM-DD', 'DD-MM-YYYY', 'DD/MM/YYYY', 'YYYY/MM/DD'];

/** Parse anything we might hold a payment date in. Returns a dayjs or null. */
export const parseAnyDate = (value) => {
  if (!value) return null;

  // Firestore Timestamp
  if (typeof value?.toDate === 'function') {
    const d = dayjs(value.toDate());
    return d.isValid() ? d : null;
  }

  if (value instanceof Date) {
    const d = dayjs(value);
    return d.isValid() ? d : null;
  }

  if (typeof value === 'number') {
    const d = dayjs(value);
    return d.isValid() ? d : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Strict pass over the known shapes first, so '28-12-2026' isn't
    // misread as a US-style date or rejected outright.
    const strict = dayjs(trimmed, ACCEPTED, true);
    if (strict.isValid()) return strict;
    // Anything else (ISO with time, etc.)
    const loose = dayjs(trimmed);
    return loose.isValid() ? loose : null;
  }

  return null;
};

/**
 * Payment date as DD/MM/YYYY. Falls back through the candidate fields in
 * order, so a record that only has one of them still shows a date.
 */
export const formatPaymentDate = (...candidates) => {
  for (const c of candidates) {
    const d = parseAnyDate(c);
    if (d) return d.format('DD/MM/YYYY');
  }
  return '—';
};

/** Same, with the time appended — for "recorded at" timestamps. */
export const formatDateTime = (value) => {
  const d = parseAnyDate(value);
  return d ? d.format('DD/MM/YYYY, hh:mm A') : '—';
};
