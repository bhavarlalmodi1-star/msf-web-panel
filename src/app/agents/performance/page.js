"use client"
import { panelTheme } from '@/utils/trust/trustStore';
import React, { useState, useEffect, useCallback } from 'react'
import {
  Card, Table, Tag, Select, Row, Col, Avatar, Spin, Typography,
  Space, Progress, Badge, Tooltip, message, Button, Divider, Empty, Alert, Modal
} from 'antd'
import {
  TrophyOutlined, UserOutlined, DollarOutlined, RiseOutlined,
  TeamOutlined, WalletOutlined, PercentageOutlined, FireOutlined,
  StarOutlined, CrownOutlined, GoldOutlined, CheckCircleOutlined,
  ClockCircleOutlined, CloseCircleOutlined, ReloadOutlined,
  PhoneOutlined, EnvironmentOutlined, InfoCircleOutlined,
  SafetyCertificateOutlined, BarChartOutlined, ArrowRightOutlined,
  SyncOutlined, WarningOutlined,
} from '@ant-design/icons'
import { useAuth } from '@/components/Base/AuthProvider'
import { auth } from '../../../../lib/firbase-client'
import { useRouter } from 'next/navigation'
import { Drawer } from 'antd'

const { Title, Text } = Typography

// ─── Project theme (matches join-fees and other pages) ───────────────────────
const C = {
  get primary() { return panelTheme().primary; },
  get secondary() { return panelTheme().secondary; },
  accent:     '#059669',
  warning:    '#f59e0b',
  success:    '#16a34a',
  error:      '#dc2626',
  info:       '#2563eb',
  purple:     '#7c3aed',
  get background() { return panelTheme().background; },
  surface:    '#ffffff',
  get border() { return panelTheme().border; },
  foreground: '#3e1f1a',
  muted:      '#9ca3af',
  textLight:  '#6b7280',
}

const RANK_MEDAL = [
  { color: '#f59e0b', shadow: 'rgba(245,158,11,0.15)', icon: <CrownOutlined />,  label: '1st', bg: '#fffbeb', border: '#fcd34d' },
  { color: '#94a3b8', shadow: 'rgba(148,163,184,0.15)', icon: <GoldOutlined />,  label: '2nd', bg: '#f8fafc', border: '#cbd5e1' },
  { color: '#cd7c32', shadow: 'rgba(205,124,50,0.15)',  icon: <TrophyOutlined />,label: '3rd', bg: '#fefce8', border: '#d97706' },
]

const PERIODS = [
  { label: 'Today',      value: 'daily'   },
  { label: 'This Week',  value: 'weekly'  },
  { label: 'This Month', value: 'monthly' },
  { label: 'This Year',  value: 'yearly'  },
  { label: 'All Time',   value: 'all'     },
]

const METRICS = [
  { label: 'Overall Score',    value: 'overall',    icon: <StarOutlined />        },
  { label: 'Members Joined',   value: 'members',    icon: <TeamOutlined />        },
  { label: 'Join Fees',        value: 'joinFees',   icon: <DollarOutlined />      },
  { label: 'Closing Fees',     value: 'closing',    icon: <WalletOutlined />      },
  { label: 'Commission',       value: 'commission', icon: <RiseOutlined />        },
  { label: 'Efficiency',       value: 'efficiency', icon: <PercentageOutlined />  },
  { label: 'Pending Requests', value: 'requests',   icon: <ClockCircleOutlined /> },
]

const fmt = v => '₹' + (v || 0).toLocaleString('en-IN')
const num = v => (v || 0).toLocaleString()

// ─── Score ring ───────────────────────────────────────────────────────────────
const ScoreRing = ({ score, size = 52 }) => {
  const color = score >= 75 ? C.success : score >= 45 ? C.warning : C.secondary
  return (
    <Progress
      type="circle"
      percent={Math.min(score, 100)}
      size={size}
      strokeColor={color}
      trailColor="#f0f0f0"
      format={() => (
        <span style={{ color: C.foreground, fontWeight: 800, fontSize: size * 0.22 }}>{score}</span>
      )}
    />
  )
}

// ─── Approval badge ───────────────────────────────────────────────────────────
const ApprovalBadge = ({ rate }) => {
  const color = rate >= 80 ? C.success : rate >= 50 ? C.warning : C.error
  return (
    <Tooltip title={`${rate}% approval rate`}>
      <Tag icon={<SafetyCertificateOutlined />} style={{
        background: color + '15', border: `1px solid ${color}55`,
        color, borderRadius: 20, fontWeight: 700, fontSize: 11, margin: 0
      }}>
        {rate}% approved
      </Tag>
    </Tooltip>
  )
}

// ─── Agent detail drawer ──────────────────────────────────────────────────────
const AgentDrawer = ({ agent, rank, onClose }) => {
  if (!agent) return null
  const medal = RANK_MEDAL[rank] || { color: C.primary, icon: <UserOutlined /> }
  return (
    <Drawer
      open={!!agent}
      onClose={onClose}
      width={380}
      title={
        <Space>
          <span style={{ color: medal.color, fontSize: 16 }}>{medal.icon}</span>
          <Text strong style={{ color: C.foreground }}>{agent.name}</Text>
        </Space>
      }
      styles={{ body: { background: C.background, padding: 16 } }}
    >
      {/* Avatar */}
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <Avatar size={72} src={agent.photoUrl} icon={<UserOutlined />}
          style={{ border: `3px solid ${medal.color}`, marginBottom: 8 }} />
        <div><Text strong style={{ color: C.foreground, fontSize: 15 }}>{agent.name}</Text></div>
        {agent.fatherName && <div><Text type="secondary" style={{ fontSize: 12 }}>S/o {agent.fatherName}</Text></div>}
        <Space style={{ marginTop: 6 }} size={4}>
          {agent.phone1 && <Tag icon={<PhoneOutlined />} style={{ borderRadius: 20 }}>{agent.phone1}</Tag>}
          {agent.village && <Tag icon={<EnvironmentOutlined />} style={{ borderRadius: 20 }}>{agent.village}</Tag>}
        </Space>
      </div>

      {/* Score */}
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <ScoreRing score={agent.score} size={72} />
        <div style={{ marginTop: 6 }}><Text type="secondary" style={{ fontSize: 11 }}>Performance Score</Text></div>
      </div>

      <Divider style={{ margin: '10px 0' }} />

      {/* Period stats */}
      <Card size="small" style={{ marginBottom: 10, borderColor: C.border, background: C.surface }}>
        <Text strong style={{ color: C.primary, fontSize: 11, letterSpacing: 1 }}>PERIOD PERFORMANCE</Text>
        <Row gutter={[8, 8]} style={{ marginTop: 8 }}>
          {[
            { label: 'Members',    value: num(agent.periodNewMembers),  color: C.info     },
            { label: 'Join Fees',  value: fmt(agent.periodJoinFees),    color: C.success  },
            { label: 'Closing',    value: fmt(agent.periodClosing),     color: C.purple   },
            { label: 'Commission', value: fmt(agent.periodCommission),  color: C.warning  },
          ].map(s => (
            <Col span={12} key={s.label}>
              <div style={{ background: C.background, borderRadius: 8, padding: '7px 10px', border: `1px solid ${C.border}` }}>
                <div style={{ color: C.muted, fontSize: 10 }}>{s.label}</div>
                <div style={{ color: s.color, fontWeight: 700, fontSize: 13 }}>{s.value}</div>
              </div>
            </Col>
          ))}
        </Row>
      </Card>

      {/* Request stats */}
      <Card size="small" style={{ marginBottom: 10, borderColor: C.border, background: C.surface }}>
        <Text strong style={{ color: C.secondary, fontSize: 11, letterSpacing: 1 }}>REQUEST OVERVIEW</Text>
        {[
          { label: 'Approved Members', value: num(agent.lifetimeMembers), color: C.success, icon: <CheckCircleOutlined /> },
          { label: 'Pending Approval', value: num(agent.pendingRequests), color: C.warning, icon: <ClockCircleOutlined /> },
          { label: 'Rejected',         value: num(agent.rejectedRequests),color: C.error,   icon: <CloseCircleOutlined /> },
          { label: 'Approval Rate',    value: `${agent.approvalRate}%`,   color: agent.approvalRate >= 70 ? C.success : C.warning, icon: <SafetyCertificateOutlined /> },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
            <Space size={6}>
              <span style={{ color: s.color }}>{s.icon}</span>
              <Text type="secondary" style={{ fontSize: 12 }}>{s.label}</Text>
            </Space>
            <Text strong style={{ color: s.color }}>{s.value}</Text>
          </div>
        ))}
      </Card>

      {/* Lifetime */}
      <Card size="small" style={{ borderColor: C.border, background: C.surface }}>
        <Text strong style={{ color: C.info, fontSize: 11, letterSpacing: 1 }}>LIFETIME TOTALS</Text>
        {[
          { label: 'Join Fees Paid',    value: fmt(agent.lifetimeJoinFeesPaid),    color: C.success  },
          { label: 'Join Fees Pending', value: fmt(agent.lifetimeJoinFeesPending), color: C.secondary},
          { label: 'Closing Paid',      value: fmt(agent.lifetimeClosingPaid),     color: C.purple   },
          { label: 'Commission Earned', value: fmt(agent.lifetimeCommission),      color: C.warning  },
          { label: 'Wallet Balance',    value: fmt(agent.walletBalance),           color: C.info     },
          { label: 'Collection Rate',   value: `${agent.efficiency}%`,            color: agent.efficiency >= 70 ? C.success : C.warning },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${C.border}` }}>
            <Text type="secondary" style={{ fontSize: 12 }}>{s.label}</Text>
            <Text strong style={{ color: s.color, fontSize: 12 }}>{s.value}</Text>
          </div>
        ))}
      </Card>
    </Drawer>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AgentPerformance() {
  const { user } = useAuth()
  const router   = useRouter()
  const [period,   setPeriod]   = useState('monthly')
  const [metric,   setMetric]   = useState('overall')
  const [agents,   setAgents]   = useState([])
  const [summary,  setSummary]  = useState({})
  const [loading,  setLoading]  = useState(false)
  const [dateRange,setDateRange]= useState(null)
  const [selected,     setSelected]     = useState(null)
  const [selRank,      setSelRank]      = useState(null)
  const [resetLoading, setResetLoading] = useState(false)

  // ── Reset / recalculate all agent stats (superadmin only) ─────────────────
  const resetStats = () => {
    Modal.confirm({
      title: 'Reset & Recalculate Agent Stats',
      icon: <WarningOutlined style={{ color: '#f59e0b' }} />,
      content: (
        <div style={{ marginTop: 8 }}>
          <p>This will <strong>recalculate join fees, closing fees, and member counts</strong> for every agent from scratch — using only <strong>accepted (active)</strong> members.</p>
          <p style={{ color: '#dc2626', marginTop: 8 }}>Any wrong amounts from pending/rejected members will be corrected.</p>
          <p style={{ color: '#6b7280', fontSize: 12, marginTop: 8 }}>This may take a few seconds depending on the number of agents.</p>
        </div>
      ),
      okText: 'Yes, Reset Now',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        setResetLoading(true)
        try {
          const token = await auth.currentUser?.getIdToken()
          const res   = await fetch('/api/agents/recalculate-stats', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body:    JSON.stringify({}),
          })
          const data = await res.json()
          if (data.success) {
            message.success(`Stats reset for ${data.results?.length || 0} agent(s)`)
            fetchData()
          } else {
            message.error(data.message || 'Reset failed')
          }
        } catch {
          message.error('Failed to reset stats')
        } finally {
          setResetLoading(false)
        }
      },
    })
  }

  const fetchData = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res   = await fetch(`/api/agents/performance?period=${period}&metric=${metric}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setAgents(data.agents || [])
        setSummary(data.summary || {})
        setDateRange(data.dateRange)
      } else {
        message.error(data.message || 'Failed to load')
      }
    } catch {
      message.error('Failed to fetch performance data')
    } finally {
      setLoading(false)
    }
  }, [period, metric, user])

  useEffect(() => { fetchData() }, [fetchData])

  const topAgents = agents.slice(0, 3)

  // ── KPI cards ─────────────────────────────────────────────────────────────
  const kpiCards = [
    { label: 'Total Agents',     value: num(summary.totalAgents),           color: C.info,      icon: <TeamOutlined />        },
    { label: 'Members Added',    value: num(summary.totalNewMembers),        color: C.success,   icon: <UserOutlined />        },
    { label: 'Join Fees',        value: fmt(summary.totalJoinFees),          color: C.primary,   icon: <DollarOutlined />      },
    { label: 'Closing Fees',     value: fmt(summary.totalClosing),           color: C.purple,    icon: <WalletOutlined />      },
    { label: 'Commission',       value: fmt(summary.totalCommission),        color: C.warning,   icon: <RiseOutlined />        },
    { label: 'Pending Requests', value: num(summary.totalPendingRequests),   color: C.secondary, icon: <ClockCircleOutlined /> },
  ]

  // ── Table columns ─────────────────────────────────────────────────────────
  const columns = [
    {
      title: '#', key: 'rank', width: 56, fixed: 'left',
      render: (_, __, idx) => {
        if (idx < 3) {
          const m = RANK_MEDAL[idx]
          return (
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: m.color + '22', border: `2px solid ${m.color}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: m.color, fontSize: 14,
            }}>{m.icon}</div>
          )
        }
        return <Text strong style={{ color: C.muted, paddingLeft: 4 }}>{idx + 1}</Text>
      },
    },
    {
      title: 'Agent', key: 'agent', width: 220, fixed: 'left',
      render: (_, r, idx) => (
        <Space>
          <div style={{ position: 'relative', cursor: 'pointer' }}
            onClick={() => { setSelected(r); setSelRank(idx) }}>
            <Avatar size={40} src={r.photoUrl} icon={<UserOutlined />}
              style={{ border: `2px solid ${RANK_MEDAL[idx]?.border || C.border}` }} />
            {r.pendingRequests > 0 && (
              <Badge count={r.pendingRequests} size="small"
                style={{ position: 'absolute', top: -4, right: -4, background: C.secondary }} />
            )}
          </div>
          <div>
            <Text strong style={{ color: C.foreground, fontSize: 13, cursor: 'pointer' }}
              onClick={() => { setSelected(r); setSelRank(idx) }}>{r.name}</Text>
            <div>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {r.village}{r.village && r.district ? ', ' : ''}{r.district}
              </Text>
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: 'Score', key: 'score', width: 90, align: 'center',
      defaultSortOrder: 'descend',
      sorter: (a, b) => (a.score || 0) - (b.score || 0),
      render: (_, r) => <ScoreRing score={r.score} size={44} />,
    },
    {
      title: 'Members', dataIndex: 'periodNewMembers', key: 'members', width: 100, align: 'center',
      sorter: (a, b) => (a.periodNewMembers || 0) - (b.periodNewMembers || 0),
      render: v => (
        <div>
          <div style={{ fontWeight: 800, fontSize: 20, color: C.info, lineHeight: 1 }}>{v || 0}</div>
          <div style={{ fontSize: 10, color: C.muted }}>this period</div>
        </div>
      ),
    },
    {
      title: 'Join Fees', dataIndex: 'periodJoinFees', key: 'joinFees', width: 130, align: 'right',
      sorter: (a, b) => (a.periodJoinFees || 0) - (b.periodJoinFees || 0),
      render: v => <Text strong style={{ color: C.success }}>{fmt(v)}</Text>,
    },
    {
      title: 'Closing', dataIndex: 'periodClosing', key: 'closing', width: 130, align: 'right',
      sorter: (a, b) => (a.periodClosing || 0) - (b.periodClosing || 0),
      render: v => <Text strong style={{ color: C.purple }}>{fmt(v)}</Text>,
    },
    {
      title: 'Commission', dataIndex: 'periodCommission', key: 'commission', width: 130, align: 'right',
      sorter: (a, b) => (a.periodCommission || 0) - (b.periodCommission || 0),
      render: v => <Text strong style={{ color: C.warning }}>{fmt(v)}</Text>,
    },
    {
      title: 'Collection %', dataIndex: 'efficiency', key: 'efficiency', width: 150,
      sorter: (a, b) => (a.efficiency || 0) - (b.efficiency || 0),
      render: v => (
        <Tooltip title={`${v}% collection efficiency`}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>Efficiency</Text>
              <Text strong style={{ fontSize: 11, color: v >= 80 ? C.success : v >= 50 ? C.warning : C.error }}>{v}%</Text>
            </div>
            <Progress percent={Math.min(v, 100)} size="small" showInfo={false}
              strokeColor={v >= 80 ? C.success : v >= 50 ? C.warning : C.error} />
          </div>
        </Tooltip>
      ),
    },
    {
      title: 'Member Requests',
      key: 'requests',
      width: 220,
      sorter: (a, b) => (a.pendingRequests || 0) - (b.pendingRequests || 0),
      render: (_, r) => {
        const total = (r.lifetimeMembers || 0) + (r.pendingRequests || 0) + (r.rejectedRequests || 0)
        return (
          <div style={{
            background: C.background, borderRadius: 8,
            border: `1px solid ${C.border}`, padding: '6px 10px',
          }}>
            {/* Total submitted */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <Text style={{ fontSize: 10, color: C.muted }}>Total Submitted</Text>
              <Text strong style={{ fontSize: 11, color: C.foreground }}>{total}</Text>
            </div>
            {/* Three status pills */}
            <div style={{ display: 'flex', gap: 4 }}>
              <Tooltip title="Approved members (all time)">
                <div style={{
                  flex: 1, textAlign: 'center', borderRadius: 6, padding: '3px 0',
                  background: C.success + '15', border: `1px solid ${C.success}40`,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.success, lineHeight: 1.2 }}>
                    {r.lifetimeMembers || 0}
                  </div>
                  <div style={{ fontSize: 9, color: C.success }}>Approved</div>
                </div>
              </Tooltip>
              <Tooltip title="Awaiting approval">
                <div style={{
                  flex: 1, textAlign: 'center', borderRadius: 6, padding: '3px 0',
                  background: r.pendingRequests > 0 ? C.warning + '20' : '#f5f5f5',
                  border: `1px solid ${r.pendingRequests > 0 ? C.warning + '60' : '#e0e0e0'}`,
                }}>
                  <div style={{
                    fontSize: 13, fontWeight: 800, lineHeight: 1.2,
                    color: r.pendingRequests > 0 ? C.warning : C.muted,
                  }}>
                    {r.pendingRequests || 0}
                  </div>
                  <div style={{ fontSize: 9, color: r.pendingRequests > 0 ? C.warning : C.muted }}>Pending</div>
                </div>
              </Tooltip>
              <Tooltip title="Rejected">
                <div style={{
                  flex: 1, textAlign: 'center', borderRadius: 6, padding: '3px 0',
                  background: r.rejectedRequests > 0 ? C.error + '12' : '#f5f5f5',
                  border: `1px solid ${r.rejectedRequests > 0 ? C.error + '40' : '#e0e0e0'}`,
                }}>
                  <div style={{
                    fontSize: 13, fontWeight: 800, lineHeight: 1.2,
                    color: r.rejectedRequests > 0 ? C.error : C.muted,
                  }}>
                    {r.rejectedRequests || 0}
                  </div>
                  <div style={{ fontSize: 9, color: r.rejectedRequests > 0 ? C.error : C.muted }}>Rejected</div>
                </div>
              </Tooltip>
            </div>
            {/* Approval rate bar */}
            <div style={{ marginTop: 5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <Text style={{ fontSize: 9, color: C.muted }}>Approval Rate</Text>
                <Text style={{ fontSize: 9, fontWeight: 700, color: r.approvalRate >= 70 ? C.success : C.warning }}>
                  {r.approvalRate}%
                </Text>
              </div>
              <Progress
                percent={Math.min(r.approvalRate, 100)} size="small" showInfo={false}
                strokeColor={r.approvalRate >= 70 ? C.success : r.approvalRate >= 40 ? C.warning : C.error}
                trailColor="#e5e7eb"
              />
            </div>
          </div>
        )
      },
    },
    {
      title: '', key: 'action', width: 48, fixed: 'right',
      render: (_, r, idx) => (
        <Button type="text" size="small" icon={<InfoCircleOutlined />}
          style={{ color: C.primary }}
          onClick={() => { setSelected(r); setSelRank(idx) }} />
      ),
    },
  ]

  return (
    <div style={{ padding: 20, background: C.background, minHeight: '100vh' }}>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <Title level={3} style={{
            margin: 0,
            background: `linear-gradient(135deg, ${C.primary}, ${C.secondary})`,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            <TrophyOutlined style={{ WebkitTextFillColor: C.warning, marginRight: 8 }} />
            Agent Performance Rankings
          </Title>
          {dateRange && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {new Date(dateRange.start).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}
              {' – '}
              {new Date(dateRange.end).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}
            </Text>
          )}
        </div>
        <Space wrap>
          <Select value={period} onChange={setPeriod} options={PERIODS} style={{ width: 140 }} />
          <Select value={metric} onChange={setMetric} style={{ width: 190 }}
            options={METRICS.map(m => ({ label: <Space size={6}>{m.icon}<span>{m.label}</span></Space>, value: m.value }))} />
          {/* {user?.role === 'superadmin' && (
            <Tooltip title="Recalculate all agent stats from scratch (active members only)">
              <Button
                icon={<SyncOutlined />}
                onClick={resetStats}
                loading={resetLoading}
                danger
              >
                Reset Stats
              </Button>
            </Tooltip>
          )} */}
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}
            style={{ borderColor: C.primary, color: C.primary }}>
            Refresh
          </Button>
        </Space>
      </div>

      <Spin spinning={loading}>

        {/* ── Pending requests alert ───────────────────────────────────────── */}
        {(summary.totalPendingRequests || 0) > 0 && (
          <Alert
            type="warning"
            showIcon
            message={`${summary.totalPendingRequests} member request(s) are awaiting approval across all agents`}
            action={
              <Button size="small" type="link" icon={<ArrowRightOutlined />}
                onClick={() => router.push('/requests')} style={{ color: C.secondary }}>
                Review
              </Button>
            }
            style={{ marginBottom: 16, borderRadius: 8 }}
          />
        )}

        {/* ── KPI summary ──────────────────────────────────────────────────── */}
        <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
          {kpiCards.map((k, i) => (
            <Col xs={12} sm={8} md={4} key={i}>
              <Card size="small" style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.surface }} bodyStyle={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 8,
                    background: k.color + '18',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: k.color, fontSize: 15, flexShrink: 0,
                  }}>{k.icon}</div>
                  <div>
                    <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.3 }}>{k.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: k.color, lineHeight: 1.3 }}>{k.value}</div>
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>

        {/* ── Top 3 Podium ─────────────────────────────────────────────────── */}
        {topAgents.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <CrownOutlined style={{ color: C.warning, fontSize: 16 }} />
              <Text strong style={{ fontSize: 15, color: C.foreground }}>Top Performers</Text>
            </div>
            <Row gutter={[16, 16]}>
              {topAgents.map((agent, i) => {
                const m = RANK_MEDAL[i]
                return (
                  <Col xs={24} sm={8} key={agent.id}>
                    <Card
                      hoverable
                      onClick={() => { setSelected(agent); setSelRank(i) }}
                      style={{
                        borderTop: `4px solid ${m.color}`,
                        borderColor: m.border,
                        borderRadius: 12,
                        background: m.bg,
                        boxShadow: `0 4px 16px ${m.shadow}`,
                        cursor: 'pointer',
                      }}
                      bodyStyle={{ padding: '16px 14px', textAlign: 'center' }}
                    >
                      {/* Rank badge */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: m.color, display: 'flex', alignItems: 'center',
                          justifyContent: 'center', color: '#fff', fontSize: 13,
                        }}>{m.icon}</div>
                        <Tag style={{ background: m.color + '22', borderColor: m.color, color: m.color, borderRadius: 20, fontWeight: 700 }}>
                          #{i + 1}
                        </Tag>
                      </div>

                      <Avatar size={60} src={agent.photoUrl} icon={<UserOutlined />}
                        style={{ border: `3px solid ${m.color}`, marginBottom: 8 }} />

                      <div style={{ marginBottom: 2 }}>
                        <Text strong style={{ color: C.foreground, fontSize: 14 }}>{agent.name}</Text>
                      </div>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {agent.village}{agent.village && agent.district ? ', ' : ''}{agent.district}
                      </Text>

                      <Divider style={{ borderColor: m.color + '40', margin: '10px 0' }} />

                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                        <ScoreRing score={agent.score} size={60} />
                      </div>

                      <Row gutter={[6, 6]}>
                        <Col span={12}>
                          <div style={{ background: C.surface, borderRadius: 8, padding: '6px 8px', border: `1px solid ${C.border}` }}>
                            <div style={{ fontSize: 9, color: C.muted }}>Members</div>
                            <div style={{ fontWeight: 800, color: C.info, fontSize: 16 }}>{agent.periodNewMembers}</div>
                          </div>
                        </Col>
                        <Col span={12}>
                          <div style={{ background: C.surface, borderRadius: 8, padding: '6px 8px', border: `1px solid ${C.border}` }}>
                            <div style={{ fontSize: 9, color: C.muted }}>Join Fees</div>
                            <div style={{ fontWeight: 700, color: C.success, fontSize: 11 }}>{fmt(agent.periodJoinFees)}</div>
                          </div>
                        </Col>
                        <Col span={12}>
                          <div style={{ background: C.surface, borderRadius: 8, padding: '6px 8px', border: `1px solid ${C.border}` }}>
                            <div style={{ fontSize: 9, color: C.muted }}>Commission</div>
                            <div style={{ fontWeight: 700, color: C.warning, fontSize: 11 }}>{fmt(agent.periodCommission)}</div>
                          </div>
                        </Col>
                        <Col span={12}>
                          <div style={{ background: C.surface, borderRadius: 8, padding: '6px 8px', border: `1px solid ${C.border}` }}>
                            <div style={{ fontSize: 9, color: C.muted }}>Efficiency</div>
                            <div style={{ fontWeight: 700, fontSize: 13,
                              color: agent.efficiency >= 70 ? C.success : C.warning }}>
                              {agent.efficiency}%
                            </div>
                          </div>
                        </Col>
                      </Row>

                      {/* Request summary mini-bar */}
                      <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>
                        <Tooltip title="Approved members">
                          <div style={{ flex: 1, textAlign: 'center', borderRadius: 6, padding: '3px 0',
                            background: C.success + '15', border: `1px solid ${C.success}40` }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: C.success }}>{agent.lifetimeMembers || 0}</div>
                            <div style={{ fontSize: 8, color: C.success }}>Approved</div>
                          </div>
                        </Tooltip>
                        <Tooltip title="Pending approval">
                          <div style={{ flex: 1, textAlign: 'center', borderRadius: 6, padding: '3px 0',
                            background: agent.pendingRequests > 0 ? C.warning + '20' : '#f5f5f5',
                            border: `1px solid ${agent.pendingRequests > 0 ? C.warning + '60' : '#e0e0e0'}` }}>
                            <div style={{ fontSize: 11, fontWeight: 800,
                              color: agent.pendingRequests > 0 ? C.warning : C.muted }}>{agent.pendingRequests || 0}</div>
                            <div style={{ fontSize: 8, color: agent.pendingRequests > 0 ? C.warning : C.muted }}>Pending</div>
                          </div>
                        </Tooltip>
                        <Tooltip title="Rejected">
                          <div style={{ flex: 1, textAlign: 'center', borderRadius: 6, padding: '3px 0',
                            background: agent.rejectedRequests > 0 ? C.error + '12' : '#f5f5f5',
                            border: `1px solid ${agent.rejectedRequests > 0 ? C.error + '40' : '#e0e0e0'}` }}>
                            <div style={{ fontSize: 11, fontWeight: 800,
                              color: agent.rejectedRequests > 0 ? C.error : C.muted }}>{agent.rejectedRequests || 0}</div>
                            <div style={{ fontSize: 8, color: agent.rejectedRequests > 0 ? C.error : C.muted }}>Rejected</div>
                          </div>
                        </Tooltip>
                      </div>
                    </Card>
                  </Col>
                )
              })}
            </Row>
          </div>
        )}

        {/* ── Full table ────────────────────────────────────────────────────── */}
        <Card
          style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.surface }}
          bodyStyle={{ padding: 0 }}
          title={
            <Space>
              <BarChartOutlined style={{ color: C.primary }} />
              <Text strong style={{ color: C.foreground }}>Full Rankings</Text>
              <Tag style={{
                background: `linear-gradient(135deg, ${C.primary}, ${C.secondary})`,
                border: 'none', color: '#fff', borderRadius: 20
              }}>{agents.length} agents</Tag>
            </Space>
          }
        >
          <Table
            dataSource={agents}
            columns={columns}
            rowKey="id"
            pagination={{
              pageSize: 20, showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50'],
              style: { padding: '12px 20px' },
            }}
            scroll={{ x: 1350 }}
            size="middle"
            locale={{ emptyText: <Empty description="No agent data for this period" /> }}
            rowClassName={(_, idx) => idx < 3 ? 'top-rank-row' : ''}
          />
        </Card>

      </Spin>

      {/* ── Detail drawer ─────────────────────────────────────────────────── */}
      <AgentDrawer
        agent={selected}
        rank={selRank}
        onClose={() => { setSelected(null); setSelRank(null) }}
      />
    </div>
  )
}
