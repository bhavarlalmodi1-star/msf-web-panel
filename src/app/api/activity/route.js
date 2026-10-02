import { NextResponse } from "next/server";
import admin from "../db/firebaseAdmin";
import { verifyToken } from "../../../../middleware/authMiddleware";

const db = admin.firestore();

export async function GET(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "agents"; // agents | members
    const agentId = searchParams.get("agentId");       // filter by specific agent

    let result;
    if (type === "members") {
      result = await getMemberActivity(agentId);
    } else {
      result = await getAgentActivity();
    }

    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("GET /api/activity error:", e);
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}

// ── Agent Activity ──────────────────────────────────────────────────────────────
async function getAgentActivity() {
  const agentsSnap = await db
    .collection("agents")
    .where("delete_flag", "==", false)
    .get();

  const activities = await Promise.all(
    agentsSnap.docs.map(async (docSnap) => {
      const agent = { id: docSnap.id, ...docSnap.data() };

      // Latest session from sessions subcollection
      const sessionsSnap = await db
        .collection("agents")
        .doc(docSnap.id)
        .collection("sessions")
        .orderBy("loginTime", "desc")
        .limit(1)
        .get();

      const latestSession = sessionsSnap.empty
        ? null
        : { id: sessionsSnap.docs[0].id, ...sessionsSnap.docs[0].data() };

      // Count of active sessions
      const activeSessionsSnap = await db
        .collection("agents")
        .doc(docSnap.id)
        .collection("sessions")
        .where("isActive", "==", true)
        .count()
        .get();
      const activeSessionCount = activeSessionsSnap.data().count || 0;

      // Count active members assigned to this agent
      const membersSnap = await db
        .collection("members")
        .where("agentId", "==", docSnap.id)
        .where("delete_flag", "==", false)
        .where("status", "==", "active")
        .count()
        .get();
      const activeMemberCount = membersSnap.data().count || 0;

      // Count pending members
      const pendingSnap = await db
        .collection("members")
        .where("agentId", "==", docSnap.id)
        .where("delete_flag", "==", false)
        .where("status", "==", "pending_approval")
        .count()
        .get();
      const pendingMemberCount = pendingSnap.data().count || 0;

      return {
        agentId: docSnap.id,
        name: agent.name || "",
        fatherName: agent.fatherName || "",
        email: agent.email || "",
        phone: agent.phone1 || "",
        photoUrl: agent.photoUrl || "",
        status: agent.status || "inactive",
        notificationToken: !!agent.notificationToken,
        lastLoginTime: agent.lastLoginTime?.toDate?.()?.toISOString() || null,
        lastLogoutTime: agent.lastLogoutTime?.toDate?.()?.toISOString() || null,
        lastActiveTime: agent.lastActiveTime?.toDate?.()?.toISOString() || agent.lastTokenUpdate?.toDate?.()?.toISOString() || null,
        lastTokenUpdate: agent.lastTokenUpdate?.toDate?.()?.toISOString() || null,
        activeSessionCount,
        activeMemberCount,
        pendingMemberCount,
        latestSession: latestSession
          ? {
              sessionId: latestSession.sessionId,
              isActive: latestSession.isActive,
              loginTime: latestSession.loginTime?.toDate?.()?.toISOString() || null,
              lastActiveTime: latestSession.lastActiveTime?.toDate?.()?.toISOString() || null,
              logoutTime: latestSession.logoutTime?.toDate?.()?.toISOString() || null,
              deviceInfo: latestSession.deviceInfo || null,
              notificationToken: !!latestSession.notificationToken,
            }
          : null,
      };
    })
  );

  const online = activities.filter((a) => a.activeSessionCount > 0).length;
  const offline = activities.length - online;

  return {
    data: activities,
    summary: { total: activities.length, online, offline },
  };
}

// ── Member Activity ─────────────────────────────────────────────────────────────
async function getMemberActivity(agentId) {
  let membersQuery = db
    .collection("members")
    .where("delete_flag", "==", false)
    .where("status", "==", "active");

  if (agentId) {
    membersQuery = membersQuery.where("agentId", "==", agentId);
  }

  const membersSnap = await membersQuery.get();

  const activities = await Promise.all(
    membersSnap.docs.map(async (docSnap) => {
      const member = { id: docSnap.id, ...docSnap.data() };

      // Latest session
      const sessionsSnap = await db
        .collection("members")
        .doc(docSnap.id)
        .collection("sessions")
        .orderBy("loginTime", "desc")
        .limit(1)
        .get();

      const latestSession = sessionsSnap.empty
        ? null
        : { id: sessionsSnap.docs[0].id, ...sessionsSnap.docs[0].data() };

      const activeSessionsSnap = await db
        .collection("members")
        .doc(docSnap.id)
        .collection("sessions")
        .where("isActive", "==", true)
        .count()
        .get();
      const activeSessionCount = activeSessionsSnap.data().count || 0;

      return {
        memberId: docSnap.id,
        displayName: member.displayName || "",
        fatherName: member.fatherName || "",
        surname: member.surname || "",
        phone: member.phone || "",
        registrationNumber: member.registrationNumber || "",
        photoURL: member.photoURL || "",
        agentId: member.agentId || null,
        notificationToken: !!member.notificationToken,
        lastLoginTime: member.lastLoginTime?.toDate?.()?.toISOString() || null,
        lastLogoutTime: member.lastLogoutTime?.toDate?.()?.toISOString() || null,
        lastActiveTime: member.lastActiveTime?.toDate?.()?.toISOString() || member.lastTokenUpdate?.toDate?.()?.toISOString() || null,
        lastTokenUpdate: member.lastTokenUpdate?.toDate?.()?.toISOString() || null,
        activeSessionCount,
        latestSession: latestSession
          ? {
              isActive: latestSession.isActive,
              loginTime: latestSession.loginTime?.toDate?.()?.toISOString() || null,
              lastActiveTime: latestSession.lastActiveTime?.toDate?.()?.toISOString() || null,
              logoutTime: latestSession.logoutTime?.toDate?.()?.toISOString() || null,
              deviceInfo: latestSession.deviceInfo || null,
              notificationToken: !!latestSession.notificationToken,
            }
          : null,
      };
    })
  );

  const online = activities.filter((a) => a.activeSessionCount > 0).length;
  const offline = activities.length - online;

  return {
    data: activities,
    summary: { total: activities.length, online, offline },
  };
}
