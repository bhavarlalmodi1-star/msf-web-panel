// GET /api/whatsapp/linked-members?phone=91XXXXXXXXXX
//
// Returns every member registered against a phone number, with the details the
// inbox drawer needs — program, age group, fees, payment and closing status.
//
// The chat document carries a denormalised `linkedMembers` preview for the
// badge, but that snapshot goes stale as members are edited. This route reads
// live so the drawer always shows current figures.
//
// It also refreshes the chat doc's cached count as a side effect, which keeps
// the badge self-healing without a separate backfill job.

import { NextResponse } from 'next/server';
import admin from '../../db/firebaseAdmin';
import { checkRole, verifyToken } from '../../../../../middleware/authMiddleware';
import { db, CHATS, normalisePhone, findMembersByPhone } from '../_lib/store';

export const runtime = 'nodejs';

export async function GET(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin', 'admin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const phone = normalisePhone(searchParams.get('phone'));
    if (!phone)
      return NextResponse.json({ success: false, message: 'Valid phone is required' }, { status: 400 });

    const members = await findMembersByPhone(phone);

    // Resolve agent names in one pass rather than per member
    const agentIds = [...new Set(members.map(m => m.agentId).filter(Boolean))];
    const agentNames = {};
    await Promise.all(agentIds.map(async (id) => {
      try {
        const s = await db.collection('agents').doc(id).get();
        if (s.exists) agentNames[id] = s.data().name || '';
      } catch { /* non-critical */ }
    }));

    const shaped = members.map(m => {
      const joinFees = Number(m.joinFees || 0);
      const paid     = Number(m.paidAmount || 0);
      // Recompute rather than trusting the stored value — same reasoning as the
      // stats routes: agent apps have historically written this incorrectly.
      const pending  = Math.max(0, joinFees - paid);

      return {
        id:                 m.id,
        displayName:        m.displayName || '',
        fatherName:         m.fatherName || '',
        registrationNumber: m.registrationNumber || '',
        phone:              m.phone || '',
        photoURL:           m.photoURL || '',

        programId:          m.programId || '',
        programName:        m.programName || '',
        ageGroupName:       m.ageGroupName || m.memberGroupName || m.ageGroup || '',
        memberGroupName:    m.memberGroupName || '',

        status:             m.status || '',
        isActive:           m.status === 'active',
        memberClosed:       m.member_closed === true,
        migratedData:       m.migratedData === true,

        joinFees,
        paidAmount:         paid,
        pendingAmount:      pending,
        paymentStatus:      m.paymentStatus || '',
        paymentPercentage:  Number(m.paymentPercentage || 0),

        closingTotal:       Number(m.closing_totalAmount || 0),
        closingPaid:        Number(m.closing_paidAmount || 0),
        closingPending:     Number(m.closing_pendingAmount || 0),
        pendingClosingCount: Number(m.pendingClosingCount || 0),

        agentId:            m.agentId || null,
        agentName:          m.agentId ? (agentNames[m.agentId] || '') : '',
        village:            m.village || '',
        district:           m.district || '',
        joinDate:           m.programJoinDate || m.dateJoin || '',
        certificateUrl:     m.certificateUrl || null,
      };
    });

    // Keep the cached badge count honest
    try {
      await db.collection(CHATS).doc(phone).set({
        memberCount: shaped.length,
        isMember:    shaped.length > 0,
        updated_at:  admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch { /* non-critical */ }

    const totals = shaped.reduce((acc, m) => ({
      joinFees:       acc.joinFees + m.joinFees,
      paid:           acc.paid + m.paidAmount,
      pending:        acc.pending + m.pendingAmount,
      closingPending: acc.closingPending + m.closingPending,
    }), { joinFees: 0, paid: 0, pending: 0, closingPending: 0 });

    return NextResponse.json({
      success: true,
      phone,
      count: shaped.length,
      totals,
      members: shaped,
    });

  } catch (error) {
    console.error('linked-members error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
