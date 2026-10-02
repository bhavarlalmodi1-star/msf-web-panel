"use client"
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Card, Table, Button, Select, Tag, Space, Typography, Divider,
  message, Avatar, Statistic, Row, Col, Input, Modal, Alert,
  Checkbox, Tooltip, Badge, Collapse, Empty, Spin, Grid, Progress,
} from 'antd'
import {
  WhatsAppOutlined, UserOutlined, TeamOutlined,
  DollarOutlined, FilterOutlined, SendOutlined,
  CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined,
  EyeOutlined, WarningOutlined, GlobalOutlined, ExperimentOutlined,
} from '@ant-design/icons'
import { useSelector } from 'react-redux'
import { auth } from '../../../../lib/firbase-client'
import { useTrust } from '@/utils/trust/useTrust'

const { Title, Text } = Typography
const { useBreakpoint } = Grid
const { Panel } = Collapse
const { TextArea } = Input

const DEFAULT_TEMPLATE = `नमस्ते {name} जी,

आपके {program} कार्यक्रम में {pendingCount} किस्तें बकाया हैं। कुल ₹{amount} का भुगतान शेष है।

कृपया जल्द से जल्द भुगतान करें।

धन्यवाद,
{trustShortName}`

const PAGE_SIZE = 100

export default function WhatsAppPage() {
  const trust = useTrust()
  const screens = useBreakpoint()
  const programList = useSelector(state => state.data?.programList || [])

  const [groups, setGroups] = useState([])
  const [paginatedMembers, setPaginatedMembers] = useState([])
  const [totalMembers, setTotalMembers] = useState(0)
  const [totalPending, setTotalPending] = useState(0)
  const [pagination, setPagination] = useState({ page: 1, pageSize: PAGE_SIZE, totalPages: 1, totalMembers: 0 })
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendProgress, setSendProgress] = useState(null)
  const [agentFilter, setAgentFilter] = useState('all')
  const [programFilter, setProgramFilter] = useState('all')
  const [selectedMemberIds, setSelectedMemberIds] = useState([])
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE)
  const [showPreview, setShowPreview] = useState(false)
  const [sendResult, setSendResult] = useState(null)
  const [templateModal, setTemplateModal] = useState(false)
  const [editableTemplate, setEditableTemplate] = useState(DEFAULT_TEMPLATE)

  // ── Test template state ───────────────────────────────────────────────────
  const [testModal, setTestModal]           = useState(false)
  const [testPhone, setTestPhone]           = useState('')
  const [testParam1, setTestParam1]         = useState('')
  const [testParam2, setTestParam2]         = useState('')
  const [testParam3, setTestParam3]         = useState('')
  const [testSending, setTestSending]       = useState(false)
  const [testResult, setTestResult]         = useState(null)   // { success, message }

  // ── Fetch data ────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) { message.error('Not authenticated'); return }
      const params = new URLSearchParams()
      if (agentFilter !== 'all') params.set('agentId', agentFilter)
      if (programFilter !== 'all') params.set('programId', programFilter)
      params.set('page', String(page))
      params.set('pageSize', String(PAGE_SIZE))

      const res = await fetch(`/api/whatsapp/pending-members?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        setGroups(data.data.groups)
        setPaginatedMembers(data.data.paginatedMembers)
        setTotalMembers(data.data.totalMembers)
        setTotalPending(data.data.totalPending)
        setPagination(data.data.pagination)
        setSelectedMemberIds([])
      } else {
        message.error(data.message)
      }
    } catch (e) {
      console.error(e)
      message.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [agentFilter, programFilter])

  useEffect(() => { fetchData(1) }, [fetchData])

  // ── Derived data ──────────────────────────────────────────────────────────
  const allMembers = useMemo(() => groups.reduce((acc, g) => [...acc, ...g.members], []), [groups])

  const agentOptions = useMemo(() => {
    const opts = groups.map(g => ({ label: `${g.agentName} (${g.totalMembers})`, value: g.agentId }))
    return [{ label: `All Agents (${totalMembers})`, value: 'all' }, ...opts]
  }, [groups, totalMembers])

  const programOptions = useMemo(() => {
    const activePrograms = programList
      .filter(p => allMembers.some(m => m.programId === p.id))
      .map(p => ({ label: `${p.name} (${allMembers.filter(m => m.programId === p.id).length})`, value: p.id }))
    return [{ label: `All Programs (${totalMembers})`, value: 'all' }, ...activePrograms]
  }, [programList, allMembers, totalMembers])

  // ── Selection helpers ─────────────────────────────────────────────────────
  const handleSelectAllPage = (checked) => {
    if (checked) {
      const newIds = [...new Set([...selectedMemberIds, ...paginatedMembers.map(m => m.id)])]
      setSelectedMemberIds(newIds)
    } else {
      const pageIds = new Set(paginatedMembers.map(m => m.id))
      setSelectedMemberIds(selectedMemberIds.filter(id => !pageIds.has(id)))
    }
  }

  const handleSelectAllAgent = (agentId, checked) => {
    const agent = groups.find(g => g.agentId === agentId)
    if (!agent) return
    const agentMemberIds = agent.members.map(m => m.id)
    if (checked) {
      setSelectedMemberIds(prev => [...new Set([...prev, ...agentMemberIds])])
    } else {
      setSelectedMemberIds(prev => prev.filter(id => !agentMemberIds.includes(id)))
    }
  }

  const selectedCountForAgent = (agentId) => {
    const agent = groups.find(g => g.agentId === agentId)
    if (!agent) return 0
    return agent.members.filter(m => selectedMemberIds.includes(m.id)).length
  }

  const toggleMember = (id) => {
    setSelectedMemberIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  // ── Send messages ─────────────────────────────────────────────────────────
  const handleSend = async (testMode = false) => {
    if (selectedMemberIds.length === 0) {
      message.warning('Select at least one member')
      return
    }
    if (!testMode && selectedMemberIds.length > 500) {
      Modal.confirm({
        title: `Send to ${selectedMemberIds.length} members?`,
        content: `This will send ${selectedMemberIds.length} WhatsApp messages. Continue?`,
        onOk: () => doSend(testMode),
      })
      return
    }
    doSend(testMode)
  }

  const doSend = async (testMode) => {
    setSending(true)
    setSendResult(null)
    setSendProgress({ current: 0, total: selectedMemberIds.length })
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) { message.error('Not authenticated'); return }
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          memberIds: selectedMemberIds,
          template: editableTemplate,
          testMode,
        }),
      })
      const data = await res.json()
      if (data.success) {
        if (testMode) {
          setSendResult(data.results || [])
          setShowPreview(true)
        } else {
          message.success(`Sent: ${data.sent}, Skipped (no phone): ${data.skipped}`)
          fetchData(1)
        }
      } else {
        message.error(data.message)
      }
    } catch (e) {
      console.error(e)
      message.error('Failed to send messages')
    } finally {
      setSending(false)
      setSendProgress(null)
    }
  }

  // ── Send Gupshup test template ────────────────────────────────────────────
  const handleTestTemplate = async () => {
    if (!testPhone.trim()) { message.warning('Enter a phone number'); return }
    setTestSending(true)
    setTestResult(null)
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) { message.error('Not authenticated'); return }
      const res = await fetch('/api/whatsapp/test-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          phone:  testPhone.trim(),
          params: [testParam1, testParam2, testParam3],
        }),
      })
      const data = await res.json()
      setTestResult(data)
      if (data.success) {
        message.success(`✅ Test message sent to ${testPhone}`)
      } else {
        message.error(`❌ ${data.message}`)
      }
    } catch (e) {
      console.error(e)
      message.error('Failed to send test message')
      setTestResult({ success: false, message: e.message })
    } finally {
      setTestSending(false)
    }
  }

  // ── Columns ───────────────────────────────────────────────────────────────
  const memberColumns = [
    {
      title: (
        <Checkbox
          checked={paginatedMembers.length > 0 && paginatedMembers.every(m => selectedMemberIds.includes(m.id))}
          indeterminate={paginatedMembers.some(m => selectedMemberIds.includes(m.id)) && !paginatedMembers.every(m => selectedMemberIds.includes(m.id))}
          onChange={e => handleSelectAllPage(e.target.checked)}
        />
      ),
      key: 'select', width: 40,
      render: (_, r) => <Checkbox checked={selectedMemberIds.includes(r.id)} onChange={() => toggleMember(r.id)} />,
    },
    {
      title: 'Member', dataIndex: 'displayName', key: 'name',
      render: (name, r) => (
        <Space>
          <Avatar icon={<UserOutlined />} size="small" />
          <div>
            <Text strong style={{ fontSize: 13 }}>{name}</Text>
            <div><Text type="secondary" style={{ fontSize: 11 }}>{r.registrationNumber} | {r.fatherName}</Text></div>
          </div>
        </Space>
      ),
    },
    {
      title: 'Phone', dataIndex: 'phone', key: 'phone', width: 110,
      render: (phone) => phone
        ? <Text copyable={{ text: phone }}>{phone}</Text>
        : <Tag color="error" style={{ fontSize: 10 }}>No Phone</Tag>,
    },
    {
      title: 'Program', dataIndex: 'programName', key: 'program', width: 120,
      render: (p) => p ? <Tag>{p}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Pending', key: 'pending', width: 140, align: 'right',
      render: (_, r) => (
        <div>
          <Text strong style={{ color: '#ff4d4f' }}>₹{(r.closing_pendingAmount || 0).toLocaleString('en-IN')}</Text>
          <div><Text type="secondary" style={{ fontSize: 11 }}>{r.pendingClosingCount || 0} closings</Text></div>
        </div>
      ),
    },
  ]

  return (
    <div style={{ padding: screens.xs ? 8 : 20 }}>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <Title level={4} style={{ margin: 0 }}>
          <WhatsAppOutlined style={{ color: '#25D366', marginRight: 8 }} />
          WhatsApp Reminders
        </Title>
        <Space wrap>
          <Button size="small" icon={<ExperimentOutlined />} onClick={() => { setTestResult(null); setTestModal(true) }}
            style={{ borderColor: '#25D366', color: '#25D366' }}>
            Test Template
          </Button>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setTemplateModal(true)}>Template</Button>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => fetchData(pagination.page)} loading={loading}>Refresh</Button>
        </Space>
      </div>

      {/* ── Summary cards ────────────────────────────────────────────── */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} sm={6} lg={3}>
          <Card size="small"><Statistic title="Pending Members" value={totalMembers} prefix={<TeamOutlined />} valueStyle={{ fontSize: 18 }} /></Card>
        </Col>
        <Col xs={12} sm={6} lg={3}>
          <Card size="small"><Statistic title="Total Pending" value={totalPending} prefix="₹" precision={0} valueStyle={{ fontSize: 18, color: '#ff4d4f' }} /></Card>
        </Col>
        <Col xs={12} sm={6} lg={3}>
          <Card size="small"><Statistic title="Selected" value={selectedMemberIds.length} prefix={<CheckCircleOutlined />} valueStyle={{ fontSize: 18, color: '#1890ff' }} /></Card>
        </Col>
        <Col xs={12} sm={6} lg={3}>
          <Card size="small"><Statistic title="Has Phone" value={allMembers.filter(m => m.phone).length} suffix={`/ ${allMembers.length}`} valueStyle={{ fontSize: 18 }} /></Card>
        </Col>
      </Row>

      {/* ── Filters & Actions ────────────────────────────────────────── */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={[12, 8]} align="middle">
          <Col xs={24} sm={8} md={6}>
            <Space size={4}>
              <FilterOutlined />
              <Select value={agentFilter} onChange={v => { setAgentFilter(v); setSelectedMemberIds([]) }}
                options={agentOptions} style={{ width: '100%' }} placeholder="Filter by Agent" />
            </Space>
          </Col>
          <Col xs={24} sm={8} md={6}>
            <Space size={4}>
              <GlobalOutlined />
              <Select value={programFilter} onChange={v => { setProgramFilter(v); setSelectedMemberIds([]) }}
                options={programOptions} style={{ width: '100%' }} placeholder="Filter by Program" />
            </Space>
          </Col>
          <Col xs={24} sm={8} md={12}>
            <Space wrap style={{ justifyContent: screens.xs ? 'flex-start' : 'flex-end', width: '100%' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>{selectedMemberIds.length} selected</Text>
              <Button size="small" icon={<EyeOutlined />} onClick={() => handleSend(true)}
                disabled={selectedMemberIds.length === 0} loading={sending}>Preview</Button>
              <Button type="primary" size="small" icon={<SendOutlined />} onClick={() => handleSend(false)}
                disabled={selectedMemberIds.length === 0} loading={sending}>
                Send ({selectedMemberIds.length})
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* ── Send progress ────────────────────────────────────────────── */}
      {sendProgress && (
        <Card size="small" style={{ marginBottom: 12, background: '#f6ffed' }}>
          <Space>
            <Spin size="small" />
            <Text>Processing {sendProgress.current} / {sendProgress.total} messages...</Text>
          </Space>
        </Card>
      )}

      {/* ── Agent-grouped table ───────────────────────────────────────── */}
      <Spin spinning={loading}>
        {groups.length > 0 ? (
          <Collapse defaultActiveKey={groups[0]?.agentId}>
            {groups.map(group => {
              const selCount = selectedCountForAgent(group.agentId)
              const allSel = selCount === group.members.length
              return (
                <Panel
                  key={group.agentId}
                  header={
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Space>
                        <Checkbox
                          checked={allSel && group.members.length > 0}
                          indeterminate={selCount > 0 && !allSel}
                          onChange={e => handleSelectAllAgent(group.agentId, e.target.checked)}
                          onClick={e => e.stopPropagation()}
                        />
                        <TeamOutlined />
                        <Text strong>{group.agentName}</Text>
                        <Tag>{group.totalMembers} members</Tag>
                        <Badge count={`₹${group.totalPending.toLocaleString('en-IN')}`} style={{ backgroundColor: '#ff4d4f' }} />
                      </Space>
                      <Space>
                        {selCount > 0 && <Tag color="blue">{selCount} selected</Tag>}
                      </Space>
                    </Space>
                  }
                  extra={
                    <Button size="small" type="primary" ghost icon={<SendOutlined />}
                      onClick={e => { e.stopPropagation(); handleSelectAllAgent(group.agentId, true); }}
                      disabled={group.members.every(m => !m.phone)}>
                      Select All & Send
                    </Button>
                  }
                >
                  <Table
                    dataSource={group.members}
                    columns={memberColumns}
                    rowKey="id"
                    pagination={false}
                    size="small"
                    bordered
                    locale={{ emptyText: <Empty description="No pending members" image={Empty.PRESENTED_IMAGE_SIMPLE} />}}
                  />
                </Panel>
              )
            })}
          </Collapse>
        ) : !loading && (
          <Empty description="No members with pending closing payments" style={{ marginTop: 40 }} />
        )}

        {/* ── Pagination info ─────────────────────────────────────────── */}
        {totalMembers > PAGE_SIZE && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Showing {paginatedMembers.length} of {totalMembers} members | Page {pagination.page} of {pagination.totalPages}
            </Text>
            <Space>
              <Button size="small" disabled={pagination.page <= 1} onClick={() => fetchData(pagination.page - 1)}>Previous</Button>
              <Button size="small" disabled={pagination.page >= pagination.totalPages} onClick={() => fetchData(pagination.page + 1)}>Next</Button>
            </Space>
          </div>
        )}
      </Spin>

      {/* ── Selected members footer bar ───────────────────────────────── */}
      {selectedMemberIds.length > 0 && (
        <Card
          size="small"
          style={{ position: 'sticky', bottom: 0, zIndex: 10, marginTop: 12, borderTop: '2px solid #1890ff' }}
        >
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space>
              <CheckCircleOutlined style={{ color: '#1890ff' }} />
              <Text strong>{selectedMemberIds.length} members selected</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                ({allMembers.filter(m => selectedMemberIds.includes(m.id) && !m.phone).length} without phone)
              </Text>
            </Space>
            <Space>
              <Button size="small" onClick={() => setSelectedMemberIds([])}>Clear</Button>
              <Button size="small" icon={<EyeOutlined />} onClick={() => handleSend(true)} disabled={sending}>Preview</Button>
              <Button type="primary" size="small" icon={<SendOutlined />} onClick={() => handleSend(false)} loading={sending}
                disabled={selectedMemberIds.filter(id => allMembers.find(m => m.id === id)?.phone).length === 0}>
                Send WhatsApp
              </Button>
            </Space>
          </Space>
        </Card>
      )}

      {/* ── Preview Modal ─────────────────────────────────────────────── */}
      <Modal
        title={<Space><EyeOutlined /> Message Preview ({sendResult?.length || 0})</Space>}
        open={showPreview}
        onCancel={() => setShowPreview(false)}
        footer={null}
        width={640}
      >
        {sendResult?.length > 50 && (
          <Alert message={`Showing first 50 of ${sendResult.length} previews`} type="info" style={{ marginBottom: 8 }} />
        )}
        <div style={{ maxHeight: 500, overflow: 'auto' }}>
          {sendResult?.slice(0, 50).map((r, i) => (
            <Card key={r.memberId} size="small" style={{ marginBottom: 6 }}>
              <Space style={{ marginBottom: 4 }}>
                <Avatar icon={<UserOutlined />} size="small" />
                <Text strong style={{ fontSize: 13 }}>{r.memberName}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>{r.phone}</Text>
                <Tag color={r.status === 'sent' ? 'green' : 'red'} style={{ fontSize: 10 }}>
                  {r.status === 'sent' ? 'Will Send' : r.reason}
                </Tag>
              </Space>
              {r.message && (
                <div style={{ padding: 8, background: '#dcf8c6', borderRadius: 6, whiteSpace: 'pre-wrap', fontSize: 12, marginTop: 4 }}>
                  {r.message}
                </div>
              )}
            </Card>
          ))}
        </div>
      </Modal>

      {/* ── Test Template Modal ───────────────────────────────────────── */}
      <Modal
        title={
          <Space>
            <WhatsAppOutlined style={{ color: '#25D366' }} />
            <span>Send Test Template</span>
            <Tag color="green" style={{ fontSize: 11 }}>thankyou_msg</Tag>
          </Space>
        }
        open={testModal}
        onCancel={() => setTestModal(false)}
        footer={[
          <Button key="cancel" onClick={() => setTestModal(false)}>Cancel</Button>,
          <Button
            key="send"
            type="primary"
            icon={<SendOutlined />}
            loading={testSending}
            onClick={handleTestTemplate}
            style={{ background: '#25D366', borderColor: '#25D366' }}
          >
            Send Test Message
          </Button>,
        ]}
        width={480}
        destroyOnClose
      >
        {/* Template info */}
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12 }}>
          <Text strong style={{ fontSize: 12, color: '#166534', display: 'block', marginBottom: 4 }}>Template: thankyou_msg</Text>
          <Text style={{ fontSize: 12, color: '#555' }}>
            Thank you for your purchase of <b>{'{{1}}'}</b>. Your warranty is active as of <b>{'{{2}}'}</b>. Our <b>{'{{3}}'}</b> are below, for your reference.
          </Text>
        </div>

        {/* Phone */}
        <div style={{ marginBottom: 14 }}>
          <Text strong style={{ display: 'block', marginBottom: 4 }}>
            Test Phone Number <span style={{ color: 'red' }}>*</span>
          </Text>
          <Input
            placeholder="e.g. 9876543210"
            value={testPhone}
            onChange={e => setTestPhone(e.target.value)}
            addonBefore="+91"
            maxLength={10}
          />
          <Text type="secondary" style={{ fontSize: 11 }}>10-digit Indian mobile number</Text>
        </div>

        {/* Template params */}
        <div style={{ background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <Text strong style={{ display: 'block', marginBottom: 10 }}>Template Variables</Text>
          <div style={{ marginBottom: 10 }}>
            <Text style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
              <Tag color="blue" style={{ fontSize: 11 }}>{'{{1}}'}</Tag> Product / Purchase Name
            </Text>
            <Input placeholder="e.g. Membership Plan" value={testParam1} onChange={e => setTestParam1(e.target.value)} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <Text style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
              <Tag color="blue" style={{ fontSize: 11 }}>{'{{2}}'}</Tag> Warranty / Active Date
            </Text>
            <Input placeholder="e.g. 24-07-2026" value={testParam2} onChange={e => setTestParam2(e.target.value)} />
          </div>
          <div>
            <Text style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
              <Tag color="blue" style={{ fontSize: 11 }}>{'{{3}}'}</Tag> Contact / Support Details
            </Text>
            <Input placeholder="e.g. support details" value={testParam3} onChange={e => setTestParam3(e.target.value)} />
          </div>
        </div>

        {/* Live preview */}
        {(testParam1 || testParam2 || testParam3) && (
          <div style={{ marginBottom: 14 }}>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Live Preview:</Text>
            <div style={{ background: '#dcf8c6', borderRadius: 8, padding: '10px 14px', fontSize: 12, lineHeight: 1.6 }}>
              {`Thank you for your purchase of ${testParam1 || '{{1}}'}. Your warranty is active as of ${testParam2 || '{{2}}'}. Our ${testParam3 || '{{3}}'} are below, for your reference.`}
            </div>
          </div>
        )}

        {/* Result */}
        {testResult && (
          <Alert
            type={testResult.success ? 'success' : 'error'}
            message={testResult.message}
            description={testResult.gupshupResponse ? JSON.stringify(testResult.gupshupResponse, null, 2) : undefined}
            showIcon
            style={{ fontSize: 12 }}
          />
        )}
      </Modal>

      {/* ── Template Editor Modal ─────────────────────────────────────── */}
      <Modal
        title={<Space><WarningOutlined /> Message Template</Space>}
        open={templateModal}
        onOk={() => { setTemplate(editableTemplate); setTemplateModal(false); message.success('Template updated') }}
        onCancel={() => { setEditableTemplate(template); setTemplateModal(false) }}
        width={560}
      >
        <div style={{ marginBottom: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Placeholders: {'{name}'}, {'{fatherName}'}, {'{regNo}'}, {'{amount}'}, {'{pendingCount}'}, {'{program}'}, {'{trustName}'}, {'{trustShortName}'}
          </Text>
        </div>
        <TextArea rows={8} value={editableTemplate} onChange={e => setEditableTemplate(e.target.value)} />
        <Divider style={{ margin: '8px 0' }} />
        <Text strong style={{ fontSize: 12 }}>Preview:</Text>
        <div style={{ padding: 8, background: '#dcf8c6', borderRadius: 6, whiteSpace: 'pre-wrap', fontSize: 12, marginTop: 4 }}>
          {editableTemplate
            .replace(/{name}/g, 'राम कुमार')
            .replace(/{fatherName}/g, 'श्याम कुमार')
            .replace(/{regNo}/g, 'SSG-2026-001')
            .replace(/{amount}/g, '5,000')
            .replace(/{pendingCount}/g, '3')
            .replace(/{program}/g, 'बाल विकास योजना')
            .replace(/{trustName}/g, trust.name)
            .replace(/{trustShortName}/g, trust.shortName)}
        </div>
      </Modal>
    </div>
  )
}
