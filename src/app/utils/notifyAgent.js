import { auth } from "../../../lib/firbase-client"

export async function notifyAgent(agentId, title, body, data = {}) {
  if (!agentId) return
  try {
    const user = auth.currentUser
    if (!user) return
    const idToken = await user.getIdToken()
    await fetch("/api/notifications/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ agentId, title, body, data }),
    })
  } catch (err) {
    console.warn("Failed to send notification:", err.message)
  }
}
