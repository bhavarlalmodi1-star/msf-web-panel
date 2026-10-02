// app/settings/users/page.tsx
"use client"
import React, { useState, useEffect } from 'react'
import {
  Table,
  Button,
  Card,
  Input,
  Select,
  Space,
  Typography,
  Badge,
  Tag,
  Avatar,
  message,
  Popconfirm,
  Tooltip,
  Modal,
  Divider,
  Row,
  Col,
  Statistic,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  SecurityScanOutlined,
  ReloadOutlined,
  UserOutlined,
  CrownOutlined,
  SettingOutlined,
  SearchOutlined,
  FilterOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { useAuth } from '@/components/Base/AuthProvider'
import { userApi } from '@/utils/api'
import UserDrawer from '@/components/pages/settings/users/UserDrawer'
import PermissionDrawer from '@/components/pages/settings/users/PermissionDrawer'

const { Title, Paragraph, Text } = Typography
const { Option } = Select

const ROLES = {
  SUPER_ADMIN: 'superadmin',
  ADMIN: 'admin',
  AGENT: 'agent',
  MEMBER: 'member',
}

const ROLE_CONFIG = {
  superadmin: { color: '#f59e0b', bg: '#fef3c7', label: 'Super Admin', icon: <CrownOutlined /> },
  admin:      { color: '#ef4444', bg: '#fee2e2', label: 'Admin',       icon: <SettingOutlined /> },
  agent:      { color: '#10b981', bg: '#d1fae5', label: 'Agent',       icon: <UserOutlined /> },
  member:     { color: '#6366f1', bg: '#ede9fe', label: 'Member',      icon: <UserOutlined /> },
}

const STATUS_CONFIG = {
  active:    { dot: '#10b981', text: '#065f46', bg: '#d1fae5', label: 'Active' },
  inactive:  { dot: '#ef4444', text: '#991b1b', bg: '#fee2e2', label: 'Inactive' },
  pending:   { dot: '#f59e0b', text: '#92400e', bg: '#fef3c7', label: 'Pending' },
  suspended: { dot: '#94a3b8', text: '#334155', bg: '#f1f5f9', label: 'Suspended' },
}

const UsersPage = () => {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [permissionDrawerVisible, setPermissionDrawerVisible] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [editingUser, setEditingUser] = useState(null)
  const [searchText, setSearchText] = useState('')
  const [filterRole, setFilterRole] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 })
  const { user: currentUser } = useAuth()

  const canManageUsers =
    currentUser?.role === ROLES.SUPER_ADMIN || currentUser?.role === ROLES.ADMIN

  useEffect(() => {
    fetchUsers()
  }, [pagination.current, filterRole, filterStatus])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const result = await userApi.getUsers(pagination.current, { role: 'all', status: 'all', page: pagination.current })
      setUsers(result.data)
      setPagination(prev => ({ ...prev, total: result.pagination.total }))
    } catch (error) {
      message.error('Failed to fetch users')
    } finally {
      setLoading(false)
    }
  }

  // ─── Computed stats ──────────────────────────────────────────────────────────
  const stats = {
    total: users.length,
    active: users.filter(u => u.status === 'active').length,
    admins: users.filter(u => u.role === ROLES.ADMIN || u.role === ROLES.SUPER_ADMIN).length,
    pending: users.filter(u => u.status === 'pending').length,
  }

  // ─── Filtered users ──────────────────────────────────────────────────────────
  const filteredUsers = users.filter(user => {
    const matchSearch = !searchText || (
      user.name?.toLowerCase().includes(searchText.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchText.toLowerCase()) ||
      user.phone?.toLowerCase().includes(searchText.toLowerCase())
    )
    const matchRole = filterRole === 'all' || user.role === filterRole
    const matchStatus = filterStatus === 'all' || user.status === filterStatus
    return matchSearch && matchRole && matchStatus
  })

  // ─── Handlers ────────────────────────────────────────────────────────────────
  const handleViewDetails = (user) => {
    Modal.info({
      title: null,
      icon: null,
      width: 520,
      footer: null,
      content: (
        <div>
          {/* Hero */}
          <div style={{
            background: 'linear-gradient(135deg, #ef4444, #f59e0b)',
            margin: '-20px -24px 0',
            padding: '24px',
            borderRadius: '8px 8px 0 0',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            color: '#fff'
          }}>
            <Avatar size={60} src={user.photoURL} icon={!user.photoURL && <UserOutlined />}
              style={{ border: '3px solid rgba(255,255,255,0.4)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{user.name}</div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>{user.email}</div>
              <Tag style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', marginTop: 6, fontSize: 11, borderRadius: 4 }}>
                {ROLE_CONFIG[user.role]?.label || user.role}
              </Tag>
            </div>
          </div>

          <div style={{ padding: '20px 0 0' }}>
            <Row gutter={16}>
              {[
                { label: 'Phone', value: user.phone || '—' },
                { label: 'Status', value: (
                  <span style={{ color: STATUS_CONFIG[user.status]?.dot || '#64748b', fontWeight: 600 }}>
                    ● {STATUS_CONFIG[user.status]?.label || user.status}
                  </span>
                )},
                { label: 'Joined', value: user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—' },
                { label: 'Page Access', value: `${user.permissions?.pages?.length || 0} pages` },
              ].map(({ label, value }) => (
                <Col span={12} key={label} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 13, color: '#1e293b', fontWeight: 500 }}>{value}</div>
                </Col>
              ))}
            </Row>
          </div>
        </div>
      ),
      okText: 'Close',
      okButtonProps: { style: { background: '#ef4444', borderColor: '#ef4444' } }
    })
  }

  const handleDelete = async (userId) => {
    try {
      await userApi.deleteUser(userId)
      message.success('User deleted successfully')
      fetchUsers()
    } catch (error) {
      message.error(error.message || 'Failed to delete user')
    }
  }

  // ─── Columns ─────────────────────────────────────────────────────────────────
  const columns = [
    {
      title: 'User',
      dataIndex: 'name',
      key: 'name',
      width: 260,
      render: (text, record) => {
        const rc = ROLE_CONFIG[record.role] || ROLE_CONFIG.member
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar
              size={40}
              src={record.photoURL}
              icon={!record.photoURL && <UserOutlined />}
              style={{ border: `2px solid ${rc.color}40`, flexShrink: 0 }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Text strong style={{ fontSize: 13 }}>{text}</Text>
                {record.role === ROLES.SUPER_ADMIN && (
                  <CrownOutlined style={{ color: '#f59e0b', fontSize: 12 }} />
                )}
              </div>
              <Text type="secondary" style={{ fontSize: 11, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {record.email}
              </Text>
            </div>
          </div>
        )
      }
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      width: 130,
      render: (role) => {
        const rc = ROLE_CONFIG[role] || ROLE_CONFIG.member
        return (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '3px 10px',
            borderRadius: 20,
            background: rc.bg,
            color: rc.color,
            fontSize: 12,
            fontWeight: 600,
          }}>
            {rc.icon}
            {rc.label}
          </div>
        )
      }
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status) => {
        const sc = STATUS_CONFIG[status] || STATUS_CONFIG.inactive
        return (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 10px',
            borderRadius: 20,
            background: sc.bg,
            color: sc.text,
            fontSize: 12,
            fontWeight: 600,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot, display: 'inline-block' }} />
            {sc.label}
          </div>
        )
      }
    },
    {
      title: 'Access',
      key: 'permissions',
      width: 160,
      render: (_, record) => {
        const pages = record.permissions?.pages?.length || 0
        const actions = Object.values(record.permissions?.actions || {}).filter(Boolean).length
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 11 }}>
              <span style={{ color: '#94a3b8' }}>Pages: </span>
              <span style={{ fontWeight: 600, color: pages ? '#6366f1' : '#94a3b8' }}>
                {pages ? `${pages} pages` : 'All'}
              </span>
            </div>
            <div style={{ fontSize: 11 }}>
              <span style={{ color: '#94a3b8' }}>Actions: </span>
              <span style={{ fontWeight: 600, color: actions ? '#10b981' : '#94a3b8' }}>
                {actions ? `${actions} enabled` : 'None'}
              </span>
            </div>
          </div>
        )
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 160,
      render: (_, record) => {
        const canEdit = canManageUsers && record.role !== ROLES.SUPER_ADMIN
        const canDelete = canEdit && record.id !== currentUser?.uid
        const canPerms = canEdit

        return (
          <Space size={2}>
            <Tooltip title="View Details">
              <Button type="text" icon={<EyeOutlined />}
                style={{ color: '#6366f1' }}
                onClick={() => handleViewDetails(record)} />
            </Tooltip>
            {canEdit && (
              <Tooltip title="Edit User">
                <Button type="text" icon={<EditOutlined />}
                  style={{ color: '#f59e0b' }}
                  onClick={() => { setEditingUser(record); setDrawerVisible(true) }} />
              </Tooltip>
            )}
            {canPerms && (
              <Tooltip title="Set Permissions">
                <Button type="text" icon={<SecurityScanOutlined />}
                  style={{ color: '#8b5cf6' }}
                  onClick={() => { setSelectedUser(record); setPermissionDrawerVisible(true) }} />
              </Tooltip>
            )}
            {canDelete && (
              <Popconfirm
                title="Delete User"
                description="This action cannot be undone."
                onConfirm={() => handleDelete(record.id)}
                okText="Delete"
                cancelText="Cancel"
                okButtonProps={{ danger: true }}
              >
                <Tooltip title="Delete">
                  <Button type="text" icon={<DeleteOutlined />} style={{ color: '#ef4444' }} />
                </Tooltip>
              </Popconfirm>
            )}
          </Space>
        )
      }
    }
  ]

  return (
    <div style={{ padding: '20px 24px', minHeight: '100vh', background: '#f8fafc' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0, color: '#1e293b' }}>User Management</Title>
          <Paragraph style={{ margin: '4px 0 0', color: '#64748b' }}>
            Manage team members and configure their access permissions
          </Paragraph>
        </div>
        {canManageUsers && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="large"
            onClick={() => { setEditingUser(null); setDrawerVisible(true) }}
            style={{ background: 'linear-gradient(135deg, #ef4444 , #f59e0b)', border: 'none', borderRadius: 10, height: 44, paddingInline: 24, fontWeight: 600 }}
          >
            Add User
          </Button>
        )}
      </div>

      {/* ── Stats ── */}
      <Row gutter={16} style={{ marginBottom: 20 }}>
        {[
          { label: 'Total Users', value: stats.total, color: '#6366f1', bg: '#ede9fe' },
          { label: 'Active',      value: stats.active, color: '#10b981', bg: '#d1fae5' },
          { label: 'Admins',      value: stats.admins, color: '#ef4444', bg: '#fee2e2' },
          { label: 'Pending',     value: stats.pending, color: '#f59e0b', bg: '#fef3c7' },
        ].map(s => (
          <Col xs={12} sm={6} key={s.label}>
            <div style={{
              background: '#fff',
              borderRadius: 12,
              padding: '14px 18px',
              border: `1px solid ${s.color}20`,
              display: 'flex',
              alignItems: 'center',
              gap: 12
            }}>
              <div style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: s.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                fontWeight: 800,
                color: s.color,
              }}>
                {s.value}
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {s.label}
                </div>
              </div>
            </div>
          </Col>
        ))}
      </Row>

      {/* ── Filters ── */}
      <Card
        style={{ marginBottom: 16, borderRadius: 12, border: '1px solid #f1f5f9' }}
        styles={{ body: { padding: '14px 20px' } }}
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            placeholder="Search by name, email or phone..."
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{ width: 280, borderRadius: 8 }}
            allowClear
          />
          <Select
            value={filterRole}
            onChange={setFilterRole}
            style={{ width: 150, borderRadius: 8 }}
            placeholder="Filter by role"
          >
            <Option value="all">All Roles</Option>
            <Option value="superadmin">Super Admin</Option>
            <Option value="admin">Admin</Option>
            <Option value="agent">Agent</Option>
            <Option value="member">Member</Option>
          </Select>
          <Select
            value={filterStatus}
            onChange={setFilterStatus}
            style={{ width: 150, borderRadius: 8 }}
            placeholder="Filter by status"
          >
            <Option value="all">All Status</Option>
            <Option value="active">Active</Option>
            <Option value="inactive">Inactive</Option>
            <Option value="pending">Pending</Option>
          </Select>
          <Tooltip title="Refresh">
            <Button icon={<ReloadOutlined />} onClick={fetchUsers} loading={loading} style={{ borderRadius: 8 }} />
          </Tooltip>
          <Text type="secondary" style={{ marginLeft: 'auto', fontSize: 12 }}>
            {filteredUsers.length} of {users.length} users
          </Text>
        </div>
      </Card>

      {/* ── Table ── */}
      <Card style={{ borderRadius: 12, border: '1px solid #f1f5f9' }} styles={{ body: { padding: 0 } }}>
        <Table
          columns={columns}
          dataSource={filteredUsers}
          loading={loading}
          rowKey="id"
          size="middle"
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} users`,
            style: { padding: '12px 20px' }
          }}
          onChange={setPagination}
          scroll={{ x: 800 }}
          rowClassName={() => 'hover:bg-slate-50 transition-colors'}
          style={{ borderRadius: 12, overflow: 'hidden' }}
        />
      </Card>

      {/* ── Drawers ── */}
      <UserDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        editingUser={editingUser}
        onSuccess={() => { setDrawerVisible(false); setEditingUser(null); fetchUsers() }}
        currentUser={currentUser}
      />
      <PermissionDrawer
        visible={permissionDrawerVisible}
        onClose={() => setPermissionDrawerVisible(false)}
        selectedUser={selectedUser}
        onSuccess={() => { setPermissionDrawerVisible(false); setSelectedUser(null); fetchUsers() }}
      />
    </div>
  )
}

export default UsersPage