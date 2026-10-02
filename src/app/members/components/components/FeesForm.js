import React, { useEffect } from 'react'
import { Card, Row, Col, Form, Input, Radio, DatePicker, Table, Typography, Alert, message } from 'antd'

const { Text } = Typography

const FeesForm = ({ 
  joinFeesDone, 
  handleJoinFeesDoneChange, 
  paymentMode, 
  setPaymentMode, 
  paidAmount, 
  setPaidAmount,
  calculateTotalJoinFees,
  programDetails,
  calculateProgramPayments,
  isEditMode = false,
  initialPaidAmount = 0,
  memberId = null,
  registrationNumber = '',
  memberName = '',
  currentUser = null
}) => {
  
  // Calculate program payments
  const programPayments = calculateProgramPayments(programDetails, parseFloat(paidAmount || 0))
  
  // Calculate summary
  const totalJoinFees = calculateTotalJoinFees()
  const totalPaid = programPayments.reduce((sum, p) => sum + p.paidAmount, 0)
  const totalPending = programPayments.reduce((sum, p) => sum + p.pendingAmount, 0)
  const paymentProgress = totalJoinFees > 0 ? Math.round((totalPaid / totalJoinFees) * 100) : 0

  // Calculate additional payment for edit mode
  const additionalPayment = isEditMode ? parseFloat(paidAmount || 0) - parseFloat(initialPaidAmount || 0) : 0

  // Handle paid amount change
  const handlePaidAmountChange = (e) => {
    const value = e.target.value
    setPaidAmount(value)
    
    // Validate that paid amount doesn't exceed total join fees
    const totalFees = calculateTotalJoinFees()
    if (parseFloat(value) > totalFees) {
      message.warning(`Paid amount cannot exceed total join fees of ₹${totalFees}`)
    }
  }

  // Payment columns for the table
  const paymentColumns = [
    {
      title: 'Program',
      dataIndex: 'programName',
      key: 'programName',
      width: '30%',
    },
    {
      title: 'Fees',
      dataIndex: 'joinFees',
      key: 'joinFees',
      render: (fees) => <Text strong>₹{fees}</Text>,
      align: 'right',
      width: '15%',
    },
    {
      title: 'Paid',
      dataIndex: 'paidAmount',
      key: 'paidAmount',
      render: (amount) => (
        <Text type={amount > 0 ? "success" : "secondary"}>₹{amount}</Text>
      ),
      align: 'right',
      width: '15%',
    },
    {
      title: 'Pending',
      dataIndex: 'pendingAmount',
      key: 'pendingAmount',
      render: (amount) => (
        <Text type={amount > 0 ? "danger" : "success"}>₹{amount}</Text>
      ),
      align: 'right',
      width: '15%',
    },
    {
      title: 'Status',
      key: 'status',
      render: (_, record) => {
        const status = record.paymentPercentage === 100 ? 'Paid' : 
                      record.paymentPercentage > 0 ? 'Partial' : 'Pending'
        const color = record.paymentPercentage === 100 ? 'green' : 
                     record.paymentPercentage > 0 ? 'orange' : 'red'
        return <Text style={{ color, fontWeight: 'bold' }}>{status}</Text>
      },
      width: '25%',
    },
  ]

  // Transaction type text based on payment amount
  const getTransactionType = () => {
    if (additionalPayment > 0) {
      return 'additional_payment'
    } else if (additionalPayment < 0) {
      return 'refund_adjustment'
    } else {
      return 'payment_update'
    }
  }

  const getTransactionDescription = () => {
    if (additionalPayment > 0) {
      return `Additional payment of ₹${additionalPayment}`
    } else if (additionalPayment < 0) {
      return `Refund/adjustment of ₹${Math.abs(additionalPayment)}`
    } else {
      return 'Payment information updated'
    }
  }

  return (
    <Card title="Fees Information" size="small" className="mb-4">
      {/* For Edit Mode: Show only Payment Status, not editable fields */}
      {isEditMode ? (
        <>
       
          
          {joinFeesDone && programDetails.length > 0 && (
            <>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    label="Total Paid Amount"
                    name="paidAmount"
                    rules={[
                      { required: joinFeesDone, message: 'Please enter paid amount' },
                      {
                        validator: (_, value) => {
                          const totalFees = calculateTotalJoinFees()
                          if (parseFloat(value) > totalFees) {
                            return Promise.reject(`Amount cannot exceed total fees of ₹${totalFees}`)
                          }
                          return Promise.resolve()
                        }
                      }
                    ]}
                  
                  >
                    <Input 
                      type="number" 
                      placeholder="Enter updated total paid amount" 
                      value={paidAmount}
                      onChange={handlePaidAmountChange}
                      addonBefore="₹"
                      min={0}
                      max={calculateTotalJoinFees()}
                      step={100}
                      disabled
                    />
                  </Form.Item>
                  <div className="text-xs text-gray-500 mb-2">
                    Total Join Fees: ₹{calculateTotalJoinFees()}
                  </div>
                </Col>
                <Col span={12}>
                  <Form.Item label="Total Pending Amount">
                    <Input 
                      value={`₹${totalPending}`} 
                      disabled 
                    />
                  </Form.Item>
                  <div className="text-xs text-gray-500">
                    Payment Progress: {paymentProgress}%
                  </div>
                </Col>
              </Row>
              
            
              
              {/* Payment Summary Alert */}
              {totalJoinFees > 0 && (
                <Alert
                  message={`Payment Summary: ₹${totalPaid} paid, ₹${totalPending} pending (${paymentProgress}% complete)`}
                  type={paymentProgress === 100 ? "success" : paymentProgress > 0 ? "warning" : "info"}
                  showIcon
                  className="mb-4"
                />
              )}
              
       

           
            </>
          )}
        </>
      ) : (
        /* For Add Mode: Show all fields */
        <>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                label="Password"
                name="password"
                rules={[
                  { required: true, message: 'Please enter password' },
                  { min: 6, message: 'Password must be at least 6 characters' }
                ]}
              >
                <Input.Password 
                  placeholder="Enter password" 
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="Join Fees Paid?"
                name="joinFeesDone"
              >
                <Radio.Group onChange={handleJoinFeesDoneChange}>
                  <Radio value={true}>Yes</Radio>
                  <Radio value={false}>No</Radio>
                </Radio.Group>
              </Form.Item>
            </Col>
            {joinFeesDone && (
              <Col span={8}>
                <Form.Item
                  label="Payment Mode"
                  name="paymentMode"
                >
                  <Radio.Group onChange={(e) => setPaymentMode(e.target.value)} value={paymentMode}>
                    <Radio value="cash">Cash</Radio>
                    <Radio value="online">Online</Radio>
                  </Radio.Group>
                </Form.Item>
              </Col>
            )}
          </Row>

          {joinFeesDone && programDetails.length > 0 && (
            <>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    label="Total Paid Amount"
                    name="paidAmount"
                    rules={[
                      { required: joinFeesDone, message: 'Please enter paid amount' },
                      {
                        validator: (_, value) => {
                          const totalFees = calculateTotalJoinFees()
                          if (parseFloat(value) > totalFees) {
                            return Promise.reject(`Amount cannot exceed total fees of ₹${totalFees}`)
                          }
                          return Promise.resolve()
                        }
                      }
                    ]}
                  >
                    <Input 
                      type="number" 
                      placeholder="Enter total paid amount" 
                      value={paidAmount}
                      onChange={handlePaidAmountChange}
                      addonBefore="₹"
                      min={0}
                      max={calculateTotalJoinFees()}
                      step={100}
                    />
                  </Form.Item>
                  <div className="text-xs text-gray-500 mb-2">
                    Total Join Fees: ₹{calculateTotalJoinFees()}
                  </div>
                </Col>
                <Col span={12}>
                  <Form.Item label="Total Pending Amount">
                    <Input 
                      value={`₹${totalPending}`} 
                      disabled 
                    />
                  </Form.Item>
                  <div className="text-xs text-gray-500">
                    Payment Progress: {paymentProgress}%
                  </div>
                </Col>
              </Row>
              
              {/* Payment Summary Alert */}
              {totalJoinFees > 0 && (
                <Alert
                  message={`Payment Summary: ₹${totalPaid} paid, ₹${totalPending} pending (${paymentProgress}% complete)`}
                  type={paymentProgress === 100 ? "success" : paymentProgress > 0 ? "warning" : "info"}
                  showIcon
                  className="mb-4"
                />
              )}
              
              {/* Program-wise Payment Distribution */}
              {  programDetails.length > 0 && (
                <div className="mt-4">
                  <Text strong style={{ fontSize: '16px', marginBottom: '8px', display: 'block' }}>
                    Program-wise Payment Distribution:
                  </Text>
                  <Table
                    columns={paymentColumns}
                    dataSource={programPayments.map((payment, index) => ({
                      ...payment,
                      key: index
                    }))}
                    rowKey="programId"
                    size="small"
                    pagination={false}
                    className="mt-2"
                    summary={() => (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0}>
                          <Text strong>Total</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={1} align="right">
                          <Text strong>₹{totalJoinFees}</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={2} align="right">
                          <Text strong type="success">₹{totalPaid}</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={3} align="right">
                          <Text strong type={totalPending > 0 ? "danger" : "success"}>₹{totalPending}</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={4}>
                          <Text strong style={{ 
                            color: paymentProgress === 100 ? 'green' : paymentProgress > 0 ? 'orange' : 'red'
                          }}>
                            {paymentProgress}% Complete
                          </Text>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    )}
                  />
                </div>
              )}
              
              {paymentMode === 'online' && (
                <Row gutter={16} className="mt-4">
                  <Col span={12}>
                    <Form.Item
                      label="Transaction ID"
                      name="joinFeesTxtId"
                      rules={[{ required: paymentMode === 'online', message: 'Transaction ID required' }]}
                    >
                      <Input placeholder="Enter transaction/UTR number" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      label="Transaction Date"
                      name="transactionDate"
                      rules={[{ required: paymentMode === 'online', message: 'Transaction date required' }]}
                    >
                      <DatePicker 
                        format="DD-MM-YYYY" 
                        style={{ width: '100%' }} 
                        placeholder="Select date"
                      />
                    </Form.Item>
                  </Col>
                </Row>
              )}
            </>
          )}
        </>
      )}
      
      {/* No Program Alert */}
      {joinFeesDone && programDetails.length === 0 && (
        <Alert
          message="No programs selected or calculated"
          description="Please select programs and ensure Date of Birth is entered to calculate program details"
          type="warning"
          showIcon
        />
      )}
      
   
    </Card>
  )
}

export default FeesForm