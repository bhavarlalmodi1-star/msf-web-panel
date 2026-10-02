"use client"
import { getTrust } from '@/utils/trust/trustStore';
import { useEffect } from "react"
import { getMessaging, getToken, onMessage } from "firebase/messaging"
import { doc, updateDoc } from "firebase/firestore"
import { app, db } from "../../../lib/firbase-client"
import { useAuth } from "./AuthProvider"

const VAPID_KEY = "BPcKr7eQYVHEZPZgHSJflV3PBxS2VJfg5jNbVgJ4ldRP0APoQpAIYLxRHz0qU1Kx6W1QWMp4X6FIXWwqBqq0CAo"

export default function FcmTokenManager() {
  const { user } = useAuth()

  useEffect(() => {
    if (!user || user.role !== "agent") return

    let cancelled = false

    const registerToken = async () => {
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "default") {
          const permission = await Notification.requestPermission()
          if (permission !== "granted") return
        }

        if (typeof Notification !== "undefined" && Notification.permission !== "granted") return

        const messaging = getMessaging(app)
        const currentToken = await getToken(messaging, { vapidKey: VAPID_KEY })

        if (!currentToken || cancelled) return

        // Persist to the agent's Firestore doc
        await updateDoc(doc(db, "agents", user.uid), { notificationToken: currentToken })

        // Listen for foreground messages
        onMessage(messaging, (payload) => {
          const { title, body } = payload.notification || {}
          if (title) {
            new Notification(title, { body: body || "", icon: getTrust().logoSrc || "/favicon.ico" })
          }
        })
      } catch (err) {
        console.warn("FCM token registration skipped:", err.message)
      }
    }

    registerToken()

    return () => { cancelled = true }
  }, [user])

  return null
}
