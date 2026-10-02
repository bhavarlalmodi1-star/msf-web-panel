import React, { useState } from 'react';
import {
  Drawer,
  Space,
  Typography,
  Card,
  Row,
  Col,
  Tag,
  Divider,
  List,
  Avatar,
  Button,
  Popconfirm,
  message
} from 'antd';
import {
  FileTextOutlined,
  UserOutlined,
  DeleteOutlined,
  WarningOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getAuth } from 'firebase/auth';

const { Text } = Typography;

const ClosingGroupDetailDrawer = ({
  visible,
  onClose,
  group,
  programList,
  colors,
  isSuperAdmin,
  onDeleteSuccess,
}) => {
  const [deleting, setDeleting] = useState(false);
  const formatDate = (date) => {
    if (!date) return 'N/A';
    return dayjs(date.toDate?.() || date).format('DD MMM YYYY, hh:mm A');
  };

  const handleDelete = async () => {
    if (!group?.id) return;
    setDeleting(true);
    try {
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/closing-fees-revert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ paymentGroupId: group.id }),
      });
      const data = await res.json();
      if (data.success) {
        message.success(data.message || 'Payment group reverted successfully');
        onClose();
        if (onDeleteSuccess) onDeleteSuccess(group.id, true);
      } else {
        message.error(data.message || 'Failed to revert payment group');
      }
    } catch (err) {
      message.error('Network error while reverting payment');
    } finally {
      setDeleting(false);
    }
  };

  if (!group) return null;

  return (
    <Drawer
      title={
        <Space>
          <FileTextOutlined style={{ color: colors.primary }} />
          <span>Payment Group Details</span>
        </Space>
      }
      placement="right"
      width={500}
      onClose={onClose}
      open={visible}
      extra={
        isSuperAdmin && (
          <Popconfirm
            title="Delete this payment group?"
            description={
              <span>
                This will <strong>permanently reverse</strong> all member payments in this group and cannot be undone.
              </span>
            }
            icon={<WarningOutlined style={{ color: 'red' }} />}
            onConfirm={handleDelete}
            okText="Yes, Delete & Revert"
            okButtonProps={{ danger: true, loading: deleting }}
            cancelText="Cancel"
          >
            <Button
              danger
              icon={<DeleteOutlined />}
              loading={deleting}
              size="small"
            >
              Delete
            </Button>
          </Popconfirm>
        )
      }
    >
      <div>
        {/* Group Header */}
        <Card size="small" style={{ marginBottom: 16, background: colors.background }}>
          <Row gutter={[12, 12]}>
            <Col span={24}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text type="secondary">Payment Method</Text>
                <Tag color={group.paymentMethod === 'cash' ? 'green' : 'blue'} style={{ padding: '4px 12px' }}>
                  {group.paymentMethod === 'cash' ? '💵 Cash' : '📱 Online'}
                </Tag>
              </div>
            </Col>
            <Col span={24}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text type="secondary">Total Amount</Text>
                <Text strong style={{ fontSize: 20, color: colors.primary }}>
                  ₹{group.totalAmount?.toLocaleString()}
                </Text>
              </div>
            </Col>
            <Col span={24}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text type="secondary">Payment Date</Text>
                <Text>{formatDate(group.paymentDate)}</Text>
              </div>
            </Col>
            {group.transactionId && (
              <Col span={24}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary">Transaction ID</Text>
                  <Text code>{group.transactionId}</Text>
                </div>
              </Col>
            )}
            {group.paymentNote && (
              <Col span={24}>
                <Text type="secondary">Note</Text>
                <div style={{ background: colors.surface, padding: 8, borderRadius: 4, marginTop: 4 }}>
                  <Text>{group.paymentNote}</Text>
                </div>
              </Col>
            )}
          </Row>
        </Card>

        <Divider orientation="left">Transactions in this Group</Divider>

        <List
          itemLayout="horizontal"
          dataSource={group.transactions || []}
          renderItem={(transaction) => (
            <List.Item
              style={{
                padding: '12px',
                marginBottom: 8,
                background: colors.background,
                borderRadius: 8,
                border: `1px solid ${colors.border}`
              }}
            >
              <List.Item.Meta
                avatar={<Avatar icon={<UserOutlined />} />}
                title={
                  <Space>
                    <Text strong>{transaction.memberName}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {transaction.registrationNumber}
                    </Text>
                  </Space>
                }
                description={
                  <Space direction="vertical" size={2}>
                    <Space>
                      <Tag color="geekblue" style={{ fontSize: 11 }}>
                        ₹{transaction.amount?.toLocaleString()}
                      </Tag>
                      {transaction.programIds?.map(pid => {
                        const program = programList.find(p => p.id === pid);
                        return program ? (
                          <Tag key={pid} color="purple" style={{ fontSize: 11 }}>
                            {program.name}
                          </Tag>
                        ) : null;
                      })}
                    </Space>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </div>
    </Drawer>
  );
};

export default ClosingGroupDetailDrawer;