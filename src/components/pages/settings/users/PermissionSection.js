"use client"
import React from 'react'
import {
  Card,
  Row,
  Col,
  Checkbox,
  Switch,
  Typography,
  Tree,
  Tag,
  Space,
  Divider,
  Collapse
} from 'antd'
import {
  DashboardOutlined,
  AppstoreOutlined,
  TeamOutlined,
  UserOutlined,
  CreditCardOutlined,
  DatabaseOutlined,
  FileProtectOutlined,
  SettingOutlined
} from '@ant-design/icons'

const { Title, Text } = Typography
const { Panel } = Collapse

const PermissionSection = ({ permissions, onChange, userRole }) => {
  const menuTreeData = [
    {
      title: 'Dashboard',
      key: '/',
      icon: <DashboardOutlined />
    },
    {
      title: 'Programs',
      key: '/programs',
      icon: <AppstoreOutlined />,
      children: [
        { title: 'Members', key: '/programs/members' },
        { title: 'Closing Forms', key: '/programs/closing-forms' },
        { title: 'Yojnas', key: '/programs/yojnas' }
      ]
    },
    {
      title: 'Agents',
      key: '/agents',
      icon: <TeamOutlined />
    },
    {
      title: 'Members',
      key: '/members',
      icon: <UserOutlined />
    },
    {
      title: 'Payments',
      key: '/payments',
      icon: <CreditCardOutlined />,
      children: [
        { title: 'Join Fees', key: '/payments/join-fees' },
        { title: 'Closing Payment', key: '/payments/closing-payment' },
        { title: 'Payment History', key: '/payments/history' }
      ]
    },
    {
      title: 'Master',
      key: '/master',
      icon: <DatabaseOutlined />,
      children: [
        { title: 'Users', key: '/master/users' },
        { title: 'State', key: '/master/state' },
        { title: 'District', key: '/master/district' },
        { title: 'Relations', key: '/master/relations' }
      ]
    },
    {
      title: 'Rule & Policy',
      key: '/rule-policy',
      icon: <FileProtectOutlined />
    },
    {
      title: 'Settings',
      key: '/settings',
      icon: <SettingOutlined />,
      children: [
        { title: 'Trust Details', key: '/settings/trust-details' },
        { title: 'Certificate Builder', key: '/settings/certificate-builder' },
        { title: 'About', key: '/settings/about' },
        { title: 'Contact', key: '/settings/contact' },
        { title: 'Users', key: '/settings/users' }
      ]
    }
  ]

  const handlePageCheck = (checkedKeys) => {
    onChange({
      ...permissions,
      pages: checkedKeys
    })
  }

  const handleActionChange = (action, value) => {
    onChange({
      ...permissions,
      actions: {
        ...permissions.actions,
        [action]: value
      }
    })
  }

  const handleModuleChange = (module, value) => {
    onChange({
      ...permissions,
      moduleAccess: {
        ...permissions.moduleAccess,
        [module]: value
      }
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <Title level={5} className="mb-4">Page Access Control</Title>
        <Text type="secondary" className="block mb-4">
          Select which pages this user can access
        </Text>
        
        <div className="border rounded-lg p-4 bg-surface max-h-[300px] overflow-y-auto">
          <Tree
            checkable
            treeData={menuTreeData}
            checkedKeys={permissions.pages}
            onCheck={handlePageCheck}
            defaultExpandAll={false}
          />
        </div>
      </Card>

      <Card>
        <Title level={5} className="mb-4">Action Permissions</Title>
        <Text type="secondary" className="block mb-4">
          Control what actions this user can perform
        </Text>
        
        <Row gutter={[16, 16]}>
          {Object.entries({
            create: 'Create Records',
            edit: 'Edit Records',
            delete: 'Delete Records',
            view: 'View Records',
            download: 'Download Data'
          }).map(([key, label]) => (
            <Col span={12} key={key}>
              <div className="flex items-center justify-between">
                <Checkbox
                  checked={permissions.actions[key] || false}
                  onChange={(e) => handleActionChange(key, e.target.checked)}
                >
                  {label}
                </Checkbox>
                <Tag color={permissions.actions[key] ? 'green' : 'default'} size="small">
                  {permissions.actions[key] ? 'Allowed' : 'Denied'}
                </Tag>
              </div>
            </Col>
          ))}
        </Row>

        <Divider />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Text strong>Can Approve Requests</Text>
              <div className="text-xs text-gray-500">Approve program requests</div>
            </div>
            <Switch 
              checked={permissions.actions.approve || false}
              onChange={(checked) => handleActionChange('approve', checked)}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <Text strong>Can Make Requests</Text>
              <div className="text-xs text-gray-500">Submit new program requests</div>
            </div>
            <Switch 
              checked={permissions.actions.request || false}
              onChange={(checked) => handleActionChange('request', checked)}
            />
          </div>
        </div>

        <Divider />

        <Title level={5} className="mb-3">Dashboard Widgets</Title>
        <Text type="secondary" className="block mb-3">
          Control which dashboard widgets this user can see
        </Text>

        <div className="space-y-3">
          {[
            { key: 'dashboard_summary', label: 'Member & Agent Counts', desc: 'Total members, active members, agents' },
            { key: 'dashboard_join_fees', label: 'Join Fees Stats', desc: 'Total, paid & pending join fees' },
            { key: 'dashboard_closing', label: 'Closing Stats', desc: 'Total, paid & pending closing amounts' },
            { key: 'dashboard_programs', label: 'Program Performance', desc: 'Per-program progress cards' },
          ].map(dw => (
            <div key={dw.key} className="flex items-center justify-between">
              <div>
                <Text strong>{dw.label}</Text>
                <div className="text-xs text-gray-500">{dw.desc}</div>
              </div>
              <Switch 
                checked={permissions.actions[dw.key] || false}
                onChange={(checked) => handleActionChange(dw.key, checked)}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <Title level={5} className="mb-4">Module Access</Title>
        <Text type="secondary" className="block mb-4">
          Quick toggles for module access
        </Text>
        
        <Row gutter={[16, 16]}>
          {Object.entries({
            dashboard: 'Dashboard',
            programs: 'Programs',
            agents: 'Agents',
            members: 'Members',
            payments: 'Payments',
            master: 'Master Data',
            rulePolicy: 'Rules & Policy',
            settings: 'Settings'
          }).map(([key, label]) => (
            <Col span={12} key={key}>
              <div className="flex items-center justify-between">
                <span>{label}</span>
                <Switch 
                  checked={permissions.moduleAccess?.[key] || false}
                  onChange={(checked) => handleModuleChange(key, checked)}
                  size="small"
                />
              </div>
            </Col>
          ))}
        </Row>
      </Card>

      <Card>
        <Title level={5} className="mb-4">Permission Summary</Title>
        
        <div className="space-y-4">
          <div>
            <Text strong>Selected Pages:</Text>
            <div className="mt-2">
              {permissions.pages.length === 0 ? (
                <Text type="secondary">No pages selected</Text>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {permissions.pages.map(key => (
                    <Tag key={key} color="green" size="small">
                      {key}
                    </Tag>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          <div>
            <Text strong>Allowed Actions:</Text>
            <div className="mt-2">
              {Object.entries(permissions.actions).filter(([_, value]) => value).length === 0 ? (
                <Text type="secondary">No actions allowed</Text>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(permissions.actions)
                    .filter(([_, value]) => value)
                    .map(([key]) => (
                      <Tag key={key} color="orange" size="small">
                        {key.toUpperCase()}
                      </Tag>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default PermissionSection