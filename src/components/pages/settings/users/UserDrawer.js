// app/settings/users/components/UserDrawer.tsx
"use client"
import React, { useState, useEffect } from 'react'
import {
  Drawer,
  Form,
  Input,
  Upload,
  Select,
  Button,
  Space,
  Row,
  Col,
  Typography,
  Checkbox,
  Card,
  Switch,
  Divider,
  Tabs,
  Modal,
  Progress,
  Image,
  App,
  Tag,
  Alert
} from 'antd'
import {
  UserOutlined,
  MailOutlined,
  PhoneOutlined,
  LockOutlined,
  PictureOutlined,
  SendOutlined,
  SettingOutlined,
  CrownOutlined,
  TeamOutlined,
  ExclamationCircleOutlined,
  DeleteOutlined,
  UploadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  PoweroffOutlined,
  InfoCircleOutlined,
  ClockCircleOutlined 
} from '@ant-design/icons'
import { userApi } from '@/utils/api'
// import { uploadFile, validateFile } from '@/utils/uploadUtils'

import PermissionSection from './PermissionSection'
import { uploadFile, validateFile } from '@/utils/uploadUtils/common'

const { Title, Text, Paragraph } = Typography
const { Option } = Select
const { TabPane } = Tabs
const { confirm } = Modal

const ROLES = {
  SUPER_ADMIN: 'superadmin',
  ADMIN: 'admin',
}

const STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PENDING: 'pending',
  SUSPENDED: 'suspended'
}

const UserDrawer = ({ visible, onClose, editingUser, onSuccess, currentUser }) => {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [fileList, setFileList] = useState([])
  const [sendEmail, setSendEmail] = useState(false)
  const [selectedRole, setSelectedRole] = useState(ROLES.ADMIN)
  const [showPermissions, setShowPermissions] = useState(false)
  const [userStatus, setUserStatus] = useState(STATUS.ACTIVE)
  const [permissions, setPermissions] = useState({
    pages: ['/'],
    actions: {
      create: false,
      edit: false,
      delete: false,
      view: true,
      download: false
    },
    moduleAccess: {
      dashboard: true,
      programs: false,
      agents: false,
      members: false,
      payments: false,
      master: false,
      rulePolicy: false,
      settings: false
    }
  })
  const {message}=App.useApp()

  // Reset form when drawer opens/closes
  useEffect(() => {
    if (visible) {
      if (editingUser) {
        form.setFieldsValue({
          ...editingUser,
          confirmPassword: '',
          status: editingUser.status || STATUS.ACTIVE
        })
        setSelectedRole(editingUser.role)
        setUserStatus(editingUser.status || STATUS.ACTIVE)
        setPermissions(editingUser.permissions || {
          pages: ['/'],
          actions: { create: false, edit: false, delete: false, view: true, download: false },
          moduleAccess: { dashboard: true }
        })
        
        // Set existing photo in fileList if it exists
        if (editingUser.photoURL) {
          setFileList([{
            uid: '-1',
            name: 'profile-photo',
            status: 'done',
            url: editingUser.photoURL,
            thumbUrl: editingUser.photoURL
          }])
        } else {
          setFileList([])
        }
      } else {
        form.resetFields()
        setSelectedRole(ROLES.ADMIN)
        setUserStatus(STATUS.ACTIVE)
        setPermissions({
          pages: ['/'],
          actions: {
            create: false,
            edit: false,
            delete: false,
            view: true,
            download: false
          },
          moduleAccess: {
            dashboard: true,
            programs: false,
            agents: false,
            members: false,
            payments: false,
            master: false,
            rulePolicy: false,
            settings: false
          }
        })
        setFileList([])
      }
      setSendEmail(false)
      setShowPermissions(false)
      setUploadProgress(0)
    }
  }, [visible, editingUser])

  const handleSubmit = async (values) => {
    try {
      setLoading(true)

      // Get photo URL from uploaded file
      let photoURL = editingUser?.photoURL || ''
      if (fileList.length > 0 && fileList[0].status === 'done') {
        photoURL = fileList[0].url
      }

      const userData = {
        ...values,
        photoURL,
        role: selectedRole,
        status: userStatus, // Include status
        permissions: showPermissions ? permissions : (editingUser ? undefined : {
          pages: ['/'],
          actions: { create: false, edit: false, delete: false, view: true, download: false },
          moduleAccess: { dashboard: true }
        }),
        sendWelcomeEmail: sendEmail,
      }

      // Don't send password if editing and not changed
      if (editingUser) {
        if (!values.password) {
          delete userData.password
        }
        delete userData.confirmPassword
      } else {
        delete userData.confirmPassword
      }

      if (editingUser) {
        userData['id'] = editingUser.id
        // Update existing user
        await userApi.updateUser(editingUser.id, userData)
        message.success('User updated successfully')
      } else {
        // Check if email exists before creating
        try {
          const emailCheck = await userApi.checkEmail(values.email)
          if (emailCheck.exists) {
            message.error('A user with this email already exists')
            return
          }
        } catch (error) {
          // Continue if check fails
          console.warn('Email check failed:', error)
        }

        // Create new user
        const result = await userApi.createUser(userData)
        message.success('User created successfully')
        
        // Show credentials if email was sent
        if (result.data.tempPassword) {
          confirm({
            title: 'User Created Successfully',
            icon: <ExclamationCircleOutlined />,
            content: (
              <div className="space-y-3">
                <Text strong>Login credentials for {userData.email}:</Text>
                <div className="bg-surface-secondary p-4 rounded-lg">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Text strong>Email:</Text>
                      <Text copyable className="text-primary">{userData.email}</Text>
                    </div>
                    <div className="flex justify-between">
                      <Text strong>Temporary Password:</Text>
                      <Text copyable className="text-success font-mono">{result.data.tempPassword}</Text>
                    </div>
                    <div className="flex justify-between">
                      <Text strong>Login URL:</Text>
                      <Text copyable className="text-info">{window.location.origin}/login</Text>
                    </div>
                  </div>
                </div>
                <Text type="secondary" className="text-xs block mt-2">
                  Please save these credentials and share them securely with the user.
                </Text>
              </div>
            ),
            okText: 'Copy All',
            onOk: () => {
              navigator.clipboard.writeText(
                `Email: ${userData.email}\nPassword: ${result.data.tempPassword}\nLogin: ${window.location.origin}/login`
              )
              message.success('All credentials copied to clipboard')
            }
          })
        }
      }

      onSuccess()
      onClose()
      
    } catch (error) {
      message.error(error.message || 'Failed to save user')
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const canSetSuperAdmin = currentUser?.role === ROLES.SUPER_ADMIN

  // Handle status change
  const handleStatusChange = (checked) => {
    const newStatus = checked ? STATUS.ACTIVE : STATUS.INACTIVE
    setUserStatus(newStatus)
    
    // Show confirmation for deactivation
    if (editingUser && editingUser.id === currentUser?.id && !checked) {
      message.warning('You cannot deactivate your own account')
      setUserStatus(STATUS.ACTIVE)
      return
    }

    if (editingUser && !checked) {
      confirm({
        title: 'Deactivate User',
        icon: <ExclamationCircleOutlined />,
        content: 'Are you sure you want to deactivate this user? They will no longer be able to access the system.',
        okText: 'Yes, Deactivate',
        cancelText: 'Cancel',
        okType: 'danger',
        onOk: () => {
          setUserStatus(STATUS.INACTIVE)
        },
        onCancel: () => {
          setUserStatus(STATUS.ACTIVE)
        }
      })
    }
  }

  // Render status tag
  const renderStatusTag = (status) => {
    const statusConfig = {
      [STATUS.ACTIVE]: {
        color: 'success',
        icon: <CheckCircleOutlined />,
        text: 'Active'
      },
      [STATUS.INACTIVE]: {
        color: 'error',
        icon: <CloseCircleOutlined />,
        text: 'Inactive'
      },
      [STATUS.PENDING]: {
        color: 'warning',
        icon: <ClockCircleOutlined />,
        text: 'Pending'
      },
      [STATUS.SUSPENDED]: {
        color: 'default',
        icon: <PoweroffOutlined />,
        text: 'Suspended'
      }
    }

    const config = statusConfig[status] || statusConfig[STATUS.INACTIVE]
    
    return (
      <Tag 
        color={config.color} 
        icon={config.icon}
        style={{ padding: '4px 8px', fontSize: '12px' }}
      >
        {config.text}
      </Tag>
    )
  }

  return (
    <Drawer
      title={editingUser ? 'Edit User' : 'Add New User'}
      open={visible}
      onClose={onClose}
      width={700}
      styles={{ body: { paddingBottom: 80 } }}
      extra={
        <Space>
          <Button onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button 
            type="primary" 
            onClick={() => form.submit()}
            loading={loading}
            disabled={uploading}
          >
            {editingUser ? 'Update' : 'Create'}
          </Button>
        </Space>
      }
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        className="h-full overflow-y-auto overflow-hidden"
      >
        <div className='space-y-6'>
          {/* Status Section */}
          {editingUser && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <InfoCircleOutlined className="text-blue-500" />
                  <div>
                    <Text strong>Account Status</Text>
                    <div className="flex items-center gap-2 mt-1">
                      {renderStatusTag(userStatus)}
                      {userStatus === STATUS.INACTIVE && (
                        <Text type="secondary" className="text-xs">
                          User cannot login
                        </Text>
                      )}
                    </div>
                  </div>
                </div>
                <Switch
                  checked={userStatus === STATUS.ACTIVE}
                  onChange={handleStatusChange}
                  checkedChildren="Active"
                  unCheckedChildren="Inactive"
                  disabled={editingUser?.id === currentUser?.id}
                  size="default"
                />
              </div>
              {editingUser?.id === currentUser?.id && (
                <Alert
                  message="Cannot modify own account status"
                  type="info"
                  showIcon
                  className="mt-3"
                  size="small"
                />
              )}
            </div>
          )}

          {/* Role Selection */}
          <div>
            <Text strong className="block mb-2">Role *</Text>
            <Select
              value={selectedRole}
              onChange={setSelectedRole}
              className="w-full"
              size="large"
              disabled={editingUser && editingUser.role === ROLES.SUPER_ADMIN}
            >
              {canSetSuperAdmin && (
                <Option value={ROLES.SUPER_ADMIN}>
                  <div className="flex items-center gap-2">
                    <CrownOutlined className="text-warning" />
                    Super Admin (Full Access)
                  </div>
                </Option>
              )}
              <Option value={ROLES.ADMIN}>
                <div className="flex items-center gap-2">
                  <SettingOutlined className="text-error" />
                  Admin
                </div>
              </Option>
            </Select>
            {selectedRole === ROLES.SUPER_ADMIN && (
              <Text type="secondary" className="block mt-2">
                Super Admin has full access to all features.
              </Text>
            )}
          </div>

          {/* Name and Email */}
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="Full Name"
                rules={[
                  { required: true, message: 'Please enter full name' },
                  { min: 2, message: 'Name must be at least 2 characters' }
                ]}
              >
                <Input 
                  prefix={<UserOutlined className="text-primary" />}
                  placeholder="John Doe"
                  size="large"
                />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                name="email"
                label="Email Address"
                rules={[
                  { required: true, message: 'Please enter email' },
                  { type: 'email', message: 'Invalid email format' },
                  { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Invalid email address' }
                ]}
                extra={editingUser ? (
                  <span style={{ color: '#d97706', fontSize: 11 }}>
                    ⚠️ Changing email updates Firebase Auth. The user must log in again with the new email.
                  </span>
                ) : null}
              >
                <Input
                  prefix={<MailOutlined className="text-secondary" />}
                  placeholder="user@example.com"
                  size="large"
                  type="email"
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Phone */}
          <Form.Item
            name="phone"
            label="Phone Number"
            rules={[
              { required: true, message: 'Please enter phone number' },
              { pattern: /^[0-9]{10}$/, message: 'Must be 10 digits (e.g., 9876543210)' }
            ]}
          >
            <Input 
              prefix={<PhoneOutlined className="text-accent" />}
              placeholder="9876543210"
              size="large"
              maxLength={10}
            />
          </Form.Item>

          {/* Password Fields (only for new users) */}
          {!editingUser && (
            <>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="password"
                    label="Password"
                    rules={[
                      { required: false },
                      { min: 6, message: 'Minimum 6 characters' },
                      { pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 
                        message: 'Must contain uppercase, lowercase, and number' }
                    ]}
                    extra={
                      <div className="text-xs text-gray-500 mt-1">
                        Leave blank to auto-generate a secure password
                      </div>
                    }
                  >
                    <Input.Password 
                      prefix={<LockOutlined className="text-warning" />}
                      placeholder="Enter password (optional)"
                      size="large"
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="confirmPassword"
                    label="Confirm Password"
                    dependencies={['password']}
                    rules={[
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          const password = getFieldValue('password')
                          if (!password && !value) {
                            return Promise.resolve()
                          }
                          if (!value) {
                            return Promise.reject(new Error('Please confirm password'))
                          }
                          if (password !== value) {
                            return Promise.reject(new Error('Passwords do not match!'))
                          }
                          return Promise.resolve()
                        }
                      })
                    ]}
                  >
                    <Input.Password 
                      prefix={<LockOutlined className="text-warning" />}
                      placeholder="Confirm password"
                      size="large"
                    />
                  </Form.Item>
                </Col>
              </Row>

              {/* Send Email Option */}
              <Form.Item>
                <Checkbox
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  disabled={uploading}
                >
                  <Space>
                    <SendOutlined className="text-primary" />
                    <Text strong>Send welcome email with login credentials</Text>
                  </Space>
                </Checkbox>
                <Text type="secondary" className="block mt-1">
                  Will send an email with login instructions to the user's email address
                </Text>
              </Form.Item>
            </>
          )}

          {/* Status Selection for New Users */}
          {!editingUser && (
            <div>
              <Text strong className="block mb-2">Initial Status</Text>
              <Select
                value={userStatus}
                onChange={setUserStatus}
                className="w-full"
                size="large"
              >
                <Option value={STATUS.ACTIVE}>
                  <div className="flex items-center gap-2">
                    <CheckCircleOutlined className="text-success" />
                    Active (Can login immediately)
                  </div>
                </Option>
                <Option value={STATUS.INACTIVE}>
                  <div className="flex items-center gap-2">
                    <CloseCircleOutlined className="text-error" />
                    Inactive (Requires activation)
                  </div>
                </Option>
            
              </Select>
              {userStatus === STATUS.INACTIVE && (
                <Alert
                  message="User will need to be activated before they can login"
                  type="info"
                  showIcon
                  className="mt-2"
                  size="small"
                />
              )}
            </div>
          )}
        </div>
      </Form>
    </Drawer>
  )
}

export default UserDrawer