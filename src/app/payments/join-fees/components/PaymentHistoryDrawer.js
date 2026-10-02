import React from 'react';
import {
  Drawer,
  Space,
  Avatar,
  Typography,
  Card,
  Row,
  Col,
  Badge,
  Progress,
  Divider,
  Empty,
  Timeline,
  Tag,
  Spin,
  Button
} from 'antd';
import {
  HistoryOutlined,
  UserOutlined,
  WalletOutlined,
  CreditCardOutlined,
  CalendarOutlined,
  FileTextOutlined,
  PictureOutlined,
  BankOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text } = Typography;

const PaymentHistoryDrawer = ({
  visible,
  onClose,
  selectedMember,
  memberTransactions,
  loading,
  programList,
  onTransactionClick,
  colors
}) => {
  const formatDate = (date) => {
    if (!date) return 'N/A';
    return dayjs(date).format('DD MMM YYYY, hh:mm A');
  };

  const getPaymentMethodLabel = (method) => {
    if (method === 'cash')    return { icon: '💵', label: 'Cash',    color: 'green' };
    if (method === 'advance') return { icon: '🏦', label: 'Advance', color: 'purple' };
    return                           { icon: '📱', label: 'Online',  color: 'blue' };
  };

  return (
    <Drawer
      title={
        <Space>
          <HistoryOutlined style={{ color: colors.primary }} />
          <span>Payment History - {selectedMember?.displayName}</span>
        </Space>
      }
      placement="right"
      width={600}
      onClose={onClose}
      open={visible}
      extra={
        <Button type="text" onClick={onClose}>
          Close
        </Button>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>Loading payment history...</div>
        </div>
      ) : (
        <div>
          {/* Member Summary */}
          <Card size="small" style={{ marginBottom: 16, background: colors.background }}>
            <Row gutter={16} align="middle">
              <Col>
                <Avatar 
                  src={selectedMember?.photoURL} 
                  icon={<UserOutlined />} 
                  size={48}
                  style={{ backgroundColor: colors.primary }}
                />
              </Col>
              <Col flex="auto">
                <Text strong style={{ fontSize: 16 }}>{selectedMember?.displayName}</Text>
                <div>
                  <Text type="secondary">{selectedMember?.registrationNumber}</Text>
                </div>
                <div>
                  <Text type="secondary">{selectedMember?.phone}</Text>
                </div>
              </Col>
              <Col>
                <Badge 
                  count={selectedMember?.programIds?.length || 0} 
                  style={{ backgroundColor: colors.info }}
                  showZero
                />
              </Col>
            </Row>
          </Card>

          {/* Payment Stats */}
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Card size="small" style={{ background: colors.background, textAlign: 'center' }}>
                <Text type="secondary">Total Fees</Text>
                <div style={{ fontWeight: 'bold', fontSize: 18 }}>
                  ₹{selectedMember?.totalFees?.toLocaleString() || 0}
                </div>
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" style={{ background: colors.background, textAlign: 'center' }}>
                <Text type="secondary">Paid</Text>
                <div style={{ fontWeight: 'bold', fontSize: 18, color: colors.success }}>
                  ₹{selectedMember?.paidAmount?.toLocaleString() || 0}
                </div>
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" style={{ background: colors.background, textAlign: 'center' }}>
                <Text type="secondary">Pending</Text>
                <div style={{ fontWeight: 'bold', fontSize: 18, color: colors.error }}>
                  ₹{selectedMember?.pendingAmount?.toLocaleString() || 0}
                </div>
              </Card>
            </Col>
          </Row>

          {/* Progress Bar */}
          <Progress
            percent={Math.round((selectedMember?.paidAmount / (selectedMember?.totalFees || 1)) * 100)}
            strokeColor={{ from: colors.primary, to: colors.secondary }}
            style={{ marginBottom: 20 }}
          />

          <Divider orientation="left">Transaction History</Divider>

          {memberTransactions.length === 0 ? (
            <Empty description="No payment transactions found" />
          ) : (
            <Timeline mode="left" style={{ marginTop: 20 }}>
              {memberTransactions.map((transaction) => {
                const mInfo = getPaymentMethodLabel(transaction.paymentMode);
                const hasScreenshot = !!transaction.fileUrl;
                return (
                  <Timeline.Item
                    key={transaction.id}
                    dot={
                      transaction.paymentMode === 'cash' ? (
                        <WalletOutlined style={{ color: colors.success }} />
                      ) : transaction.paymentMode === 'advance' ? (
                        <BankOutlined style={{ color: '#7c3aed' }} />
                      ) : (
                        <CreditCardOutlined style={{ color: colors.info }} />
                      )
                    }
                    color={
                      transaction.paymentMode === 'cash'    ? colors.success :
                      transaction.paymentMode === 'advance' ? '#7c3aed' : colors.info
                    }
                  >
                    <Card
                      size="small"
                      style={{ marginBottom: 8, cursor: 'pointer' }}
                      hoverable
                      onClick={() => onTransactionClick(transaction)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Space wrap>
                          <Tag color={mInfo.color}>
                            {mInfo.icon} {mInfo.label}
                          </Tag>
                          {transaction.transactionId && (
                            <Tag color="default" style={{ fontSize: 10 }}>
                              {transaction.transactionId}
                            </Tag>
                          )}
                          {hasScreenshot && (
                            <Tag color="cyan" icon={<PictureOutlined />} style={{ fontSize: 10 }}>
                              Screenshot
                            </Tag>
                          )}
                        </Space>
                        <Text strong style={{ color: colors.primary, fontSize: 16 }}>
                          ₹{transaction.amount?.toLocaleString()}
                        </Text>
                      </div>

                      <div style={{ marginBottom: 4 }}>
                        <CalendarOutlined style={{ marginRight: 4, color: colors.info }} />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {formatDate(transaction.transactionDate || transaction.createdAt)}
                        </Text>
                      </div>

                      {transaction.paymentNote && (
                        <div style={{ marginBottom: 4 }}>
                          <FileTextOutlined style={{ marginRight: 4, color: colors.warning }} />
                          <Text type="secondary" style={{ fontSize: 12 }}>{transaction.paymentNote}</Text>
                        </div>
                      )}

                      {transaction.programName && (
                        <div style={{ marginTop: 6 }}>
                          <Tag color="geekblue" style={{ fontSize: 10 }}>{transaction.programName}</Tag>
                        </div>
                      )}
                    </Card>
                  </Timeline.Item>
                );
              })}
            </Timeline>
          )}
        </div>
      )}
    </Drawer>
  );
};

export default PaymentHistoryDrawer;