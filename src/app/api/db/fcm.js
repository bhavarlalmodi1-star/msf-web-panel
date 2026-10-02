import admin from "./firebaseAdmin";

/**
 * Send push notification to an agent via FCM.
 * Reads the agent's `notificationToken` from Firestore.
 */
export async function sendToAgent(agentId, title, body, data = {}) {
  if (!agentId) return { success: false, error: "agentId required" };

  try {
    const agentSnap = await admin.firestore().collection("agents").doc(agentId).get();
    if (!agentSnap.exists) return { success: false, error: "Agent not found" };

    const token = agentSnap.data()?.notificationToken;
    if (!token) return { success: false, error: "No FCM token for agent" };

    const message = {
      token,
      notification: { title, body },
      data: { ...data, click_action: data.click_action || "/" },
    };

    const response = await admin.messaging().send(message);
    return { success: true, response };
  } catch (error) {
    console.error("FCM sendToAgent error:", error);
    // If token is invalid/unregistered, clear it
    if (
      error.code === "messaging/invalid-registration-token" ||
      error.code === "messaging/registration-token-not-registered"
    ) {
      try {
        await admin
          .firestore()
          .collection("agents")
          .doc(agentId)
          .update({ notificationToken: admin.firestore.FieldValue.delete() });
      } catch (_) {}
    }
    return { success: false, error: error.message };
  }
}

/**
 * Send push notification to multiple agents (each with their own token).
 */
export async function sendToMultipleAgents(agentIds, title, body, data = {}) {
  if (!agentIds?.length) return { success: false, error: "No agentIds provided" };

  const results = await Promise.allSettled(
    agentIds.map((id) => sendToAgent(id, title, body, data))
  );

  return {
    success: true,
    sent: results.filter((r) => r.status === "fulfilled" && r.value.success).length,
    failed: results.filter((r) => r.status === "fulfilled" && !r.value.success).length,
  };
}
