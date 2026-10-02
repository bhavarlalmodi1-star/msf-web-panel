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
  message,
  Tooltip
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

const GroupDetailDrawer = ({
  visible,
  onClose,
  group,
  programList,
  colors,
  isSuperAdmin,
  onDeleteSuccess,
}) => {
  const [deleting, setDeleting] = useState(false);
  const [deletingFeeId, setDeletingFeeId] = useState(null);
  // Local transactions state so we can remove entries live without re-fetch
  const [localTransactions, setLocalTransactions] = useState(null);

  // Sync localTransactions when the group prop changes
  const transactions = localTransactions ?? (group?.transactions || []);

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return dayjs(date.toDate?.() || date).format('DD MMM YYYY, hh:mm A');
  };

  const getToken = async () => {
    const auth = getAuth();
    return auth.currentUser?.getIdToken();
  };

  // ── Delete entire group ───────────────────────────────────────────────────
  const handleDeleteGroup = async () => {
    if (!group?.id) return;
    setDeleting(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/join-fees-revert', {
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
        setLocalTransactions(null);
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

  // ── Delete single fee (one member's transaction) ──────────────────────────
  const handleDeleteSingleFee = async (feeDocId, memberName) => {
    setDeletingFeeId(feeDocId);
    try {
      const token = await getToken();
      const res = await fetch('/api/join-fees-revert-single', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ feeDocId }),
      });
      const data = await res.json();
      if (data.success) {
        message.success(`Payment for ${memberName} reversed`);
        // Live-remove the deleted transaction from local state
        const updated = transactions.filter(t => t.id !== feeDocId);
        setLocalTransactions(updated);
        // If the group itself was deleted (last transaction), close the drawer
        if (data.groupDeleted) {
          onClose();
          if (onDeleteSuccess) onDeleteSuccess(group.id, true);
        } else {
          // Notify parent to refresh but keep drawer open
          if (onDeleteSuccess) onDeleteSuccess(group.id, false);
        }
      } else {
        message.error(data.message || 'Failed to revert payment');
      }
    } catch (err) {
      message.error('Network error while reverting payment');
    } finally {
      setDeletingFeeId(null);
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
      width={520}
      onClose={() => { setLocalTransactions(null); onClose(); }}
      open={visible}
      extra={
        isSuperAdmin && (
          <Popconfirm
            title="Delete entire payment group?"
            description={
              <span>
                This will <strong>permanently reverse all {transactions.length} payment(s)</strong> in this group and cannot be undone.
              </span>
            }
            icon={<WarningOutlined style={{ color: 'red' }} />}
            onConfirm={handleDeleteGroup}
            okText="Yes, Delete All & Revert"
            okButtonProps={{ danger: true, loading: deleting }}
            cancelText="Cancel"
          >
            <Button danger icon={<DeleteOutlined />} loading={deleting} size="small">
              Delete Group
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

        <Divider orientation="left">
          Transactions ({transactions.length})
        </Divider>

        <List
          itemLayout="horizontal"
          dataSource={transactions}
          locale={{ emptyText: 'No transactions remaining' }}
          renderItem={(transaction) => {
            const isTxDeleting = deletingFeeId === transaction.id;
            const programName = transaction.programName ||
              programList.find(p => p.id === transaction.programId)?.name;

            return (
              <List.Item
                style={{
                  padding: '12px',
                  marginBottom: 8,
                  background: isTxDeleting ? '#fff1f0' : colors.background,
                  borderRadius: 8,
                  border: `1px solid ${isTxDeleting ? '#ffccc7' : colors.border}`,
                  opacity: isTxDeleting ? 0.6 : 1,
                  transition: 'all 0.2s',
                }}
                actions={
                  isSuperAdmin
                    ? [
                        <Popconfirm
                          key="del"
                          title={`Remove ${transaction.memberName}'s payment?`}
                          description={
                            <span>
                              ₹{transaction.amount?.toLocaleString()} will be <strong>reversed</strong> for this member.
                            </span>
                          }
                          icon={<WarningOutlined style={{ color: 'red' }} />}
                          onConfirm={() => handleDeleteSingleFee(transaction.id, transaction.memberName)}
                          okText="Yes, Revert"
                          okButtonProps={{ danger: true, loading: isTxDeleting }}
                          cancelText="Cancel"
                          placement="left"
                        >
                          <Tooltip title="Remove this member's payment">
                            <Button
                              type="text"
                              danger
                              size="small"
                              icon={<DeleteOutlined />}
                              loading={isTxDeleting}
                            />
                          </Tooltip>
                        </Popconfirm>,
                      ]
                    : undefined
                }
              >
                <List.Item.Meta
                  avatar={<Avatar icon={<UserOutlined />} style={{ background: colors.primary }} />}
                  title={
                    <Space>
                      <Text strong>{transaction.memberName}</Text>
                      {transaction.memberRegNo && (
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {transaction.memberRegNo}
                        </Text>
                      )}
                    </Space>
                  }
                  description={
                    <Space size={4} wrap>
                      <Tag color="pink" style={{ fontSize: 11, fontWeight: 600 }}>
                        ₹{transaction.amount?.toLocaleString()}
                      </Tag>
                      {programName && (
                        <Tag color="geekblue" style={{ fontSize: 11 }}>
                          {programName}
                        </Tag>
                      )}
                      {transaction.memberPhone && (
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {transaction.memberPhone}
                        </Text>
                      )}
                    </Space>
                  }
                />
              </List.Item>
            );
          }}
        />
      </div>
    </Drawer>
  );
};

export default GroupDetailDrawer;
