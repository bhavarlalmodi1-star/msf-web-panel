// app/api/agents/route.js
import { NextResponse } from "next/server";
import admin from "../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../middleware/authMiddleware";
import { creditCommissionStandalone } from "../commission/route";

const db   = admin.firestore();
const auth = admin.auth();
const INC  = admin.firestore.FieldValue.increment;
const STS  = admin.firestore.FieldValue.serverTimestamp;

// ─────────────────────────────────────────────────────────────────────────────
// Read single-program financial data DIRECTLY from the member doc.
// No memberPrograms subcollection needed — all fields are flat on the member.
// ─────────────────────────────────────────────────────────────────────────────
const getMemberData = async (memberId) => {
  if (!memberId) return null;
  try {
    const snap = await db.collection('members').doc(memberId).get();
    if (!snap.exists) return null;

    const d = snap.data();

    // Single program — all flat fields
    const programId   = d.programId   || '';
    const programName = d.programName || '';
    const joinFees    = d.joinFees    || 0;
    const paidAmount  = d.paidAmount  || 0;
    // Recompute pendingAmount from joinFees - paidAmount (never trust the stored
    // value — agent apps or legacy imports may have written it incorrectly, e.g.
    // as joinFees + fixedJoinFees).  This guarantees agent stats are always sane.
    const pending     = Math.max(0, joinFees - paidAmount);

    return {
      programId,
      programName,
      joinFees,
      paidAmount,
      pendingAmount: pending,
      agentId:  d.agentId  || null,
      hasData:  true,
      // closing fields (needed for removeMemberStats)
      closing_totalAmount: d.closing_totalAmount || 0,
      closing_paidAmount: d.closing_paidAmount || 0,
      closing_pendingAmount: d.closing_pendingAmount || 0,
      totalClosingCount: d.totalClosingCount || 0,
      paidClosingCount: d.paidClosingCount || 0,
      pendingClosingCount: d.pendingClosingCount || 0,
    };
  } catch (e) {
    console.error("❌ getMemberData error:", e);
    return null;
  }
};

// ─── Password generator ───────────────────────────────────────────────────────
export const generatePassword = (name, dobDate) => {
  try {
    if (!name || !dobDate) return 'ssgmsss2024';
    const namePart = name.trim().split(' ')[0].substring(0, 5);
    const year     = dobDate.split('-')[2];   // DD-MM-YYYY → YYYY
    return `${namePart}${year}`;
  } catch (e) {
    console.error('generatePassword error:', e);
    return '';
  }
};

// ─── Create Firebase Auth account for member ──────────────────────────────────
  const createMemberAccount = async ({ memberId, displayName, photoURL, password, programId, registrationNumber }) => {
    try {
      try {
        await auth.getUser(memberId);
        console.log("Auth already exists:", memberId);
      } catch {
        const email = `${registrationNumber}@ssgmsss.com`;
        await auth.createUser({
          uid: memberId, email, emailVerified: true,
          displayName, photoURL: photoURL || null,
          password: password || "Member@123"
        });
        // Set custom claims — single programId (string, not array)
        await auth.setCustomUserClaims(memberId, { role: "member", programId: programId || '' });

        const memberDoc = await db.collection('members').doc(memberId).get();
        if (memberDoc.exists) {
          await memberDoc.ref.update({ uid: memberId, account_flag: true });
        }
      }
    } catch (e) {
      console.error("❌ createMemberAccount error:", e);
      throw e;
    }
  };

// ─────────────────────────────────────────────────────────────────────────────
// ADD stats — increment agent, program, org counts using flat member fields
// Uses atomic dot-notation INC() for programStats to avoid read-before-write
// race conditions when multiple members are added concurrently for the same agent.
// ─────────────────────────────────────────────────────────────────────────────
const addMemberStats = async (memberInfo) => {
  const { agentId, programId, programName, joinFees, paidAmount, pendingAmount } = memberInfo;
  const batch = db.batch();

  // ── Agent ──────────────────────────────────────────────────────────────────
  // Use dot-notation INC() — no read required, fully atomic, no race condition.
  if (agentId) {
    const agentRef  = db.collection('agents').doc(agentId);
    const agentSnap = await agentRef.get();
    if (agentSnap.exists) {
      batch.update(agentRef, {
        memberCount:          INC(1),
        totalJoinFees:        INC(joinFees),
        totalJoinFeesPaid:    INC(paidAmount),
        totalJoinFeesPending: INC(pendingAmount),
        [`programStats.${programId}.programName`]:          programName,
        [`programStats.${programId}.memberCount`]:          INC(1),
        [`programStats.${programId}.totalJoinFees`]:        INC(joinFees),
        [`programStats.${programId}.totalJoinFeesPaid`]:    INC(paidAmount),
        [`programStats.${programId}.totalJoinFeesPending`]: INC(pendingAmount),
        [`programStats.${programId}.lastUpdated`]:          STS(),
        updated_at: STS()
      });
    }
  }

  // ── Program ────────────────────────────────────────────────────────────────
  if (programId) {
    batch.update(db.collection('programs').doc(programId), {
      memberCount:          INC(1),
      totalJoinFees:        INC(joinFees),
      totalJoinFeesPaid:    INC(paidAmount),
      totalJoinFeesPending: INC(pendingAmount),
      updated_at:           STS()
    });
  }

  // ── Organization ──────────────────────────────────────────────────────────
  // Use set+merge so it auto-creates if missing — INC() works with merge.
  batch.set(db.collection('organizationStats').doc('current'), {
    totalMembers:         INC(1),
    totalJoinFees:        INC(joinFees),
    totalJoinFeesPaid:    INC(paidAmount),
    totalJoinFeesPending: INC(pendingAmount),
    updated_at:           STS()
  }, { merge: true });

  await batch.commit();
  console.log(`✅ Stats ADDED — program: ${programId}, agent: ${agentId}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// REMOVE stats — decrement (reverse) agent, program, org counts
// Uses atomic INC(-value) and dot-notation for programStats — no race condition.
// ─────────────────────────────────────────────────────────────────────────────
const removeMemberStats = async (memberInfo) => {
  const { agentId, programId, joinFees, paidAmount, pendingAmount,
    closing_totalAmount, closing_paidAmount, closing_pendingAmount,
    totalClosingCount, paidClosingCount, pendingClosingCount } = memberInfo;
  const batch = db.batch();

  // ── Agent ──────────────────────────────────────────────────────────────────
  // Atomic INC(-value) — no stale read, no race condition.
  if (agentId) {
    const agentRef  = db.collection('agents').doc(agentId);
    const agentSnap = await agentRef.get();
    if (agentSnap.exists) {
      batch.update(agentRef, {
        memberCount:          INC(-1),
        totalJoinFees:        INC(-joinFees),
        totalJoinFeesPaid:    INC(-paidAmount),
        totalJoinFeesPending: INC(-pendingAmount),
        closing_totalAmount:    INC(-closing_totalAmount),
        closing_paidAmount:     INC(-closing_paidAmount),
        closing_pendingAmount:  INC(-closing_pendingAmount),
        totalClosingCount:      INC(-totalClosingCount),
        paidClosingCount:       INC(-paidClosingCount),
        pendingClosingCount:    INC(-pendingClosingCount),
        [`programStats.${programId}.memberCount`]:                  INC(-1),
        [`programStats.${programId}.totalJoinFees`]:                INC(-joinFees),
        [`programStats.${programId}.totalJoinFeesPaid`]:            INC(-paidAmount),
        [`programStats.${programId}.totalJoinFeesPending`]:         INC(-pendingAmount),
        [`programStats.${programId}.totalClosingAmount`]:           INC(-closing_totalAmount),
        [`programStats.${programId}.totalClosingPaidAmount`]:       INC(-closing_paidAmount),
        [`programStats.${programId}.totalClosingPendingAmount`]:    INC(-closing_pendingAmount),
        [`programStats.${programId}.totalClosingCount`]:            INC(-totalClosingCount),
        [`programStats.${programId}.paidClosingCount`]:             INC(-paidClosingCount),
        [`programStats.${programId}.pendingClosingCount`]:          INC(-pendingClosingCount),
        [`programStats.${programId}.lastUpdated`]:                  STS(),
        updated_at: STS()
      });
    }
  }

  // ── Program ────────────────────────────────────────────────────────────────
  if (programId) {
    batch.update(db.collection('programs').doc(programId), {
      memberCount:               INC(-1),
      totalJoinFees:             INC(-joinFees),
      totalJoinFeesPaid:         INC(-paidAmount),
      totalJoinFeesPending:      INC(-pendingAmount),
      totalClosingAmount:        INC(-closing_totalAmount),
      totalClosingPaidAmount:    INC(-closing_paidAmount),
      totalClosingPendingAmount: INC(-closing_pendingAmount),
      totalClosingCount:         INC(-totalClosingCount),
      paidClosingCount:          INC(-paidClosingCount),
      pendingClosingCount:       INC(-pendingClosingCount),
      updated_at:                STS()
    });
  }

  // ── Organization ──────────────────────────────────────────────────────────
  batch.set(db.collection('organizationStats').doc('current'), {
    totalMembers:              INC(-1),
    totalJoinFees:             INC(-joinFees),
    totalJoinFeesPaid:         INC(-paidAmount),
    totalJoinFeesPending:      INC(-pendingAmount),
    totalClosingAmount:        INC(-closing_totalAmount),
    totalClosingPaidAmount:    INC(-closing_paidAmount),
    totalClosingPendingAmount: INC(-closing_pendingAmount),
    totalClosingCount:         INC(-totalClosingCount),
    paidClosingCount:          INC(-paidClosingCount),
    pendingClosingCount:       INC(-pendingClosingCount),
    updated_at:                STS()
  }, { merge: true });

  await batch.commit();
  console.log(`✅ Stats REMOVED — program: ${programId}, agent: ${agentId}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// Main orchestrator
// ─────────────────────────────────────────────────────────────────────────────
const handleMemberCountUpdate = async (operation, memberId, agentId) => {
  // Read all data from the flat member doc — no subcollection
  const memberInfo = await getMemberData(memberId);
  if (!memberInfo) { console.log("No member data found for", memberId); return; }

  // Override agentId if provided explicitly
  if (agentId) memberInfo.agentId = agentId;

  if (operation === 'add')    await addMemberStats(memberInfo);
  if (operation === 'remove') await removeMemberStats(memberInfo);
};

// ─────────────────────────────────────────────────────────────────────────────
// POST — create account + update counts
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });

    if (!checkRole(['superadmin', 'admin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

    const body = await req.json();
    const { isOnlyAccountCreate = false, memberData, memberId, agentId, operation = 'add', commissionData } = body;

    // Update counts (reads from member doc directly)
    if (!isOnlyAccountCreate && memberId) {
      await handleMemberCountUpdate(operation, memberId, agentId);
    }

    // Self-heal: if the member doc's stored pendingAmount doesn't match
    // joinFees - paidAmount, fix it now.  This corrects bad data written by
    // agent apps or legacy imports (e.g. pendingAmount = joinFees + fixedJoinFees).
    if (operation === 'add' && memberId) {
      try {
        const snap = await db.collection('members').doc(memberId).get();
        if (snap.exists) {
          const d = snap.data();
          const jf = Number(d.joinFees || 0);
          const pa = Number(d.paidAmount || 0);
          const correct = Math.max(0, jf - pa);
          const stored  = Number(d.pendingAmount || 0);
          if (stored !== correct) {
            console.warn(`⚠️ pendingAmount mismatch for ${memberId}: stored=${stored} correct=${correct} — fixing`);
            await db.collection('members').doc(memberId).update({
              pendingAmount:     correct,
              hasPendingPayments: correct > 0,
              updated_at: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        }
      } catch (healErr) {
        console.error('Self-heal pendingAmount failed:', healErr);
      }
    }

    // Credit commission if join fees were paid and agent is set
    if (commissionData && commissionData.agentId && commissionData.amount > 0) {
      try {
        await creditCommissionStandalone({
          agentId: commissionData.agentId,
          amount: commissionData.amount,
          source: 'joinFees',
          sourceId: memberId,
          memberName: commissionData.memberName || '',
          memberFatherName: commissionData.memberFatherName || '',
          memberRegNo: commissionData.memberRegNo || '',
          programId: commissionData.programId || '',
          programName: commissionData.programName || '',
          description: commissionData.description || 'Join Fee Commission (25%) - New Member',
          createdBy: authResult.user.uid,
          paymentGroupId: commissionData.paymentGroupId || '',
        });
      } catch (comErr) {
        console.error('Commission credit failed:', comErr);
      }
    }

    // Create Firebase Auth account
    await createMemberAccount({
      memberId:           memberData?.id || memberId,
      displayName:        memberData?.displayName || memberData?.fullName,
      photoURL:           memberData?.photoURL,
      password:           memberData?.password || generatePassword(memberData?.displayName || memberData?.fullName, memberData?.dobDate || memberData?.bobDate),
      programId:          memberData?.programId  || '',    // ← single flat field
      registrationNumber: memberData?.registrationNumber
    });

    return NextResponse.json(
      { success: true, message: operation === 'add' ? "Member counts increased" : "Member counts decreased" },
      { status: 201 }
    );

  } catch (e) {
    console.error("❌ POST /api/agents error:", e);
    return NextResponse.json({ success: false, message: "Internal Server Error", error: e.message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH — update member status / counts
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });

    if (!checkRole(['superadmin', 'admin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

    const body = await req.json();
    const { memberId, agentId, operation, updateData } = body;

    if (!memberId || !operation)
      return NextResponse.json({ success: false, message: 'Missing required fields: memberId, operation' }, { status: 400 });

    const memberDoc = await db.collection('members').doc(memberId).get();
    if (!memberDoc.exists)
      return NextResponse.json({ success: false, message: 'Member not found' }, { status: 404 });

    // Update counts using flat member doc
    await handleMemberCountUpdate(operation, memberId, agentId);

    // Optionally update the member document itself
    if (updateData) {
      await db.collection('members').doc(memberId).update({
        ...updateData,
        updated_at: STS()
      });
    }

    return NextResponse.json(
      { success: true, message: `Member ${operation === 'remove' ? 'removed' : 'updated'} successfully` },
      { status: 200 }
    );

  } catch (e) {
    console.error("❌ PATCH /api/agents error:", e);
    return NextResponse.json({ success: false, message: "Internal Server Error", error: e.message }, { status: 500 });
  }
}