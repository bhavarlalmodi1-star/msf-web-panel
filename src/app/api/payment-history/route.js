import { NextResponse } from "next/server";
import admin from "../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../middleware/authMiddleware";

const db = admin.firestore();

export async function GET(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    const currentUser = authResult.user;
    if (!checkRole(['superadmin', 'admin'], currentUser.role))
      return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const isExport = searchParams.get('export') === 'true';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '100');
    const type = searchParams.get('type') || 'all';
    const method = searchParams.get('method') || 'all';
    const agentId = searchParams.get('agentId') || 'all';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const search = searchParams.get('search') || '';

    // NOTE: combining orderBy('createdAt') with where() on different fields requires
    // a composite Firestore index. To avoid that, apply where() filters only and
    // sort the results in JS instead.
    let groupsQuery = db.collection('paymentGroups');

    if (type !== 'all') {
      groupsQuery = groupsQuery.where('paymentType', '==', type);
    }
    if (method !== 'all') {
      groupsQuery = groupsQuery.where('paymentMethod', '==', method);
    }
    if (agentId !== 'all') {
      groupsQuery = groupsQuery.where('agentId', '==', agentId);
    }

    const allSnap = await groupsQuery.get();
    let allGroups = allSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Sort by createdAt desc in JS (no composite index needed)
    allGroups.sort((a, b) => {
      const aT = a.createdAt?.toMillis?.() ?? (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const bT = b.createdAt?.toMillis?.() ?? (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return bT - aT;
    });

    if (startDate || endDate) {
      allGroups = allGroups.filter(g => {
        const d = g.paymentDate?.toDate ? g.paymentDate.toDate() : new Date(g.paymentDate);
        if (startDate && d < new Date(startDate)) return false;
        if (endDate && d > new Date(endDate)) return false;
        return true;
      });
    }

    // ── Search ────────────────────────────────────────────────────────────
    // Previously the page slice happened BEFORE the search was applied, so only
    // the current page of groups was ever examined. With a single agent
    // selected everything fit on page one and search appeared to work; with
    // "All Agents" the matching UTR usually sat on a later page and was never
    // looked at, so the search returned nothing.
    //
    // Now the matching groups are resolved up front — via targeted Firestore
    // queries rather than scanning every group's transactions, which would mean
    // one read per group across the whole collection.
    if (search) {
      const raw = search.trim();

      // Firestore has no substring operator; prefix ranges are the closest
      // equivalent and suit UTR / registration numbers, which are searched
      // from the start.
      const prefixQuery = (coll, field, value) =>
        db.collection(coll)
          .where(field, '>=', value)
          .where(field, '<=', value + '')
          .limit(200)
          .get();

      // Transaction ids are stored as entered (usually upper-case), while
      // search_keyword is lower-cased at write time — so try both forms.
      const variants = [...new Set([raw, raw.toUpperCase(), raw.toLowerCase()])];

      const lookups = [];
      for (const v of variants) {
        lookups.push(prefixQuery('paymentGroups', 'transactionId', v));
        for (const coll of ['memberJoinFees', 'memberClosingFees']) {
          lookups.push(prefixQuery(coll, 'transactionId', v));
          lookups.push(prefixQuery(coll, 'memberRegNo', v));
          lookups.push(prefixQuery(coll, 'registrationNumber', v));
        }
      }
      // Member name / phone live in the lower-cased keyword blob
      for (const coll of ['memberJoinFees', 'memberClosingFees']) {
        lookups.push(prefixQuery(coll, 'search_keyword', raw.toLowerCase()));
      }

      const settled = await Promise.allSettled(lookups);

      const matchedGroupIds = new Set();
      settled.forEach(r => {
        if (r.status !== 'fulfilled') return;
        r.value.docs.forEach(d => {
          const data = d.data();
          // paymentGroups matches are the group itself; fee docs carry groupId
          matchedGroupIds.add(data.groupId || d.id);
        });
      });

      allGroups = allGroups.filter(g => matchedGroupIds.has(g.id));
    }

    const totalGroups = allGroups.length;
    const totalPages = Math.ceil(totalGroups / pageSize);
    const targetGroups = isExport ? allGroups : allGroups.slice((page - 1) * pageSize, page * pageSize);

    const agentIds = [...new Set(targetGroups.map(g => g.agentId).filter(Boolean))];
    const agents = {};
    if (agentIds.length > 0) {
      for (let i = 0; i < agentIds.length; i += 30) {
        const snap = await db.collection('agents')
          .where('uid', 'in', agentIds.slice(i, i + 30))
          .get();
        snap.docs.forEach(d => {
          const data = d.data();
          agents[data.uid || d.id] = { name: data.name, phone1: data.phone1, village: data.village, district: data.district };
        });
      }
    }

    const results = [];
    for (const g of targetGroups) {
      const coll = g.paymentType === 'closingPayment' ? 'memberClosingFees' : 'memberJoinFees';
      const txSnap = await db.collection(coll).where('groupId', '==', g.id).get();
      const transactions = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      let filteredTx = transactions;
      if (search) {
        const s = search.toLowerCase();
        // If the GROUP's UTR/transactionId matches, include all transactions in that group
        const groupTxMatch = (g.transactionId || '').toLowerCase().includes(s);
        if (groupTxMatch) {
          filteredTx = transactions; // whole group matches
        } else {
          filteredTx = transactions.filter(tx => {
            const kw = tx.search_keyword || '';
            return (
              kw.includes(s) ||
              (tx.transactionId   || '').toLowerCase().includes(s) ||
              (tx.memberRegNo     || '').toLowerCase().includes(s) ||
              (tx.registrationNumber || '').toLowerCase().includes(s)
            );
          });
        }
      }

      if (filteredTx.length > 0 || !search) {
        results.push({
          ...g,
          paymentDate: g.paymentDate?.toDate ? g.paymentDate.toDate().toISOString() : g.paymentDate,
          createdAt: g.createdAt?.toDate ? g.createdAt.toDate().toISOString() : g.createdAt,
          agent: agents[g.agentId] || null,
          transactions: filteredTx.map(tx => ({
            ...tx,
            createdAt: tx.createdAt?.toDate ? tx.createdAt.toDate().toISOString() : tx.createdAt,
          })),
        });
      }
    }

    const totalTxCount = results.reduce((s, g) => s + g.transactions.length, 0);
    const totalAmount = results.reduce((s, g) => s + (g.totalAmount || 0), 0);

    return NextResponse.json({
      success: true,
      data: results,
      pagination: {
        page,
        pageSize,
        totalGroups,
        totalPages,
        totalTransactions: totalTxCount,
        totalAmount,
      },
    });
  } catch (error) {
    console.error('Payment history error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
