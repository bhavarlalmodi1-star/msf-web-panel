'use client'
// Join Fees — Amount Correction
//
// A deliberately narrow screen: it finds members with the same filters as the
// members page, and lets a superadmin correct ONLY the join-fee figures.
//
// Total and Paid are typed; Pending is always rendered as total − paid and is
// never editable. Allowing all three to be typed is what lets a member end up
// with pending ≠ total − paid, which is the state that made the agent list and
// the agent detail page disagree.
//
// Saving goes through /api/members/edit-join-fees, which applies the change as
// deltas inside a transaction and cascades to agent / programStats / program /
// organizationStats, so this screen can never introduce the drift it exists to
// repair.

import { panelTheme } from '@/utils/trust/trustStore';
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useSelector } from 'react-redux'
import { useAuth } from '@/components/Base/AuthProvider'
import { useRouter } from 'next/navigation'
import {
  Table, Card, Button, Input, Select, DatePicker, Space, Typography, Tag,
  InputNumber, message, Drawer, Badge, Tooltip, Avatar, Empty, Result,
  Statistic, Row, Col, Modal, Alert, Popconfirm, Divider, Spin
} from 'antd'
import {
  SearchOutlined, FilterOutlined, UserOutlined, SaveOutlined,
  ReloadOutlined, HistoryOutlined, EditOutlined, CloseOutlined,
  CheckCircleOutlined, WarningOutlined, UndoOutlined, ClearOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { auth } from '../../../../lib/firbase-client'
import { fetchMembersPaginated, getTotalMembersCount } from '@/app/members/components/firebase-helpers'

const { Title, Text } = Typography
const { RangePicker } = DatePicker

const C = {
  get primary() { return panelTheme().primary; }, get secondary() { return panelTheme().secondary; }, success: '#16a34a',
  error: '#dc2626', warning: '#f59e0b', info: '#2563eb',
  get bg() { return panelTheme().background; }, surface: '#ffffff', get border() { return panelTheme().border; },
  text: '#3e1f1a', muted: '#6b7280', light: '#9ca3af',
}

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`

const EMPTY_FILTERS = {
  search: '', programIds: [], ageGroupIds: [], agentId: 'all',
  status: 'all', paymentStatus: 'all', gender: 'all',
  fromDate: null, toDate: null,
  sortField: 'createdAt', sortOrder: 'desc',
}

const JoinFeesEditPage = () => {
  const router      = useRouter()
  const { user }    = useAuth()
  const isSuperAdmin = user?.role === 'superadmin'
  const programList = useSelector(s => s.data.programList || [])
  const agentList   = useSelector(s => s.data.agentList   || [])

  const [members, setMembers]   = useState([])
  const [loading, setLoading]   = useState(false)
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [lastDocs, setLastDocs] = useState({})

  const [filters, setFilters]       = useState(EMPTY_FILTERS)
  const [searchInput, setSearchInput] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)

  // Pending edits, keyed by member id: { joinFees, paidAmount }
  const [edits, setEdits]     = useState({})
  const [saving, setSaving]   = useState({})
  const [savingAll, setSavingAll] = useState(false)

  const [historyOpen, setHistoryOpen]       = useState(false)
  const [historyRows, setHistoryRows]       = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyMember, setHistoryMember]   = useState(null)

  // ── Data ───────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (override = null, targetPage = 1) => {
    const f = override || filters
    setLoading(true)
    try {
      const res = await fetchMembersPaginated({
        ...f,
        pageSize,
        lastDoc: targetPage > 1 ? lastDocs[targetPage - 1] : null,
      })
      setMembers(res.members || [])
      if (res.lastDoc) setLastDocs(prev => ({ ...prev, [targetPage]: res.lastDoc }))
      const count = await getTotalMembersCount(f)
      setTotal(count || 0)
    } catch (e) {
      console.error(e)
      message.error('Failed to load members: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [filters, pageSize, lastDocs])

  useEffect(() => { if (isSuperAdmin) fetchData(filters, 1) }, [filters, pageSize])

  const applyFilters = (next) => {
    setPage(1); setLastDocs({}); setEdits({})
    setFilters(next)
  }

  const clearAll = () => {
    setSearchInput('')
    applyFilters({ ...EMPTY_FILTERS })
  }

  const activeFilterCount = useMemo(() => {
    let n = 0
    if (filters.search) n++
    if (filters.programIds?.length) n++
    if (filters.ageGroupIds?.length) n++
    if (filters.agentId !== 'all') n++
    if (filters.status !== 'all') n++
    if (filters.paymentStatus !== 'all') n++
    if (filters.gender !== 'all') n++
    if (filters.fromDate || filters.toDate) n++
    return n
  }, [filters])

  // Age groups available for the chosen yojna(s) — same rule as the members
  // page: group ids are scoped to a programme, so this only makes sense once a
  // programme is picked.
  const ageGroupOptions = useMemo(() => {
    const ids = filters.programIds || []
    if (!ids.length) return []
    const out = []
    ids.forEach(pid => {
      const prog = programList.find(p => p.id === pid)
      ;(prog?.ageGroups || []).forEach(ag => {
        out.push({
          value: ag.id,
          label: ids.length > 1 ? `${ag.ageGroupName} — ${prog?.name || ''}` : ag.ageGroupName,
        })
      })
    })
    return out
  }, [filters.programIds, programList])

  // ── Edit helpers ───────────────────────────────────────────────────────────
  const rowValues = (m) => {
    const e = edits[m.id]
    const jf   = e?.joinFees   ?? Number(m.joinFees   || 0)
    const paid = e?.paidAmount ?? Number(m.paidAmount || 0)
    return { jf, paid, pending: jf - paid }
  }

  const isDirty = (m) => {
    const e = edits[m.id]
    if (!e) return false
    return e.joinFees !== Number(m.joinFees || 0) || e.paidAmount !== Number(m.paidAmount || 0)
  }

  const setEdit = (m, key, value) => {
    setEdits(prev => {
      const cur = prev[m.id] || { joinFees: Number(m.joinFees || 0), paidAmount: Number(m.paidAmount || 0) }
      return { ...prev, [m.id]: { ...cur, [key]: Number(value ?? 0) } }
    })
  }

  const revertRow = (m) => setEdits(prev => { const n = { ...prev }; delete n[m.id]; return n })

  const dirtyRows = useMemo(
    () => members.filter(isDirty),
    [members, edits]
  )

  const invalidRows = useMemo(
    () => dirtyRows.filter(m => { const { jf, paid } = rowValues(m); return paid > jf || jf < 0 || paid < 0 }),
    [dirtyRows, edits]
  )

  // ── Save ───────────────────────────────────────────────────────────────────
  const saveRow = async (m, { silent = false } = {}) => {
    const { jf, paid } = rowValues(m)
    if (paid > jf) {
      if (!silent) message.error(`${m.displayName}: paid cannot exceed total`)
      return false
    }
    setSaving(prev => ({ ...prev, [m.id]: true }))
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch('/api/members/edit-join-fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ memberId: m.id, joinFees: jf, paidAmount: paid }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message)

      // Reflect the saved values locally so the row settles without a refetch
      setMembers(prev => prev.map(x => x.id === m.id
        ? { ...x, joinFees: jf, paidAmount: paid, pendingAmount: jf - paid,
            paymentPercentage: jf > 0 ? Math.round((paid / jf) * 100) : 0 }
        : x))
      revertRow(m)
      if (!silent) message.success(`${m.displayName} updated`)
      return true
    } catch (e) {
      if (!silent) message.error(`${m.displayName}: ${e.message}`)
      return false
    } finally {
      setSaving(prev => { const n = { ...prev }; delete n[m.id]; return n })
    }
  }

  const saveAll = async () => {
    if (invalidRows.length) {
      message.error(`${invalidRows.length} row(s) have paid greater than total — fix those first`)
      return
    }
    setSavingAll(true)
    let ok = 0, fail = 0
    // Sequential on purpose: each save is a transaction that increments the same
    // agent and organizationStats documents, and firing them in parallel just
    // makes those transactions retry against each other.
    for (const m of dirtyRows) {
      const done = await saveRow(m, { silent: true })
      done ? ok++ : fail++
    }
    setSavingAll(false)
    if (ok)   message.success(`${ok} member(s) updated`)
    if (fail) message.error(`${fail} member(s) failed`)
  }

  // ── History ────────────────────────────────────────────────────────────────
  const openHistory = async (m = null) => {
    setHistoryMember(m)
    setHistoryOpen(true)
    setHistoryLoading(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      const url = m ? `/api/members/edit-join-fees?memberId=${m.id}` : '/api/members/edit-join-fees?limit=100'
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      setHistoryRows(data.success ? data.data : [])
      if (!data.success) message.error(data.message)
    } catch (e) {
      message.error('Failed to load history')
    } finally {
      setHistoryLoading(false)
    }
  }

  // ── Guard ──────────────────────────────────────────────────────────────────
  if (user && !isSuperAdmin) {
    return (
      <div style={{ padding: 40, background: C.bg, minHeight: '100vh' }}>
        <Result
          status="403"
          title="Superadmin only"
          subTitle="This screen rewrites fee amounts directly, outside the payment trail, so it is limited to superadmin accounts."
          extra={<Button type="primary" onClick={() => router.push('/payments/join-fees')}>Back to Join Fees</Button>}
        />
      </div>
    )
  }

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns = [
    {
      title: 'Member', key: 'member', width: 240, fixed: 'left',
      render: (_, m) => (
        <Space size={8}>
          <Avatar src={m.photoURL} icon={!m.photoURL && <UserOutlined />} size={34}
            style={{ backgroundColor: C.primary, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <Text strong style={{ fontSize: 12, display: 'block' }}>{m.displayName}</Text>
            <Text style={{ fontSize: 10, color: C.light }}>
              {m.registrationNumber}{m.fatherName ? ` · ${m.fatherName}` : ''}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Yojna', key: 'program', width: 130,
      render: (_, m) => (
        <div>
          <Text style={{ fontSize: 11 }}>
            {m.programName || programList.find(p => p.id === m.programId)?.name || '—'}
          </Text>
          {m.ageGroupName && <div style={{ fontSize: 10, color: C.light }}>{m.ageGroupName}</div>}
        </div>
      ),
    },
    {
      title: 'Agent', key: 'agent', width: 120,
      render: (_, m) => (
        <Text style={{ fontSize: 11, color: C.muted }}>
          {agentList.find(a => a.uid === m.agentId || a.id === m.agentId)?.name || '—'}
        </Text>
      ),
    },
    {
      title: 'Total Join Fees', key: 'total', width: 140, align: 'right',
      render: (_, m) => {
        const { jf } = rowValues(m)
        const changed = isDirty(m) && jf !== Number(m.joinFees || 0)
        return (
          <div>
            <InputNumber
              size="small" min={0} precision={0} value={jf}
              onChange={v => setEdit(m, 'joinFees', v)}
              style={{ width: '100%', borderColor: changed ? C.warning : undefined }}
              formatter={v => v ? `₹${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
              parser={v => v.replace(/[^\d]/g, '')}
            />
            {changed && <div style={{ fontSize: 9, color: C.light }}>was {inr(m.joinFees)}</div>}
          </div>
        )
      },
    },
    {
      title: 'Paid', key: 'paid', width: 140, align: 'right',
      render: (_, m) => {
        const { jf, paid } = rowValues(m)
        const changed = isDirty(m) && paid !== Number(m.paidAmount || 0)
        const over = paid > jf
        return (
          <div>
            <InputNumber
              size="small" min={0} precision={0} value={paid}
              onChange={v => setEdit(m, 'paidAmount', v)}
              status={over ? 'error' : undefined}
              style={{ width: '100%', borderColor: over ? C.error : changed ? C.warning : undefined }}
              formatter={v => v ? `₹${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
              parser={v => v.replace(/[^\d]/g, '')}
            />
            {over
              ? <div style={{ fontSize: 9, color: C.error }}>exceeds total</div>
              : changed && <div style={{ fontSize: 9, color: C.light }}>was {inr(m.paidAmount)}</div>}
          </div>
        )
      },
    },
    {
      // Derived, never typed — see the file header for why.
      title: <Tooltip title="Always total − paid. Not editable.">Pending<sup style={{ fontSize: 8 }}> auto</sup></Tooltip>,
      key: 'pending', width: 110, align: 'right',
      render: (_, m) => {
        const { pending } = rowValues(m)
        const was = Math.max(0, Number(m.joinFees || 0) - Number(m.paidAmount || 0))
        return (
          <div>
            <Text strong style={{ fontSize: 12, color: pending > 0 ? C.error : C.success }}>
              {inr(Math.max(0, pending))}
            </Text>
            {isDirty(m) && pending !== was && (
              <div style={{ fontSize: 9, color: C.light }}>was {inr(was)}</div>
            )}
          </div>
        )
      },
    },
    {
      title: '%', key: 'pct', width: 60, align: 'center',
      render: (_, m) => {
        const { jf, paid } = rowValues(m)
        const pct = jf > 0 ? Math.round((paid / jf) * 100) : 0
        return <Tag color={pct === 100 ? 'success' : pct > 0 ? 'warning' : 'default'} style={{ fontSize: 10, margin: 0 }}>{pct}%</Tag>
      },
    },
    {
      title: 'Action', key: 'action', width: 120, fixed: 'right', align: 'center',
      render: (_, m) => {
        const dirty = isDirty(m)
        const { jf, paid } = rowValues(m)
        return (
          <Space size={4}>
            <Popconfirm
              title="Save this change?"
              description={<span style={{ fontSize: 12 }}>{m.displayName}<br />Total {inr(m.joinFees)} → <b>{inr(jf)}</b><br />Paid {inr(m.paidAmount)} → <b>{inr(paid)}</b></span>}
              onConfirm={() => saveRow(m)}
              okText="Save" cancelText="Cancel"
              disabled={!dirty || paid > jf}
            >
              <Button
                type="primary" size="small" icon={<SaveOutlined />}
                disabled={!dirty || paid > jf}
                loading={!!saving[m.id]}
                style={dirty && paid <= jf ? { background: C.success, border: 'none' } : undefined}
              />
            </Popconfirm>
            <Tooltip title="Undo">
              <Button size="small" icon={<UndoOutlined />} disabled={!dirty} onClick={() => revertRow(m)} />
            </Tooltip>
            <Tooltip title="Edit history">
              <Button size="small" icon={<HistoryOutlined />} onClick={() => openHistory(m)} style={{ color: C.info }} />
            </Tooltip>
          </Space>
        )
      },
    },
  ]

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 20, background: C.bg, minHeight: '100vh' }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0, background: `linear-gradient(135deg, ${C.primary}, ${C.secondary})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Join Fees — Amount Correction
          </Title>
          <Text type="secondary">Fix a member's total and paid amounts. Pending recalculates automatically.</Text>
        </div>
        <Space>
          <Button icon={<HistoryOutlined />} onClick={() => openHistory(null)}>All Edits</Button>
          <Button icon={<ReloadOutlined />} onClick={() => fetchData(filters, page)} loading={loading}>Refresh</Button>
          <Button onClick={() => router.push('/payments/join-fees')}>Join Fees</Button>
        </Space>
      </div>

      <Alert
        type="info" showIcon style={{ marginBottom: 14, borderRadius: 10 }}
        message={<span style={{ fontSize: 12 }}>This screen writes amounts directly — no payment record is created. Use it to correct wrong figures, not to record a real payment.</span>}
        description={<span style={{ fontSize: 11 }}>Every change updates the member, their agent's totals and the organisation totals together, and is recorded in the edit history.</span>}
      />

      {/* Search & filter bar */}
      <Card size="small" style={{ marginBottom: 12, borderRadius: 12, borderColor: C.border }} bodyStyle={{ padding: 12 }}>
        <Space wrap size={10}>
          <Input.Search
            placeholder="Search name, reg no, phone..."
            allowClear enterButton={<SearchOutlined />}
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onSearch={v => applyFilters({ ...filters, search: v.trim() })}
            style={{ width: 280 }}
          />
          <Select
            mode="multiple" allowClear placeholder="Yojna" style={{ minWidth: 200 }}
            value={filters.programIds} maxTagCount="responsive"
            onChange={v => applyFilters({ ...filters, programIds: v, ageGroupIds: [] })}
            options={programList.map(p => ({ label: p.name, value: p.id }))}
            optionFilterProp="label" showSearch
          />
          <Select
            mode="multiple" allowClear style={{ minWidth: 180 }}
            placeholder={filters.programIds?.length ? 'Age group' : 'Age group (pick yojna)'}
            disabled={!filters.programIds?.length}
            value={filters.ageGroupIds} maxTagCount="responsive"
            onChange={v => applyFilters({ ...filters, ageGroupIds: v })}
            options={ageGroupOptions} optionFilterProp="label" showSearch
          />
          <Button icon={<FilterOutlined />} onClick={() => setFilterOpen(true)}>
            More {activeFilterCount > 0 && <Badge count={activeFilterCount} size="small" style={{ backgroundColor: C.primary }} />}
          </Button>
          {activeFilterCount > 0 && (
            <Button icon={<ClearOutlined />} onClick={clearAll} style={{ color: C.primary, borderColor: C.border }}>Clear all</Button>
          )}
          <Text style={{ fontSize: 12, color: C.light }}>{total} members</Text>
        </Space>
      </Card>

      {/* Unsaved-changes bar */}
      {dirtyRows.length > 0 && (
        <Card
          size="small"
          style={{ marginBottom: 12, borderRadius: 12, borderColor: C.warning, background: '#fffbeb' }}
          bodyStyle={{ padding: '10px 14px' }}
        >
          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space>
              <WarningOutlined style={{ color: C.warning }} />
              <Text style={{ fontSize: 12 }}>
                <b>{dirtyRows.length}</b> unsaved change{dirtyRows.length !== 1 ? 's' : ''}
                {invalidRows.length > 0 && (
                  <Text style={{ fontSize: 12, color: C.error }}> · {invalidRows.length} invalid (paid &gt; total)</Text>
                )}
              </Text>
            </Space>
            <Space>
              <Button size="small" icon={<UndoOutlined />} onClick={() => setEdits({})}>Undo all</Button>
              <Popconfirm
                title={`Save ${dirtyRows.length} change(s)?`}
                description="Member, agent and organisation totals all update together."
                onConfirm={saveAll}
                okText="Save all" cancelText="Cancel"
                disabled={invalidRows.length > 0}
              >
                <Button
                  size="small" type="primary" icon={<SaveOutlined />}
                  loading={savingAll} disabled={invalidRows.length > 0}
                  style={{ background: C.success, border: 'none' }}
                >
                  Save all
                </Button>
              </Popconfirm>
            </Space>
          </Space>
        </Card>
      )}

      <Card size="small" style={{ borderRadius: 12, borderColor: C.border }} bodyStyle={{ padding: 0 }}>
        <Table
          columns={columns}
          dataSource={members}
          rowKey="id"
          loading={loading}
          size="small"
          scroll={{ x: 1100 }}
          rowClassName={m => isDirty(m) ? 'jf-dirty' : ''}
          pagination={{
            current: page, pageSize, total,
            showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: (t, r) => `${r[0]}-${r[1]} of ${t}`,
            onChange: (p, ps) => {
              if (ps !== pageSize) { setPageSize(ps); setPage(1); setLastDocs({}); return }
              setPage(p); fetchData(filters, p)
            },
          }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No members match these filters" style={{ margin: '24px 0' }} /> }}
        />
      </Card>

      <style jsx global>{`
        .jf-dirty td { background: #fffbeb !important; }
      `}</style>

      {/* More filters */}
      <Drawer
        title="More Filters" open={filterOpen} onClose={() => setFilterOpen(false)} width={360}
        extra={<Button size="small" onClick={clearAll}>Clear all</Button>}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <Text strong style={{ fontSize: 12 }}>Agent</Text>
            <Select
              style={{ width: '100%', marginTop: 6 }} showSearch optionFilterProp="label"
              value={filters.agentId} onChange={v => applyFilters({ ...filters, agentId: v })}
              options={[{ label: 'All Agents', value: 'all' },
                ...agentList.filter(a => !a.delete_flag).map(a => ({ label: a.name, value: a.uid || a.id }))]}
            />
          </div>
          <div>
            <Text strong style={{ fontSize: 12 }}>Member Status</Text>
            <Select
              style={{ width: '100%', marginTop: 6 }}
              value={filters.status} onChange={v => applyFilters({ ...filters, status: v })}
              options={[
                { label: 'All', value: 'all' },
                { label: 'Active', value: 'active' },
                { label: 'Inactive', value: 'inactive' },
                { label: 'Closed', value: 'closed' },
              ]}
            />
          </div>
          <div>
            <Text strong style={{ fontSize: 12 }}>Payment Status</Text>
            <Select
              style={{ width: '100%', marginTop: 6 }}
              value={filters.paymentStatus} onChange={v => applyFilters({ ...filters, paymentStatus: v })}
              options={[
                { label: 'All', value: 'all' },
                { label: 'Fully Paid (100%)', value: 'paid' },
                { label: 'Nothing Paid (0%)', value: 'pending' },
                { label: 'Partially Paid', value: 'partial' },
              ]}
            />
          </div>
          <div>
            <Text strong style={{ fontSize: 12 }}>Gender</Text>
            <Select
              style={{ width: '100%', marginTop: 6 }}
              value={filters.gender} onChange={v => applyFilters({ ...filters, gender: v })}
              options={[
                { label: 'All', value: 'all' },
                { label: 'Male', value: 'male' },
                { label: 'Female', value: 'female' },
              ]}
            />
          </div>
          <div>
            <Text strong style={{ fontSize: 12 }}>Join Date</Text>
            <RangePicker
              style={{ width: '100%', marginTop: 6 }} format="DD-MM-YYYY"
              value={filters.fromDate ? [dayjs(filters.fromDate), filters.toDate ? dayjs(filters.toDate) : null] : null}
              onChange={(d) => applyFilters({
                ...filters,
                fromDate: d?.[0] ? d[0].startOf('day').toISOString() : null,
                toDate:   d?.[1] ? d[1].endOf('day').toISOString()   : null,
              })}
            />
            <Text style={{ fontSize: 10, color: C.light }}>Filters on join date, not the date the record was created.</Text>
          </div>
        </Space>
      </Drawer>

      {/* Edit history */}
      <Drawer
        title={historyMember ? `Edit history — ${historyMember.displayName}` : 'Join fee edits — all members'}
        open={historyOpen} onClose={() => setHistoryOpen(false)} width={560}
      >
        {historyLoading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
        ) : historyRows.length === 0 ? (
          <Empty description="No edits recorded yet" />
        ) : (
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            {historyRows.map(h => (
              <Card key={h.id} size="small" style={{ borderRadius: 10, borderColor: C.border }} bodyStyle={{ padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <Text strong style={{ fontSize: 12 }}>{h.memberName} <Text style={{ fontSize: 10, color: C.light }}>{h.registrationNumber}</Text></Text>
                  <Text style={{ fontSize: 10, color: C.light }}>
                    {h.createdAt ? dayjs(h.createdAt).format('DD-MM-YYYY HH:mm') : ''}
                  </Text>
                </div>
                <Divider style={{ margin: '8px 0' }} />
                <Row gutter={8}>
                  {[
                    ['Total',   h.before?.joinFees,      h.after?.joinFees],
                    ['Paid',    h.before?.paidAmount,    h.after?.paidAmount],
                    ['Pending', h.before?.pendingAmount, h.after?.pendingAmount],
                  ].map(([label, before, after]) => (
                    <Col span={8} key={label}>
                      <Text style={{ fontSize: 10, color: C.light, display: 'block' }}>{label}</Text>
                      <Text style={{ fontSize: 11 }}>
                        <Text delete style={{ fontSize: 11, color: C.light }}>{inr(before)}</Text>{' → '}
                        <Text strong style={{ fontSize: 11, color: before === after ? C.muted : C.primary }}>{inr(after)}</Text>
                      </Text>
                    </Col>
                  ))}
                </Row>
                {h.note && <div style={{ marginTop: 6, fontSize: 11, color: C.muted }}>Note: {h.note}</div>}
              </Card>
            ))}
          </Space>
        )}
      </Drawer>
    </div>
  )
}

export default JoinFeesEditPage
