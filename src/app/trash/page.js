"use client"
import React, { useState, useEffect } from 'react'
import {
  Card, Tabs, Table, Button, Space, Tag, Avatar, Modal,
  message, Input, Tooltip, Badge, Popconfirm, Empty,
  Drawer, Descriptions, Row, Col, Statistic
} from 'antd'
import {
  DeleteOutlined, ReloadOutlined, RollbackOutlined, SearchOutlined,
  UserOutlined, TeamOutlined, DollarOutlined, ExclamationCircleOutlined,
  EyeOutlined, ClearOutlined, WarningOutlined, FileTextOutlined,
  PhoneOutlined, MailOutlined, EnvironmentOutlined, IdcardOutlined, CalendarOutlined
} from '@ant-design/icons'
import {
  collection, query, where, getDocs, doc, updateDoc, deleteDoc,
  orderBy, writeBatch
} from 'firebase/firestore'
import { ref, deleteObject } from 'firebase/storage'
import { db, storage, auth } from '../../../lib/firbase-client'
import { useAuth } from '@/components/Base/AuthProvider'
import dayjs from 'dayjs'

const { TabPane } = Tabs
const { Search } = Input

// ─── API helpers ──────────────────────────────────────────────────────────────
const getToken = async () => {
  const user = auth.currentUser
  return user ? await user.getIdToken() : ''
}

// POST  → soft-delete + decrement counters
const apiDeleteMember = async (memberId) => {
  const res = await fetch('/api/members/delete-restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getToken()}` },
    body: JSON.stringify({ memberId }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.message || 'Delete failed')
  return data
}

// PATCH → restore + increment counters
const apiRestoreMember = async (memberId) => {
  const res = await fetch('/api/members/delete-restore', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getToken()}` },
    body: JSON.stringify({ memberId }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.message || 'Restore failed')
  return data
}

// DELETE → permanent delete (counters already decremented at soft-delete)
const apiPermanentDeleteMember = async (memberId) => {
  const res = await fetch('/api/members/delete-restore', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getToken()}` },
    body: JSON.stringify({ memberId }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.message || 'Permanent delete failed')
  return data
}

// PATCH → restore agent + re-enable Auth account
const apiRestoreAgent = async (agentId) => {
  const res = await fetch('/api/agents', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getToken()}` },
    body: JSON.stringify({ id: agentId, action: 'restore' }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.message || 'Agent restore failed')
  return data
}

// DELETE → permanent delete agent (storage + Auth + Firestore)
const apiPermanentDeleteAgent = async (agentId) => {
  const res = await fetch(`/api/agents?id=${agentId}&hard=true`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${await getToken()}` },
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.message || 'Agent permanent delete failed')
  return data
}

// ─── Storage file cleanup (client side) ──────────────────────────────────────
const deleteStorageFiles = async (item, type) => {
  const urls = type === 'member'
    ? [item.photoURL, item.guardianPhotoURL, item.documentFrontURL, item.documentBackURL, item.guardianDocumentURL]
    : [item.photoUrl, item.documentUrl]
  const toDelete = urls.filter(u => u?.includes('firebasestorage'))
  await Promise.allSettled(toDelete.map(u => deleteObject(ref(storage, u)).catch(() => { })))
  return toDelete.length
}

// ─────────────────────────────────────────────────────────────────────────────
const TrashManagementPage = () => {
  const [activeTab, setActiveTab] = useState('members')
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [deletedMembers, setDeletedMembers] = useState([])
  const [deletedAgents, setDeletedAgents] = useState([])
  const [deletedTransactions, setDeletedTransactions] = useState([])
  const [viewDrawerVisible, setViewDrawerVisible] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [viewType, setViewType] = useState('member')
  const [stats, setStats] = useState({ totalMembers: 0, totalAgents: 0, totalTransactions: 0, totalItems: 0 })
  const { user } = useAuth()

  useEffect(() => { fetchAllDeletedData() }, [])

  const fetchAllDeletedData = async () => {
    setLoading(true)
    try {
      await Promise.all([fetchDeletedMembers(), fetchDeletedAgents(), fetchDeletedTransactions()])
    } catch (e) { console.error(e); message.error('Failed to load trash data') }
    finally { setLoading(false) }
  }

  const fetchDeletedMembers = async () => {
    const snap = await getDocs(query(collection(db, 'members'), where('delete_flag', '==', true), orderBy('deleted_at', 'desc')))
    const data = snap.docs.map(d => ({ id: d.id, ...d.data(), deleted_at: d.data().deleted_at?.toDate?.() || null, createdAt: d.data().createdAt?.toDate?.() || null }))
    setDeletedMembers(data)
    setStats(p => ({ ...p, totalMembers: data.length, totalItems: data.length + (p.totalAgents || 0) + (p.totalTransactions || 0) }))
  }

  const fetchDeletedAgents = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'agents'), where('delete_flag', '==', true), orderBy('deleted_at', 'desc')))
      const data = snap.docs.map(d => ({ id: d.id, ...d.data(), deleted_at: d.data().deleted_at?.toDate?.() || null }))
      setDeletedAgents(data)
      setStats(p => ({ ...p, totalAgents: data.length, totalItems: (p.totalMembers || 0) + data.length + (p.totalTransactions || 0) }))
    } catch (e) { console.error(e) }
  }

  const fetchDeletedTransactions = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'transactions'), where('delete_flag', '==', true), orderBy('deleted_at', 'desc')))
      const data = snap.docs.map(d => ({ id: d.id, ...d.data(), deleted_at: d.data().deleted_at?.toDate?.() || null }))
      setDeletedTransactions(data)
      setStats(p => ({ ...p, totalTransactions: data.length, totalItems: (p.totalMembers || 0) + (p.totalAgents || 0) + data.length }))
    } catch (e) { console.error(e) }
  }

  // ── Restore ───────────────────────────────────────────────────────────────
  const handleRestore = (item, type) => {
    Modal.confirm({
      title: 'Confirm Restore',
      icon: <ExclamationCircleOutlined />,
      content: `Restore this ${type}? It will be available again in the system.`,
      okText: 'Yes, Restore', cancelText: 'Cancel',
      onOk: async () => {
        try {
          if (type === 'member') {
            // API handles: delete_flag=false, status=active + counter increment
            await apiRestoreMember(item.id)
          } else if (type === 'agent') {
            // API handles: delete_flag=false, Auth re-enabled
            await apiRestoreAgent(item.id)
          } else {
            // Transactions — simple flag restore
            await updateDoc(doc(db, 'transactions', item.id), {
              delete_flag: false, deleted_at: null, deleted_by: null,
              restored_at: new Date(), restored_by: user?.uid
            })
          }
          message.success(`${type.charAt(0).toUpperCase() + type.slice(1)} restored successfully!`)
          fetchAllDeletedData()
        } catch (e) { console.error(e); message.error('Failed to restore: ' + e.message) }
      }
    })
  }

  // ── Permanent delete ──────────────────────────────────────────────────────
  const handlePermanentDelete = (item, type) => {
    Modal.confirm({
      title: 'Permanent Delete',
      icon: <WarningOutlined style={{ color: '#ff4d4f' }} />,
      content: (
        <div>
          <p className="text-red-600 font-semibold mb-2">⚠️ This action is irreversible!</p>
          <p>Permanently delete this {type}?{type === 'member' && ' All files and related transactions will also be deleted.'}</p>
        </div>
      ),
      okText: 'Yes, Delete Permanently', okType: 'danger', cancelText: 'Cancel',
      onOk: async () => {
        try {
          setLoading(true)
          if (type === 'member') {
            // Delete storage files client-side
            await deleteStorageFiles(item, 'member')
            // API handles: Firestore doc deletion + memberJoinFees cleanup
            // NOTE: counters were already decremented at soft-delete time — no decrement here
            await apiPermanentDeleteMember(item.id)
          } else if (type === 'agent') {
            // API handles: storage files (server-side) + Auth delete + Firestore delete
            await apiPermanentDeleteAgent(item.id)
          } else {
            await deleteDoc(doc(db, 'transactions', item.id))
          }
          message.success(`${type.charAt(0).toUpperCase() + type.slice(1)} permanently deleted!`)
          fetchAllDeletedData()
        } catch (e) { console.error(e); message.error(`Failed to delete: ${e.message}`) }
        finally { setLoading(false) }
      }
    })
  }

  // ── Empty trash ───────────────────────────────────────────────────────────
  const handleEmptyTrash = (type) => {
    const items = type === 'members' ? deletedMembers : type === 'agents' ? deletedAgents : deletedTransactions
    if (!items.length) { message.info('Trash is already empty'); return }

    Modal.confirm({
      title: 'Empty Trash',
      icon: <WarningOutlined style={{ color: '#ff4d4f' }} />,
      content: <div><p className="text-red-600 font-semibold mb-2">⚠️ Permanently delete all {items.length} {type}?</p><p className="text-sm text-gray-600">This cannot be undone.</p></div>,
      okText: 'Yes, Empty Trash', okType: 'danger', cancelText: 'Cancel',
      onOk: async () => {
        try {
          setLoading(true)
          if (type === 'members') {
            // Each member: delete storage + call permanent delete API
            for (const item of items) {
              await deleteStorageFiles(item, 'member').catch(() => { })
              await apiPermanentDeleteMember(item.id).catch(e => console.error(e))
            }
          } else if (type === 'agents') {
            // API handles storage + Auth + Firestore per agent
            for (const item of items) {
              await apiPermanentDeleteAgent(item.id).catch(e => console.error(e))
            }
          } else {
            // Transactions: batch delete from Firestore
            const batch = writeBatch(db)
            items.forEach(item => batch.delete(doc(db, 'transactions', item.id)))
            await batch.commit()
          }
          message.success(`Successfully deleted all ${items.length} ${type}!`)
          fetchAllDeletedData()
        } catch (e) { console.error(e); message.error(`Failed to empty trash: ${e.message}`) }
        finally { setLoading(false) }
      }
    })
  }

  const handleView = (item, type) => { setSelectedItem(item); setViewType(type); setViewDrawerVisible(true) }

  const filterData = (data) => {
    if (!searchText) return data
    const s = searchText.toLowerCase()
    return data.filter(item =>
      [item.name, item.displayName, item.email, item.phone, item.phone1,
      item.registrationNumber, item.village, item.city, item.fatherName, item.aadhaarNo]
        .some(f => f?.toLowerCase().includes(s))
    )
  }

  // ── Member columns ─────────────────────────────────────────────────────────
  const memberColumns = [
    {
      title: 'Member', key: 'member', width: 250,
      render: (_, r) => <div className="flex items-center gap-3"><Avatar src={r.photoURL} icon={<UserOutlined />} size={40} /><div><div className="font-medium">{r.displayName}</div><div className="text-xs text-gray-500">{r.registrationNumber}</div></div></div>
    },
    { title: 'Contact', key: 'contact', width: 150, render: (_, r) => <div><div className="text-sm">{r.phone}</div><div className="text-xs text-gray-500">{r.village}</div></div> },
    {
      title: 'Program', key: 'program', width: 130,
      render: (_, r) => r.programName ? <Tag color="blue">{r.programName}</Tag> : <Tag color="gray">—</Tag>
    },
    { title: 'Deleted On', dataIndex: 'deleted_at', key: 'deleted_at', width: 150, render: d => d ? dayjs(d).format('DD/MM/YYYY HH:mm') : 'N/A' },
    {
      title: 'Actions', key: 'actions', width: 200, fixed: 'right',
      render: (_, r) => (
        <Space>
          <Tooltip title="View Details"><Button type="text" icon={<EyeOutlined />} onClick={() => handleView(r, 'member')} size="small" /></Tooltip>
          <Tooltip title="Restore">
            <Button type="primary" icon={<RollbackOutlined />} onClick={() => handleRestore(r, 'member')} size="small">Restore</Button>
          </Tooltip>
          <Popconfirm
            title="Delete Permanently"
            description={<div className="max-w-xs"><p className="text-red-600 font-semibold mb-1">Cannot be undone!</p><p className="text-sm">All files and transactions will be deleted.</p></div>}
            onConfirm={() => handlePermanentDelete(r, 'member')} okText="Delete" cancelText="Cancel" okType="danger">
            <Tooltip title="Delete Permanently"><Button danger type="text" icon={<DeleteOutlined />} size="small" /></Tooltip>
          </Popconfirm>
        </Space>
      )
    },
  ]

  // ── Agent columns ──────────────────────────────────────────────────────────
  const agentColumns = [
    {
      title: 'Agent', key: 'agent', width: 250,
      render: (_, r) => <div className="flex items-center gap-3"><Avatar src={r.photoUrl} icon={<UserOutlined />} size={40} /><div><div className="font-medium">{r.name}</div><div className="text-xs text-gray-500">{r.email}</div></div></div>
    },
    { title: 'Contact', key: 'contact', width: 150, render: (_, r) => <div><div className="text-sm">{r.phone1}</div><div className="text-xs text-gray-500">{r.city}</div></div> },
    { title: 'Deleted On', dataIndex: 'deleted_at', key: 'deleted_at', width: 150, render: d => d ? dayjs(d).format('DD/MM/YYYY HH:mm') : 'N/A' },
    {
      title: 'Actions', key: 'actions', width: 200, fixed: 'right',
      render: (_, r) => (
        <Space>
          <Tooltip title="View Details"><Button type="text" icon={<EyeOutlined />} onClick={() => handleView(r, 'agent')} size="small" /></Tooltip>
          <Button type="primary" icon={<RollbackOutlined />} onClick={() => handleRestore(r, 'agent')} size="small">Restore</Button>
          <Popconfirm title="Delete Permanently" description="This cannot be undone!"
            onConfirm={() => handlePermanentDelete(r, 'agent')} okText="Delete" cancelText="Cancel" okType="danger">
            <Button danger type="text" icon={<DeleteOutlined />} size="small" />
          </Popconfirm>
        </Space>
      )
    },
  ]

  // ── Transaction columns ────────────────────────────────────────────────────
  const transactionColumns = [
    { title: 'Transaction ID', dataIndex: 'transactionId', key: 'transactionId', width: 150, render: t => <Tag color="blue">{t}</Tag> },
    { title: 'Type', dataIndex: 'type', key: 'type', width: 120, render: t => <Tag color={t === 'credit' ? 'green' : 'red'}>{t?.toUpperCase()}</Tag> },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120, render: a => <span className="font-semibold">₹{a?.toLocaleString()}</span> },
    { title: 'Member/Agent', key: 'party', width: 200, render: (_, r) => <div><div className="font-medium">{r.memberName || r.agentName}</div><div className="text-xs text-gray-500">{r.description}</div></div> },
    { title: 'Deleted On', dataIndex: 'deleted_at', key: 'deleted_at', width: 150, render: d => d ? dayjs(d).format('DD/MM/YYYY HH:mm') : 'N/A' },
    {
      title: 'Actions', key: 'actions', width: 200, fixed: 'right',
      render: (_, r) => (
        <Space>
          <Tooltip title="View Details"><Button type="text" icon={<EyeOutlined />} onClick={() => handleView(r, 'transaction')} size="small" /></Tooltip>
          <Button type="primary" icon={<RollbackOutlined />} onClick={() => handleRestore(r, 'transaction')} size="small">Restore</Button>
          <Popconfirm title="Delete Permanently" description="Cannot be undone!" onConfirm={() => handlePermanentDelete(r, 'transaction')} okText="Delete" cancelText="Cancel" okType="danger">
            <Button danger type="text" icon={<DeleteOutlined />} size="small" />
          </Popconfirm>
        </Space>
      )
    },
  ]

  return (
    <div className="p-4 bg-gray-50 min-h-screen flex flex-col gap-4">
      {/* Header */}
      <Card className="shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><DeleteOutlined className="text-red-600" />Trash Management</h1>
            <p className="text-gray-500">Restore or permanently delete items. Member counters update automatically.</p>
          </div>
          <Button icon={<ReloadOutlined />} onClick={fetchAllDeletedData} loading={loading}>Refresh</Button>
        </div>
        <Row gutter={16}>
          {[
            { title: 'Total Items', value: stats.totalItems, icon: <DeleteOutlined />, color: '#3f51b5' },
            { title: 'Deleted Members', value: stats.totalMembers, icon: <TeamOutlined />, color: '#52c41a' },
            { title: 'Deleted Agents', value: stats.totalAgents, icon: <UserOutlined />, color: '#722ed1' },
            { title: 'Deleted Transactions', value: stats.totalTransactions, icon: <DollarOutlined />, color: '#fa8c16' },
          ].map(s => (
            <Col span={6} key={s.title}>
              <Card size="small"><Statistic title={s.title} value={s.value} prefix={s.icon} valueStyle={{ color: s.color }} /></Card>
            </Col>
          ))}
        </Row>
      </Card>

      {/* Main content */}
      <Card className="shadow-sm">
        <Tabs activeKey={activeTab} onChange={setActiveTab}
          tabBarExtraContent={
            <Space>
              <Search placeholder="Search..." prefix={<SearchOutlined />} style={{ width: 280 }} onChange={e => setSearchText(e.target.value)} allowClear />
              <Button danger icon={<ClearOutlined />} onClick={() => handleEmptyTrash(activeTab)}
                disabled={(activeTab === 'members' && !deletedMembers.length) || (activeTab === 'agents' && !deletedAgents.length) || (activeTab === 'transactions' && !deletedTransactions.length)}>
                Empty Trash
              </Button>
            </Space>
          }
        >
          <TabPane tab={<span><TeamOutlined />Members<Badge count={stats.totalMembers} showZero style={{ marginLeft: 8, backgroundColor: '#52c41a' }} /></span>} key="members">
            <Table columns={memberColumns} dataSource={filterData(deletedMembers)} rowKey="id" loading={loading}
              pagination={{ pageSize: 10, showSizeChanger: true, showTotal: t => `Total ${t} deleted members` }}
              scroll={{ x: 1000 }} locale={{ emptyText: <Empty description="No deleted members" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }} />
          </TabPane>

          <TabPane tab={<span><UserOutlined />Agents<Badge count={stats.totalAgents} showZero style={{ marginLeft: 8, backgroundColor: '#722ed1' }} /></span>} key="agents">
            <Table columns={agentColumns} dataSource={filterData(deletedAgents)} rowKey="id" loading={loading}
              pagination={{ pageSize: 10, showSizeChanger: true, showTotal: t => `Total ${t} deleted agents` }}
              scroll={{ x: 1000 }} locale={{ emptyText: <Empty description="No deleted agents" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }} />
          </TabPane>

          {/* <TabPane tab={<span><DollarOutlined />Transactions<Badge count={stats.totalTransactions} showZero style={{ marginLeft: 8, backgroundColor: '#fa8c16' }} /></span>} key="transactions">
            <Table columns={transactionColumns} dataSource={filterData(deletedTransactions)} rowKey="id" loading={loading}
              pagination={{ pageSize: 10, showSizeChanger: true, showTotal: t => `Total ${t} deleted transactions` }}
              scroll={{ x: 1000 }} locale={{ emptyText: <Empty description="No deleted transactions" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }} />
          </TabPane> */}
        </Tabs>
      </Card>

      {/* View drawer */}
      <Drawer title={`${viewType.charAt(0).toUpperCase() + viewType.slice(1)} Details`} placement="right" width={600}
        open={viewDrawerVisible} onClose={() => setViewDrawerVisible(false)}
        footer={
          <Space className="w-full justify-end">
            <Button onClick={() => setViewDrawerVisible(false)}>Close</Button>
            <Button type="primary" icon={<RollbackOutlined />} onClick={() => { handleRestore(selectedItem, viewType); setViewDrawerVisible(false) }}>Restore</Button>
            <Button danger icon={<DeleteOutlined />} onClick={() => { handlePermanentDelete(selectedItem, viewType); setViewDrawerVisible(false) }}>Delete Permanently</Button>
          </Space>
        }
      >
        {selectedItem && (
          <div className="space-y-4">
            {viewType === 'member' && (
              <>
                <Card className="bg-gray-50">
                  <div className="flex items-center gap-4 mb-4">
                    <Avatar src={selectedItem.photoURL} icon={<UserOutlined />} size={80} />
                    <div>
                      <h3 className="text-lg font-semibold">{selectedItem.displayName}</h3>
                      <Tag color="blue">{selectedItem.registrationNumber}</Tag>
                      {selectedItem.programName && <Tag color="pink" className="ml-1">{selectedItem.programName}</Tag>}
                    </div>
                  </div>
                </Card>
                <Descriptions title="Member Information" bordered column={1}>
                  <Descriptions.Item label="Father Name">{selectedItem.fatherName || 'N/A'}</Descriptions.Item>
                  <Descriptions.Item label="Phone"><PhoneOutlined className="mr-1" />{selectedItem.phone || 'N/A'}</Descriptions.Item>
                  <Descriptions.Item label="Aadhaar"><IdcardOutlined className="mr-1" />{selectedItem.aadhaarNo || 'N/A'}</Descriptions.Item>
                  <Descriptions.Item label="Village/City"><EnvironmentOutlined className="mr-1" />{selectedItem.village}, {selectedItem.city}</Descriptions.Item>
                  <Descriptions.Item label="Join Date"><CalendarOutlined className="mr-1" />{selectedItem.dateJoin || 'N/A'}</Descriptions.Item>
                  <Descriptions.Item label="Join Fees">₹{selectedItem.joinFees || 0} (Paid: ₹{selectedItem.paidAmount || 0}, Pending: ₹{selectedItem.pendingAmount || 0})</Descriptions.Item>
                  {(selectedItem.closing_totalAmount > 0) && (
                    <Descriptions.Item label="Closing Fees">Total: ₹{selectedItem.closing_totalAmount || 0} (Paid: ₹{selectedItem.closing_paidAmount || 0}, Pending: ₹{selectedItem.closing_pendingAmount || 0})</Descriptions.Item>
                  )}
                  <Descriptions.Item label="Deleted On">{selectedItem.deleted_at ? dayjs(selectedItem.deleted_at).format('DD/MM/YYYY HH:mm') : 'N/A'}</Descriptions.Item>
                </Descriptions>
              </>
            )}
            {viewType === 'agent' && (
              <>
                <Card className="bg-gray-50">
                  <div className="flex items-center gap-4"><Avatar src={selectedItem.photoUrl} icon={<UserOutlined />} size={80} /><div><h3 className="text-lg font-semibold">{selectedItem.name}</h3><p className="text-gray-600">{selectedItem.email}</p></div></div>
                </Card>
                <Descriptions title="Agent Information" bordered column={1}>
                  <Descriptions.Item label="Phone"><PhoneOutlined className="mr-1" />{selectedItem.phone1 || 'N/A'}</Descriptions.Item>
                  <Descriptions.Item label="Email"><MailOutlined className="mr-1" />{selectedItem.email || 'N/A'}</Descriptions.Item>
                  <Descriptions.Item label="Location"><EnvironmentOutlined className="mr-1" />{selectedItem.city}, {selectedItem.district}, {selectedItem.state}</Descriptions.Item>
                  <Descriptions.Item label="Deleted On">{selectedItem.deleted_at ? dayjs(selectedItem.deleted_at).format('DD/MM/YYYY HH:mm') : 'N/A'}</Descriptions.Item>
                </Descriptions>
              </>
            )}
            {viewType === 'transaction' && (
              <Descriptions title="Transaction Information" bordered column={1}>
                <Descriptions.Item label="Transaction ID"><Tag color="blue">{selectedItem.transactionId}</Tag></Descriptions.Item>
                <Descriptions.Item label="Type"><Tag color={selectedItem.type === 'credit' ? 'green' : 'red'}>{selectedItem.type?.toUpperCase()}</Tag></Descriptions.Item>
                <Descriptions.Item label="Amount"><span className="text-lg font-semibold">₹{selectedItem.amount?.toLocaleString()}</span></Descriptions.Item>
                <Descriptions.Item label="Description">{selectedItem.description}</Descriptions.Item>
                <Descriptions.Item label="Deleted On">{selectedItem.deleted_at ? dayjs(selectedItem.deleted_at).format('DD/MM/YYYY HH:mm') : 'N/A'}</Descriptions.Item>
              </Descriptions>
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}

export default TrashManagementPage