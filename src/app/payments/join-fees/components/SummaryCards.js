import React from 'react';
import { Card, Row, Col, Typography, Progress } from 'antd';
import { TeamOutlined } from '@ant-design/icons';

const { Text } = Typography;

const SummaryCards = ({ 
  activeAgents, 
  totalFees, 
  totalCollected, 
  totalPending, 
  overallProgress, 
  colors 
}) => {
  const stats = [
    { title: 'Total Agents', value: activeAgents.length, color: colors.info, prefix: <TeamOutlined /> },
    { title: 'Total Fees', value: `₹${totalFees.toLocaleString()}`, color: colors.foreground },
    { title: 'Collected', value: `₹${totalCollected.toLocaleString()}`, color: colors.success },
    { title: 'Pending', value: `₹${totalPending.toLocaleString()}`, color: colors.error },
  ];

  return (
    <>
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        {stats.map((stat, i) => (
          <Col xs={12} md={6} key={i}>
            <Card
              size="small"
              style={{
                border: `1px solid ${colors.border}`,
                borderRadius: 10,
                background: colors.surface,
              }}
              bodyStyle={{ padding: '12px 16px' }}
            >
              <Text type="secondary" style={{ fontSize: 12 }}>{stat.title}</Text>
              <div style={{ fontSize: 20, fontWeight: 700, color: stat.color, marginTop: 2 }}>
                {stat.prefix && <span style={{ marginRight: 6 }}>{stat.prefix}</span>}
                {stat.value}
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Overall Progress Bar */}
      <Card
        size="small"
        style={{ border: `1px solid ${colors.border}`, borderRadius: 10, marginBottom: 16 }}
        bodyStyle={{ padding: '12px 16px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text strong>Overall Collection Progress</Text>
          <Text style={{ color: colors.primary, fontWeight: 700 }}>{overallProgress}%</Text>
        </div>
        <Progress
          percent={overallProgress}
          strokeColor={{ from: colors.primary, to: colors.secondary }}
          showInfo={false}
        />
      </Card>
    </>
  );
};

export default SummaryCards;