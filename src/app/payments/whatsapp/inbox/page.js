'use client'
// WhatsApp Inbox — live two-pane conversation view.
//
// Scale note: the conversation list uses a *bounded* live listener (LIST_LIMIT,
// extended by "Load more"). An unbounded onSnapshot over every chat would bill
// a document read per member on every single change — at 1000+ members that
// gets expensive and janky fast. Bounding it keeps the UX fully live while the
// read cost stays proportional to what's actually on screen.
//
// The message thread attaches its own listener only to the open chat.

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Card, Input, Avatar, Badge, Typography, Empty, Spin, Tag, Button,
  Tooltip, Image, message as antMessage, Segmented, Alert, Grid,
  Drawer, Statistic, Row, Col, Divider,
} from 'antd'
import {
  SearchOutlined, SendOutlined, UserOutlined, ReloadOutlined,
  CheckOutlined, ClockCircleOutlined, WarningOutlined,
  FileTextOutlined, ArrowLeftOutlined, WhatsAppOutlined, DownloadOutlined,
  TeamOutlined, IdcardOutlined, EnvironmentOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons'
import {
  collection, query, orderBy, limit, onSnapshot, doc, updateDoc,
} from 'firebase/firestore'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { db, auth } from '../../../../../lib/firbase-client'

dayjs.extend(relativeTime)

const { Text, Title } = Typography
const { useBreakpoint } = Grid
const { TextArea } = Input

const LIST_PAGE  = 40    // conversations per "page" of the bounded listener
const MSG_LIMIT  = 100   // messages loaded per open thread

const C = {
  primary: '#25D366',
  dark:    '#075E54',
  bubbleIn:  '#ffffff',
  bubbleOut: '#dcf8c6',
  bg:      '#efeae2',
  border:  '#e9edef',
  muted:   '#8696a0',
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const toDate = (v) => {
  if (!v) return null
  if (v?.toDate) return v.toDate()
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

const fmtListTime = (v) => {
  const d = toDate(v)
  if (!d) return ''
  const now = dayjs()
  const t   = dayjs(d)
  if (t.isSame(now, 'day'))  return t.format('HH:mm')
  if (t.isSame(now.subtract(1, 'day'), 'day')) return 'Yesterday'
  if (t.isSame(now, 'year')) return t.format('DD MMM')
  return t.format('DD/MM/YY')
}

// Read receipt ticks, mirroring WhatsApp's own semantics
const StatusTick = ({ status }) => {
  if (status === 'failed') {
    return <Tooltip title="Failed to send"><WarningOutlined style={{ fontSize: 12, color: '#dc2626' }} /></Tooltip>
  }
  if (status === 'queued' || status === 'enqueued') {
    return <Tooltip title="Queued"><ClockCircleOutlined style={{ fontSize: 11, color: C.muted }} /></Tooltip>
  }
  const isRead      = status === 'read'
  const isDelivered = status === 'delivered' || isRead
  return (
    <Tooltip title={isRead ? 'Read' : isDelivered ? 'Delivered' : 'Sent'}>
      <span style={{ display: 'inline-flex', marginLeft: 2, color: isRead ? '#53bdeb' : C.muted }}>
        <CheckOutlined style={{ fontSize: 11 }} />
        {isDelivered && <CheckOutlined style={{ fontSize: 11, marginLeft: -5 }} />}
      </span>
    </Tooltip>
  )
}

// ── Session countdown ───────────────────────────────────────────────────────
const useSessionWindow = (lastInboundAt) => {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  return useMemo(() => {
    const d = toDate(lastInboundAt)
    if (!d) return { open: false, label: 'No message received yet' }
    const elapsed = now - d.getTime()
    const left    = 24 * 60 * 60 * 1000 - elapsed
    if (left <= 0) return { open: false, label: 'Reply window closed' }
    const h = Math.floor(left / 3_600_000)
    const m = Math.floor((left % 3_600_000) / 60_000)
    return { open: true, label: h > 0 ? `${h}h ${m}m left to reply` : `${m}m left to reply` }
  }, [lastInboundAt, now])
}

// ── Message bubble ──────────────────────────────────────────────────────────
const MessageBubble = ({ m }) => {
  const out = m.direction === 'out'
  const ts  = toDate(m.timestamp)

  return (
    <div style={{ display: 'flex', justifyContent: out ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
      <div
        style={{
          maxWidth: '72%',
          background: out ? C.bubbleOut : C.bubbleIn,
          borderRadius: 8,
          padding: '6px 9px 4px',
          boxShadow: '0 1px 0.5px rgba(0,0,0,.13)',
          wordBreak: 'break-word',
        }}
      >
        {/* Media */}
        {m.mediaUrl && (m.type === 'image' || m.mediaType?.startsWith?.('image')) && (
          <Image
            src={m.mediaUrl}
            alt={m.caption || 'Image'}
            style={{ maxWidth: 260, borderRadius: 6, marginBottom: 4 }}
            placeholder
          />
        )}

        {m.mediaUrl && m.type === 'document' && (
          <a
            href={m.mediaUrl} target="_blank" rel="noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: 8,
              background: 'rgba(0,0,0,.05)', borderRadius: 6, marginBottom: 4,
              color: 'inherit', textDecoration: 'none',
            }}
          >
            <FileTextOutlined style={{ fontSize: 22, color: '#dc2626' }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.fileName || 'Document'}
              </div>
              <div style={{ fontSize: 10, color: C.muted }}>Tap to open</div>
            </div>
            <DownloadOutlined style={{ marginLeft: 'auto', color: C.muted }} />
          </a>
        )}

        {m.mediaUrl && m.type === 'video' && (
          <video src={m.mediaUrl} controls style={{ maxWidth: 260, borderRadius: 6, marginBottom: 4 }} />
        )}
        {m.mediaUrl && m.type === 'audio' && (
          <audio src={m.mediaUrl} controls style={{ maxWidth: 240, marginBottom: 4 }} />
        )}

        {/* Text */}
        {(m.text || m.caption) && (
          <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
            {m.text || m.caption}
          </div>
        )}

        {/* Meta line */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 2 }}>
          {m.type === 'template' && <Tag color="blue" style={{ fontSize: 9, lineHeight: '14px', margin: 0, padding: '0 4px' }}>Template</Tag>}
          <span style={{ fontSize: 10, color: C.muted }}>{ts ? dayjs(ts).format('HH:mm') : ''}</span>
          {out && <StatusTick status={m.status} />}
        </div>
      </div>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function WhatsAppInboxPage() {
  const screens = useBreakpoint()
  const isMobile = !screens.md

  const [chats, setChats]         = useState([])
  const [chatsLoading, setLoading] = useState(true)
  const [listLimit, setListLimit] = useState(LIST_PAGE)

  const [activePhone, setActivePhone] = useState(null)
  const [messages, setMessages]       = useState([])
  const [msgLoading, setMsgLoading]   = useState(false)

  const [search, setSearch]     = useState('')
  const [filter, setFilter]     = useState('All')
  const [draft, setDraft]       = useState('')
  const [sending, setSending]   = useState(false)

  // ── Linked-members drawer ─────────────────────────────────────────────────
  const [linkedOpen, setLinkedOpen]       = useState(false)
  const [linkedLoading, setLinkedLoading] = useState(false)
  const [linkedData, setLinkedData]       = useState(null)  // { count, totals, members }

  const bottomRef = useRef(null)

  // ── Live listener: conversation list (bounded) ────────────────────────────
  useEffect(() => {
    setLoading(true)
    const q = query(
      collection(db, 'whatsappChats'),
      orderBy('lastMessageAt', 'desc'),
      limit(listLimit),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        setChats(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      (err) => {
        console.error('chats listener error:', err)
        antMessage.error('Failed to load conversations')
        setLoading(false)
      },
    )
    return () => unsub()
  }, [listLimit])

  // ── Live listener: open thread only ───────────────────────────────────────
  useEffect(() => {
    if (!activePhone) { setMessages([]); return }
    setMsgLoading(true)
    const q = query(
      collection(db, 'whatsappChats', activePhone, 'messages'),
      orderBy('timestamp', 'desc'),
      limit(MSG_LIMIT),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        // Query descending (newest first) so the limit keeps the *latest*
        // messages, then flip for display.
        setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse())
        setMsgLoading(false)
      },
      (err) => {
        console.error('messages listener error:', err)
        setMsgLoading(false)
      },
    )
    return () => unsub()
  }, [activePhone])

  // Auto-scroll to newest
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const activeChat = useMemo(
    () => chats.find(c => c.id === activePhone) || null,
    [chats, activePhone],
  )
  const session = useSessionWindow(activeChat?.lastInboundAt)

  // ── Open a chat: clear badge + send real WhatsApp read receipts ───────────
  // Clearing unreadCount only hides our own badge. The server route also calls
  // Gupshup's read API so the member actually sees blue ticks on their phone.
  const openChat = useCallback(async (phone) => {
    setActivePhone(phone)
    setDraft('')

    // Optimistic local clear so the badge disappears instantly
    try {
      await updateDoc(doc(db, 'whatsappChats', phone), { unreadCount: 0 })
    } catch (e) {
      console.warn('Failed to clear unread badge:', e)
    }

    // Fire the real read receipts (non-blocking — never hold up opening a chat)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch('/api/whatsapp/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone }),
      })
      const data = await res.json()
      if (data.receiptsSent > 0) {
        console.log(`✅ Sent ${data.receiptsSent} read receipt(s) for ${phone}`)
      }
      if (data.failures?.length) {
        console.warn('Some read receipts failed:', data.failures)
      }
    } catch (e) {
      console.warn('Read receipt call failed (non-critical):', e)
    }
  }, [])

  // ── Load every member registered against this phone ───────────────────────
  // Fetched live rather than read off the chat doc, whose linkedMembers copy is
  // only a preview and goes stale as members are edited.
  const openLinkedMembers = useCallback(async (phone) => {
    if (!phone) return
    setLinkedOpen(true)
    setLinkedLoading(true)
    setLinkedData(null)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch(`/api/whatsapp/linked-members?phone=${encodeURIComponent(phone)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) setLinkedData(data)
      else antMessage.error(data.message || 'Failed to load members')
    } catch (e) {
      console.error(e)
      antMessage.error('Failed to load linked members')
    } finally {
      setLinkedLoading(false)
    }
  }, [])

  // ── Send a reply ──────────────────────────────────────────────────────────
  const sendReply = async () => {
    const text = draft.trim()
    if (!text || !activePhone) return
    setSending(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch('/api/whatsapp/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone: activePhone, text }),
      })
      const data = await res.json()
      if (data.success) {
        setDraft('')
      } else if (data.sessionClosed) {
        antMessage.warning(data.message)
      } else {
        antMessage.error(data.message || 'Failed to send')
      }
    } catch (e) {
      console.error(e)
      antMessage.error('Failed to send message')
    } finally {
      setSending(false)
    }
  }

  // ── Filter + search (client-side over the loaded window) ──────────────────
  const visibleChats = useMemo(() => {
    const q = search.trim().toLowerCase()
    return chats.filter(c => {
      if (filter === 'Unread' && !(c.unreadCount > 0)) return false
      if (filter === 'Members' && !c.isMember) return false
      if (!q) return true
      return (
        (c.memberName || '').toLowerCase().includes(q) ||
        (c.senderName || '').toLowerCase().includes(q) ||
        (c.registrationNumber || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q)
      )
    })
  }, [chats, search, filter, ])

  const totalUnread = useMemo(
    () => chats.reduce((s, c) => s + (c.unreadCount || 0), 0),
    [chats],
  )

  // ── Conversation list pane ────────────────────────────────────────────────
  const listPane = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderRight: `1px solid ${C.border}`, background: '#fff' }}>
      <div style={{ padding: 12, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <Title level={5} style={{ margin: 0 }}>
            <WhatsAppOutlined style={{ color: C.primary, marginRight: 6 }} />
            Inbox
            {totalUnread > 0 && <Badge count={totalUnread} style={{ marginLeft: 8, backgroundColor: C.primary }} />}
          </Title>
          <Tooltip title="Conversations update live">
            <Tag color="green" style={{ fontSize: 10, margin: 0 }}>● LIVE</Tag>
          </Tooltip>
        </div>
        <Input
          prefix={<SearchOutlined style={{ color: C.muted }} />}
          placeholder="Search name, reg no or phone"
          value={search}
          onChange={e => setSearch(e.target.value)}
          allowClear
          size="small"
          style={{ marginBottom: 8 }}
        />
        <Segmented
          size="small"
          block
          value={filter}
          onChange={setFilter}
          options={['All', 'Unread', 'Members']}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {chatsLoading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div>
        ) : visibleChats.length === 0 ? (
          <Empty
            description={search ? 'No matching conversations' : 'No conversations yet'}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ marginTop: 40 }}
          />
        ) : (
          visibleChats.map(c => {
            const active = c.id === activePhone
            return (
              <div
                key={c.id}
                onClick={() => openChat(c.id)}
                style={{
                  display: 'flex', gap: 10, padding: '10px 12px', cursor: 'pointer',
                  background: active ? '#f0f2f5' : '#fff',
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <Avatar src={c.photoURL || undefined} icon={<UserOutlined />} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                    <Text strong style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.memberName || c.senderName || c.phone}
                    </Text>
                    <span style={{ fontSize: 10.5, color: c.unreadCount > 0 ? C.primary : C.muted, whiteSpace: 'nowrap' }}>
                      {fmtListTime(c.lastMessageAt)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
                    <span style={{
                      fontSize: 12, color: C.muted, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                    }}>
                      {c.lastDirection === 'out' && '↗ '}{c.lastMessage || '—'}
                    </span>
                    {c.unreadCount > 0 && (
                      <Badge count={c.unreadCount} style={{ backgroundColor: C.primary }} />
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                    {c.registrationNumber && (
                      <Text style={{ fontSize: 10, color: 'var(--primary)', fontFamily: 'monospace' }}>
                        {c.registrationNumber}
                      </Text>
                    )}
                    {/* More than one member shares this number */}
                    {c.memberCount > 1 && (
                      <Tooltip title={`${c.memberCount} members on this number — click to view`}>
                        <Tag
                          color="blue"
                          icon={<TeamOutlined />}
                          style={{ fontSize: 9, lineHeight: '15px', margin: 0, padding: '0 4px', cursor: 'pointer' }}
                          onClick={(e) => { e.stopPropagation(); openLinkedMembers(c.id) }}
                        >
                          +{c.memberCount - 1} more
                        </Tag>
                      </Tooltip>
                    )}
                    {!c.isMember && (
                      <Tag color="orange" style={{ fontSize: 9, lineHeight: '15px', margin: 0, padding: '0 4px' }}>
                        Unknown
                      </Tag>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}

        {/* Extend the bounded listener */}
        {!chatsLoading && chats.length >= listLimit && (
          <div style={{ padding: 12, textAlign: 'center' }}>
            <Button size="small" onClick={() => setListLimit(l => l + LIST_PAGE)} icon={<ReloadOutlined />}>
              Load older conversations
            </Button>
          </div>
        )}
      </div>
    </div>
  )

  // ── Thread pane ───────────────────────────────────────────────────────────
  const threadPane = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bg }}>
      {!activeChat ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Empty description="Select a conversation" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      ) : (
        <>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
            background: '#f0f2f5', borderBottom: `1px solid ${C.border}`,
          }}>
            {isMobile && (
              <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => setActivePhone(null)} />
            )}
            <Avatar src={activeChat.photoURL || undefined} icon={<UserOutlined />} size={38} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text strong style={{ fontSize: 14, display: 'block' }}>
                {activeChat.memberName || activeChat.senderName || activeChat.phone}
              </Text>
              <Text style={{ fontSize: 11, color: C.muted }}>
                +{activeChat.phone}
                {activeChat.registrationNumber && ` · ${activeChat.registrationNumber}`}
                {activeChat.programName && ` · ${activeChat.programName}`}
              </Text>
            </div>

            {/* Linked members — always clickable, even for a single member */}
            <Tooltip title="View all members registered on this number">
              <Button
                size="small"
                icon={<TeamOutlined />}
                onClick={() => openLinkedMembers(activeChat.id)}
                style={{
                  borderColor: activeChat.memberCount > 1 ? C.primary : undefined,
                  color:       activeChat.memberCount > 1 ? C.dark : undefined,
                }}
              >
                {activeChat.memberCount ?? 0} member{(activeChat.memberCount ?? 0) === 1 ? '' : 's'}
              </Button>
            </Tooltip>

            <Tag color={session.open ? 'green' : 'default'} style={{ fontSize: 10 }}>
              {session.label}
            </Tag>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
            {msgLoading ? (
              <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
            ) : messages.length === 0 ? (
              <Empty description="No messages yet" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 40 }} />
            ) : (
              <>
                {messages.length >= MSG_LIMIT && (
                  <div style={{ textAlign: 'center', marginBottom: 10 }}>
                    <Tag style={{ fontSize: 10 }}>Showing the latest {MSG_LIMIT} messages</Tag>
                  </div>
                )}
                {messages.map(m => <MessageBubble key={m.id} m={m} />)}
              </>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Composer */}
          <div style={{ padding: 10, background: '#f0f2f5', borderTop: `1px solid ${C.border}` }}>
            {!session.open && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 8, fontSize: 12 }}
                message="24-hour reply window closed"
                description="WhatsApp only allows free-form replies within 24 hours of the member's last message. Send an approved template instead."
              />
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <TextArea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder={session.open ? 'Type a message…' : 'Reply window closed'}
                autoSize={{ minRows: 1, maxRows: 4 }}
                disabled={!session.open || sending}
                onPressEnter={e => {
                  if (!e.shiftKey) { e.preventDefault(); sendReply() }
                }}
                style={{ borderRadius: 20, resize: 'none' }}
              />
              <Button
                type="primary"
                shape="circle"
                icon={<SendOutlined />}
                loading={sending}
                disabled={!session.open || !draft.trim()}
                onClick={sendReply}
                style={{ background: C.primary, borderColor: C.primary, flexShrink: 0 }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )

  // ── Linked members drawer ─────────────────────────────────────────────────
  const linkedDrawer = (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TeamOutlined style={{ color: C.primary }} />
          <span>Linked Members</span>
          {linkedData && <Tag color="blue">{linkedData.count}</Tag>}
        </div>
      }
      open={linkedOpen}
      onClose={() => setLinkedOpen(false)}
      width={isMobile ? '100%' : 520}
    >
      {linkedLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
      ) : !linkedData ? (
        <Empty description="Could not load members" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : linkedData.count === 0 ? (
        <Empty
          description={
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>No member registered</div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                +{linkedData.phone} isn&apos;t linked to any member record.
              </Text>
            </div>
          }
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ marginTop: 40 }}
        />
      ) : (
        <>
          {/* Phone + combined totals across every linked member */}
          <Card size="small" style={{ marginBottom: 12, background: '#f0fdf4', borderColor: '#bbf7d0' }}>
            <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
              +{linkedData.phone}
            </Text>
            <Row gutter={8}>
              <Col span={8}>
                <Statistic title="Members" value={linkedData.count}
                  valueStyle={{ fontSize: 17 }} prefix={<TeamOutlined />} />
              </Col>
              <Col span={8}>
                <Statistic title="Join Fees Pending" value={linkedData.totals.pending} prefix="₹"
                  valueStyle={{ fontSize: 17, color: linkedData.totals.pending > 0 ? '#dc2626' : '#16a34a' }} />
              </Col>
              <Col span={8}>
                <Statistic title="Closing Pending" value={linkedData.totals.closingPending} prefix="₹"
                  valueStyle={{ fontSize: 17, color: linkedData.totals.closingPending > 0 ? '#dc2626' : '#16a34a' }} />
              </Col>
            </Row>
          </Card>

          {/* One card per member */}
          {linkedData.members.map((m, i) => (
            <Card key={m.id} size="small" style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <Avatar src={m.photoURL || undefined} icon={<UserOutlined />} size={46} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text strong style={{ fontSize: 14 }}>{m.displayName || '—'}</Text>
                    {i === 0 && <Tag color="green" style={{ fontSize: 9, margin: 0 }}>PRIMARY</Tag>}
                    <Tag color={m.isActive ? 'success' : 'default'} style={{ fontSize: 9, margin: 0 }}>
                      {m.status || 'unknown'}
                    </Tag>
                    {m.migratedData && <Tag color="purple" style={{ fontSize: 9, margin: 0 }}>Migrated</Tag>}
                    {m.memberClosed && <Tag color="volcano" style={{ fontSize: 9, margin: 0 }}>Closed</Tag>}
                  </div>

                  {m.fatherName && (
                    <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                      s/o {m.fatherName}
                    </Text>
                  )}

                  <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 11 }}>
                    <span>
                      <IdcardOutlined style={{ marginRight: 3, color: C.muted }} />
                      <Text style={{ fontSize: 11, color: 'var(--primary)', fontFamily: 'monospace' }}>
                        {m.registrationNumber || '—'}
                      </Text>
                    </span>
                    {m.ageGroupName && <Tag style={{ fontSize: 9, margin: 0 }}>{m.ageGroupName}</Tag>}
                  </div>

                  {m.programName && (
                    <div style={{ marginTop: 3 }}>
                      <Tag color="geekblue" style={{ fontSize: 10 }}>{m.programName}</Tag>
                    </div>
                  )}

                  {(m.village || m.district || m.agentName) && (
                    <Text type="secondary" style={{ fontSize: 10.5, display: 'block', marginTop: 3 }}>
                      {(m.village || m.district) && (
                        <>
                          <EnvironmentOutlined style={{ marginRight: 3 }} />
                          {[m.village, m.district].filter(Boolean).join(', ')}
                        </>
                      )}
                      {m.agentName && ` · Agent: ${m.agentName}`}
                    </Text>
                  )}

                  <Divider style={{ margin: '8px 0' }} />

                  {/* Money */}
                  <Row gutter={6}>
                    <Col span={8}>
                      <div style={{ fontSize: 9.5, color: C.muted }}>Join Fees</div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>₹{m.joinFees.toLocaleString('en-IN')}</div>
                    </Col>
                    <Col span={8}>
                      <div style={{ fontSize: 9.5, color: C.muted }}>Paid</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#16a34a' }}>
                        ₹{m.paidAmount.toLocaleString('en-IN')}
                      </div>
                    </Col>
                    <Col span={8}>
                      <div style={{ fontSize: 9.5, color: C.muted }}>Pending</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: m.pendingAmount > 0 ? '#dc2626' : '#16a34a' }}>
                        ₹{m.pendingAmount.toLocaleString('en-IN')}
                      </div>
                    </Col>
                  </Row>

                  {(m.closingPending > 0 || m.pendingClosingCount > 0) && (
                    <div style={{ marginTop: 6, padding: '4px 8px', background: '#fef2f2', borderRadius: 4 }}>
                      <Text style={{ fontSize: 10.5, color: '#dc2626' }}>
                        Closing pending: ₹{m.closingPending.toLocaleString('en-IN')}
                        {m.pendingClosingCount > 0 && ` (${m.pendingClosingCount} closing${m.pendingClosingCount === 1 ? '' : 's'})`}
                      </Text>
                    </div>
                  )}

                  <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Button
                      size="small" type="link" style={{ padding: 0, fontSize: 11 }}
                      onClick={() => window.open(`/members?search=${encodeURIComponent(m.registrationNumber || '')}`, '_blank')}
                    >
                      Open member →
                    </Button>
                    {m.certificateUrl && (
                      <Button
                        size="small" type="link" icon={<SafetyCertificateOutlined />}
                        style={{ padding: 0, fontSize: 11 }}
                        onClick={() => window.open(m.certificateUrl, '_blank')}
                      >
                        Certificate
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </>
      )}
    </Drawer>
  )

  // ── Layout ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: isMobile ? 0 : 16 }}>
      <Card
        styles={{ body: { padding: 0 } }}
        style={{ overflow: 'hidden', borderRadius: isMobile ? 0 : 10 }}
      >
        <div style={{ display: 'flex', height: 'calc(100vh - 140px)', minHeight: 480 }}>
          {isMobile ? (
            <div style={{ flex: 1, minWidth: 0 }}>
              {activePhone ? threadPane : listPane}
            </div>
          ) : (
            <>
              <div style={{ width: 340, flexShrink: 0 }}>{listPane}</div>
              <div style={{ flex: 1, minWidth: 0 }}>{threadPane}</div>
            </>
          )}
        </div>
      </Card>

      {linkedDrawer}
    </div>
  )
}
