import { NextResponse } from "next/server";
import admin from "../../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../../middleware/authMiddleware";

const db = admin.firestore();

export async function GET(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin', 'admin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

    const url = new URL(req.url);
    const agentId = url.searchParams.get('agentId') || '';
    const programId = url.searchParams.get('programId') || '';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const pageSize = Math.min(200, Math.max(10, parseInt(url.searchParams.get('pageSize') || '50')));

    // ── Build query ─────────────────────────────────────────────────────
    let q = db.collection('members')
      .where('delete_flag', '==', false)
      .where('status', '==', 'active')
      .where('closing_pendingAmount', '>', 0);

    if (agentId) q = q.where('agentId', '==', agentId);
    if (programId) q = q.where('programId', '==', programId);

    const snap = await q.get();
    const members = [];
    snap.forEach(d => {
      const m = d.data();
      members.push({
        id: d.id,
        displayName: m.displayName || '',
        fatherName: m.fatherName || '',
        surname: m.surname || '',
        phone: m.phone || '',
        registrationNumber: m.registrationNumber || '',
        village: m.village || '',
        agentId: m.agentId || '',
        programId: m.programId || '',
        programName: m.programName || '',
        closing_totalAmount: m.closing_totalAmount || 0,
        closing_paidAmount: m.closing_paidAmount || 0,
        closing_pendingAmount: m.closing_pendingAmount || 0,
        totalClosingCount: m.totalClosingCount || 0,
        paidClosingCount: m.paidClosingCount || 0,
        pendingClosingCount: m.pendingClosingCount || 0,
      });
    });

    // ── Resolve agent names ─────────────────────────────────────────────
    const agentIds = [...new Set(members.map(m => m.agentId).filter(Boolean))];
    const agentNames = {};
    if (agentIds.length > 0) {
      const CHUNK = 30;
      for (let i = 0; i < agentIds.length; i += CHUNK) {
        const chunk = agentIds.slice(i, i + CHUNK);
        const aSnap = await db.collection('agents')
          .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
          .get();
        aSnap.forEach(d => {
          agentNames[d.id] = d.data().name || '';
        });
      }
    }

    // ── Group by agent ───────────────────────────────────────────────────
    const grouped = {};
    members.forEach(m => {
      const aid = m.agentId || '__no_agent__';
      if (!grouped[aid]) {
        grouped[aid] = {
          agentId: aid,
          agentName: agentNames[aid] || 'No Agent',
          members: [],
          totalPending: 0,
          totalMembers: 0,
        };
      }
      grouped[aid].members.push(m);
      grouped[aid].totalPending += m.closing_pendingAmount;
      grouped[aid].totalMembers += 1;
    });

    const groups = Object.values(grouped).sort((a, b) => b.totalPending - a.totalPending);

    // ── Paginate the flat member list ────────────────────────────────────
    const totalMembers = members.length;
    const totalPages = Math.ceil(totalMembers / pageSize);
    const offset = (page - 1) * pageSize;
    const paginatedMembers = members.slice(offset, offset + pageSize);

    return NextResponse.json({
      success: true,
      data: {
        groups,
        paginatedMembers,
        totalMembers,
        totalPending: members.reduce((s, m) => s + m.closing_pendingAmount, 0),
        pagination: { page, pageSize, totalPages, totalMembers },
      },
    });

  } catch (error) {
    console.error("WhatsApp pending members error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
