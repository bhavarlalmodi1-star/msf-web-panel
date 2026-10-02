'use client'
// Agent Amount Correction
//
// Fixes an agent's join-fee and closing totals when they have drifted from the
// members underneath.
//
// Amounts are edited PER YOJNA. The agent's overall totals are the sum of the
// rows and are shown read-only — typing a top-level total while the per-yojna
// breakdown kept its old values is what makes the agent row and the expanded
// rows on the payment pages disagree.
//
// Paid is typed; Pending is always total − paid.
//
// Each row also shows what the member documents actually add up to, so the
// mismatch is visible before anything is typed, and "Use" copies that figure in.
// Recalculate does the whole agent from members in one go and is the right
// action in nearly every case — manual typing is the fallback for when the
// member data itself is known to be wrong.

import { panelTheme } from '@/utils/trust/trustStore';
import React, { useState, useEffect, useMemo } from 'react'
import {
  Drawer, Table, Button, InputNumber, Space, Typography, Tag, Alert, Spin,
  message, Popconfirm, Row, Col, Card, Empty, Divider, Tooltip, Input, Segmented
} from 'antd'
import {
  SaveOutlined, ReloadOutlined, UndoOutlined, WarningOutlined,
  CheckCircleOutlined, HistoryOutlined, ThunderboltOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { auth } from '../../../../lib/firbase-client'

const { Text, Title } = Typography

const C = {
  get primary() { return panelTheme().primary; }, success: '#16a34a', error: '#dc2626',
  warning: '#f59e0b', info: '#2563eb', get border() { return panelTheme().border; },
  muted: '#6b7280', light: '#9ca3af',
}

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`

const AgentStatsEditDrawer = ({ open, onClose, agent, onSaved }) => {
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [recalcing, setRecalcing] = useState(false)
  const [data, setData]         = useState(null)
  const [edits, setEdits]       = useState({})   // { [programId]: {jfTotal, jfPaid, cTotal, cPaid} }
  const [note, setNote]         = useState('')
  const [mode, setMode]         = useState('joinFees')
  const [showHistory, setShowHistory] = useState(false)

  const agentId = agent?.uid || agent?.id

  const load = async () => {
    if (!agentId) return
    setLoading(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch(`/api/agents/edit-stats?agentId=${agentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)
      setData(json.data)
      setEdits({})
      setNote('')
    } catch (e) {
      message.error('Failed to load agent totals: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (open && agentId) load() }, [open, agentId])

  // ── Row values ─────────────────────────────────────────────────────────────
  const valuesFor = (row) => {
    const e = edits[row.programId] || {}
    return {
      jfTotal: e.jfTotal ?? row.stored.totalJoinFees,
      jfPaid:  e.jfPaid  ?? row.stored.totalJoinFeesPaid,
      cTotal:  e.cTotal  ?? row.stored.totalClosingAmount,
      cPaid:   e.cPaid   ?? row.stored.totalClosingPaidAmount,
    }
  }

  const rowDirty = (row) => {
    const v = valuesFor(row)
    return v.jfTotal !== row.stored.totalJoinFees
        || v.jfPaid  !== row.stored.totalJoinFeesPaid
        || v.cTotal  !== row.stored.totalClosingAmount
        || v.cPaid   !== row.stored.totalClosingPaidAmount
  }

  const setVal = (row, key, val) => {
    setEdits(prev => ({
      ...prev,
      [row.programId]: { ...valuesFor(row), ...prev[row.programId], [key]: Math.max(0, Math.round(Number(val || 0))) },
    }))
  }

  const useDerived = (row) => {
    setEdits(prev => ({
      ...prev,
      [row.programId]: {
        jfTotal: row.derived.totalJoinFees,
        jfPaid:  row.derived.totalJoinFeesPaid,
        cTotal:  row.derived.totalClosingAmount,
        cPaid:   row.derived.totalClosingPaidAmount,
      },
    }))
  }

  const useAllDerived = () => {
    const next = {}
    ;(data?.programs || []).forEach(r => {
      next[r.programId] = {
        jfTotal: r.derived.totalJoinFees,
        jfPaid:  r.derived.totalJoinFeesPaid,
        cTotal:  r.derived.totalClosingAmount,
        cPaid:   r.derived.totalClosingPaidAmount,
      }
    })
    setEdits(next)
  }

  const dirtyRows = useMemo(
    () => (data?.programs || []).filter(rowDirty),
    [data, edits]
  )

  const invalidRows = useMemo(
    () => (data?.programs || []).filter(r => {
      const v = valuesFor(r)
      return v.jfPaid > v.jfTotal || v.cPaid > v.cTotal
    }),
    [data, edits]
  )

  // Live totals = sum of every row as it currently stands on screen
  const liveTotals = useMemo(() => {
    const t = { jfTotal: 0, jfPaid: 0, cTotal: 0, cPaid: 0 }
    ;(data?.programs || []).forEach(r => {
      const v = valuesFor(r)
      t.jfTotal += v.jfTotal; t.jfPaid += v.jfPaid
      t.cTotal  += v.cTotal;  t.cPaid  += v.cPaid
    })
    return t
  }, [data, edits])

  // ── Actions ────────────────────────────────────────────────────────────────
  const save = async () => {
    if (invalidRows.length) { message.error('Some rows have paid greater than total'); return }
    setSaving(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch('/api/agents/edit-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          agentId,
          note,
          programs: (data?.programs || []).map(r => {
            const v = valuesFor(r)
            return {
              programId: r.programId,
              programName: r.programName,
              totalJoinFees: v.jfTotal,
              totalJoinFeesPaid: v.jfPaid,
              totalClosingAmount: v.cTotal,
              totalClosingPaidAmount: v.cPaid,
            }
          }),
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)
      message.success(json.unchanged ? 'No change' : 'Agent totals corrected')
      await load()
      onSaved?.()
    } catch (e) {
      message.error('Save failed: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const recalculate = async () => {
    setRecalcing(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch('/api/agents/recalculate-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ agentId }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)
      message.success('Rebuilt from member data')
      await load()
      onSaved?.()
    } catch (e) {
      message.error('Recalculate failed: ' + e.message)
    } finally {
      setRecalcing(false)
    }
  }

  // ── Mismatch summary ───────────────────────────────────────────────────────
  const drift = useMemo(() => {
    if (!data) return null
    const s = data.storedTotals, d = data.derivedTotals
    return {
      jfTotal:   s.totalJoinFees         - d.totalJoinFees,
      jfPaid:    s.totalJoinFeesPaid     - d.totalJoinFeesPaid,
      jfPending: s.totalJoinFeesPending  - d.totalJoinFeesPending,
      cTotal:    s.closing_totalAmount   - d.closing_totalAmount,
      cPaid:     s.closing_paidAmount    - d.closing_paidAmount,
      cPending:  s.closing_pendingAmount - d.closing_pendingAmount,
    }
  }, [data])

  const hasDrift = drift && Object.values(drift).some(v => v !== 0)

  // ── Columns ────────────────────────────────────────────────────────────────
  const isJF = mode === 'joinFees'

  const columns = [
    {
      title: 'Yojna', dataIndex: 'programName', width: 150,
      render: (t, r) => (
        <div>
          <Text strong style={{ fontSize: 12 }}>{t || r.programId}</Text>
          <div style={{ fontSize: 10, color: C.light }}>
            {r.stored.memberCount || r.derived.memberCount || 0} members
          </div>
        </div>
      ),
    },
    {
      title: 'Total', key: 'total', width: 130, align: 'right',
      render: (_, r) => {
        const v = valuesFor(r)
        const cur = isJF ? v.jfTotal : v.cTotal
        const was = isJF ? r.stored.totalJoinFees : r.stored.totalClosingAmount
        return (
          <div>
            <InputNumber
              size="small" min={0} precision={0} value={cur}
              onChange={x => setVal(r, isJF ? 'jfTotal' : 'cTotal', x)}
              style={{ width: '100%', borderColor: cur !== was ? C.warning : undefined }}
              formatter={x => x ? `₹${x}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
              parser={x => x.replace(/[^\d]/g, '')}
            />
            {cur !== was && <div style={{ fontSize: 9, color: C.light }}>was {inr(was)}</div>}
          </div>
        )
      },
    },
    {
      title: 'Paid', key: 'paid', width: 130, align: 'right',
      render: (_, r) => {
        const v = valuesFor(r)
        const cur = isJF ? v.jfPaid : v.cPaid
        const tot = isJF ? v.jfTotal : v.cTotal
        const was = isJF ? r.stored.totalJoinFeesPaid : r.stored.totalClosingPaidAmount
        const over = cur > tot
        return (
          <div>
            <InputNumber
              size="small" min={0} precision={0} value={cur}
              onChange={x => setVal(r, isJF ? 'jfPaid' : 'cPaid', x)}
              status={over ? 'error' : undefined}
              style={{ width: '100%', borderColor: over ? C.error : cur !== was ? C.warning : undefined }}
              formatter={x => x ? `₹${x}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
              parser={x => x.replace(/[^\d]/g, '')}
            />
            {over
              ? <div style={{ fontSize: 9, color: C.error }}>exceeds total</div>
              : cur !== was && <div style={{ fontSize: 9, color: C.light }}>was {inr(was)}</div>}
          </div>
        )
      },
    },
    {
      title: <Tooltip title="Always total − paid">Pending<sup style={{ fontSize: 8 }}> auto</sup></Tooltip>,
      key: 'pending', width: 100, align: 'right',
      render: (_, r) => {
        const v = valuesFor(r)
        const p = isJF ? v.jfTotal - v.jfPaid : v.cTotal - v.cPaid
        return <Text strong style={{ fontSize: 12, color: p > 0 ? C.error : C.success }}>{inr(Math.max(0, p))}</Text>
      },
    },
    {
      title: <Tooltip title="What this agent's member documents actually add up to">From members</Tooltip>,
      key: 'derived', width: 165, align: 'right',
      render: (_, r) => {
        const v = valuesFor(r)
        const dTot  = isJF ? r.derived.totalJoinFees     : r.derived.totalClosingAmount
        const dPaid = isJF ? r.derived.totalJoinFeesPaid : r.derived.totalClosingPaidAmount
        const match = v.jfTotal === r.derived.totalJoinFees && v.jfPaid === r.derived.totalJoinFeesPaid
                   && v.cTotal === r.derived.totalClosingAmount && v.cPaid === r.derived.totalClosingPaidAmount
        const same = (isJF ? v.jfTotal : v.cTotal) === dTot && (isJF ? v.jfPaid : v.cPaid) === dPaid
        return (
          <Space size={4}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: same ? C.success : C.warning }}>{inr(dTot)}</div>
              <div style={{ fontSize: 9, color: C.light }}>paid {inr(dPaid)}</div>
            </div>
            {same
              ? <CheckCircleOutlined style={{ color: C.success, fontSize: 12 }} />
              : <Tooltip title="Copy the member figures into this row">
                  <Button size="small" type="link" style={{ fontSize: 10, padding: 0 }} onClick={() => useDerived(r)}>Use</Button>
                </Tooltip>}
          </Space>
        )
      },
    },
    {
      title: '', key: 'undo', width: 40, align: 'center',
      render: (_, r) => (
        <Tooltip title="Undo this row">
          <Button
            size="small" type="text" icon={<UndoOutlined />} disabled={!rowDirty(r)}
            onClick={() => setEdits(prev => { const n = { ...prev }; delete n[r.programId]; return n })}
          />
        </Tooltip>
      ),
    },
  ]

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={980}
      title={
        <div>
          <Title level={5} style={{ margin: 0 }}>Correct Amounts — {agent?.name || 'Agent'}</Title>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Updates the agent record only. Member documents are not changed.
          </Text>
        </div>
      }
      extra={
        <Space>
          <Button size="small" icon={<HistoryOutlined />} onClick={() => setShowHistory(s => !s)}>
            History {data?.history?.length ? `(${data.history.length})` : ''}
          </Button>
          <Popconfirm
            title="Rebuild from member data?"
            description="Replaces every total for this agent with the sum of their members. This is exact and undoes any manual correction."
            onConfirm={recalculate}
            okText="Rebuild" cancelText="Cancel"
          >
            <Button size="small" icon={<ThunderboltOutlined />} loading={recalcing} style={{ color: C.info, borderColor: C.info }}>
              Recalculate
            </Button>
          </Popconfirm>
        </Space>
      }
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <Space size={4}>
            {dirtyRows.length > 0 && (
              <Tag color="warning" style={{ margin: 0 }}>{dirtyRows.length} row(s) changed</Tag>
            )}
            {invalidRows.length > 0 && (
              <Tag color="error" style={{ margin: 0 }}>{invalidRows.length} invalid</Tag>
            )}
          </Space>
          <Space>
            <Button onClick={() => setEdits({})} disabled={!dirtyRows.length} icon={<UndoOutlined />}>Undo all</Button>
            <Popconfirm
              title={`Save ${dirtyRows.length} change(s)?`}
              description="The agent's overall totals will be recomputed as the sum of every yojna row."
              onConfirm={save}
              okText="Save" cancelText="Cancel"
              disabled={!dirtyRows.length || !!invalidRows.length}
            >
              <Button
                type="primary" icon={<SaveOutlined />} loading={saving}
                disabled={!dirtyRows.length || !!invalidRows.length}
                style={{ background: C.success, border: 'none' }}
              >
                Save
              </Button>
            </Popconfirm>
          </Space>
        </div>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
      ) : !data ? (
        <Empty description="No data" />
      ) : (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>

          {hasDrift ? (
            <Alert
              type="warning" showIcon icon={<WarningOutlined />}
              style={{ borderRadius: 10 }}
              message={<span style={{ fontSize: 12 }}>This agent's stored totals don't match their members.</span>}
              description={
                <div style={{ fontSize: 11 }}>
                  <Row gutter={[12, 4]}>
                    {[
                      ['Join fees total',   data.storedTotals.totalJoinFees,         data.derivedTotals.totalJoinFees],
                      ['Join fees paid',    data.storedTotals.totalJoinFeesPaid,     data.derivedTotals.totalJoinFeesPaid],
                      ['Join fees pending', data.storedTotals.totalJoinFeesPending,  data.derivedTotals.totalJoinFeesPending],
                      ['Closing total',     data.storedTotals.closing_totalAmount,   data.derivedTotals.closing_totalAmount],
                      ['Closing paid',      data.storedTotals.closing_paidAmount,    data.derivedTotals.closing_paidAmount],
                      ['Closing pending',   data.storedTotals.closing_pendingAmount, data.derivedTotals.closing_pendingAmount],
                    ].filter(([, s, d]) => s !== d).map(([label, s, d]) => (
                      <Col span={12} key={label}>
                        {label}: <b>{inr(s)}</b> stored vs <b>{inr(d)}</b> from members{' '}
                        <Text style={{ fontSize: 11, color: C.error }}>({s > d ? '+' : ''}{inr(s - d)})</Text>
                      </Col>
                    ))}
                  </Row>
                  <div style={{ marginTop: 6 }}>
                    <Button size="small" type="link" style={{ padding: 0, fontSize: 11 }} onClick={useAllDerived}>
                      Fill every row from member data
                    </Button>
                    <Text style={{ fontSize: 11, color: C.muted }}> — or use Recalculate above to apply it directly.</Text>
                  </div>
                </div>
              }
            />
          ) : (
            <Alert
              type="success" showIcon
              style={{ borderRadius: 10 }}
              message={<span style={{ fontSize: 12 }}>Stored totals match this agent's member data.</span>}
            />
          )}

          <Alert
            type="info" showIcon style={{ borderRadius: 10 }}
            message={<span style={{ fontSize: 11 }}>
              Manual values are overwritten the next time anyone runs <b>Sync Stats</b> or <b>Recalculate</b>, since those rebuild from member documents. If the members themselves are wrong, fix those instead.
            </span>}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { label: 'Join Fees', value: 'joinFees' },
                { label: 'Closing Payment', value: 'closing' },
              ]}
            />
            <Text style={{ fontSize: 11, color: C.light }}>
              Editing <b>{isJF ? 'join fee' : 'closing'}</b> amounts — the other set is kept as-is and saved together.
            </Text>
          </div>

          <Table
            columns={columns}
            dataSource={data.programs}
            rowKey="programId"
            size="small"
            pagination={false}
            rowClassName={r => rowDirty(r) ? 'agent-stat-dirty' : ''}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="This agent has no yojna stats yet" /> }}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 600 }}>
                  <Table.Summary.Cell index={0}>
                    <Text strong style={{ fontSize: 12 }}>Agent total</Text>
                    <div style={{ fontSize: 9, color: C.light }}>sum of rows — not editable</div>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    <Text strong style={{ fontSize: 12 }}>{inr(isJF ? liveTotals.jfTotal : liveTotals.cTotal)}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right">
                    <Text strong style={{ fontSize: 12, color: C.success }}>{inr(isJF ? liveTotals.jfPaid : liveTotals.cPaid)}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    <Text strong style={{ fontSize: 12, color: C.error }}>
                      {inr(Math.max(0, isJF ? liveTotals.jfTotal - liveTotals.jfPaid : liveTotals.cTotal - liveTotals.cPaid))}
                    </Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">
                    <Text style={{ fontSize: 11, color: C.light }}>
                      {inr(isJF ? data.derivedTotals.totalJoinFees : data.derivedTotals.closing_totalAmount)}
                    </Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5} />
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />

          <div>
            <Text style={{ fontSize: 11, color: C.muted }}>Reason for this correction (saved to history)</Text>
            <Input.TextArea
              rows={2} maxLength={500} showCount
              value={note} onChange={e => setNote(e.target.value)}
              placeholder="e.g. old import had double-counted join fees for this agent"
              style={{ marginTop: 4 }}
            />
          </div>

          {showHistory && (
            <Card size="small" title="Correction history" style={{ borderRadius: 10, borderColor: C.border }} bodyStyle={{ padding: 12 }}>
              {!data.history?.length ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No corrections recorded" />
              ) : (
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  {data.history.map(h => (
                    <div key={h.id} style={{ borderLeft: `3px solid ${C.primary}`, paddingLeft: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                        <Text style={{ fontSize: 11 }}>
                          Join fees <Text delete style={{ fontSize: 11, color: C.light }}>{inr(h.before?.totalJoinFees)}</Text>
                          {' → '}<b>{inr(h.after?.totalJoinFees)}</b>
                          {'  ·  '}Closing <Text delete style={{ fontSize: 11, color: C.light }}>{inr(h.before?.closing_totalAmount)}</Text>
                          {' → '}<b>{inr(h.after?.closing_totalAmount)}</b>
                        </Text>
                        <Text style={{ fontSize: 10, color: C.light }}>
                          {h.createdAt ? dayjs(h.createdAt).format('DD-MM-YYYY HH:mm') : ''}
                        </Text>
                      </div>
                      {h.note && <div style={{ fontSize: 10, color: C.muted }}>{h.note}</div>}
                    </div>
                  ))}
                </Space>
              )}
            </Card>
          )}
        </Space>
      )}

      <style jsx global>{`
        .agent-stat-dirty td { background: #fffbeb !important; }
      `}</style>
    </Drawer>
  )
}

export default AgentStatsEditDrawer
