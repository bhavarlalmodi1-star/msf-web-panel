'use client'
// Send Login Details on WhatsApp
//
// Sends members their app login ID and password.
//
// The honest constraint, stated up front in the UI too: this sends a FREE-FORM
// WhatsApp message, which Meta only delivers within 24 hours of that member's
// last inbound message. Members who have never messaged the trust cannot be
// reached this way. The preview shows exactly who is reachable BEFORE anything
// is sent, so the limit is visible rather than discovered afterwards.

import { panelTheme } from '@/utils/trust/trustStore';
import React, { useState, useMemo, useCallback } from 'react'
import { useSelector } from 'react-redux'
import { useAuth } from '@/components/Base/AuthProvider'
import {
  Card, Button, Table, Tag, Alert, Typography, Space, Progress, Input, Select,
  Statistic, Row, Col, message, Result, Modal, Tooltip, Empty, Drawer, Badge, DatePicker
} from 'antd'
import {
  SendOutlined, EyeOutlined, DownloadOutlined, WarningOutlined, KeyOutlined,
  SearchOutlined, FilterOutlined, StopOutlined, WhatsAppOutlined, ClearOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { auth } from '../../../../../lib/firbase-client'
import { fetchAllFilteredMembers } from '@/app/members/components/firebase-helpers'
import { useTrust } from '@/utils/trust/useTrust'

const { Title, Text } = Typography
const { RangePicker } = DatePicker

const C = {
  get primary() { return panelTheme().primary; }, success: '#16a34a', error: '#dc2626',
  warning: '#f59e0b', info: '#2563eb', get border() { return panelTheme().border; },
  muted: '#6b7280', light: '#9ca3af', get bg() { return panelTheme().background; }, wa: '#25D366',
}

const STATUS = {
  WILL_SEND:      { label: 'Will send',      color: 'blue'    },
  SENT:           { label: 'Sent',           color: 'green'   },
  FAILED:         { label: 'Failed',         color: 'red'     },
  SESSION_CLOSED: { label: 'Cannot reach',   color: 'volcano' },
  NO_PHONE:       { label: 'No phone',       color: 'default' },
  NO_PASSWORD:    { label: 'No password',    color: 'orange'  },
  NO_LOGIN_ID:    { label: 'No login ID',    color: 'orange'  },
}

// {trustName} / {trustShortName} / {appLink} / {supportPhone} are filled in by
// the server from Settings → Trust Details.
const DEFAULT_MESSAGE = `नमस्ते {name} जी,

{trustName} के ऐप में आपका लॉगिन विवरण:

आईडी : {regNo}
पासवर्ड : {password}

ऐप डाउनलोड करें :
{appLink}

कृपया यह जानकारी किसी और को न बताएं।

किसी भी समस्या के लिए संपर्क करें : {supportPhone}

धन्यवाद,
{trustShortName}`

const EMPTY_FILTERS = {
  search: '', programIds: [], ageGroupIds: [], agentId: 'all',
  status: 'active', paymentStatus: 'all', gender: 'all',
  fromDate: null, toDate: null, sortField: 'createdAt', sortOrder: 'desc',
}

const BATCH = 100   // server accepts up to 200; 100 keeps each round trip quick

const SendCredentialsPage = () => {
  const trust = useTrust()
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'superadmin'
  const programList = useSelector(s => s.data.programList || [])
  const agentList   = useSelector(s => s.data.agentList   || [])

  const [filters, setFilters]       = useState(EMPTY_FILTERS)
  const [searchInput, setSearchInput] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [skipAlreadySent, setSkipAlreadySent] = useState(true)

  const [messageText, setMessageText] = useState(DEFAULT_MESSAGE)
  const [loading, setLoading]   = useState(false)
  const [sending, setSending]   = useState(false)
  const [progress, setProgress] = useState(0)
  const [counts, setCounts]     = useState(null)
  const [results, setResults]   = useState([])
  const [applied, setApplied]   = useState(false)
  const stopRef = React.useRef(false)

  const ageGroupOptions = useMemo(() => {
    const ids = filters.programIds || []
    if (!ids.length) return []
    const out = []
    ids.forEach(pid => {
      const prog = programList.find(p => p.id === pid)
      ;(prog?.ageGroups || []).forEach(ag => out.push({
        value: ag.id,
        label: ids.length > 1 ? `${ag.ageGroupName} — ${prog?.name || ''}` : ag.ageGroupName,
      }))
    })
    return out
  }, [filters.programIds, programList])

  const activeFilterCount = useMemo(() => {
    let n = 0
    if (filters.search) n++
    if (filters.programIds?.length) n++
    if (filters.ageGroupIds?.length) n++
    if (filters.agentId !== 'all') n++
    if (filters.status !== 'active') n++
    if (filters.gender !== 'all') n++
    if (filters.fromDate || filters.toDate) n++
    return n
  }, [filters])

  // ── Run ────────────────────────────────────────────────────────────────────
  const run = useCallback(async ({ dryRun }) => {
    stopRef.current = false
    dryRun ? setLoading(true) : setSending(true)
    setResults([]); setCounts(null); setProgress(0)
    if (dryRun) setApplied(false)

    try {
      const all = await fetchAllFilteredMembers({ ...filters })
      let targets = (all || []).filter(m => !m.delete_flag)
      if (skipAlreadySent) targets = targets.filter(m => !m.credentialsSentAt)

      if (!targets.length) {
        message.warning('No members match these filters')
        return
      }

      const token = await auth.currentUser?.getIdToken()
      const agg = {}
      const rows = []

      for (let i = 0; i < targets.length; i += BATCH) {
        if (stopRef.current) { message.info('Stopped'); break }
        const slice = targets.slice(i, i + BATCH)
        const res = await fetch('/api/whatsapp/send-credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ memberIds: slice.map(m => m.id), message: messageText, dryRun }),
        })
        const data = await res.json()
        if (!data.success) throw new Error(data.message)

        Object.entries(data.counts).forEach(([k, v]) => { agg[k] = (agg[k] || 0) + v })
        rows.push(...data.results)
        setCounts({ ...agg }); setResults([...rows])
        setProgress(Math.round(Math.min(100, ((i + slice.length) / targets.length) * 100)))
      }

      if (dryRun) message.success(`${agg.willSend || 0} of ${targets.length} member(s) can be reached`)
      else { setApplied(true); message.success(`Sent to ${agg.sent || 0} member(s)`) }
    } catch (e) {
      message.error((dryRun ? 'Preview' : 'Send') + ' failed: ' + e.message)
    } finally {
      setLoading(false); setSending(false)
    }
  }, [filters, messageText, skipAlreadySent])

  const confirmSend = () => {
    Modal.confirm({
      title: 'Send login details?',
      width: 560,
      icon: <WarningOutlined style={{ color: C.warning }} />,
      content: (
        <div>
          <p><b>{counts?.willSend || 0}</b> member(s) will receive their login ID and password on WhatsApp.</p>
          <Alert
            type="warning" showIcon style={{ marginTop: 8 }}
            message="Passwords are being sent in plain text"
            description="WhatsApp messages stay on the member's phone. Only send to the members you intend to, and never forward this list."
          />
          {(counts?.sessionClosed || 0) > 0 && (
            <p style={{ marginTop: 10, fontSize: 12, color: C.muted }}>
              {counts.sessionClosed} member(s) cannot be reached and will be skipped — see below.
            </p>
          )}
        </div>
      ),
      okText: `Yes, send to ${counts?.willSend || 0}`,
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: () => run({ dryRun: false }),
    })
  }

  const downloadCsv = () => {
    if (!results.length) return
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const head = ['Status', 'Reason', 'Name', 'Login ID', 'Phone', 'Program', 'Derived password?']
    const body = results.map(r => [
      q(STATUS[r.status]?.label || r.status), q(r.reason || ''), q(r.name),
      q(r.loginId), q(r.phone), q(r.programName || ''), q(r.derivedPassword ? 'Yes' : 'No'),
    ].join(','))
    // Deliberately NOT exporting the password itself.
    const csv = [head.map(q).join(','), ...body].join('\r\n')
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), new TextEncoder().encode(csv)],
      { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = window.URL.createObjectURL(blob)
    a.download = `credentials-send_${dayjs().format('YYYY-MM-DD_HHmm')}.csv`
    a.click()
    window.URL.revokeObjectURL(a.href)
  }

  if (user && !isSuperAdmin) {
    return (
      <div style={{ padding: 40, background: C.bg, minHeight: '100vh' }}>
        <Result status="403" title="Superadmin only"
          subTitle="This screen sends members their passwords." />
      </div>
    )
  }

  const columns = [
    { title: 'Status', dataIndex: 'status', width: 130, fixed: 'left',
      render: (s, r) => (
        <Tooltip title={r.reason || ''}>
          <Tag color={STATUS[s]?.color || 'default'} style={{ fontSize: 10, margin: 0 }}>
            {STATUS[s]?.label || s}
          </Tag>
        </Tooltip>
      ) },
    { title: 'Member', key: 'm', width: 200,
      render: (_, r) => (
        <div>
          <Text strong style={{ fontSize: 12 }}>{r.name}</Text>
          <div style={{ fontSize: 10, color: C.light }}>{r.programName || '—'}</div>
        </div>
      ) },
    { title: 'Login ID', dataIndex: 'loginId', width: 130,
      render: v => <Text code style={{ fontSize: 11 }}>{v || '—'}</Text> },
    { title: 'Phone', dataIndex: 'phone', width: 120,
      render: v => <Text style={{ fontSize: 11 }}>{v || '—'}</Text> },
    { title: 'Password', key: 'pw', width: 110,
      render: (_, r) => r.derivedPassword
        ? <Tooltip title="No password stored — the derived one (name + birth year) is being sent. It is what the login accepts.">
            <Tag style={{ fontSize: 9 }}>derived</Tag>
          </Tooltip>
        : <Tag color="blue" style={{ fontSize: 9 }}>stored</Tag> },
    { title: 'Note', dataIndex: 'reason', ellipsis: true,
      render: v => <Text style={{ fontSize: 10, color: C.muted }}>{v || ''}</Text> },
  ]

  const unreachable = (counts?.sessionClosed || 0)

  return (
    <div style={{ padding: 20, background: C.bg, minHeight: '100vh' }}>
      <Title level={3} style={{ marginBottom: 2 }}>
        <KeyOutlined style={{ color: C.primary, marginRight: 8 }} />
        Send Login Details on WhatsApp
      </Title>
      <Text type="secondary">Send members their app login ID and password.</Text>

      <Alert
        type="warning" showIcon icon={<WhatsAppOutlined />}
        style={{ marginTop: 14, borderRadius: 10 }}
        message={<span style={{ fontSize: 12 }}>
          This sends a normal WhatsApp message, which only reaches members who have messaged
          the trust in the last 24 hours.
        </span>}
        description={<span style={{ fontSize: 11 }}>
          Members who have never messaged you <b>cannot</b> be reached this way — WhatsApp blocks it.
          The preview below shows exactly who is reachable before anything is sent. To reach everyone,
          an approved Gupshup template is needed; once you have one, the same screen can send through it.
        </span>}
      />

      {/* Filters */}
      <Card size="small" style={{ marginTop: 12, borderRadius: 12, borderColor: C.border }} bodyStyle={{ padding: 12 }}>
        <Space wrap size={10}>
          <Input.Search
            placeholder="Search name, reg no, phone..." allowClear enterButton={<SearchOutlined />}
            value={searchInput} onChange={e => setSearchInput(e.target.value)}
            onSearch={v => setFilters(f => ({ ...f, search: v.trim() }))}
            style={{ width: 260 }}
          />
          <Select
            mode="multiple" allowClear placeholder="Yojna" style={{ minWidth: 190 }}
            value={filters.programIds} maxTagCount="responsive"
            onChange={v => setFilters(f => ({ ...f, programIds: v, ageGroupIds: [] }))}
            options={programList.map(p => ({ label: p.name, value: p.id }))}
            optionFilterProp="label" showSearch
          />
          <Select
            mode="multiple" allowClear style={{ minWidth: 170 }}
            placeholder={filters.programIds?.length ? 'Age group' : 'Age group (pick yojna)'}
            disabled={!filters.programIds?.length}
            value={filters.ageGroupIds} maxTagCount="responsive"
            onChange={v => setFilters(f => ({ ...f, ageGroupIds: v }))}
            options={ageGroupOptions} optionFilterProp="label" showSearch
          />
          <Button icon={<FilterOutlined />} onClick={() => setFilterOpen(true)}>
            More {activeFilterCount > 0 && <Badge count={activeFilterCount} size="small" style={{ backgroundColor: C.primary }} />}
          </Button>
          <Select
            value={skipAlreadySent} onChange={setSkipAlreadySent} style={{ width: 210 }}
            options={[
              { label: 'Skip already-sent members', value: true },
              { label: 'Include already-sent members', value: false },
            ]}
          />
          {activeFilterCount > 0 && (
            <Button icon={<ClearOutlined />} onClick={() => { setSearchInput(''); setFilters(EMPTY_FILTERS) }}>
              Clear
            </Button>
          )}
        </Space>
      </Card>

      {/* Message */}
      <Card size="small" title={<span style={{ fontSize: 13 }}>Message</span>}
        style={{ marginTop: 12, borderRadius: 12, borderColor: C.border }}>
        <Input.TextArea
          rows={9} value={messageText} onChange={e => setMessageText(e.target.value)}
          style={{ fontSize: 12, fontFamily: 'inherit' }}
        />
        <div style={{ marginTop: 6, fontSize: 11, color: C.muted }}>
          Placeholders: <Text code>{'{name}'}</Text> <Text code>{'{regNo}'}</Text>{' '}
          <Text code>{'{password}'}</Text> <Text code>{'{fatherName}'}</Text>{' '}
          <Text code>{'{program}'}</Text> <Text code>{'{village}'}</Text>{' '}
          <Text code>{'{appLink}'}</Text> <Text code>{'{supportPhone}'}</Text>{' '}
          <Text code>{'{trustName}'}</Text> <Text code>{'{trustShortName}'}</Text>
          <div style={{ marginTop: 4 }}>
            <Text style={{ fontSize: 10, color: C.light }}>
              {'{appLink}'} inserts the Play Store link:{' '}
              <Text code style={{ fontSize: 10 }}>{trust.appLink || '—'}</Text>
              {' '}· trust name, link and support phone come from Settings → Trust Details
            </Text>
          </div>
        </div>
      </Card>

      {/* Actions */}
      <Card size="small" style={{ marginTop: 12, borderRadius: 12, borderColor: C.border }} bodyStyle={{ padding: 12 }}>
        <Space wrap>
          <Button
            type="primary" icon={<EyeOutlined />} loading={loading} disabled={sending}
            onClick={() => run({ dryRun: true })}
            style={{ background: `linear-gradient(135deg, ${C.primary}, var(--secondary))`, border: 'none' }}
          >
            Preview recipients
          </Button>
          <Button
            icon={<SendOutlined />} loading={sending}
            disabled={loading || !counts || !(counts.willSend > 0)}
            onClick={confirmSend}
            style={{ background: C.wa, borderColor: C.wa, color: '#fff' }}
          >
            Send {counts?.willSend ? `(${counts.willSend})` : ''}
          </Button>
          {sending && (
            <Button danger icon={<StopOutlined />} onClick={() => { stopRef.current = true }}>Stop</Button>
          )}
          <Button icon={<DownloadOutlined />} disabled={!results.length} onClick={downloadCsv}>CSV</Button>
        </Space>
        {(loading || sending) && (
          <Progress percent={progress} status="active" strokeColor={C.primary} style={{ marginTop: 10 }} />
        )}
      </Card>

      {counts && (
        <Row gutter={[10, 10]} style={{ marginTop: 12 }}>
          {[
            { t: applied ? 'Sent' : 'Can be reached', v: applied ? counts.sent || 0 : counts.willSend || 0, c: C.success },
            { t: 'Cannot reach',  v: counts.sessionClosed || 0, c: C.warning },
            { t: 'No phone',      v: counts.noPhone      || 0, c: C.muted },
            { t: 'No password',   v: counts.noPassword   || 0, c: C.warning },
            { t: 'Failed',        v: counts.failed       || 0, c: C.error },
          ].map(s => (
            <Col xs={12} md={4} key={s.t}>
              <Card size="small" style={{ borderRadius: 10, borderColor: C.border }} bodyStyle={{ padding: '8px 12px' }}>
                <Statistic title={<span style={{ fontSize: 10 }}>{s.t}</span>} value={s.v}
                  valueStyle={{ fontSize: 19, color: s.c, fontWeight: 700 }} />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {unreachable > 0 && !applied && (
        <Alert
          type="info" showIcon style={{ marginTop: 12, borderRadius: 10 }}
          message={<span style={{ fontSize: 12 }}>
            {unreachable} member(s) can't be reached with a normal message.
          </span>}
          description={<span style={{ fontSize: 11 }}>
            They haven't messaged the trust in the last 24 hours. Options: ask them to send any message
            on WhatsApp first, hand the details over in person, or get a Gupshup template approved for
            credentials — that removes the limit entirely.
          </span>}
        />
      )}

      {results.length > 0 && (
        <Card size="small" title={`Recipients (${results.length})`}
          style={{ marginTop: 12, borderRadius: 12, borderColor: C.border }} bodyStyle={{ padding: 0 }}>
          <Table
            columns={columns} dataSource={results}
            rowKey={r => r.memberId} size="small" scroll={{ x: 850 }}
            pagination={{ pageSize: 25, size: 'small', showSizeChanger: true, pageSizeOptions: ['25', '50', '100'] }}
          />
        </Card>
      )}

      {/* More filters */}
      <Drawer title="More Filters" open={filterOpen} onClose={() => setFilterOpen(false)} width={340}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <Text strong style={{ fontSize: 12 }}>Agent</Text>
            <Select style={{ width: '100%', marginTop: 6 }} showSearch optionFilterProp="label"
              value={filters.agentId} onChange={v => setFilters(f => ({ ...f, agentId: v }))}
              options={[{ label: 'All Agents', value: 'all' },
                ...agentList.filter(a => !a.delete_flag).map(a => ({ label: a.name, value: a.uid || a.id }))]} />
          </div>
          <div>
            <Text strong style={{ fontSize: 12 }}>Member Status</Text>
            <Select style={{ width: '100%', marginTop: 6 }}
              value={filters.status} onChange={v => setFilters(f => ({ ...f, status: v }))}
              options={[
                { label: 'Active only', value: 'active' },
                { label: 'All', value: 'all' },
                { label: 'Inactive', value: 'inactive' },
                { label: 'Closed', value: 'closed' },
              ]} />
          </div>
          <div>
            <Text strong style={{ fontSize: 12 }}>Join Date</Text>
            <RangePicker style={{ width: '100%', marginTop: 6 }} format="DD-MM-YYYY"
              value={filters.fromDate ? [dayjs(filters.fromDate), filters.toDate ? dayjs(filters.toDate) : null] : null}
              onChange={d => setFilters(f => ({
                ...f,
                fromDate: d?.[0] ? d[0].startOf('day').toISOString() : null,
                toDate:   d?.[1] ? d[1].endOf('day').toISOString()   : null,
              }))} />
          </div>
        </Space>
      </Drawer>
    </div>
  )
}

export default SendCredentialsPage
