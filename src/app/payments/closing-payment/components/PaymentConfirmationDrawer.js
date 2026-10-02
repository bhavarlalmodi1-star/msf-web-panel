import React from 'react';
import {
  Drawer, Space, Typography, Card, Row, Col, Tag, Avatar, Divider, List, Button,
  DatePicker, Input, Upload, Alert, Spin, Collapse, Tooltip
} from 'antd';
import {
  UserOutlined, DollarCircleOutlined, WalletOutlined, CalendarOutlined,
  UploadOutlined, ExclamationCircleOutlined, FolderOpenOutlined, CheckCircleOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Panel } = Collapse;

const ClosingPaymentConfirmationDrawer = ({
  visible, onClose, onConfirm, uploading,
  processingPayments, selectedMembersData, memberPayments, closingGroupsMap,
  currentAgent, paymentMethod, transactionId, totalPaymentAmount,
  paymentDate, setPaymentDate, paymentNote, setPaymentNote,
  uploadedFile, setUploadedFile, colors
}) => {

  // Group payments by memberId for display
  const memberGrouped = {};
  for (const p of processingPayments) {
    if (!memberGrouped[p.memberId]) {
      const member = selectedMembersData?.find(m => m.id === p.memberId);
      memberGrouped[p.memberId] = {
        memberId: p.memberId,
        memberName: p.memberName || member?.displayName || '',
        member,
        groups: [],
        totalAmt: 0,
      };
    }
    memberGrouped[p.memberId].groups.push(p);
    memberGrouped[p.memberId].totalAmt += p.amount;
  }
  const groupedList = Object.values(memberGrouped);

  return (
    <Drawer
      title={
        <Space size={12}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: `linear-gradient(135deg, ${colors.primary}20 0%, ${colors.secondary}20 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <DollarCircleOutlined style={{ color: colors.primary, fontSize: 20 }} />
          </div>
          <div>
            <Title level={5} style={{ margin: 0 }}>Confirm Payment</Title>
            <Text type="secondary">
              {processingPayments.length} closing group{processingPayments.length !== 1 ? 's' : ''}
            </Text>
          </div>
        </Space>
      }
      placement="right"
      size={650}
      onClose={onClose}
      destroyOnHidden
      open={visible}
      extra={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" onClick={onConfirm} loading={uploading}
            style={{ background: colors.primary, borderColor: colors.primary }}>
            Confirm Payment
          </Button>
        </Space>
      }
    >
      {uploading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>Processing payments...</div>
        </div>
      ) : (
        <div style={{ padding: '8px 0' }}>
          {/* Agent Info Summary */}
          <Card size="small" style={{ marginBottom: 16, background: colors.background }}>
            <Row gutter={16} align="middle">
              <Col><Avatar src={currentAgent?.photoUrl} icon={<UserOutlined />} size={40} /></Col>
              <Col flex="auto">
                <Text strong>{currentAgent?.name}</Text>
                <div><Text type="secondary" style={{ fontSize: '12px' }}>{currentAgent?.phone1}</Text></div>
              </Col>
              <Col><Tag color="purple">{currentAgent?.caste}</Tag></Col>
            </Row>
          </Card>

          {/* Payment Summary Card */}
          <Card size="small" style={{ marginBottom: 16, border: `1px dashed ${colors.primary}`, background: `${colors.primary}08` }}>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Text type="secondary">Payment Method</Text>
                <div style={{ marginTop: 4 }}>
                  <Tag color={paymentMethod === 'cash' ? 'green' : 'blue'} style={{ padding: '4px 12px' }}>
                    {paymentMethod === 'cash' ? 'Cash Payment' : 'Online Transfer'}
                  </Tag>
                </div>
              </Col>
              <Col span={12}>
                <Text type="secondary">Total Amount</Text>
                <Title level={4} style={{ margin: 0, color: colors.primary }}>
                  ₹{totalPaymentAmount.toLocaleString()}
                </Title>
              </Col>
              {paymentMethod === 'online' && (
                <Col span={24}>
                  <Text type="secondary">Transaction ID</Text>
                  <div style={{ marginTop: 4 }}><Text code>{transactionId}</Text></div>
                </Col>
              )}
            </Row>
          </Card>

          {/* Payment Date */}
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary">Payment Date</Text>
            <DatePicker style={{ width: '100%', marginTop: 4 }} value={paymentDate}
              onChange={setPaymentDate} format="DD/MM/YYYY" allowClear={false} size="middle"
              suffixIcon={<CalendarOutlined style={{ color: colors.primary }} />} />
          </div>

          {/* Online Payment Upload */}
          {paymentMethod === 'online' && (
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary">Upload Payment Screenshot (Optional)</Text>
              <Upload beforeUpload={(file) => { setUploadedFile(file); return false; }}
                onRemove={() => setUploadedFile(null)}
                fileList={uploadedFile ? [{ uid: '-1', name: uploadedFile.name, status: 'done' }] : []}
                maxCount={1} listType="picture" accept="image/*,.pdf">
                <Button size="middle" icon={<UploadOutlined />} style={{ marginTop: 4, width: '100%' }}>
                  Select File
                </Button>
              </Upload>
            </div>
          )}

          {/* Payment Note */}
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary">Note (Optional)</Text>
            <TextArea rows={3} placeholder="Add any notes about this payment..."
              value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} style={{ marginTop: 4 }} />
          </div>

          <Divider style={{ margin: '16px 0' }}>
            <Tag color="purple">Closing-wise Breakdown ({groupedList.length} members)</Tag>
          </Divider>

          {/* Per-Closing-Group Breakdown */}
          <Collapse bordered={false} ghost style={{ background: 'transparent' }}
            defaultActiveKey={groupedList.slice(0, 3).map(g => g.memberId)}>
            {groupedList.map(group => {
              const member = group.member;
              const mGroups = closingGroupsMap?.[group.memberId] || [];
              const groupAmt = group.totalAmt;
              return (
                <Panel
                  key={group.memberId}
                  header={
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Space>
                        <Avatar src={member?.photoURL} icon={<UserOutlined />} size={28} />
                        <div>
                          <Text strong style={{ fontSize: 13 }}>{group.memberName}</Text>
                          <div style={{ fontSize: 10, color: '#999' }}>
                            {member?.registrationNumber || ''} · {group.groups.length} closing group{group.groups.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </Space>
                      <Tag color="purple" style={{ fontWeight: 600, fontSize: 12 }}>
                        ₹{groupAmt.toLocaleString()}
                      </Tag>
                    </div>
                  }
                  style={{ marginBottom: 8, borderRadius: 8, background: '#fafafa' }}
                >
                  {/* Per-group breakdown table */}
                  <div style={{ fontSize: 12 }}>
                    <div style={{ display: 'flex', fontWeight: 600, padding: '6px 8px', background: '#f0f0f0', borderRadius: 4, marginBottom: 4 }}>
                      <div style={{ flex: 1 }}>Closing Group</div>
                      <div style={{ width: 80, textAlign: 'right' }}>Pending</div>
                      <div style={{ width: 90, textAlign: 'right' }}>Paying</div>
                      <div style={{ width: 80, textAlign: 'right' }}>Remaining</div>
                    </div>
                    {group.groups.map((g, i) => {
                      const grpDetail = mGroups.find(mg => mg.closingGroupId === g.closingGroupId) || {};
                      const pendingAmt = grpDetail.pendingAmount || 0;
                      const remaining = pendingAmt - g.amount;
                      return (
                        <div key={i} style={{ display: 'flex', padding: '5px 8px', borderBottom: '1px solid #f0f0f0', alignItems: 'center' }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontWeight: 500 }}>{grpDetail.closingDetails?.[0]?.closed_memberName || g.closingGroupId?.slice(-8) || '—'}</span>
                            <div style={{ fontSize: 10, color: '#999' }}>
                              {grpDetail.closingGroupName ? `${grpDetail.closingGroupName} · ` : ''}{grpDetail.closingCount || 0} event(s) · ₹{grpDetail.payAmount || 0}/event
                            </div>
                          </div>
                          <div style={{ width: 80, textAlign: 'right', color: '#ff4d4f' }}>₹{pendingAmt.toLocaleString()}</div>
                          <div style={{ width: 90, textAlign: 'right', fontWeight: 600, color: colors.primary }}>₹{g.amount.toLocaleString()}</div>
                          <div style={{ width: 80, textAlign: 'right', color: remaining <= 0 ? '#52c41a' : '#faad14' }}>
                            {remaining <= 0 ? <CheckCircleOutlined /> : `₹${remaining.toLocaleString()}`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Panel>
              );
            })}
          </Collapse>

          {/* Summary Footer */}
          <Card size="small" style={{ marginTop: 16, background: colors.background }}>
            <Row justify="space-between">
              <Col><Text type="secondary">Members</Text><div><Text strong>{groupedList.length}</Text></div></Col>
              <Col><Text type="secondary">Groups</Text><div><Text strong>{processingPayments.length}</Text></div></Col>
              <Col><Text type="secondary">Total</Text><div><Text strong style={{ color: colors.primary }}>₹{totalPaymentAmount.toLocaleString()}</Text></div></Col>
              <Col><Text type="secondary">Method</Text><div><Tag color={paymentMethod === 'cash' ? 'green' : 'blue'}>{paymentMethod === 'cash' ? 'Cash' : 'Online'}</Tag></div></Col>
            </Row>
          </Card>

          <Alert
            message="This action will update per-closing-group payment records and cannot be undone"
            type="warning" showIcon icon={<ExclamationCircleOutlined />} style={{ marginTop: 16 }}
          />
        </div>
      )}
    </Drawer>
  );
};

export default ClosingPaymentConfirmationDrawer;