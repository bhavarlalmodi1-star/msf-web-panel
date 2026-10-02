"use client"
import dynamic from "next/dynamic"

const FcmTokenManager = dynamic(() => import("@/components/Base/FcmTokenManager"), { ssr: false })

export default function FcmTokenManagerClient() {
  return <FcmTokenManager />
}
