// components/pages/settings/users/PermissionDrawer.tsx
"use client"
import { panelTheme } from '@/utils/trust/trustStore';
import React, { useState, useEffect } from 'react'
import {
  Drawer, Button, Space, Typography, Switch, Checkbox,
  Tag, Tabs, message, Modal, Alert, Avatar,
} from 'antd'
import {
  SecurityScanOutlined, CheckCircleOutlined, AppstoreOutlined,
  TeamOutlined, SettingOutlined, DashboardOutlined, CreditCardOutlined,
  DatabaseOutlined, UserSwitchOutlined, InboxOutlined, TagOutlined,
  DeleteOutlined, ExclamationCircleOutlined, ClearOutlined, SaveOutlined,
  CloseOutlined, UserOutlined, CrownOutlined, EyeOutlined, EditOutlined,
  PlusOutlined, DownloadOutlined, BarChartOutlined, DollarOutlined,
  RiseOutlined, FundOutlined,
} from '@ant-design/icons'
import { userApi } from '@/utils/api'

const { Title, Text, Paragraph } = Typography
const ROLES = { SUPER_ADMIN: 'superadmin' }

// ── Pink/rose theme — matches existing sidebar ──────────────────────────────
const T = {
  get primary() { return panelTheme().primary; },
  get primaryHover() { return panelTheme().primaryDark; },
  get primaryBg() { return panelTheme().pink100; },
  get primaryLight() { return panelTheme().pink50; },
  get border() { return panelTheme().border; },
  gradient:     'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
}

// ── Module config ────────────────────────────────────────────────────────────
// Keep this in sync with the sidebar (components/Base/SideBar.js). Any page
// missing here can never be granted, so the user simply can't reach it.
const MODULE_CONFIG = {
  '/':         { label: 'Dashboard',  icon: <DashboardOutlined />,  module: 'dashboard' },
  '/programs': { label: 'Programs',   icon: <AppstoreOutlined />,   module: 'programs',
    children: [
      { key: '/programs/closing-forms', label: 'Closing Forms' },
      { key: '/programs/yojnas',        label: 'Yojnas' },
    ],
  },
  '/agents':   { label: 'Agents',     icon: <UserSwitchOutlined />, module: 'agents',
    children: [
      { key: '/agents/performance', label: 'Performance' },
    ],
  },
  '/members':  { label: 'Members',    icon: <TeamOutlined />,       module: 'members' },
  '/requests': { label: 'Requests',   icon: <InboxOutlined />,      module: 'requests' },
  '/payments': { label: 'Payments',   icon: <CreditCardOutlined />, module: 'payments',
    children: [
      { key: '/payments/join-fees',       label: 'Join Fees' },
      { key: '/payments/closing-payment', label: 'Closing Payment' },
      { key: '/payments/history',         label: 'Payment History' },
      { key: '/payments/whatsapp',        label: 'WhatsApp' },
      { key: '/payments/whatsapp/inbox',  label: 'WhatsApp Inbox' },
    ],
  },
  '/master':   { label: 'Master',     icon: <DatabaseOutlined />,   module: 'master',
    children: [
      { key: '/master/users',     label: 'Users' },
      { key: '/master/state',     label: 'State' },
      { key: '/master/district',  label: 'District' },
      { key: '/master/city',      label: 'City' },
      { key: '/master/cast',      label: 'Cast' },
      { key: '/master/relations', label: 'Relations' },
    ],
  },
  '/expenses': { label: 'Expenses',   icon: <TagOutlined />,        module: 'expenses' },
  '/settings': { label: 'Settings',   icon: <SettingOutlined />,    module: 'settings',
    children: [
      { key: '/settings/trust-details',            label: 'Trust Details' },
      { key: '/settings/certificate-builder',      label: 'Certificate Builder' },
      { key: '/settings/about',                    label: 'About' },
      { key: '/settings/contact',                  label: 'Contact' },
      { key: '/settings/commission',               label: 'Commission' },
      { key: '/settings/payment-details',          label: 'Payment Details' },
      { key: '/settings/fix-age-groups',           label: 'Fix Age Group & Fees' },
      { key: '/settings/security/change-password', label: 'Password Change' },
      { key: '/settings/security/sessions',        label: 'Sessions' },
      { key: '/settings/security/pin',             label: 'PIN Lock' },
    ],
  },
  '/activity': { label: 'Activity',   icon: <FundOutlined />,       module: 'activity' },
  '/trash':    { label: 'Trash',      icon: <DeleteOutlined />,     module: 'trash' },
}

// Every page key in the config, used by the bulk enable/disable helpers
const ALL_PAGE_KEYS = Object.entries(MODULE_CONFIG).flatMap(
  ([key, cfg]) => [key, ...(cfg.children || []).map(c => c.key)]
)

const BASIC_ACTIONS = [
  { key: 'view',     label: 'View',     icon: <EyeOutlined />,      desc: 'View records & data' },
  { key: 'create',   label: 'Create',   icon: <PlusOutlined />,     desc: 'Add new records' },
  { key: 'edit',     label: 'Edit',     icon: <EditOutlined />,     desc: 'Modify existing records' },
  { key: 'delete',   label: 'Delete',   icon: <DeleteOutlined />,   desc: 'Remove records' },
  { key: 'download', label: 'Download', icon: <DownloadOutlined />, desc: 'Export & download data' },
]

const ADVANCED_ACTIONS = [
  { key: 'approve',    label: 'Approve Requests', icon: <CheckCircleOutlined /> },
  // { key: 'request',    label: 'Make Requests',    icon: <InboxOutlined /> },
  {key:"reject", label:"Reject Requests", icon:<CloseOutlined />},
  { key: 'add_agent',  label: 'Add Agents',       icon: <UserSwitchOutlined /> },
  { key: 'add_yojna',  label: 'Add Yojnas',       icon: <AppstoreOutlined /> },

  { key: 'add_member', label: 'Add Members',      icon: <TeamOutlined /> },
]

const DASHBOARD_ACTIONS = [
  { key: 'dashboard_summary',   label: 'Member & Agent Counts', icon: <BarChartOutlined /> },
  { key: 'dashboard_join_fees', label: 'Join Fees Stats',      icon: <DollarOutlined /> },
  { key: 'dashboard_closing',   label: 'Closing Stats',        icon: <RiseOutlined /> },
  { key: 'dashboard_programs',  label: 'Program Performance',  icon: <FundOutlined /> },
]

// ── Module card ──────────────────────────────────────────────────────────────
function ModuleCard({ pageKey, config, checkedPages, onToggle, onSubToggle }) {
  const on = checkedPages.includes(pageKey)
  const hasChildren = config.children?.length > 0
  const enabledCount = hasChildren ? config.children.filter(c => checkedPages.includes(c.key)).length : 0

  return (
    <div style={{
      border: `1.5px solid ${on ? T.primary + '35' : T.border}`,
      borderRadius: 10,
      overflow: 'hidden',
      background: on ? T.primaryLight : '#fff',
      transition: 'all 0.2s',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px',
        background: on ? T.primaryBg + 'cc' : '#fafafa',
        borderBottom: hasChildren && on ? `1px solid ${T.primary}18` : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: on ? T.gradient : '#f1f5f9',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: on ? '#fff' : '#94a3b8', fontSize: 14, transition: 'all 0.2s',
          }}>
            {config.icon}
          </div>
          <div>
            <Text strong style={{ fontSize: 13, color: on ? '#1e293b' : '#64748b' }}>
              {config.label}
            </Text>
            {hasChildren && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                {on ? `${enabledCount}/${config.children.length} sub-pages` : 'Has sub-pages'}
              </div>
            )}
          </div>
        </div>
        <Switch
          checked={on}
          onChange={checked => onToggle(pageKey, checked, config)}
          style={on ? { background: T.primary } : {}}
        />
      </div>

      {hasChildren && on && (
        <div style={{ padding: '8px 14px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {config.children.map(child => {
            const childOn = checkedPages.includes(child.key)
            return (
              <label key={child.key} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
                userSelect: 'none', transition: 'all 0.15s',
                border: `1px solid ${childOn ? T.primary + '55' : '#e2e8f0'}`,
                background: childOn ? T.primaryBg : '#f8fafc',
              }}>
                <Checkbox
                  checked={childOn}
                  onChange={e => onSubToggle(child.key, e.target.checked)}
                  style={{ margin: 0 }}
                />
                <span style={{ fontSize: 12, fontWeight: 500, color: childOn ? T.primary : '#64748b' }}>
                  {child.label}
                </span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Action card ──────────────────────────────────────────────────────────────
function ActionCard({ actionKey, config, checked, onChange }) {
  return (
    <div
      onClick={() => onChange(actionKey, !checked)}
      style={{
        border: `1.5px solid ${checked ? T.primary + '45' : T.border}`,
        borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
        background: checked ? T.primaryLight : '#fff', transition: 'all 0.2s',
        display: 'flex', alignItems: 'center', gap: 10,
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        background: checked ? T.gradient : '#f1f5f9',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: checked ? '#fff' : '#94a3b8', fontSize: 14, transition: 'all 0.2s',
      }}>
        {config.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text strong style={{ fontSize: 13, display: 'block', color: checked ? '#1e293b' : '#64748b' }}>
          {config.label}
        </Text>
        <Text style={{ fontSize: 11, color: '#94a3b8' }}>{config.desc}</Text>
      </div>
      <Switch
        checked={checked}
        size="small"
        style={checked ? { background: T.primary } : {}}
        onClick={e => e.stopPropagation()}
        onChange={val => onChange(actionKey, val)}
      />
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
const PermissionDrawer = ({ visible, onClose, selectedUser, onSuccess }) => {
  const [loading, setLoading]       = useState(false)
  const [activeTab, setActiveTab]   = useState('pages')
  const [checkedPages, setCheckedPages] = useState(['/'])
  const [permissions, setPermissions]   = useState({
    pages: ['/'],
    actions: { create: false, edit: false, delete: false, view: false, download: false, dashboard_summary: false, dashboard_join_fees: false, dashboard_closing: false, dashboard_programs: false },
    moduleAccess: {},
    pagePermissions: {},
  })

  useEffect(() => {
    if (visible && selectedUser) {
      const p = selectedUser.permissions || {
        pages: ['/'],
        actions: { create: false, edit: false, delete: false, view: true, download: false, dashboard_summary: false, dashboard_join_fees: false, dashboard_closing: false, dashboard_programs: false },
        moduleAccess: { dashboard: true },
        pagePermissions: {},
      }
      setPermissions(p)
      setCheckedPages(p.pages || ['/'])
      setActiveTab('pages')
    }
  }, [visible, selectedUser])

  // Derived from MODULE_CONFIG rather than a second hardcoded list — a separate
  // map is exactly how '/activity' ended up ungrantable.
  const rebuildModuleAccess = (pages) => {
    const map = Object.fromEntries(
      Object.entries(MODULE_CONFIG).map(([key, cfg]) => [key, cfg.module])
    )
    const acc = {}
    Object.values(map).forEach(m => (acc[m] = false))
    pages.forEach(k => {
      // Longest match first so '/payments/whatsapp/inbox' resolves to the
      // payments module and not something shorter that also prefixes it
      const mod = Object.keys(map)
        .filter(m => k === m || k.startsWith(m + '/'))
        .sort((a, b) => b.length - a.length)[0]
      if (mod) acc[map[mod]] = true
    })
    return acc
  }

  // ── Bulk helpers ──────────────────────────────────────────────────────────
  const handleEnableAllPages = () => {
    setCheckedPages(ALL_PAGE_KEYS)
    setPermissions(prev => ({ ...prev, moduleAccess: rebuildModuleAccess(ALL_PAGE_KEYS) }))
  }

  const handleDisableAllPages = () => {
    // '/' always stays — a user with no landing page can't use the panel at all
    setCheckedPages(['/'])
    setPermissions(prev => ({ ...prev, moduleAccess: rebuildModuleAccess(['/']) }))
  }

  const handleToggle = (pageKey, checked, config) => {
    let next = [...checkedPages]
    if (checked) {
      if (!next.includes(pageKey)) next.push(pageKey)
    } else {
      next = next.filter(p => p !== pageKey)
      config.children?.forEach(c => { next = next.filter(p => p !== c.key) })
    }
    setCheckedPages(next)
    setPermissions(prev => ({ ...prev, moduleAccess: rebuildModuleAccess(next) }))
  }

  const handleSubToggle = (childKey, checked) => {
    let next = [...checkedPages]
    if (checked) { if (!next.includes(childKey)) next.push(childKey) }
    else next = next.filter(p => p !== childKey)
    setCheckedPages(next)
    setPermissions(prev => ({ ...prev, moduleAccess: rebuildModuleAccess(next) }))
  }

  const handleAction = (key, val) => {
    setPermissions(prev => ({ ...prev, actions: { ...prev.actions, [key]: val } }))
  }

  const handleSave = async () => {
    try {
      setLoading(true)
      const updated = { ...permissions, pages: checkedPages, role: selectedUser.role }
      await userApi.updateUser(selectedUser.id, { permissions: updated, id: selectedUser.id, role: selectedUser.role })
      message.success('Permissions updated successfully')
      onSuccess()
    } catch (err) {
      message.error(err.message || 'Failed to update permissions')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    Modal.confirm({
      title: 'Reset All Permissions?',
      icon: <ExclamationCircleOutlined style={{ color: T.primary }} />,
      content: <Text>Reset <strong>{selectedUser?.name}</strong> to dashboard-only access?</Text>,
      okText: 'Reset', okType: 'danger', cancelText: 'Cancel',
      async onOk() {
        const reset = {
          pages: ['/'],
          actions: { create: false, edit: false, delete: false, view: true, download: false, approve: false, request: false, add_agent: false, add_member: false, dashboard_summary: false, dashboard_join_fees: false, dashboard_closing: false, dashboard_programs: false },
          moduleAccess: { dashboard: true }, pagePermissions: {},
        }
        setPermissions(reset)
        setCheckedPages(['/'])
        try {
          await userApi.updateUser(selectedUser.id, { permissions: reset, id: selectedUser.id, role: selectedUser.role })
          message.success('Permissions reset')
          onSuccess()
        } catch { message.error('Failed to reset') }
      },
    })
  }

  if (!selectedUser) return null

  const isSA        = selectedUser.role === ROLES.SUPER_ADMIN
  const pagesCount  = checkedPages.length
  const actionsCount = Object.values(permissions.actions || {}).filter(Boolean).length

  const CountBadge = ({ n }) => n > 0 ? (
    <span style={{
      background: T.primary, color: '#fff', borderRadius: 10,
      fontSize: 10, fontWeight: 700, padding: '1px 6px', lineHeight: '16px',
    }}>{n}</span>
  ) : null

  const tabItems = [
    {
      key: 'pages',
      label: <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><AppstoreOutlined />Page Access <CountBadge n={pagesCount} /></span>,
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', borderRadius: 8,
            background: '#fff', border: `1px solid ${T.border}`,
          }}>
            <Text style={{ fontSize: 12, color: '#64748b' }}>
              {pagesCount} of {ALL_PAGE_KEYS.length} pages granted
            </Text>
            <Space size={4}>
              <Button size="small" type="link" style={{ fontSize: 12 }} onClick={handleEnableAllPages}>
                Enable all
              </Button>
              <Button size="small" type="link" style={{ fontSize: 12, color: '#94a3b8' }} onClick={handleDisableAllPages}>
                Disable all
              </Button>
            </Space>
          </div>

          {Object.entries(MODULE_CONFIG).map(([key, config]) => (
            <ModuleCard key={key} pageKey={key} config={config}
              checkedPages={checkedPages} onToggle={handleToggle} onSubToggle={handleSubToggle} />
          ))}
        </div>
      ),
    },
    {
      key: 'actions',
      label: <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><SecurityScanOutlined />Actions <CountBadge n={actionsCount} /></span>,
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <Text style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, display: 'block', marginBottom: 8 }}>
              Basic Actions
            </Text>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {BASIC_ACTIONS.map(ac => (
                <ActionCard key={ac.key} actionKey={ac.key} config={ac}
                  checked={permissions.actions?.[ac.key] || false} onChange={handleAction} />
              ))}
            </div>
          </div>
          <div>
            <Text style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, display: 'block', marginBottom: 8 }}>
              Advanced Permissions
            </Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ADVANCED_ACTIONS.map(ac => {
                const on = permissions.actions?.[ac.key] || false
                return (
                  <div key={ac.key} onClick={() => handleAction(ac.key, !on)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                    border: `1.5px solid ${on ? T.primary + '40' : T.border}`,
                    background: on ? T.primaryLight : '#fff', transition: 'all 0.2s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: on ? T.primary : '#94a3b8', fontSize: 16 }}>{ac.icon}</span>
                      <Text style={{ fontSize: 13, fontWeight: 500, color: on ? '#1e293b' : '#64748b' }}>
                        {ac.label}
                      </Text>
                    </div>
                    <Switch checked={on} size="small" style={on ? { background: T.primary } : {}}
                      onClick={e => e.stopPropagation()} onChange={val => handleAction(ac.key, val)} />
                  </div>
                )
              })}
            </div>
          </div>
          <div>
            <Text style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, display: 'block', marginBottom: 8 }}>
              Dashboard Widgets
            </Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {DASHBOARD_ACTIONS.map(ac => {
                const on = permissions.actions?.[ac.key] || false
                return (
                  <div key={ac.key} onClick={() => handleAction(ac.key, !on)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                    border: `1.5px solid ${on ? T.primary + '40' : T.border}`,
                    background: on ? T.primaryLight : '#fff', transition: 'all 0.2s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: on ? T.primary : '#94a3b8', fontSize: 16 }}>{ac.icon}</span>
                      <Text style={{ fontSize: 13, fontWeight: 500, color: on ? '#1e293b' : '#64748b' }}>
                        {ac.label}
                      </Text>
                    </div>
                    <Switch checked={on} size="small" style={on ? { background: T.primary } : {}}
                      onClick={e => e.stopPropagation()} onChange={val => handleAction(ac.key, val)} />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'summary',
      label: <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircleOutlined />Summary</span>,
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Stat pills */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              { label: 'Pages',   value: pagesCount },
              { label: 'Actions', value: actionsCount },
              { label: 'Modules', value: Object.values(permissions.moduleAccess || {}).filter(Boolean).length },
            ].map(s => (
              <div key={s.label} style={{
                padding: '14px 10px', borderRadius: 10, textAlign: 'center',
                background: T.primaryBg, border: `1px solid ${T.primary}25`,
              }}>
                <div style={{ color: T.primary, fontSize: 22, fontWeight: 700 }}>{s.value}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {[
            { label: 'Accessible Pages', items: checkedPages },
            { label: 'Enabled Actions',  items: Object.entries(permissions.actions || {}).filter(([_, v]) => v).map(([k]) => k.replace(/_/g, ' ')) },
          ].map(({ label, items }) => (
            <div key={label} style={{
              background: T.primaryLight, borderRadius: 10, padding: 14,
              border: `1px solid ${T.border}`,
            }}>
              <Text style={{ fontSize: 11, fontWeight: 700, color: T.primaryHover, display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {label}
              </Text>
              {items.length === 0 ? (
                <Text type="secondary" style={{ fontSize: 12 }}>None selected</Text>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {items.map(item => (
                    <Tag key={item} style={{
                      borderRadius: 6, fontSize: 11,
                      borderColor: T.primary + '40', color: T.primary, background: T.primaryBg,
                    }}>{item}</Tag>
                  ))}
                </div>
              )}
            </div>
          ))}

          <Alert
            message="Danger Zone"
            description="Reset this user to dashboard-only access. All permissions will be lost."
            type="warning" showIcon
            action={<Button danger size="small" icon={<ClearOutlined />} onClick={handleReset}>Reset</Button>}
          />
        </div>
      ),
    },
  ]

  return (
    <Drawer
      title={null}
      open={visible}
      onClose={onClose}
      width={680}
      styles={{ body: { padding: 0, background: T.primaryLight }, header: { display: 'none' } }}
      footer={
        !isSA && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Button danger icon={<ClearOutlined />} onClick={handleReset}>Reset All</Button>
            <Space>
              <Button onClick={onClose} icon={<CloseOutlined />}>Cancel</Button>
              <Button type="primary" onClick={handleSave} loading={loading} icon={<SaveOutlined />}
                style={{ background: T.primary, borderColor: T.primary }}>
                Save Permissions
              </Button>
            </Space>
          </div>
        )
      }
    >
      {/* Pink gradient header */}
      <div style={{ padding: '20px 24px 16px', background: T.gradient, color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ padding: 8, background: 'rgba(255,255,255,0.2)', borderRadius: 10 }}>
              <SecurityScanOutlined style={{ fontSize: 20 }} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Permission Manager</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>Configure access levels & capabilities</div>
            </div>
          </div>
          <Button type="text" icon={<CloseOutlined />} onClick={onClose} style={{ color: '#fff', opacity: 0.8 }} />
        </div>

        {/* User card */}
        <div style={{
          background: 'rgba(255,255,255,0.18)', borderRadius: 12, padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 12,
          border: '1px solid rgba(255,255,255,0.25)',
        }}>
          <Avatar size={46} src={selectedUser.photoURL}
            icon={!selectedUser.photoURL && <UserOutlined />}
            style={{ border: '2px solid rgba(255,255,255,0.5)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>{selectedUser.name}</div>
            <div style={{ fontSize: 12, opacity: 0.85, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedUser.email}
            </div>
          </div>
          <Tag style={{
            background: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.4)',
            color: '#fff', fontWeight: 600, borderRadius: 6,
            textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5, flexShrink: 0,
          }}>
            {isSA && <CrownOutlined style={{ marginRight: 4 }} />}
            {selectedUser.role}
          </Tag>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '0 20px 24px' }}>
        {isSA ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{
              width: 76, height: 76, borderRadius: 20, background: T.gradient,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px', fontSize: 34, color: '#fff',
            }}>
              <CrownOutlined />
            </div>
            <Title level={4} style={{ marginBottom: 8 }}>Super Admin — Full Access</Title>
            <Paragraph type="secondary">
              This user has complete access to all features.<br />Permissions cannot be modified.
            </Paragraph>
          </div>
        ) : (
          <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} style={{ marginTop: 8 }} />
        )}
      </div>
    </Drawer>
  )
}

export default PermissionDrawer