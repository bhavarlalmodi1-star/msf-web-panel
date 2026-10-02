import React from 'react';
import {
  Drawer,
  Space,
  Avatar,
  Typography,
  Row,
  Col,
  Divider,
  Badge,
  Progress,
  Button,
  Tag
} from 'antd';
import {
  UserOutlined,
  HistoryOutlined,
  ArrowRightOutlined
} from '@ant-design/icons';

const { Text } = Typography;

const AgentDetailDrawer = ({
  agent,
  onClose,
  onViewHistory,
  onPayNow,
  getStatusTag,
  colors
}) => {
  if (!agent) return null;

  return (
    <Drawer
      title={
        <Space>
          <Avatar
            src={agent.photoUrl}
            icon={!agent.photoUrl && <UserOutlined />}
            size={36}
            style={{ backgroundColor: colors.primary, border: `2px solid ${colors.secondary}` }}
          />
          <div>
            <div style={{ fontWeight: 700, color: colors.foreground }}>{agent.name}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>{agent.role}</Text>
          </div>
        </Space>
      }
      open={!!agent}
      onClose={onClose}
      size={600}
      extra={
        <Space>
          <Button
            icon={<HistoryOutlined />}
            onClick={() => {
              onClose();
              onViewHistory(agent);
            }}
            style={{ borderColor: colors.info, color: colors.info }}
          >
            History
          </Button>
          {agent.totalJoinFeesPending > 0 && (
            <Button
              type="primary"
              icon={<ArrowRightOutlined />}
              onClick={() => onPayNow(agent)}
              style={{
                background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
                border: 'none',
                borderRadius: 20,
                fontWeight: 600,
              }}
            >
              Pay Now
            </Button>
          )}
        </Space>
      }
    >
      <div>
        {/* Status Banner */}
        <div
          style={{
            background: agent.totalJoinFeesPending === 0
              ? '#f0fdf4'
              : '#fff7ed',
            border: `1px solid ${agent.totalJoinFeesPending === 0 ? '#bbf7d0' : '#fed7aa'}`,
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {getStatusTag(agent.totalJoinFeesPending)}
          <Text type="secondary" style={{ fontSize: 12 }}>
            {agent.programs?.length || 0} program(s)
          </Text>
        </div>

        {/* Fee Summary */}
        <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
          {[
            { label: 'Total Fees', value: agent.totalJoinFees, color: colors.foreground },
            { label: 'Paid', value: agent.totalJoinFeesPaid, color: colors.success },
            { label: 'Pending', value: agent.totalJoinFeesPending, color: colors.error },
          ].map((item, i) => (
            <Col span={8} key={i}>
              <div
                style={{
                  background: colors.background,
                  borderRadius: 8,
                  padding: '10px 12px',
                  border: `1px solid ${colors.border}`,
                  textAlign: 'center',
                }}
              >
                <Text type="secondary" style={{ fontSize: 11 }}>{item.label}</Text>
                <div style={{ fontWeight: 700, fontSize: 15, color: item.color }}>
                  ₹{item.value?.toLocaleString()}
                </div>
              </div>
            </Col>
          ))}
        </Row>

        <Progress
          percent={Math.round((agent.totalJoinFeesPaid / (agent.totalJoinFees || 1)) * 100)}
          strokeColor={{ from: colors.primary, to: colors.secondary }}
          style={{ marginBottom: 20 }}
        />

        <Divider orientation="left" style={{ fontSize: 13, color: colors.foregroundSecondary }}>
          Program Breakdown
        </Divider>

        {agent.programs?.map((prog) => (
          <div
            key={prog.programId}
            style={{
              background: colors.background,
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text strong style={{ color: colors.primary, fontSize: 13 }}>{prog.programName}</Text>
              <Badge count={prog.memberCount || 0} style={{ backgroundColor: colors.info }} showZero />
            </div>
            <Row gutter={8} style={{ marginBottom: 6 }}>
              <Col span={8}>
                <Text type="secondary" style={{ fontSize: 11 }}>Total</Text>
                <div style={{ fontWeight: 600 }}>₹{prog.totalJoinFees?.toLocaleString() || 0}</div>
              </Col>
              <Col span={8}>
                <Text type="secondary" style={{ fontSize: 11 }}>Paid</Text>
                <div style={{ fontWeight: 600, color: colors.success }}>₹{prog.totalJoinFeesPaid?.toLocaleString() || 0}</div>
              </Col>
              <Col span={8}>
                <Text type="secondary" style={{ fontSize: 11 }}>Pending</Text>
                <div style={{ fontWeight: 600, color: prog.totalJoinFeesPending > 0 ? colors.error : colors.success }}>
                  ₹{prog.totalJoinFeesPending?.toLocaleString() || 0}
                </div>
              </Col>
            </Row>
            <Progress
              percent={Math.round(prog.paymentProgress)}
              size="small"
              strokeColor={prog.paymentProgress >= 100 ? colors.success : colors.primary}
            />
            {prog.totalJoinFeesPending > 0 && (
              <Button
                type="primary"
                size="small"
                block
                icon={<ArrowRightOutlined />}
                onClick={() => onPayNow(agent, prog)}
                style={{
                  marginTop: 8,
                  background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
                  border: 'none',
                  borderRadius: 20,
                  fontWeight: 600,
                }}
              >
                Pay ₹{prog.totalJoinFeesPending.toLocaleString()}
              </Button>
            )}
          </div>
        ))}
      </div>
    </Drawer>
  );
};

export default AgentDetailDrawer;