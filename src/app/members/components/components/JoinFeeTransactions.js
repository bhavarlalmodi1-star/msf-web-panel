// components/JoinFeeTransactions.jsx
import React, { useState, useEffect } from 'react'
import { Card, Table, Tag, Typography, Space, Button, Modal, Form, Input, DatePicker, message } from 'antd'
import { EditOutlined } from '@ant-design/icons'
import { collection, query, where, getDocs, addDoc, serverTimestamp, updateDoc, doc } from 'firebase/firestore'
import dayjs from 'dayjs'
import { db } from '../../../../../lib/firbase-client'
import { formatPaymentDate, parseAnyDate } from '@/utils/formatDate'

const { Text } = Typography

const JoinFeeTransactions = ({ memberId, memberName, registrationNumber }) => {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [form] = Form.useForm()

  // ── Correct a wrongly-entered payment date ─────────────────────────────────
  const [dateEditId, setDateEditId] = useState(null)
  const [dateSaving, setDateSaving] = useState(false)
  const [dateForm] = Form.useForm()

  const openDateEdit = (record) => {
    setDateEditId(record.id)
    dateForm.setFieldsValue({
      transactionDate:
        parseAnyDate(record.transactionDate || record.paymentDate || record.date) || dayjs(),
    })
  }

  const saveDateEdit = async () => {
    try {
      const values = await dateForm.validateFields()
      setDateSaving(true)
      await updateDoc(doc(db, 'memberJoinFees', dateEditId), {
        transactionDate: values.transactionDate.format('YYYY-MM-DD'),
        dateCorrectedAt: serverTimestamp(),
      })
      message.success('Payment date updated')
      setDateEditId(null)
      dateForm.resetFields()
      fetchTransactions()
    } catch (err) {
      if (err?.errorFields) return
      console.error('Failed to update payment date:', err)
      message.error('Could not update the payment date')
    } finally {
      setDateSaving(false)
    }
  }

  useEffect(() => {
    if (memberId) {
      fetchTransactions()
    }
  }, [memberId])

  const fetchTransactions = async () => {
    setLoading(true)
    try {
      const q = query(
        collection(db, 'memberJoinFees'),
        where('memberId', '==', memberId)
      )
      const snapshot = await getDocs(q)
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().createdAt?.toDate?.() || new Date()
      }))
      setTransactions(data.sort((a, b) => b.date - a.date))
    } catch (error) {
      console.error('Error fetching transactions:', error)
      message.error('Failed to load transaction history')
    } finally {
      setLoading(false)
    }
  }

  const addTransaction = async (values) => {
    try {
      const keyword = [memberName, registrationNumber]
        .filter(Boolean).join(' ').toLowerCase();

      await addDoc(collection(db, 'memberJoinFees'), {
        memberId,
        memberName,
        registrationNumber,
        transactionType: 'join_fee_additional',
        amount: parseFloat(values.amount),
        paymentMode: values.paymentMode,
        transactionId: values.transactionId,
        // 'YYYY-MM-DD' to match what join-fees-add / closed_payment_update
        // write. This used to store 'DD-MM-YYYY', so the same field held two
        // different shapes depending on which screen recorded the payment.
        transactionDate: values.transactionDate.format('YYYY-MM-DD'),
        notes: values.notes,
        status: 'completed',
        verified: true,
        createdBy: 'admin',
        createdAt: serverTimestamp(),
        search_keyword: keyword,
      })

      message.success('Transaction recorded successfully')
      setShowAddModal(false)
      form.resetFields()
      fetchTransactions()
    } catch (error) {
      console.error('Error adding transaction:', error)
      message.error('Failed to record transaction')
    }
  }

  const columns = [
    {
      // dayjs('28-12-2026') with no format hint is Invalid Date — and this
      // component writes transactionDate in exactly that shape, while the
      // payment APIs write 'YYYY-MM-DD'. formatPaymentDate parses both.
      title: 'Payment Date',
      dataIndex: 'transactionDate',
      key: 'date',
      render: (date, r) => (
        <div>
          <div>{formatPaymentDate(date, r?.paymentDate, r?.date)}</div>
          {/* Lets a mistyped date be corrected without reverting the payment.
              Date only — the amount drives the rollups and isn't touched. */}
          <Button
            type="link" size="small" icon={<EditOutlined />}
            onClick={() => openDateEdit(r)}
            style={{ padding: 0, height: 18, fontSize: 11 }}
          >
            Edit
          </Button>
        </div>
      ),
      width: 130,
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount) => <Text strong type="success">₹{amount}</Text>,
      width: 100,
    },
    {
      title: 'Mode',
      dataIndex: 'paymentMode',
      key: 'paymentMode',
      render: (mode) => (
        <Tag color={mode === 'cash' ? 'green' : mode === 'online' ? 'blue' : 'orange'}>
          {mode?.toUpperCase()}
        </Tag>
      ),
      width: 80,
    },
    {
      title: 'Transaction ID',
      dataIndex: 'transactionId',
      key: 'transactionId',
      width: 150,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'completed' ? 'green' : 'orange'}>
          {status?.toUpperCase()}
        </Tag>
      ),
      width: 100,
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      key: 'notes',
      ellipsis: true,
    },
  ]

  return (
    <Card 
      title="Join Fee Transaction History"
      extra={
        <Button 
          type="primary" 
          size="small"
          onClick={() => setShowAddModal(true)}
        >
          Add Payment
        </Button>
      }
    >
      <Table
        columns={columns}
        dataSource={transactions}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 5 }}
        size="small"
        summary={() => {
          const total = transactions.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0)
          return (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}>
                <Text strong>Total Paid:</Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1}>
                <Text strong type="success">₹{total}</Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={2} colSpan={4}>
                <Text type="secondary">
                  {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
                </Text>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          )
        }}
      />

      {/* Add Transaction Modal */}
      <Modal
        title="Record Additional Payment"
        open={showAddModal}
        onCancel={() => {
          setShowAddModal(false)
          form.resetFields()
        }}
        onOk={() => form.submit()}
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={addTransaction}
        >
          <Form.Item
            label="Amount"
            name="amount"
            rules={[
              { required: true, message: 'Please enter amount' },
              { type: 'number', min: 1, message: 'Amount must be positive' }
            ]}
          >
            <Input 
              type="number" 
              prefix="₹" 
              placeholder="Enter payment amount"
            />
          </Form.Item>
          
          <Form.Item
            label="Payment Mode"
            name="paymentMode"
            rules={[{ required: true, message: 'Please select payment mode' }]}
          >
            <Input placeholder="cash, online, cheque, etc." />
          </Form.Item>
          
          <Form.Item
            label="Transaction ID"
            name="transactionId"
          >
            <Input placeholder="Enter transaction/UTR number" />
          </Form.Item>
          
          <Form.Item
            label="Transaction Date"
            name="transactionDate"
            rules={[{ required: true, message: 'Please select date' }]}
          >
            <DatePicker 
              format="DD-MM-YYYY" 
              style={{ width: '100%' }}
            />
          </Form.Item>
          
          <Form.Item
            label="Notes"
            name="notes"
          >
            <Input.TextArea rows={2} placeholder="Additional notes about this payment" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Correct payment date — date only, amount untouched */}
      <Modal
        title="Correct Payment Date"
        open={!!dateEditId}
        onCancel={() => { setDateEditId(null); dateForm.resetFields() }}
        onOk={saveDateEdit}
        okText="Save Date"
        confirmLoading={dateSaving}
        width={400}
        destroyOnClose
      >
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
          Only the payment date changes. The amount and payment mode are not affected.
        </div>
        <Form form={dateForm} layout="vertical">
          <Form.Item
            name="transactionDate"
            label="Payment Date"
            rules={[{ required: true, message: 'Please pick the correct date' }]}
          >
            <DatePicker
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
              disabledDate={d => d && d > dayjs()}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}

export default JoinFeeTransactions