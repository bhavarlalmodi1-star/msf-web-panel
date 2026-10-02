"use client"
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { 
  Button, Card, Table, Space, Input, Tag, Avatar, 
  Badge, Tooltip, Row, Col, Statistic,
  message, Dropdown, Modal, Select, Tabs
} from 'antd'
import { 
  SearchOutlined, EyeOutlined, 
  CheckCircleOutlined, CloseCircleOutlined,
  DeleteOutlined, MoreOutlined,
  UserOutlined, PhoneOutlined,
  FileTextOutlined, CalendarOutlined,
  ReloadOutlined, DownloadOutlined,
  ClockCircleOutlined, HistoryOutlined,
  ExclamationCircleOutlined,
  UserSwitchOutlined, EditOutlined
} from '@ant-design/icons'
import { useAuth } from '@/components/Base/AuthProvider'
import dayjs from 'dayjs'
import { auth, db, storage } from '../../../lib/firbase-client'
import { 
  collection, query, where, getDocs, 
  doc, deleteDoc, serverTimestamp
} from 'firebase/firestore'
import { ref, deleteObject } from 'firebase/storage'
import { useSelector } from 'react-redux'
import EditMember    from '../members/components/EditMember'
import RejectModal   from './components/RejectModal'
import ApproveModal  from './components/ApproveModal'
import ViewRequests  from './components/ViewRequests'
import { generateRegistrationNumber } from '../members/components/components/firebaseUtils'

const { Search } = Input
const { Option }  = Select

// ─── Firestore helpers ────────────────────────────────────────────────────────
const fetchPendingMembers = async () => {
  try {
    const q = query(
      collection(db, 'members'),
      where('status',      '==', 'pending_approval'),
      where('delete_flag', '!=', true)
    )
    const snap = await getDocs(q)
    return snap.docs
      .map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.() || new Date(), requestedAt: d.data().requestedAt?.toDate?.() || new Date() }))
      .sort((a, b) => b.requestedAt - a.requestedAt)
  } catch (e) { console.error(e); return [] }
}

const fetchRejectedMembers = async () => {
  try {
    const q = query(
      collection(db, 'members'),
      where('status',      '==', 'rejected'),
      where('delete_flag', '!=', true)
    )
    const snap = await getDocs(q)
    return snap.docs
      .map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.() || new Date(), requestedAt: d.data().requestedAt?.toDate?.() || new Date(), rejectedAt: d.data().rejectedAt?.toDate?.() || new Date() }))
      .sort((a, b) => b.rejectedAt - a.rejectedAt)
  } catch (e) { console.error(e); return [] }
}

const getAgentName = (agentId, agentList) => {
  if (!agentId) return 'Admin/System'
  const a = agentList?.find(a => a.id === agentId || a.uid === agentId)
  return a ? a.name : 'Unknown Agent'
}

// Single program name (flat field)
const getProgramName = (member, programList) => {
  if (!member?.programId || !programList) return member?.programName || '—'
  return programList.find(p => p.id === member.programId)?.name || member.programName || '—'
}

const deleteMemberFiles = async (member) => {
  try {
    const urls = [member.photoURL, member.guardianPhotoURL, member.documentFrontURL, member.documentBackURL, member.guardianDocumentURL].filter(u => u?.includes('firebasestorage'))
    await Promise.allSettled(urls.map(u => deleteObject(ref(storage, u))))
  } catch (e) { console.error(e) }
}

// ─── Page ─────────────────────────────────────────────────────────────────────
const Page = () => {
  const [loading,                setLoading]                = useState(true)
  const [activeTab,              setActiveTab]              = useState('pending')
  const [pendingMembers,         setPendingMembers]         = useState([])
  const [rejectedMembers,        setRejectedMembers]        = useState([])
  const [selectedMember,         setSelectedMember]         = useState(null)
  const [detailDrawerVisible,    setDetailDrawerVisible]    = useState(false)
  const [approvalModalVisible,   setApprovalModalVisible]   = useState(false)
  const [rejectionModalVisible,  setRejectionModalVisible]  = useState(false)
  const [openEditMember,         setOpenEditMember]         = useState(false)
  const [editMemberId,           setEditMemberId]           = useState(null)
  const [filters, setFilters] = useState({ search: '', agentId: 'all', programId: 'all' })
  const [stats,   setStats]   = useState({
    pending:  { total: 0, todayRequests: 0, weekRequests: 0, agentRequests: {} },
    rejected: { total: 0, todayRequests: 0, weekRequests: 0, agentRequests: {} }
  })

  const programList = useSelector((s) => s.data.programList)
  const agentList   = useSelector((s) => s.data.agentList)
  const { user }    = useAuth()
  const isSuperAdmin = user?.role === 'superadmin'
  const usersPermissions = user?.permissions || {}
  const can = (key) => isSuperAdmin || !!usersPermissions?.actions?.[key]
  useEffect(() => { fetchAllData() }, [])

  const fetchAllData = async () => {
    setLoading(true); setDetailDrawerVisible(false)
    try {
      const [pending, rejected] = await Promise.all([fetchPendingMembers(), fetchRejectedMembers()])
      setPendingMembers(pending); setRejectedMembers(rejected)

      const today   = dayjs().startOf('day')
      const weekAgo = dayjs().subtract(7, 'day')
      const mkStats = (arr, dateKey) => ({
        total:          arr.length,
        todayRequests:  arr.filter(m => dayjs(m[dateKey]).isSame(today, 'day')).length,
        weekRequests:   arr.filter(m => dayjs(m[dateKey]).isAfter(weekAgo)).length,
        agentRequests:  arr.reduce((acc, m) => { if (m.agentId) acc[m.agentId] = (acc[m.agentId]||0)+1; return acc }, {})
      })
      setStats({ pending: mkStats(pending,'requestedAt'), rejected: mkStats(rejected,'rejectedAt') })
    } catch (e) { console.error(e); message.error('Failed to load data') }
    finally    { setLoading(false) }
  }

  const currentMembers = activeTab === 'pending' ? pendingMembers : rejectedMembers
  const currentStats   = activeTab === 'pending' ? stats.pending  : stats.rejected

  const filteredMembers = useMemo(() => {
    let list = [...currentMembers]
    if (filters.search) {
      const s = filters.search.toLowerCase()
      list = list.filter(m =>
        m.displayName?.toLowerCase().includes(s) ||
        m.fatherName?.toLowerCase().includes(s)  ||
        m.surname?.toLowerCase().includes(s)     ||
        m.phone?.includes(s) || m.aadhaarNo?.includes(s) ||
        m.registrationNumber?.toLowerCase().includes(s) ||
        m.village?.toLowerCase().includes(s) || m.city?.toLowerCase().includes(s)
      )
    }
    if (filters.agentId !== 'all')   list = list.filter(m => m.agentId === filters.agentId)
    if (filters.programId !== 'all') list = list.filter(m => m.programId === filters.programId)
    return list
  }, [activeTab, pendingMembers, rejectedMembers, filters])

  const handleViewMember    = (m) => { setSelectedMember(m); setDetailDrawerVisible(true) }
  const handleApproveMember = (m) => { setSelectedMember(m); setApprovalModalVisible(true) }
  const handleRejectMember  = (m) => { setSelectedMember(m); setRejectionModalVisible(true) }
  const handleEditMember    = (m) => { setEditMemberId(m.id); setOpenEditMember(true) }

  const handleDeleteMember = (member) => {
    Modal.confirm({
      title: 'Permanently Delete Request',
      icon: <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />,
      content: (
        <div>
          <p className="text-red-600 mb-2">This action cannot be undone!</p>
          <p>Delete <b>{member.displayName}</b>'s request and all uploaded files?</p>
        </div>
      ),
      okText: 'Yes, Delete Permanently', okType: 'danger', cancelText: 'Cancel',
      onOk: async () => {
        try {
          await deleteMemberFiles(member)
          await deleteDoc(doc(db, 'members', member.id))
          // Clean up payment summaries
          const psSnap = await getDocs(query(collection(db,'memberPaymentSummaries'), where('memberId','==',member.id)))
          await Promise.all(psSnap.docs.map(d => deleteDoc(d.ref)))
          message.success('Request deleted permanently')
          fetchAllData()
        } catch (e) { console.error(e); message.error('Failed to delete') }
      }
    })
  }

  const exportToCSV = () => {
    const status = activeTab === 'pending' ? 'Pending' : 'Rejected'
    const headers = ['Sr No','Reg No','Name','Phone','Aadhaar','Village','City','Program','Agent',
      activeTab === 'pending' ? 'Requested Date' : 'Rejected Date',
      activeTab === 'pending' ? 'Days Pending'  : 'Rejection Reason']
    const rows = filteredMembers.map((m, i) => [
      i+1, m.registrationNumber,
      `${m.displayName} ${m.fatherName} ${m.surname}`,
      m.phone, m.aadhaarNo, m.village, m.city,
      getProgramName(m, programList),
      getAgentName(m.agentId, agentList),
      activeTab === 'pending' ? dayjs(m.requestedAt).format('DD-MM-YYYY HH:mm') : dayjs(m.rejectedAt).format('DD-MM-YYYY HH:mm'),
      activeTab === 'pending' ? dayjs().diff(dayjs(m.requestedAt),'day') : (m.rejectionReason || 'No reason')
    ])
    const csv  = [headers, ...rows].map(r => r.map(c => typeof c === 'string' && c.includes(',') ? `"${c}"` : c).join(',')).join('\n')
    const url  = window.URL.createObjectURL(new Blob([csv], { type:'text/csv' }))
    const a    = document.createElement('a'); a.href = url; a.download = `${status.toLowerCase()}_${dayjs().format('YYYY-MM-DD')}.csv`; a.click()
  }

  // ── Shared columns ──────────────────────────────────────────────────────────
  const memberCol = {
    title: 'Member', key: 'member', width: 180,
    render: (_, r) => (
      <div className="flex items-center gap-2">
        <Avatar src={r.photoURL} icon={<UserOutlined />} size="small" />
        <div>
          <div className="font-medium text-sm">{r.displayName}</div>
          <div className="text-xs text-gray-500">{r.fatherName} • {r.surname}</div>
          <div className="text-xs text-gray-400">Age: {r.age || 'N/A'}</div>
        </div>
      </div>
    ),
  }
  const contactCol = {
    title: 'Contact', key: 'contact', width: 130,
    render: (_, r) => (
      <div>
        <div className="flex items-center gap-1 text-sm"><PhoneOutlined style={{fontSize:11}} />{r.phone}</div>
        {r.phoneAlt && <div className="text-xs text-gray-500">Alt: {r.phoneAlt}</div>}
      </div>
    ),
  }
  const agentCol = {
    title: 'Agent', key: 'agent', width: 120,
    render: (_, r) => (
      <div className="text-xs flex items-center gap-1">
        <UserSwitchOutlined style={{fontSize:11, color:'#1890ff'}} />
        <span className="font-medium truncate">{getAgentName(r.agentId, agentList)}</span>
      </div>
    ),
  }
  // Single program tag
  const programCol = {
    title: 'Yojna', key: 'program', width: 130,
    render: (_, r) => {
      const name = getProgramName(r, programList)
      return name !== '—' ? <Tag color="geekblue">{name}</Tag> : <span className="text-gray-400 text-xs">—</span>
    },
  }

  // ── Pending columns ─────────────────────────────────────────────────────────
  const pendingColumns = [
    { title: '#', key: 'idx', width: 50, render: (_, __, i) => i+1 },
    memberCol, contactCol,
    { title: 'Aadhaar', key: 'aadhaar', width: 130, render: (_, r) => <span className="text-sm">{r.aadhaarNo}</span> },
    agentCol, programCol,
    {
      title: 'Requested', key: 'requestedAt', width: 120,
      render: (_, r) => <div className="text-sm"><div>{dayjs(r.requestedAt).format('DD-MM-YYYY')}</div><div className="text-xs text-gray-500">{dayjs(r.requestedAt).format('hh:mm A')}</div></div>,
    },
    {
      title: 'Pending', key: 'days', width: 90,
      render: (_, r) => {
        const d = dayjs().diff(dayjs(r.requestedAt),'day')
        return <Tag color={d > 14 ? 'red' : d > 7 ? 'orange' : 'green'}>{d}d</Tag>
      },
    },
    {
      title: 'Actions', key: 'actions', width: 140, fixed: 'right',
      render: (_, r) => (
        <Space>
          {/* 👁 VIEW */}
          {can('view') && (
            <Tooltip title="View">
              <Button type="text" icon={<EyeOutlined />} size="small" onClick={() => handleViewMember(r)} />
            </Tooltip>
          )}

          {/* ✏️ EDIT — visible to superadmin + users with edit permission */}
          {can('edit') && (
            <Tooltip title="Edit Member">
              <Button type="text" icon={<EditOutlined />} size="small" onClick={() => handleEditMember(r)} />
            </Tooltip>
          )}

          {/* ✅ APPROVE */}
          {can('approve') && (
            <Tooltip title="Approve">
              <Button type="text" icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />} size="small" onClick={() => handleApproveMember(r)} />
            </Tooltip>
          )}

          {/* ⋮ MORE OPTIONS (reject / delete) */}
          {(can('reject') || can('delete')) && (
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  can('reject') && {
                    key: 'reject',
                    label: 'Reject',
                    icon: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
                    onClick: () => handleRejectMember(r),
                  },
                  can('reject') && can('delete') && { type: 'divider' },
                  can('delete') && {
                    key: 'delete',
                    label: 'Delete',
                    danger: true,
                    icon: <DeleteOutlined style={{ color: '#ff4d4f' }} />,
                    onClick: () => handleDeleteMember(r),
                  },
                ].filter(Boolean),
              }}
            >
              <Button type="text" icon={<MoreOutlined />} size="small" />
            </Dropdown>
          )}
        </Space>
      ),
    },
  ]

  // ── Rejected columns ────────────────────────────────────────────────────────
  const rejectedColumns = [
    { title: '#', key: 'idx', width: 50, render: (_, __, i) => i+1 },
    memberCol, contactCol, agentCol, programCol,
    {
      title: 'Rejected On', key: 'rejectedAt', width: 120,
      render: (_, r) => <div className="text-sm"><div>{dayjs(r.rejectedAt).format('DD-MM-YYYY')}</div><div className="text-xs text-gray-500">{dayjs(r.rejectedAt).format('hh:mm A')}</div></div>,
    },
    {
      title: 'Rejected By', key: 'rejectedBy', width: 120,
      render: (_, r) => <div className="text-xs font-medium">{r.rejectedByName || 'Unknown'}</div>,
    },
    {
      title: 'Reason', key: 'reason', width: 200,
      render: (_, r) => (
        <Tooltip title={r.rejectionReason}>
          <div className="text-sm text-red-600 max-w-[180px] truncate">
            <CloseCircleOutlined className="mr-1" />{r.rejectionReason || 'No reason'}
          </div>
        </Tooltip>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 130,
      fixed: 'right',
      render: (_, r) => (
        <Space>
          {/* 👁 VIEW */}
          {can('view') && (
            <Tooltip title="View">
              <Button type="text" icon={<EyeOutlined />} size="small" onClick={() => handleViewMember(r)} />
            </Tooltip>
          )}

          {/* ✏️ EDIT — visible to superadmin + users with edit permission */}
          {can('edit') && (
            <Tooltip title="Edit Member">
              <Button type="text" icon={<EditOutlined />} size="small" onClick={() => handleEditMember(r)} />
            </Tooltip>
          )}

          {/* ⋮ DELETE (dropdown, only if has permission) */}
          {can('delete') && (
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  {
                    key: 'delete',
                    label: 'Delete',
                    danger: true,
                    icon: <DeleteOutlined style={{ color: '#ff4d4f' }} />,
                    onClick: () => handleDeleteMember(r),
                  },
                ],
              }}
            >
              <Button type="text" icon={<MoreOutlined />} size="small" />
            </Dropdown>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Card>
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClockCircleOutlined className="text-orange-500" /> Member Requests
            </h1>
            <p className="text-gray-500">Manage pending and rejected member registration requests</p>
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchAllData} loading={loading}>Refresh</Button>
            <Button icon={<DownloadOutlined />} onClick={exportToCSV} disabled={!filteredMembers.length}>Export CSV</Button>
          </Space>
        </div>

        {/* Tabs */}
        <Tabs activeKey={activeTab} onChange={setActiveTab} className="mb-4" items={[
          { key: 'pending',  label: <span><ClockCircleOutlined className="mr-1" />Pending ({stats.pending.total})</span> },
          { key: 'rejected', label: <span><CloseCircleOutlined className="mr-1" />Rejected ({stats.rejected.total})</span> },
        ]} />

        {/* Stats */}
        <Row gutter={16} className="mb-4">
          {[
            { title: `Total ${activeTab === 'pending' ? 'Pending' : 'Rejected'}`, value: currentStats.total, icon: activeTab === 'pending' ? <ClockCircleOutlined /> : <CloseCircleOutlined />, color: activeTab === 'pending' ? '#fa8c16' : '#ff4d4f' },
            { title: "Today's Requests", value: currentStats.todayRequests, icon: <CalendarOutlined />, color: '#52c41a' },
            { title: 'Last 7 Days',      value: currentStats.weekRequests,  icon: <HistoryOutlined />,  color: '#1890ff' },
          ].map((s, i) => (
            <Col span={8} key={i}>
              <Card size="small"><Statistic title={s.title} value={s.value} prefix={s.icon} valueStyle={{ color: s.color }} /></Card>
            </Col>
          ))}
        </Row>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center mb-4">
          <Search
            placeholder={`Search ${activeTab} requests...`}
            prefix={<SearchOutlined />} style={{ width: 280 }}
            onChange={e => setFilters(p => ({...p, search: e.target.value}))}
            value={filters.search} allowClear
          />
          <Select
            placeholder="All Agents" style={{ width: 180 }}
            value={filters.agentId}
            onChange={v => setFilters(p => ({...p, agentId: v||'all'}))}
            allowClear showSearch optionFilterProp="children"
          >
            <Option value="all">All Agents</Option>
            {agentList?.map(a => (
              <Option key={a.id} value={a.uid}>
                {a.name} ({(activeTab === 'pending' ? stats.pending : stats.rejected).agentRequests[a.uid] || 0})
              </Option>
            ))}
          </Select>
          <Select
            placeholder="All Programs" style={{ width: 180 }}
            value={filters.programId}
            onChange={v => setFilters(p => ({...p, programId: v||'all'}))}
            allowClear showSearch optionFilterProp="children"
          >
            <Option value="all">All Programs</Option>
            {programList?.map(p => <Option key={p.id} value={p.id}>{p.name}</Option>)}
          </Select>
          {(filters.search || filters.agentId !== 'all' || filters.programId !== 'all') && (
            <Button type="link" onClick={() => setFilters({ search:'', agentId:'all', programId:'all' })} icon={<ReloadOutlined />}>Clear</Button>
          )}
          <span className="text-gray-500 text-sm ml-auto">Showing {filteredMembers.length} of {currentMembers.length}</span>
        </div>

        {/* Table */}
        <Table
          columns={activeTab === 'pending' ? pendingColumns : rejectedColumns}
          dataSource={filteredMembers} rowKey="id" loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t, r) => `${r[0]}-${r[1]} of ${t}`, pageSizeOptions: ['10','20','50'] }}
          scroll={{ x: 1300 }} size="small"
        />
      </Card>

      <ViewRequests
        activeTab={activeTab} open={detailDrawerVisible} setOpen={setDetailDrawerVisible}
        handleRejectMember={handleRejectMember} handleApproveMember={handleApproveMember}
        selectedMember={selectedMember} setSelectedMember={setSelectedMember}
        fetchAllData={fetchAllData} programList={programList} user={user}
        getAgentName={getAgentName} agentList={agentList}
      />

      {approvalModalVisible && (
        <ApproveModal
          open={approvalModalVisible} setOpen={setApprovalModalVisible}
          selectedMember={selectedMember} setSelectedMember={setSelectedMember}
          fetchAllData={fetchAllData} programList={programList} user={user}
        />
      )}

      {rejectionModalVisible && (
        <RejectModal
          open={rejectionModalVisible} setOpen={setRejectionModalVisible}
          selectedMember={selectedMember} setSelectedMember={setSelectedMember}
          fetchAllData={fetchAllData} programList={programList} user={user}
        />
      )}

      <EditMember
        programs={programList||[]} agents={agentList||[]}
        open={openEditMember} setOpen={setOpenEditMember}
        currentUser={user} memberId={editMemberId}
        onSuccess={fetchAllData}
      />
    </div>
  )
}

export default Page