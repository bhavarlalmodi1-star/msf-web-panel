'use client'
// Member login credentials — view and reset. Superadmin only.
//
// The password is shown as soon as the card opens, but it is still fetched by a
// SEPARATE authorised request rather than travelling with the member record —
// so it never reaches anyone who isn't superadmin, and it isn't sitting in the
// member payload that other screens load.

import React, { useState, useEffect } from 'react'
import { Card, Button, Input, Space, Typography, Tag, message, Modal, Alert, Tooltip } from 'antd'
import {
  KeyOutlined, CopyOutlined, ReloadOutlined, SaveOutlined, WarningOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { getAuth } from 'firebase/auth'

const { Text } = Typography

const MemberCredentialsCard = ({ member, isSuperAdmin }) => {
  const [revealed, setRevealed]   = useState(null)   // { password, source, ... }
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [editing, setEditing]     = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving]       = useState(false)

  const token = async () => getAuth().currentUser?.getIdToken()

  const reveal = async () => {
    setLoading(true); setError(null)
    try {
      const res  = await fetch(`/api/members/password?memberId=${member.id}`, {
        headers: { Authorization: `Bearer ${await token()}` },
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message)
      setRevealed(data.data)
    } catch (e) {
      // Shown inline rather than as a toast — this loads on open, and a toast
      // firing every time a member is viewed would be noise.
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Load as soon as the card is shown. Superadmin asked for it to be visible
  // without a click; the fetch is still a separate authorised call, so the
  // password never travels with the member record itself.
  useEffect(() => {
    if (!isSuperAdmin || !member?.id) return
    setRevealed(null); setEditing(false); setNewPassword('')
    reveal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id, isSuperAdmin])

  // Hooks must all run before any early return, so the permission check sits
  // here rather than at the top of the component.
  if (!isSuperAdmin || !member?.id) return null

  const copy = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value)
      message.success(`${label} copied`)
    } catch {
      message.warning('Copy failed — select the text manually')
    }
  }

  const save = () => {
    const pw = newPassword.trim()
    if (pw && pw.length < 6) {
      message.error('Password must be at least 6 characters')
      return
    }
    Modal.confirm({
      title: pw ? 'Set this password?' : 'Generate a new password?',
      icon: <WarningOutlined style={{ color: '#f59e0b' }} />,
      width: 520,
      content: (
        <div>
          <p>
            <b>{member.displayName}</b> will log in with the new password from now on.
            Their old one stops working immediately.
          </p>
          <Alert
            type="info" showIcon style={{ marginTop: 8 }}
            message="Tell the member"
            description="They cannot sign in until they know the new password. Send it on WhatsApp or hand it over before changing it."
          />
        </div>
      ),
      okText: 'Yes, change it',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: async () => {
        setSaving(true)
        try {
          const res = await fetch('/api/members/password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
            body: JSON.stringify({ memberId: member.id, password: pw || undefined }),
          })
          const data = await res.json()
          if (!data.success) throw new Error(data.message)
          setRevealed({ ...(revealed || {}), password: data.data.password, source: 'stored',
                        hasAuthAccount: true, lastChangedAt: new Date().toISOString() })
          setNewPassword(''); setEditing(false)
          message.success(data.message)
        } catch (e) {
          message.error('Change failed: ' + e.message)
        } finally {
          setSaving(false)
        }
      },
    })
  }

  return (
    <Card
      size="small"
      style={{ borderRadius: 10, borderColor: 'var(--border)', marginTop: 12 }}
      title={<span style={{ fontSize: 13 }}><KeyOutlined style={{ color: 'var(--primary)', marginRight: 6 }} />ऐप लॉगिन</span>}
      extra={
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={reveal}>
          Refresh
        </Button>
      }
    >
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <div>
          <Text style={{ fontSize: 11, color: '#6b7280' }}>लॉगिन आईडी</Text>
          <div>
            <Text code style={{ fontSize: 13 }}>{member.registrationNumber || '—'}</Text>
            {member.registrationNumber && (
              <Tooltip title="Copy">
                <Button size="small" type="text" icon={<CopyOutlined />}
                  onClick={() => copy(member.registrationNumber, 'Login ID')} />
              </Tooltip>
            )}
          </div>
        </div>

        {revealed ? (
          <>
            <div>
              <Text style={{ fontSize: 11, color: '#6b7280' }}>पासवर्ड</Text>
              <div>
                <Text code style={{ fontSize: 13 }}>{revealed.password || '—'}</Text>
                {revealed.password && (
                  <Tooltip title="Copy">
                    <Button size="small" type="text" icon={<CopyOutlined />}
                      onClick={() => copy(revealed.password, 'Password')} />
                  </Tooltip>
                )}
                {revealed.source === 'derived' && (
                  <Tooltip title="No password is stored for this member. This is the one the login falls back to — first letters of the name plus birth year — and it does work.">
                    <Tag style={{ fontSize: 9, marginLeft: 4 }}>derived</Tag>
                  </Tooltip>
                )}
                {revealed.source === 'stored' && <Tag color="blue" style={{ fontSize: 9, marginLeft: 4 }}>stored</Tag>}
                {revealed.source === 'none'   && <Tag color="red"  style={{ fontSize: 9, marginLeft: 4 }}>none set</Tag>}
              </div>
              {revealed.lastChangedAt && (
                <Text style={{ fontSize: 10, color: '#9ca3af' }}>
                  अंतिम बदलाव : {dayjs(revealed.lastChangedAt).format('DD-MM-YYYY hh:mm A')}
                </Text>
              )}
            </div>

            {!revealed.hasAuthAccount && (
              <Alert
                type="warning" showIcon
                style={{ borderRadius: 8 }}
                message={<span style={{ fontSize: 11 }}>
                  This member has no login account yet — setting a password below will create one.
                </span>}
              />
            )}

            {editing ? (
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  size="small"
                  placeholder="Leave blank to generate one"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  onPressEnter={save}
                />
                <Button size="small" type="primary" icon={<SaveOutlined />} loading={saving} onClick={save}>
                  Save
                </Button>
                <Button size="small" onClick={() => { setEditing(false); setNewPassword('') }}>Cancel</Button>
              </Space.Compact>
            ) : (
              <Button size="small" icon={<ReloadOutlined />} onClick={() => setEditing(true)}>
                Change password
              </Button>
            )}
          </>
        ) : error ? (
          <Alert
            type="error" showIcon style={{ borderRadius: 8 }}
            message={<span style={{ fontSize: 11 }}>पासवर्ड नहीं मिल सका : {error}</span>}
            action={<Button size="small" onClick={reveal}>Retry</Button>}
          />
        ) : (
          <Text style={{ fontSize: 11, color: '#9ca3af' }}>
            {loading ? 'पासवर्ड लोड हो रहा है…' : '—'}
          </Text>
        )}
      </Space>
    </Card>
  )
}

export default MemberCredentialsCard
