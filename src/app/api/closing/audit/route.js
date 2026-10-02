// POST /api/closing/audit
//
// Checks the closing system for internal inconsistency and, on request, repairs
// it. Built after members were found showing e.g. "count 2, total ₹400, pending
// ₹600" — figures that cannot all be true at once.
//
// THE SOURCE OF TRUTH is the set of closing_payment docs for a member, one per
// closing group. Each doc lists the individual closing events it charges for in
// `closingDetails`. Everything else — the doc's own count/total, and the
// member's closing_* aggregate fields — is a rollup of those and must agree.
//
// Checks, in order of how much they are allowed to change:
//
//   ARITHMETIC (safe — no event is added or removed, only totals recomputed)
//     DOC_COUNT      closingCount   ≠ closingDetails.length
//     DOC_TOTAL      totalAmount    ≠ closingCount × payAmount
//     DOC_PENDING    pendingAmount  ≠ totalAmount − paidAmount
//     DOC_STATUS     status doesn't match paid vs total
//     MEMBER_TOTAL   closing_totalAmount   ≠ Σ doc.totalAmount
//     MEMBER_PAID    closing_paidAmount    ≠ Σ doc.paidAmount
//     MEMBER_PENDING closing_pendingAmount ≠ total − paid
//     MEMBER_COUNT   totalClosingCount     ≠ Σ doc.closingCount
//
//   EVENTS (destructive — removes charged events, so opt-in via removeInvalidEvents)
//     DUP_EVENT      the same closed_memberId charged twice in one doc.
//                    closingDetails is appended with arrayUnion, which only
//                    de-duplicates on EXACT object equality — the same event
//                    re-added with one differing field becomes a second charge.
//     AFTER_CLOSED   event dated after the member's own closing date. This is
//                    what the ownClosedDate bug produced before it was fixed;
//                    those rows are still in the data.
//     BEFORE_JOIN    event dated before the member joined.
//
// Body: {
//   programId?  : string | 'all',
//   cursor?     : string,
//   batchSize?  : number,
//   dryRun?     : boolean,   // default true
//   removeInvalidEvents? : boolean,  // default false
// }

import { NextResponse } from 'next/server';
import admin from '../../db/firebaseAdmin';
import { checkRole, verifyToken } from '../../../../../middleware/authMiddleware';

export const runtime = 'nodejs';
export const maxDuration = 60;

const db = admin.firestore();

const parseDate = (d) => {
  if (!d) return null;
  if (typeof d?.toDate === 'function') {
    const t = d.toDate();
    return isNaN(t.getTime()) ? null : t;
  }
  if (typeof d !== 'string') {
    const t = new Date(d);
    return isNaN(t.getTime()) ? null : t;
  }
  if (d.includes('T') || /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const t = new Date(d);
    return isNaN(t.getTime()) ? null : t;
  }
  const [day, month, year] = d.split('-').map(Number);
  const t = new Date(year, month - 1, day);
  return isNaN(t.getTime()) ? null : t;
};

// Same resolution order as closed_payment_entry — a member's closing date can
// live in any of four places.
const ownClosedDate = (m, programId) => {
  for (const cs of (m.closedStatus || [])) {
    if (cs?.programId !== programId) continue;
    const d = parseDate(cs.closed_date);
    if (d) return d;
  }
  return parseDate(m.closed_date) || parseDate(m.marriageDate) || parseDate(m.member_closed_at);
};

const n = (v) => Number(v || 0);
const money = (v) => Math.round(n(v));
const dayStr = (d) => (d ? d.toISOString().slice(0, 10) : '');

export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Only superadmin can audit closing data' }, { status: 403 });

    const {
      programId = 'all',
      memberId = null,
      cursor = null,
      batchSize = 200,
      dryRun = true,
      removeInvalidEvents = false,
    } = await req.json().catch(() => ({}));

    const size = Math.min(Number(batchSize) || 200, 400);

    // Single-member mode — used by the "Recheck" button on a member's closing
    // tab, so a mismatch can be fixed where it is noticed instead of running a
    // full sweep.
    let snap;
    if (memberId) {
      const one = await db.collection('members').doc(memberId).get();
      if (!one.exists)
        return NextResponse.json({ success: false, message: 'Member not found' }, { status: 404 });
      snap = { docs: [one], size: 1, empty: false };
    } else {
      // Page members by document id for stable, resumable pagination.
      let q = db.collection('members')
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(size);
      if (cursor) q = q.startAfter(cursor);
      snap = await q.get();
    }

    let scanned = 0, considered = 0, clean = 0, fixed = 0, skipped = 0;
    const issueCounts = {};
    const rows = [];
    let lastId = cursor;

    const bump = (k) => { issueCounts[k] = (issueCounts[k] || 0) + 1; };

    for (const docSnap of snap.docs) {
      scanned++;
      lastId = docSnap.id;
      const m = docSnap.data();
      const memberId = docSnap.id;

      if (m.delete_flag === true) { skipped++; continue; }
      if (programId !== 'all' && m.programId !== programId) { skipped++; continue; }

      // Load this member's closing_payment docs — the source of truth.
      const cpSnap = await db.collection('closing_payment')
        .where('memberId', '==', memberId)
        .get();

      const storedAgg = {
        total:        money(m.closing_totalAmount),
        paid:         money(m.closing_paidAmount),
        pending:      money(m.closing_pendingAmount),
        totalCount:   n(m.totalClosingCount),
        paidCount:    n(m.paidClosingCount),
        pendingCount: n(m.pendingClosingCount),
      };

      // A member with no closing docs and no closing figures is simply not
      // involved in closing yet — not an error.
      if (cpSnap.empty && storedAgg.total === 0 && storedAgg.pending === 0 && storedAgg.totalCount === 0) {
        skipped++;
        continue;
      }

      considered++;

      const closedOn = ownClosedDate(m, m.programId);
      const joinedOn = parseDate(m.dateJoin || m.programJoinDate || m.joinDateTs);

      const issues = new Set();
      const docPlans = [];

      let sumTotal = 0, sumPaid = 0, sumCount = 0;
      let removedEvents = 0;
      let overpaid = 0;

      for (const d of cpSnap.docs) {
        const cp = d.data();
        if (cp.isReversed === true) continue;   // reversed docs don't count

        const payAmount = money(cp.payAmount);
        let details = Array.isArray(cp.closingDetails) ? [...cp.closingDetails] : [];

        // ── Event-level problems ──────────────────────────────────────────
        const seen = new Set();
        const keep = [];
        const dropped = [];

        for (const ev of details) {
          const key = ev?.closed_memberId || JSON.stringify(ev);
          const evDate = parseDate(ev?.closed_date || ev?.marriageDate);

          if (seen.has(key)) {
            issues.add('DUP_EVENT');
            dropped.push({ reason: 'DUP_EVENT', name: ev?.closed_memberName || '', date: dayStr(evDate) });
            continue;
          }
          if (closedOn && evDate && evDate > closedOn) {
            issues.add('AFTER_CLOSED');
            dropped.push({ reason: 'AFTER_CLOSED', name: ev?.closed_memberName || '', date: dayStr(evDate) });
            seen.add(key);
            continue;
          }
          if (joinedOn && evDate && evDate < joinedOn) {
            issues.add('BEFORE_JOIN');
            dropped.push({ reason: 'BEFORE_JOIN', name: ev?.closed_memberName || '', date: dayStr(evDate) });
            seen.add(key);
            continue;
          }
          seen.add(key);
          keep.push(ev);
        }

        // Only actually drop events when asked; otherwise report and keep.
        const finalDetails = removeInvalidEvents ? keep : details;
        if (removeInvalidEvents) removedEvents += dropped.length;

        // ── Arithmetic ────────────────────────────────────────────────────
        const storedCount   = n(cp.closingCount);
        const storedTotal   = money(cp.totalAmount);
        const storedPaid    = money(cp.paidAmount);
        const storedPending = money(cp.pendingAmount);

        // Count follows the details list. Fall back to the stored count only
        // when there are no details at all (older docs never wrote them) —
        // otherwise an empty array would wrongly zero a real charge.
        const wantCount = finalDetails.length > 0 ? finalDetails.length
                        : (details.length === 0 ? storedCount : 0);
        const wantTotal = payAmount > 0 ? wantCount * payAmount : storedTotal;

        if (details.length > 0 && storedCount !== details.length) issues.add('DOC_COUNT');
        if (payAmount > 0 && storedTotal !== storedCount * payAmount) issues.add('DOC_TOTAL');
        if (storedPending !== Math.max(0, storedTotal - storedPaid)) issues.add('DOC_PENDING');

        const wantPaid    = Math.min(storedPaid, wantTotal);
        if (storedPaid > wantTotal) { issues.add('OVERPAID'); overpaid += storedPaid - wantTotal; }
        const wantPending = Math.max(0, wantTotal - wantPaid);
        const wantStatus  = wantTotal <= 0 ? 'pending'
                          : wantPaid >= wantTotal ? 'paid'
                          : wantPaid > 0 ? 'partial' : 'pending';

        // Only judge the three statuses this system manages; anything else was
        // set by a flow outside the audit's remit and is left alone.
        if (['paid', 'partial', 'pending'].includes(cp.status) && cp.status !== wantStatus) {
          issues.add('DOC_STATUS');
        }

        sumTotal += wantTotal;
        sumPaid  += wantPaid;
        sumCount += wantCount;

        const docChanged = wantCount !== storedCount || wantTotal !== storedTotal
                        || wantPending !== storedPending || wantPaid !== storedPaid
                        || wantStatus !== cp.status
                        || (removeInvalidEvents && dropped.length > 0);

        if (docChanged) {
          docPlans.push({
            ref: d.ref,
            closingGroupId: cp.closingGroupId || '',
            groupName: cp.closingGroupName || '',
            before: { count: storedCount, total: storedTotal, paid: storedPaid, pending: storedPending, status: cp.status || '' },
            after:  { count: wantCount,   total: wantTotal,   paid: wantPaid,   pending: wantPending,   status: wantStatus },
            dropped,
            update: {
              closingCount:  wantCount,
              totalAmount:   wantTotal,
              paidAmount:    wantPaid,
              pendingAmount: wantPending,
              status:        wantStatus,
              paymentPercentage: wantTotal > 0 ? Number(((wantPaid / wantTotal) * 100).toFixed(2)) : 0,
              ...(removeInvalidEvents && dropped.length ? { closingDetails: finalDetails } : {}),
              closingAuditAt: admin.firestore.FieldValue.serverTimestamp(),
            },
          });
        }
      }

      // ── Member aggregate vs the docs ────────────────────────────────────
      const wantPending = Math.max(0, sumTotal - sumPaid);

      if (storedAgg.total      !== sumTotal)    issues.add('MEMBER_TOTAL');
      if (storedAgg.paid       !== sumPaid)     issues.add('MEMBER_PAID');
      if (storedAgg.pending    !== wantPending) issues.add('MEMBER_PENDING');
      if (storedAgg.totalCount !== sumCount)    issues.add('MEMBER_COUNT');

      if (issues.size === 0) { clean++; continue; }
      issues.forEach(bump);

      // paid/pending event counts: derive from the docs' status
      let paidCount = 0;
      for (const p of docPlans) paidCount += p.after.status === 'paid' ? p.after.count : 0;
      // Docs that needed no change still contribute
      for (const d of cpSnap.docs) {
        const cp = d.data();
        if (cp.isReversed === true) continue;
        if (docPlans.some(p => p.ref.id === d.id)) continue;
        if (cp.status === 'paid') paidCount += n(cp.closingCount);
      }

      const memberUpdate = {
        closing_totalAmount:   sumTotal,
        closing_paidAmount:    sumPaid,
        closing_pendingAmount: wantPending,
        totalClosingCount:     sumCount,
        paidClosingCount:      Math.min(paidCount, sumCount),
        pendingClosingCount:   Math.max(0, sumCount - Math.min(paidCount, sumCount)),
        closing_paymentPercentage: sumTotal > 0 ? Number(((sumPaid / sumTotal) * 100).toFixed(2)) : 0,
        closingAuditAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      rows.push({
        memberId,
        name: m.displayName || '',
        fatherName: m.fatherName || '',
        regNo: m.registrationNumber || '',
        phone: m.phone || '',
        village: m.village || '',
        programId: m.programId || '',
        programName: m.programName || '',
        agentId: m.agentId || '',
        memberClosed: m.member_closed === true,
        closedOn: dayStr(closedOn),
        joinedOn: dayStr(joinedOn),
        payAmount: money(m.payAmount),
        docCount: cpSnap.size,
        issues: [...issues],
        before: storedAgg,
        after: {
          total: sumTotal, paid: sumPaid, pending: wantPending,
          totalCount: sumCount,
        },
        removedEvents,
        overpaid,
        groups: docPlans.map(p => ({
          groupName: p.groupName || p.closingGroupId,
          before: p.before, after: p.after, dropped: p.dropped,
        })),
      });

      if (!dryRun) {
        const batch = db.batch();
        for (const p of docPlans) batch.update(p.ref, p.update);
        batch.update(docSnap.ref, memberUpdate);
        await batch.commit();
        fixed++;
      }
    }

    // Single-member mode is always a complete run.
    const hasMore = !memberId && snap.size === size;

    console.log(
      `[ClosingAudit] chunk scanned=${scanned} considered=${considered} clean=${clean} ` +
      `issues=${rows.length} fixed=${fixed}${dryRun ? ' (preview)' : ''}`
    );

    return NextResponse.json({
      success: true,
      dryRun,
      removeInvalidEvents,
      scanned,
      considered,
      clean,
      skipped,
      fixed,
      issueCounts,
      rows,
      hasMore,
      nextCursor: hasMore ? lastId : null,
    });

  } catch (error) {
    console.error('closing audit error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
