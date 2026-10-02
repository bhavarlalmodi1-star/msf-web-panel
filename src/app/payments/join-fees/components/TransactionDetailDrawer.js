import React, { useState } from 'react';
import {
  Drawer, Space, Typography, Card, Descriptions, Tag, Avatar,
  Row, Col, Divider, Button, Popconfirm, message, Alert, Image
} from 'antd';
import {
  FileTextOutlined, UserOutlined, CalendarOutlined,
  DeleteOutlined, WarningOutlined, PictureOutlined,
  LinkOutlined, WalletOutlined, MobileOutlined, BankOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getAuth } from 'firebase/auth';

const { Text, Title } = Typography;

// ─── helpers ──────────────────────────────────────────────────────────────────
const isImageUrl = (url) => {
  if (!url) return false;
  const lower = url.toLowerCase().split('?')[0];
  return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/.test(lower);
};

const paymentMethodInfo = (mode) => {
  switch (mode) {
    case 'cash':    return { label: 'Cash',    color: 'green',  icon: <WalletOutlined /> };
    case 'online':  return { label: 'Online',  color: 'blue',   icon: <MobileOutlined /> };
    case 'advance': return { label: 'Advance', color: 'purple', icon: <BankOutlined /> };
    default:        return { label: mode || '—', color: 'default', icon: <WalletOutlined /> };
  }
};

// ─── Component ────────────────────────────────────────────────────────────────
const TransactionDetailDrawer = ({
  visible, onClose, transaction, selectedMember,
  programList, colors, isSuperAdmin, onDeleteSuccess,
  // The closing-payment screen reuses this drawer, but its transactions live in
  // memberClosingFees and must be reverted by the closing endpoint. Defaults to
  // join fees so existing callers are unaffected.
  revertEndpoint = '/api/join-fees-revert-single',
}) => {
  const [deleting, setDeleting] = useState(false);

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return dayjs(date?.toDate?.() || date).format('DD MMM YYYY, hh:mm A');
  };

  const handleDelete = async () => {
    if (!transaction?.id) return;
    setDeleting(true);
    try {
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(revertEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ feeDocId: transaction.id }),
      });
      const data = await res.json();
      if (data.success) {
        message.success(data.message || 'Transaction reverted successfully');
        onClose();
        if (onDeleteSuccess) onDeleteSuccess(transaction);
      } else {
        message.error(data.message || 'Failed to revert transaction');
      }
    } catch {
      message.error('Network error while reverting transaction');
    } finally {
      setDeleting(false);
    }
  };

  if (!transaction) return null;

  const programName = transaction.programName ||
    programList?.find(p => p.id === transaction.programId)?.name;
  const method = paymentMethodInfo(transaction.paymentMode);
  const fileUrl = transaction.fileUrl || '';
  const hasFile = !!fileUrl;
  const isImage = isImageUrl(fileUrl);

  return (
    <Drawer
      title={
        <Space>
          <FileTextOutlined style={{ color: colors.primary }} />
          <span>Transaction Details</span>
        </Space>
      }
      placement="right"
      width={480}
      onClose={onClose}
      open={visible}
      extra={
        isSuperAdmin && (
          <Popconfirm
            title="Revert this transaction?"
            description={
              <span>
                ₹{transaction.amount?.toLocaleString()} will be <strong>reversed</strong> for {transaction.memberName}.
                This cannot be undone.
              </span>
            }
            icon={<WarningOutlined style={{ color: 'red' }} />}
            onConfirm={handleDelete}
            okText="Yes, Revert"
            okButtonProps={{ danger: true, loading: deleting }}
            cancelText="Cancel"
          >
            <Button danger icon={<DeleteOutlined />} loading={deleting} size="small">
              Revert
            </Button>
          </Popconfirm>
        )
      }
    >
      <div>
        {/* ── Amount Banner ── */}
        <div style={{
          background: `linear-gradient(135deg, ${colors.primary}15, ${colors.secondary}15)`,
          border: `1.5px solid ${colors.primary}30`,
          borderRadius: 12, padding: '14px 20px', marginBottom: 16,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <Text type="secondary" style={{ fontSize: 11 }}>Amount Paid</Text>
            <Title level={3} style={{ margin: 0, color: colors.primary }}>
              ₹{transaction.amount?.toLocaleString()}
            </Title>
          </div>
          <Tag
            color={method.color}
            icon={method.icon}
            style={{ fontSize: 13, padding: '4px 12px', fontWeight: 600 }}
          >
            {method.label}
          </Tag>
        </div>

        {/* ── Payment Info ── */}
        <Card size="small" style={{ marginBottom: 16 }}>
          <Descriptions column={1} bordered={false} size="small" labelStyle={{ color: '#888', fontSize: 12 }}>
            <Descriptions.Item label="Transaction ID">
              <Text code style={{ fontSize: 11 }}>{transaction.id}</Text>
            </Descriptions.Item>
            {transaction.transactionId && (
              <Descriptions.Item label="Reference / UTR">
                <Text code style={{ fontSize: 12 }}>{transaction.transactionId}</Text>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Date">
              <Space>
                <CalendarOutlined />
                {formatDate(transaction.transactionDate || transaction.createdAt)}
              </Space>
            </Descriptions.Item>
            {programName && (
              <Descriptions.Item label="Program">
                <Tag color="geekblue">{programName}</Tag>
              </Descriptions.Item>
            )}
            {transaction.paymentNote && (
              <Descriptions.Item label="Note">
                <div style={{ background: '#fafafa', padding: '6px 10px', borderRadius: 6, fontSize: 13 }}>
                  {transaction.paymentNote}
                </div>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Created By">
              <Text type="secondary" style={{ fontSize: 12 }}>{transaction.createdBy}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Group ID">
              <Text type="secondary" style={{ fontSize: 11 }}>{transaction.groupId}</Text>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* ── Member ── */}
        <Divider orientation="left" style={{ fontSize: 13 }}>Member</Divider>
        <Card size="small" style={{ marginBottom: 16 }}>
          <Row gutter={12} align="middle">
            <Col>
              <Avatar
                src={selectedMember?.photoURL}
                icon={<UserOutlined />}
                size={44}
                style={{ background: colors.primary }}
              />
            </Col>
            <Col flex="auto">
              <Text strong style={{ fontSize: 14 }}>{transaction.memberName}</Text>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {transaction.memberRegNo || selectedMember?.registrationNumber}
                </Text>
              </div>
              {transaction.memberPhone && (
                <Text type="secondary" style={{ fontSize: 12 }}>{transaction.memberPhone}</Text>
              )}
            </Col>
          </Row>
        </Card>

        {/* ── Screenshot / Receipt ── */}
        {hasFile ? (
          <>
            <Divider orientation="left" style={{ fontSize: 13 }}>
              <Space size={4}>
                <PictureOutlined />
                Payment Screenshot
              </Space>
            </Divider>
            <Card size="small" style={{ marginBottom: 16, textAlign: 'center' }}>
              {isImage ? (
                <Image
                  src={fileUrl}
                  alt="Payment screenshot"
                  style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 8, objectFit: 'contain' }}
                  placeholder={
                    <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', borderRadius: 8 }}>
                      <PictureOutlined style={{ fontSize: 32, color: '#ccc' }} />
                    </div>
                  }
                />
              ) : (
                <div style={{ padding: '16px 0' }}>
                  <PictureOutlined style={{ fontSize: 32, color: colors.info, marginBottom: 8, display: 'block' }} />
                  <Text type="secondary" style={{ fontSize: 12 }}>Receipt / Document attached</Text>
                </div>
              )}
              <div style={{ marginTop: 10 }}>
                <Button
                  type="link"
                  icon={<LinkOutlined />}
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  size="small"
                >
                  Open in new tab
                </Button>
              </div>
            </Card>
          </>
        ) : (
          <div style={{ marginBottom: 12, fontSize: 12, color: '#bbb', textAlign: 'center' }}>
            <PictureOutlined style={{ marginRight: 4 }} />No screenshot attached
          </div>
        )}

        {/* ── Warning for superadmin revert ── */}
        {isSuperAdmin && (
          <Alert
            message="Reverting will deduct this amount from member's paid balance and restore it as pending."
            description={`₹${transaction.amount?.toLocaleString()} will be reversed. Agent and program stats will also be updated.`}
            type="warning"
            showIcon
            icon={<WarningOutlined />}
          />
        )}
      </div>
    </Drawer>
  );
};

export default TransactionDetailDrawer;
