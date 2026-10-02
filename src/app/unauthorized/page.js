// app/unauthorized/page.tsx
"use client"
import { Button, Result } from 'antd'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/Base/AuthProvider'

export default function UnauthorizedPage() {
  const router = useRouter()
  const { user } = useAuth()

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--pink-50)',
    }}>
      <Result
        status="403"
        title={
          <span style={{ color: 'var(--primary)', fontWeight: 800, fontSize: 28 }}>
            Access Denied
          </span>
        }
        subTitle={
          <span style={{ color: '#64748b', fontSize: 15 }}>
            You don't have permission to view this page.
            <br />Contact your administrator to request access.
          </span>
        }
        extra={[
          <Button
            key="home"
            type="primary"
            size="large"
            style={{ background: 'var(--primary)', borderColor: 'var(--primary)', borderRadius: 8 }}
            onClick={() => router.replace('/')}
          >
            Go to Dashboard
          </Button>,
          <Button
            key="back"
            size="large"
            style={{ borderRadius: 8 }}
            onClick={() => router.back()}
          >
            Go Back
          </Button>,
        ]}
      />
    </div>
  )
}