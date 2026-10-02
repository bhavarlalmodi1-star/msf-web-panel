import React from 'react';
import {
  Drawer, Space, Typography, Card, Row, Col, Tag, Avatar,
  Divider, List, Button, DatePicker, Input, Upload, Alert,
  Spin, Progress, Radio
} from 'antd';
import {
  UserOutlined, DollarCircleOutlined, CalendarOutlined,
  UploadOutlined, ExclamationCircleOutlined,
  CheckCircleOutlined, BankOutlined, WalletOutlined,
  MobileOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;
const { TextArea } = Input;

// ─── Join Fees Payment Confirmation Drawer ────────────────────────────────────
const PaymentConfirmationDrawer = ({
  visible, onClose, onConfirm, uploading,
  processingPayments, selectedMembersData, memberPayments,
  currentAgent, paymentMethod, setPaymentMethod,
  transactionId, setTransactionId,
  totalPaymentAmount,
  paymentDate, setPaymentDate,
  paymentNote, setPaymentNote,
  uploadedFile, setUploadedFile,
  advanceBalance = 0,
  colors,
}) => {
  const isOnline  = paymentMethod === 'online';
  const isAdvance = paymentMethod === 'advance';
  const insufficientAdvance = isAdvance && totalPaymentAmount > advanceBalance;

  const confirmDisabled =
    uploading ||
    (isOnline  && !transactionId?.trim()) ||
    insufficientAdvance;

  return (
    <Drawer
      title={
        <Space size={12}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: `linear-gradient(135deg,${colors.primary}20,${colors.secondary}20)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <DollarCircleOutlined style={{ color: colors.primary, fontSize: 20 }} />
          </div>
          <div>
            <Title level={5} style={{ margin: 0 }}>Confirm Join Fees Payment</Title>
            <Text type="secondary" style={{ fontSize: 12 }}>Review details before processing</Text>
          </div>
        </Space>
      }
      placement="right"
      width={620}
      onClose={onClose}
      open={visible}
      extra={
        <Space>
          <Button onClick={onClose} disabled={uploading}>Cancel</Button>
          <Button
            type="primary"
            onClick={onConfirm}
            loading={uploading}
            disabled={confirmDisabled}
            style={{ background: colors.primary, borderColor: colors.primary }}
          >
            Confirm Payment
          </Button>
        </Space>
      }
    >
      {uploading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16, color: colors.primary, fontWeight: 600, fontSize: 15 }}>
            Processing join fee payments...
          </div>
          <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>
            Please wait, do not close this window
          </div>
        </div>
      ) : (
        <div style={{ padding: '4px 0' }}>

          {/* ── Agent Info ── */}
          <Card size="small" style={{ marginBottom: 16 }}>
            <Row gutter={16} align="middle">
              <Col>
                <Avatar src={currentAgent?.photoUrl} icon={<UserOutlined />} size={44}
                  style={{ backgroundColor: colors.primary }} />
              </Col>
              <Col flex="auto">
                <Text strong style={{ fontSize: 14 }}>{currentAgent?.name}</Text>
                <div><Text type="secondary" style={{ fontSize: 12 }}>{currentAgent?.phone1}</Text></div>
              </Col>
              <Col>
                <Tag color="volcano" style={{ fontWeight: 600, fontSize: 16, padding: '4px 14px' }}>
                  ₹{totalPaymentAmount.toLocaleString()}
                </Tag>
              </Col>
            </Row>
          </Card>

          {/* ── Payment Method Selector ── */}
          <Card
            size="small"
            style={{ marginBottom: 16, border: `1.5px solid ${colors.primary}40`, borderRadius: 10 }}
            title={<Text strong style={{ color: colors.primary }}>Payment Method</Text>}
          >
            <Radio.Group
              value={paymentMethod}
              onChange={e => {
                setPaymentMethod(e.target.value);
                // Clear transaction id when switching away from online
                if (e.target.value !== 'online') setTransactionId('');
              }}
              style={{ width: '100%' }}
              buttonStyle="solid"
            >
              <Row gutter={8}>
                <Col span={advanceBalance > 0 ? 8 : 12}>
                  <Radio.Button value="cash" style={{ width: '100%', textAlign: 'center', borderRadius: 8 }}>
                    <Space size={4}>
                      <WalletOutlined />
                      Cash
                    </Space>
                  </Radio.Button>
                </Col>
                <Col span={advanceBalance > 0 ? 8 : 12}>
                  <Radio.Button value="online" style={{ width: '100%', textAlign: 'center', borderRadius: 8 }}>
                    <Space size={4}>
                      <MobileOutlined />
                      Online
                    </Space>
                  </Radio.Button>
                </Col>
                {advanceBalance > 0 && (
                  <Col span={8}>
                    <Radio.Button value="advance" style={{ width: '100%', textAlign: 'center', borderRadius: 8 }}>
                      <Space size={4}>
                        <BankOutlined />
                        Advance
                      </Space>
                    </Radio.Button>
                  </Col>
                )}
              </Row>
            </Radio.Group>

            {/* Online — Transaction ID + Upload */}
            {isOnline && (
              <div style={{ marginTop: 14 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Transaction ID <Text type="danger">*</Text></Text>
                <Input
                  placeholder="Enter UPI / bank transaction ID"
                  value={transactionId}
                  onChange={e => setTransactionId(e.target.value)}
                  style={{ marginTop: 4 }}
                  size="middle"
                  prefix={<MobileOutlined style={{ color: colors.primary }} />}
                  allowClear
                />
                <div style={{ marginTop: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Payment Screenshot (Optional)</Text>
                  <Upload
                    beforeUpload={file => { setUploadedFile(file); return false; }}
                    onRemove={() => setUploadedFile(null)}
                    fileList={uploadedFile ? [{ uid: '-1', name: uploadedFile.name, status: 'done' }] : []}
                    maxCount={1}
                    listType="picture"
                    accept="image/*,.pdf"
                    style={{ marginTop: 4 }}
                  >
                    {!uploadedFile && (
                      <Button size="middle" icon={<UploadOutlined />} style={{ marginTop: 4, width: '100%' }}>
                        Select Screenshot / Receipt
                      </Button>
                    )}
                  </Upload>
                  {uploadedFile && (
                    <div style={{ marginTop: 6, fontSize: 11, color: colors.success }}>
                      ✓ {uploadedFile.name} ({(uploadedFile.size / 1024).toFixed(1)} KB) — will upload on confirm
                    </div>
                  )}
                </div>
                {!transactionId?.trim() && (
                  <Alert
                    message="Transaction ID is required for online payment"
                    type="warning"
                    showIcon
                    style={{ marginTop: 10, fontSize: 12 }}
                  />
                )}
              </div>
            )}

            {/* Advance — balance info */}
            {isAdvance && (
              <div style={{
                marginTop: 14,
                background: insufficientAdvance ? '#fff1f0' : '#f6ffed',
                border: `1px solid ${insufficientAdvance ? '#ffa39e' : '#b7eb8f'}`,
                borderRadius: 8,
                padding: '10px 14px',
              }}>
                <Row justify="space-between" align="middle">
                  <Col>
                    <Text type="secondary" style={{ fontSize: 12 }}>Available Advance</Text>
                    <div>
                      <Text strong style={{ fontSize: 18, color: '#059669' }}>
                        ₹{advanceBalance.toLocaleString()}
                      </Text>
                    </div>
                  </Col>
                  <Col>
                    <Text type="secondary" style={{ fontSize: 12 }}>Payment Amount</Text>
                    <div>
                      <Text strong style={{ fontSize: 18, color: insufficientAdvance ? '#dc2626' : colors.primary }}>
                        ₹{totalPaymentAmount.toLocaleString()}
                      </Text>
                    </div>
                  </Col>
                  <Col>
                    <Text type="secondary" style={{ fontSize: 12 }}>Balance After</Text>
                    <div>
                      <Text strong style={{ fontSize: 18, color: insufficientAdvance ? '#dc2626' : '#1d4ed8' }}>
                        ₹{Math.max(0, advanceBalance - totalPaymentAmount).toLocaleString()}
                      </Text>
                    </div>
                  </Col>
                </Row>
                {insufficientAdvance && (
                  <Alert
                    message={`Advance balance ₹${advanceBalance.toLocaleString()} is less than payment ₹${totalPaymentAmount.toLocaleString()}`}
                    type="error"
                    showIcon
                    style={{ marginTop: 10, fontSize: 12 }}
                  />
                )}
              </div>
            )}
          </Card>

          {/* ── Payment Date ── */}
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Payment Date</Text>
            <DatePicker
              style={{ width: '100%', marginTop: 4 }}
              value={paymentDate}
              onChange={setPaymentDate}
              format="DD/MM/YYYY"
              allowClear={false}
              size="middle"
              suffixIcon={<CalendarOutlined style={{ color: colors.primary }} />}
            />
          </div>

          {/* ── Note ── */}
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Note (Optional)</Text>
            <TextArea
              rows={2}
              placeholder="Add any notes about this payment..."
              value={paymentNote}
              onChange={e => setPaymentNote(e.target.value)}
              style={{ marginTop: 4 }}
            />
          </div>

          <Divider style={{ margin: '16px 0' }}>
            <Tag color="pink" style={{ fontWeight: 600 }}>
              {selectedMembersData?.length || 0} Members — ₹{totalPaymentAmount.toLocaleString()}
            </Tag>
          </Divider>

          {/* ── Member list ── */}
          <List
            itemLayout="horizontal"
            dataSource={selectedMembersData || []}
            renderItem={member => {
              const amount       = parseFloat(memberPayments?.[member.id]) || 0;
              const pending      = Number(member.pendingAmount || 0);
              const paid         = Number(member.paidAmount    || 0);
              const totalFees    = Number(member.joinFees      || 0);
              const afterPending = Math.max(0, pending - amount);
              const newPaid      = paid + amount;
              const newPct       = totalFees > 0 ? Math.min(Math.round((newPaid / totalFees) * 100), 100) : 0;
              const willClear    = afterPending === 0 && amount > 0;

              return (
                <List.Item style={{
                  padding: '10px 12px', marginBottom: 8,
                  background: willClear ? '#f6ffed' : '#fafafa',
                  borderRadius: 8,
                  border: `1px solid ${willClear ? '#b7eb8f' : colors.border}`,
                }}>
                  <List.Item.Meta
                    avatar={
                      <Avatar
                        src={member.photoURL}
                        icon={<UserOutlined />}
                        style={{ backgroundColor: colors.primary }}
                      />
                    }
                    title={
                      <Space>
                        <Text strong style={{ fontSize: 13 }}>{member.displayName}</Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>{member.registrationNumber}</Text>
                        {willClear && (
                          <Tag icon={<CheckCircleOutlined />} color="success" style={{ fontSize: 10 }}>
                            Fully Paid
                          </Tag>
                        )}
                      </Space>
                    }
                    description={
                      <div>
                        <Space size={4} wrap style={{ marginBottom: 4 }}>
                          {member.programName && (
                            <Tag color="geekblue" style={{ fontSize: 10 }}>{member.programName}</Tag>
                          )}
                          <Tag color="orange" style={{ fontSize: 10 }}>
                            Pending ₹{pending.toLocaleString()}
                          </Tag>
                          <Tag color="default" style={{ fontSize: 10 }}>
                            Total ₹{totalFees.toLocaleString()}
                          </Tag>
                        </Space>
                        {totalFees > 0 && (
                          <Progress
                            percent={newPct}
                            size="small"
                            strokeColor={willClear ? '#52c41a' : colors.primary}
                            format={p => <span style={{ fontSize: 10 }}>{p}%</span>}
                          />
                        )}
                      </div>
                    }
                  />
                  <div style={{ textAlign: 'right', minWidth: 90 }}>
                    <Tag color="pink" style={{ fontSize: 13, padding: '4px 12px', fontWeight: 700 }}>
                      ₹{amount.toLocaleString()}
                    </Tag>
                    {afterPending > 0 && (
                      <div style={{ fontSize: 10, color: colors.warning, marginTop: 2 }}>
                        Still due: ₹{afterPending.toLocaleString()}
                      </div>
                    )}
                    {willClear && (
                      <div style={{ fontSize: 10, color: '#16a34a', marginTop: 2 }}>✓ Cleared</div>
                    )}
                  </div>
                </List.Item>
              );
            }}
          />

          {/* ── Footer summary ── */}
          <Card size="small" style={{ marginTop: 16, background: '#fafafa', borderRadius: 10 }}>
            <Row justify="space-between" align="middle">
              <Col>
                <Text type="secondary" style={{ fontSize: 11 }}>Members</Text>
                <div><Text strong style={{ fontSize: 16 }}>{selectedMembersData?.length || 0}</Text></div>
              </Col>
              <Col>
                <Text type="secondary" style={{ fontSize: 11 }}>Method</Text>
                <div>
                  <Tag color={isOnline ? 'blue' : isAdvance ? 'purple' : 'green'} style={{ fontWeight: 600 }}>
                    {isOnline ? '📱 Online' : isAdvance ? '🏦 Advance' : '💵 Cash'}
                  </Tag>
                </div>
              </Col>
              <Col>
                <Text type="secondary" style={{ fontSize: 11 }}>Total</Text>
                <div>
                  <Text strong style={{ fontSize: 20, color: colors.primary }}>
                    ₹{totalPaymentAmount.toLocaleString()}
                  </Text>
                </div>
              </Col>
            </Row>
          </Card>

          <Alert
            message="This action will update member join fee records and cannot be undone"
            type="warning"
            showIcon
            icon={<ExclamationCircleOutlined />}
            style={{ marginTop: 16 }}
          />
        </div>
      )}
    </Drawer>
  );
};

export default PaymentConfirmationDrawer;
