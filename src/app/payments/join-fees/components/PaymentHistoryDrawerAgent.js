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
  Divider,
  Empty,
  Timeline,
  Tag,
  Spin,
  Button,
  Select
} from 'antd';
import {
  HistoryOutlined,
  UserOutlined,
  WalletOutlined,
  CreditCardOutlined,
  CalendarOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text } = Typography;

const PaymentHistoryDrawerAgent = ({
  visible,
  onClose,
  selectedAgent,
  paymentGroups,
  paymentTransactions,
  loading,
  programList,
  selectedProgramFilter,
  onProgramFilterChange,
  onGroupClick,
  colors
}) => {
  const formatDate = (date) => {
    if (!date) return 'N/A';
    return dayjs(date.toDate?.() || date).format('DD MMM YYYY, hh:mm A');
  };

  const getTotalCollected = () => {
    if (selectedProgramFilter === 'all') {
      return paymentTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
    }
    return paymentTransactions
      .filter(t => t.programIds?.includes(selectedProgramFilter))
      .reduce((sum, t) => sum + (t.amount || 0), 0);
  };

  const getProgramOptions = () => {
    if (!selectedAgent) return [{ id: 'all', name: 'All Programs' }];
    const programs = selectedAgent.programs || [];
    return [
      { id: 'all', name: 'All Programs' },
      ...programs.map(p => ({ id: p.programId, name: p.programName }))
    ];
  };

  const getFilteredGroups = () => {
    if (selectedProgramFilter === 'all') {
      return paymentGroups;
    }
    return paymentGroups.filter(group => 
      group.transactions?.some(t => t.programIds?.includes(selectedProgramFilter))
    );
  };

  return (
    <Drawer
      title={
        <Space>
          <HistoryOutlined style={{ color: colors.primary }} />
          <span>Payment History - {selectedAgent?.name}</span>
        </Space>
      }
      placement="right"
      width={700}
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
          {/* Agent Summary */}
          <Card size="small" style={{ marginBottom: 16, background: colors.background }}>
            <Row gutter={16} align="middle">
              <Col>
                <Avatar 
                  src={selectedAgent?.photoUrl} 
                  icon={<UserOutlined />} 
                  size={48}
                  style={{ backgroundColor: colors.primary }}
                />
              </Col>
              <Col flex="auto">
                <Text strong style={{ fontSize: 16 }}>{selectedAgent?.name}</Text>
                <div>
                  <Text type="secondary">{selectedAgent?.phone1}</Text>
                </div>
                <div>
                  <Text type="secondary">{selectedAgent?.village}, {selectedAgent?.district}</Text>
                </div>
              </Col>
              <Col>
                <Badge 
                  count={selectedAgent?.totalMembers || 0} 
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
                <Text type="secondary">Total Collections</Text>
                <div style={{ fontWeight: 'bold', fontSize: 16, color: colors.primary }}>
                  ₹{getTotalCollected().toLocaleString()}
                </div>
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" style={{ background: colors.background, textAlign: 'center' }}>
                <Text type="secondary">Payment Groups</Text>
                <div style={{ fontWeight: 'bold', fontSize: 16, color: colors.info }}>
                  {paymentGroups.length}
                </div>
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" style={{ background: colors.background, textAlign: 'center' }}>
                <Text type="secondary">Transactions</Text>
                <div style={{ fontWeight: 'bold', fontSize: 16, color: colors.success }}>
                  {paymentTransactions.length}
                </div>
              </Card>
            </Col>
          </Row>

          {/* Program Filter */}
          <div style={{ marginBottom: 16 }}>
            <Select
              style={{ width: '100%' }}
              value={selectedProgramFilter}
              onChange={onProgramFilterChange}
              options={getProgramOptions().map(p => ({
                label: p.name,
                value: p.id
              }))}
            />
          </div>

          {/* Payment Groups Timeline */}
          <Divider orientation="left">Payment Groups</Divider>
          
          {paymentGroups.length === 0 ? (
            <Empty description="No payment groups found" />
          ) : (
            <Timeline mode="left" style={{ marginTop: 20 }}>
              {getFilteredGroups().map((group) => (
                <Timeline.Item
                  key={group.id}
                  dot={
                    group.paymentMethod === 'cash' ? (
                      <WalletOutlined style={{ color: colors.success }} />
                    ) : (
                      <CreditCardOutlined style={{ color: colors.info }} />
                    )
                  }
                  color={group.paymentMethod === 'cash' ? colors.success : colors.info}
                >
                  <Card 
                    size="small" 
                    style={{ marginBottom: 8, cursor: 'pointer' }}
                    hoverable
                    onClick={() => onGroupClick(group)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Space>
                        <Tag color={group.paymentMethod === 'cash' ? 'green' : 'blue'}>
                          {group.paymentMethod === 'cash' ? '💵 Cash' : '📱 Online'}
                        </Tag>
                        {group.transactionId && (
                          <Tag color="purple">ID: {group.transactionId}</Tag>
                        )}
                      </Space>
                      <Text strong style={{ color: colors.primary, fontSize: 16 }}>
                        ₹{group.totalAmount?.toLocaleString()}
                      </Text>
                    </div>
                    
                    <div style={{ marginBottom: 4 }}>
                      <CalendarOutlined style={{ marginRight: 4, color: colors.info }} />
                      <Text type="secondary">{formatDate(group.paymentDate)}</Text>
                    </div>
                    
                    {group.paymentNote && (
                      <div style={{ marginBottom: 4 }}>
                        <FileTextOutlined style={{ marginRight: 4, color: colors.warning }} />
                        <Text type="secondary">{group.paymentNote}</Text>
                      </div>
                    )}
                    
                    <div>
                      <Text type="secondary">
                        {group.transactions?.length || 0} transaction(s) • 
                        Created by: {group.createdBy}
                      </Text>
                    </div>

                    {/* Quick preview of members in this group */}
                    {group.transactions && group.transactions.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>Members:</Text>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                          {group.transactions.slice(0, 3).map(t => (
                            <Tag key={t.id} style={{ fontSize: 10 }}>
                              {t.memberName}
                            </Tag>
                          ))}
                          {group.transactions.length > 3 && (
                            <Tag>+{group.transactions.length - 3} more</Tag>
                          )}
                        </div>
                      </div>
                    )}
                  </Card>
                </Timeline.Item>
              ))}
            </Timeline>
          )}
        </div>
      )}
    </Drawer>
  );
};

export default PaymentHistoryDrawerAgent;