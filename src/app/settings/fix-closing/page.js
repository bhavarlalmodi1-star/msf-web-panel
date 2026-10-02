'use client'
// Closing System Check
//
// Finds members whose closing figures contradict themselves — the "count 2,
// total ₹400, pending ₹600" case — and repairs them.
//
// Always preview first. Two repair levels:
//   Safe        recompute totals/counts/status from the events already charged.
//               No event is added or removed; nobody's bill changes membership.
//   + Remove    additionally delete duplicate events, events dated after the
//               member's own closing, and events before they joined. This LOWERS
//               what people owe, so it is off by default and confirmed separately.

import { panelTheme } from '@/utils/trust/trustStore';
import React, { useState, useMemo } from 'react'
import { useSelector } from 'react-redux'
import { useAuth } from '@/components/Base/AuthProvider'
import {
  Card, Button, Select, Typography, Space, Progress, Table, Tag, Alert, Result,
  Statistic, Row, Col, Switch, message, Tooltip, Modal, Empty, Divider
} from 'antd'
import {
  PlayCircleOutlined, DownloadOutlined, WarningOutlined, CheckCircleOutlined,
  ReloadOutlined, SafetyCertificateOutlined, ThunderboltOutlined, StopOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { auth } from '../../../../lib/firbase-client'

const { Title, Text, Paragraph } = Typography

const C = {
  get primary() { return panelTheme().primary; }, success: '#16a34a', error: '#dc2626',
  warning: '#f59e0b', info: '#2563eb', get border() { return panelTheme().border; },
  muted: '#6b7280', light: '#9ca3af', get bg() { return panelTheme().background; },
}

const inr = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`

// Human wording for each machine code the API returns
const ISSUE_INFO = {
  DOC_COUNT:      { label: 'Group count wrong',      color: 'orange',  hint: "The group's event count doesn't match the events listed on it." },
  DOC_TOTAL:      { label: 'Group total wrong',      color: 'orange',  hint: 'Total ≠ event count × per-closing amount.' },
  DOC_PENDING:    { label: 'Group pending wrong',    color: 'orange',  hint: 'Pending ≠ total − paid on the group.' },
  DOC_STATUS:     { label: 'Group status wrong',     color: 'default', hint: 'Marked paid/partial/pending inconsistently with its amounts.' },
  MEMBER_TOTAL:   { label: 'Member total wrong',     color: 'red',     hint: "Member's total doesn't match the sum of their groups." },
  MEMBER_PAID:    { label: 'Member paid wrong',      color: 'red',     hint: "Member's paid doesn't match the sum of their groups." },
  MEMBER_PENDING: { label: 'Member pending wrong',   color: 'red',     hint: 'Pending ≠ total − paid. This is the “total 400 but pending 600” case.' },
  MEMBER_COUNT:   { label: 'Member count wrong',     color: 'red',     hint: "Member's event count doesn't match their groups." },
  DUP_EVENT:      { label: 'Duplicate event',        color: 'magenta', hint: 'The same closing charged twice on one group.' },
  AFTER_CLOSED:   { label: 'Event after closing',    color: 'volcano', hint: 'Charged for a closing that happened after this member was closed.' },
  BEFORE_JOIN:    { label: 'Event before joining',   color: 'volcano', hint: 'Charged for a closing that happened before they joined.' },
  OVERPAID:       { label: 'Paid exceeds total',     color: 'purple',  hint: 'More money is recorded as paid than the group can owe — check before changing.' },
}

const DESTRUCTIVE = ['DUP_EVENT', 'AFTER_CLOSED', 'BEFORE_JOIN']

const FixClosingPage = () => {
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'superadmin'
  const programList = useSelector(s => s.data.programList || [])

  const [programId, setProgramId] = useState('all')
  const [removeEvents, setRemoveEvents] = useState(false)
  const [running, setRunning] = useState(false)
  const [applying, setApplying] = useState(false)
  const [stats, setStats] = useState(null)
  const [rows, setRows] = useState([])
  const [progress, setProgress] = useState(0)

  const run = async ({ dryRun }) => {
    dryRun ? setRunning(true) : setApplying(true)
    setRows([]); setProgress(0)
    const agg = { scanned: 0, considered: 0, clean: 0, skipped: 0, fixed: 0, issueCounts: {} }
    const all = []
    let cursor = null
    let guard = 0

    try {
      const token = await auth.currentUser?.getIdToken()
      do {
        const res = await fetch('/api/closing/audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            programId, cursor, dryRun,
            removeInvalidEvents: removeEvents,
            batchSize: 200,
          }),
        })
        const data = await res.json()
        if (!data.success) throw new Error(data.message)

        agg.scanned    += data.scanned
        agg.considered += data.considered
        agg.clean      += data.clean
        agg.skipped    += data.skipped
        agg.fixed      += data.fixed
        Object.entries(data.issueCounts || {}).forEach(([k, v]) => {
          agg.issueCounts[k] = (agg.issueCounts[k] || 0) + v
        })
        all.push(...(data.rows || []))

        setStats({ ...agg })
        setRows([...all])
        setProgress(agg.scanned)

        cursor = data.nextCursor
        guard++
      } while (cursor && guard < 500)

      message.success(
        dryRun
          ? `Preview complete — ${all.length} member(s) need repair`
          : `Repaired ${agg.fixed} member(s)`
      )
    } catch (e) {
      message.error((dryRun ? 'Check' : 'Repair') + ' failed: ' + e.message)
    } finally {
      setRunning(false); setApplying(false)
    }
  }

  const confirmApply = () => {
    const destructiveCount = DESTRUCTIVE.reduce((s, k) => s + (stats?.issueCounts?.[k] || 0), 0)
    Modal.confirm({
      title: 'Apply repairs?',
      width: 560,
      icon: <WarningOutlined style={{ color: C.warning }} />,
      content: (
        <div>
          <p><b>{rows.length}</b> member(s) will be updated.</p>
          {removeEvents ? (
            <Alert
              type="error" showIcon style={{ marginTop: 8 }}
              message="Event removal is ON"
              description={`${destructiveCount} bad event charge(s) will be deleted. This reduces what those members owe. Make sure the preview below looks right.`}
            />
          ) : (
            <Alert
              type="info" showIcon style={{ marginTop: 8 }}
              message="Safe mode — totals only"
              description="Counts, totals, pending and status are recomputed from the events already charged. No event is added or removed."
            />
          )}
          <p style={{ marginTop: 10, fontSize: 12, color: C.muted }}>
            Afterwards, run <b>Sync Stats</b> on the Join Fees page so agent and organisation
            totals pick these corrections up.
          </p>
        </div>
      ),
      okText: removeEvents ? 'Yes, repair and remove events' : 'Yes, repair totals',
      okButtonProps: { danger: removeEvents },
      cancelText: 'Cancel',
      onOk: () => run({ dryRun: false }),
    })
  }

  const downloadCsv = () => {
    if (!rows.length) return
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const headers = [
      'Member ID', 'Reg No', 'Name', 'Father Name', 'Phone', 'Village', 'Program',
      'Closed', 'Closed On', 'Joined On', 'Pay Amount', 'Groups', 'Issues',
      'Total Before', 'Total After', 'Paid Before', 'Paid After',
      'Pending Before', 'Pending After', 'Count Before', 'Count After',
      'Events Removed', 'Overpaid',
    ]
    const body = rows.map(r => [
      q(r.memberId), q(r.regNo), q(r.name), q(r.fatherName), q(r.phone), q(r.village),
      q(r.programName || r.programId),
      q(r.memberClosed ? 'Yes' : 'No'), q(r.closedOn), q(r.joinedOn),
      r.payAmount, r.docCount,
      q(r.issues.map(i => ISSUE_INFO[i]?.label || i).join(' | ')),
      r.before.total, r.after.total,
      r.before.paid, r.after.paid,
      r.before.pending, r.after.pending,
      r.before.totalCount, r.after.totalCount,
      r.removedEvents, r.overpaid,
    ].join(','))

    const csv = [headers.map(q).join(','), ...body].join('\r\n')
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF])
    const blob = new Blob([bom, new TextEncoder().encode(csv)], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = window.URL.createObjectURL(blob)
    a.download = `closing-check_${dayjs().format('YYYY-MM-DD_HHmm')}.csv`
    a.click()
    window.URL.revokeObjectURL(a.href)
  }

  const moneyDelta = useMemo(() => {
    return rows.reduce((acc, r) => {
      acc.total   += r.after.total   - r.before.total
      acc.pending += r.after.pending - r.before.pending
      return acc
    }, { total: 0, pending: 0 })
  }, [rows])

  const hasDestructive = DESTRUCTIVE.some(k => (stats?.issueCounts?.[k] || 0) > 0)

  if (user && !isSuperAdmin) {
    return (
      <div style={{ padding: 40, background: C.bg, minHeight: '100vh' }}>
        <Result status="403" title="Superadmin only"
          subTitle="This tool rewrites closing amounts across many members." />
      </div>
    )
  }

  const columns = [
    {
      title: 'Member', key: 'm', width: 200, fixed: 'left',
      render: (_, r) => (
        <div>
          <Text strong style={{ fontSize: 12 }}>{r.name}</Text>
          <div style={{ fontSize: 10, color: C.light }}>
            {r.regNo}{r.programName ? ` · ${r.programName}` : ''}
          </div>
          {r.memberClosed && (
            <Tag color="purple" style={{ fontSize: 9, marginTop: 2 }}>
              Closed{r.closedOn ? ` ${dayjs(r.closedOn).format('DD-MM-YY')}` : ''}
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: 'Problem', dataIndex: 'issues', width: 230,
      render: (issues) => (
        <Space size={2} wrap>
          {issues.map(i => (
            <Tooltip key={i} title={ISSUE_INFO[i]?.hint || i}>
              <Tag color={ISSUE_INFO[i]?.color || 'default'} style={{ fontSize: 9, margin: 0 }}>
                {ISSUE_INFO[i]?.label || i}
              </Tag>
            </Tooltip>
          ))}
        </Space>
      ),
    },
    {
      title: 'Total', key: 'total', width: 130, align: 'right',
      render: (_, r) => r.before.total === r.after.total
        ? <Text style={{ fontSize: 11, color: C.muted }}>{inr(r.after.total)}</Text>
        : <span style={{ fontSize: 11 }}>
            <Text delete style={{ fontSize: 11, color: C.light }}>{inr(r.before.total)}</Text>
            {' → '}<Text strong style={{ fontSize: 11, color: C.primary }}>{inr(r.after.total)}</Text>
          </span>,
    },
    {
      title: 'Paid', key: 'paid', width: 130, align: 'right',
      render: (_, r) => r.before.paid === r.after.paid
        ? <Text style={{ fontSize: 11, color: C.muted }}>{inr(r.after.paid)}</Text>
        : <span style={{ fontSize: 11 }}>
            <Text delete style={{ fontSize: 11, color: C.light }}>{inr(r.before.paid)}</Text>
            {' → '}<Text strong style={{ fontSize: 11, color: C.primary }}>{inr(r.after.paid)}</Text>
          </span>,
    },
    {
      title: 'Pending', key: 'pending', width: 130, align: 'right',
      render: (_, r) => r.before.pending === r.after.pending
        ? <Text style={{ fontSize: 11, color: C.muted }}>{inr(r.after.pending)}</Text>
        : <span style={{ fontSize: 11 }}>
            <Text delete style={{ fontSize: 11, color: C.light }}>{inr(r.before.pending)}</Text>
            {' → '}<Text strong style={{ fontSize: 11, color: C.error }}>{inr(r.after.pending)}</Text>
          </span>,
    },
    {
      title: 'Events', key: 'count', width: 90, align: 'center',
      render: (_, r) => r.before.totalCount === r.after.totalCount
        ? <Text style={{ fontSize: 11, color: C.muted }}>{r.after.totalCount}</Text>
        : <span style={{ fontSize: 11 }}>
            <Text delete style={{ fontSize: 11, color: C.light }}>{r.before.totalCount}</Text>
            {' → '}<Text strong style={{ fontSize: 11 }}>{r.after.totalCount}</Text>
          </span>,
    },
  ]

  return (
    <div style={{ padding: 20, background: C.bg, minHeight: '100vh' }}>
      <Title level={3} style={{ marginBottom: 2 }}>Closing System Check</Title>
      <Text type="secondary">
        Finds members whose closing count, total and pending don't agree with each other, and repairs them.
      </Text>

      <Card size="small" style={{ marginTop: 14, borderRadius: 12, borderColor: C.border }}>
        <Space wrap size={14} align="end">
          <div>
            <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Yojna</Text>
            <Select
              style={{ width: 240 }} value={programId} onChange={setProgramId}
              showSearch optionFilterProp="label"
              disabled={running || applying}
              options={[{ label: 'All Yojna', value: 'all' },
                ...programList.map(p => ({ label: p.name, value: p.id }))]}
            />
          </div>

          <div>
            <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Also remove bad event charges{' '}
              <Tooltip title="Duplicates, closings dated after this member was closed, and closings before they joined. This lowers what members owe.">
                <WarningOutlined style={{ color: C.warning }} />
              </Tooltip>
            </Text>
            <Switch
              checked={removeEvents} onChange={setRemoveEvents}
              disabled={running || applying}
              checkedChildren="Remove" unCheckedChildren="Totals only"
            />
          </div>

          <Button
            type="primary" icon={<PlayCircleOutlined />}
            loading={running} disabled={applying}
            onClick={() => run({ dryRun: true })}
            style={{ background: `linear-gradient(135deg, ${C.primary}, var(--secondary))`, border: 'none' }}
          >
            Check (preview)
          </Button>

          <Button
            danger icon={<ThunderboltOutlined />}
            loading={applying} disabled={running || !rows.length}
            onClick={confirmApply}
          >
            Apply repairs
          </Button>

          <Button icon={<DownloadOutlined />} disabled={!rows.length} onClick={downloadCsv}>
            CSV
          </Button>
        </Space>

        {(running || applying) && (
          <div style={{ marginTop: 12 }}>
            <Progress percent={100} status="active" showInfo={false} strokeColor={C.primary} />
            <Text style={{ fontSize: 11, color: C.muted }}>
              Scanned {progress} members… {rows.length} with problems so far
            </Text>
          </div>
        )}
      </Card>

      {stats && (
        <>
          <Row gutter={[10, 10]} style={{ marginTop: 14 }}>
            {[
              { t: 'Scanned',      v: stats.scanned,    c: C.muted },
              { t: 'With closing', v: stats.considered, c: C.info },
              { t: 'Already fine', v: stats.clean,      c: C.success },
              { t: 'Need repair',  v: rows.length,      c: rows.length ? C.error : C.success },
              { t: 'Repaired',     v: stats.fixed,      c: C.primary },
            ].map(s => (
              <Col xs={12} md={4} key={s.t}>
                <Card size="small" style={{ borderRadius: 10, borderColor: C.border }} bodyStyle={{ padding: '10px 14px' }}>
                  <Statistic title={<span style={{ fontSize: 11 }}>{s.t}</span>}
                    value={s.v} valueStyle={{ fontSize: 20, color: s.c, fontWeight: 700 }} />
                </Card>
              </Col>
            ))}
            <Col xs={24} md={4}>
              <Card size="small" style={{ borderRadius: 10, borderColor: C.border }} bodyStyle={{ padding: '10px 14px' }}>
                <Text style={{ fontSize: 11, color: C.muted, display: 'block' }}>Pending change</Text>
                <Text strong style={{ fontSize: 18, color: moneyDelta.pending < 0 ? C.success : C.error }}>
                  {moneyDelta.pending > 0 ? '+' : ''}{inr(moneyDelta.pending)}
                </Text>
              </Card>
            </Col>
          </Row>

          {Object.keys(stats.issueCounts).length > 0 && (
            <Card size="small" title="What was found" style={{ marginTop: 12, borderRadius: 12, borderColor: C.border }}>
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                {Object.entries(stats.issueCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([code, count]) => (
                    <div key={code} style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <Tag color={ISSUE_INFO[code]?.color || 'default'} style={{ minWidth: 150, margin: 0 }}>
                        {ISSUE_INFO[code]?.label || code}
                      </Tag>
                      <Text strong style={{ fontSize: 13 }}>{count}</Text>
                      <Text style={{ fontSize: 11, color: C.muted }}>{ISSUE_INFO[code]?.hint}</Text>
                      {DESTRUCTIVE.includes(code) && !removeEvents && (
                        <Tag color="default" style={{ fontSize: 9 }}>needs “remove” mode</Tag>
                      )}
                    </div>
                  ))}
              </Space>
              {hasDestructive && !removeEvents && (
                <Alert
                  type="warning" showIcon style={{ marginTop: 10, borderRadius: 8 }}
                  message={<span style={{ fontSize: 12 }}>Some problems are bad event charges, not just wrong totals.</span>}
                  description={<span style={{ fontSize: 11 }}>
                    Turn on <b>Also remove bad event charges</b> and re-run the preview to see what removing them would do.
                    Totals-only repair will leave those charges in place.
                  </span>}
                />
              )}
            </Card>
          )}
        </>
      )}

      {rows.length > 0 && (
        <Card
          size="small"
          title={`Members needing repair (${rows.length})`}
          style={{ marginTop: 12, borderRadius: 12, borderColor: C.border }}
          bodyStyle={{ padding: 0 }}
        >
          <Table
            columns={columns}
            dataSource={rows.slice(0, 300)}
            rowKey="memberId"
            size="small"
            scroll={{ x: 950 }}
            pagination={{ pageSize: 25, size: 'small', showSizeChanger: false }}
            expandable={{
              expandedRowRender: (r) => (
                <div style={{ padding: '4px 8px' }}>
                  {r.groups.length === 0
                    ? <Text style={{ fontSize: 11, color: C.muted }}>Only the member's own totals were wrong — no group needed changing.</Text>
                    : r.groups.map((g, i) => (
                      <div key={i} style={{ marginBottom: 8 }}>
                        <Text strong style={{ fontSize: 11 }}>{g.groupName}</Text>
                        <div style={{ fontSize: 11, color: C.muted }}>
                          events {g.before.count} → <b>{g.after.count}</b> ·
                          total {inr(g.before.total)} → <b>{inr(g.after.total)}</b> ·
                          pending {inr(g.before.pending)} → <b>{inr(g.after.pending)}</b> ·
                          status {g.before.status || '—'} → <b>{g.after.status}</b>
                        </div>
                        {g.dropped?.length > 0 && (
                          <div style={{ fontSize: 10, color: C.error, marginTop: 2 }}>
                            removing: {g.dropped.map((d, j) => (
                              <Tag key={j} color="volcano" style={{ fontSize: 9, margin: '0 3px 3px 0' }}>
                                {ISSUE_INFO[d.reason]?.label || d.reason}
                                {d.name ? ` — ${d.name}` : ''}{d.date ? ` (${dayjs(d.date).format('DD-MM-YY')})` : ''}
                              </Tag>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              ),
            }}
          />
          {rows.length > 300 && (
            <div style={{ padding: 10, textAlign: 'center' }}>
              <Text style={{ fontSize: 11, color: C.muted }}>
                Showing first 300. The CSV contains all {rows.length}.
              </Text>
            </div>
          )}
        </Card>
      )}

      {stats && rows.length === 0 && !running && (
        <Card size="small" style={{ marginTop: 12, borderRadius: 12, borderColor: C.border }}>
          <Result
            status="success"
            icon={<CheckCircleOutlined style={{ color: C.success }} />}
            title="No problems found"
            subTitle={`${stats.considered} member(s) with closing data all add up correctly.`}
          />
        </Card>
      )}
    </div>
  )
}

export default FixClosingPage
