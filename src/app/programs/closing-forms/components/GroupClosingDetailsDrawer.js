"use client"
import { panelTheme } from '@/utils/trust/trustStore';
import React from 'react'
import { Modal, Space, Tag, Descriptions, List, Avatar, Button, Typography } from 'antd'
import { HeartFilled, UserOutlined, TeamOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'

const { Text } = Typography

const C = {
  get primary() { return panelTheme().primary; }, success: '#16a34a', muted: '#9ca3af', fg: '#111827',
  warning: '#f59e0b', info: '#2563eb',
}

const ClosingGroupModal = ({ group, visible, onClose, programList }) => {
  if (!group) return null
  const program = programList.find(p => p.id === group.programId)

  return (
    <Modal
      open={visible} onCancel={onClose} footer={null} width={720}
      title={
        <Space>
          <HeartFilled style={{ color: C.primary }} />
          <span style={{ fontWeight: 700 }}>Closing Group Detail</span>
          <Tag color={group.status === 'reversed' ? 'red' : 'green'}>
            {group.status === 'reversed' ? 'Reversed' : 'Active'}
          </Tag>
        </Space>
      }
    >
      <Descriptions size="small" bordered column={2} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Group ID">
          <Text copyable style={{ fontSize: 11 }}>{group.id}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="Program">{program?.name || group.programId}</Descriptions.Item>
        <Descriptions.Item label="Closed By">{group.closedByName || '—'}</Descriptions.Item>
        <Descriptions.Item label="Closed At">
          {group.closedDate ? dayjs(group.closedDate).format('DD/MM/YYYY HH:mm') : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Member Count">
          <Tag color="blue">{group.memberCount}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Total Amount">
          <span style={{ fontWeight: 700, color: C.success }}>₹{group.totalAmount?.toLocaleString()}</span>
        </Descriptions.Item>
        {group.status === 'reversed' && (
          <>
            <Descriptions.Item label="Reversed By">{group.reversedByName || '—'}</Descriptions.Item>
            <Descriptions.Item label="Reversal Reason">{group.reversalReason || '—'}</Descriptions.Item>
          </>
        )}
      </Descriptions>

      <div style={{ fontWeight: 700, marginBottom: 8, color: C.fg }}>
        Members ({group.members?.length || group.memberIds?.length || 0})
      </div>
      <div style={{ maxHeight: 360, overflowY: 'auto' }}>
        <List
          size="small"
          dataSource={group.members || []}
          locale={{ emptyText: group.memberIds?.length ? `${group.memberIds.length} member IDs stored` : 'No member details' }}
          renderItem={(m) => (
            <List.Item
              style={{ padding: '8px 0' }}
              extra={
                <Space>
                  {(m.closed_invitation_url || m.invitationUrl) && (
                    <Button size="small" type="link" onClick={() => window.open(m.closed_invitation_url || m.invitationUrl)}>View Card</Button>
                  )}
                  <Tag color="blue">₹{m.amount}</Tag>
                </Space>
              }
            >
              <List.Item.Meta
                avatar={
                  <Avatar icon={<UserOutlined />} size={30}
                    style={{ background: C.primary + '30', color: C.primary }} />
                }
                title={
                  <Space size={4}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{m.memberName}</span>
                    <Tag style={{ fontSize: 10 }}>{m.registrationNumber}</Tag>
                  </Space>
                }
                description={
                  <Space size={4} style={{ fontSize: 11, color: C.muted }}>
                    {m.phone && <span>{m.phone}</span>}
                    {m.marriageDate && <span>• {dayjs(m.marriageDate).format('DD/MM/YYYY')}</span>}
                    {m.note && <span>• {m.note}</span>}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </div>
    </Modal>
  )
}

export default ClosingGroupModal