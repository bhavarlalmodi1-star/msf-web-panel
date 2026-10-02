"use client"
import React, { useState, useEffect } from 'react'
import { Drawer, Card, Tag, Table, Badge, Button, Spin, Empty, Divider, Popconfirm, message, Tooltip } from 'antd'
import {
  DollarOutlined, MoneyCollectOutlined, WalletOutlined,
  CheckCircleOutlined, FilePdfOutlined,
  CreditCardOutlined, BarcodeOutlined, DeleteOutlined, WarningOutlined
} from '@ant-design/icons'
import { PDFDownloadLink } from '@react-pdf/renderer'
import { collection, query, where, getDocs, getDoc, doc, orderBy } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import dayjs from 'dayjs'
import { db } from '../../../../lib/firbase-client'
import PaymentDetailsPdf from './MemberPdf/PaymentDetailsPdf'
import { useAuth } from '@/components/Base/AuthProvider'

const PaymentDetailsDrawer = ({ member, visible, onClose, onDeleteSuccess }) => {
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'superadmin'

  const [transactions, setTransactions] = useState([])
  const [closingTransactions, setClosingTransactions] = useState([])
  const [closingEntries, setClosingEntries] = useState([])
  const [loading, setLoading] = useState({ txn: false, closing: false, entries: false })

  // Local copy of member stats — updated immediately on delete so summary cards reflect reality
  const [stats, setStats] = useState({
    joinFees: 0, paidAmount: 0, pendingAmount: 0, paymentPercentage: 0,
    closing_totalAmount: 0, closing_paidAmount: 0, closing_pendingAmount: 0,
    closing_paymentPercentage: 0, paidClosingCount: 0, totalClosingCount: 0,
  })

  // Reset local stats whenever the member prop changes (drawer opened for new member)
  useEffect(() => {
    if (member) {
      setStats({
        joinFees:                   member.joinFees || 0,
        paidAmount:                 member.paidAmount || 0,
        pendingAmount:              member.pendingAmount || 0,
        paymentPercentage:          member.paymentPercentage || 0,
        closing_totalAmount:        member.closing_totalAmount || 0,
        closing_paidAmount:         member.closing_paidAmount || 0,
        closing_pendingAmount:      member.closing_pendingAmount || 0,
        closing_paymentPercentage:  member.closing_paymentPercentage || 0,
        paidClosingCount:           member.paidClosingCount || 0,
        totalClosingCount:          member.totalClosingCount || 0,
      })
    }
  }, [member])

  useEffect(() => {
    if (member && visible) {
      fetchTransactions()
      fetchClosingTransactions()
      fetchClosingEntries()
    }
  }, [member, visible])

  const fetchTransactions = async () => {
    if (!member?.id) return
    setLoading(p => ({ ...p, txn: true }))
    try {
      const q = query(collection(db, 'memberJoinFees'), where('memberId', '==', member.id), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      const data = snap.docs.map(d => ({ id: d.id, ...d.data(), date: d.data().createdAt?.toDate?.() || new Date() }))
      if (data.length === 0 && member.joinFeesDone) {
        data.push({
          id: 'initial-join-fee',
          transactionType: 'join_fee',
          amount: member.paidAmount || 0,
          paymentMode: member.paymentMode,
          transactionId: member.joinFeesTxtId || '',
          transactionDate: member.transactionDate || member.dateJoin,
          status: 'completed',
          verified: true,
          notes: 'Initial join fee payment',
          date: member.createdAt?.toDate?.() || new Date()
        })
      }
      setTransactions(data)
    } catch (err) { console.error(err) }
    finally { setLoading(p => ({ ...p, txn: false })) }
  }

  const fetchClosingTransactions = async () => {
    if (!member?.id) return
    setLoading(p => ({ ...p, closing: true }))
    try {
      const q = query(collection(db, 'memberClosingFees'), where('memberId', '==', member.id), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      setClosingTransactions(snap.docs.map(d => ({ id: d.id, ...d.data(), date: d.data().createdAt?.toDate?.() || new Date() })))
    } catch (err) { console.error(err) }
    finally { setLoading(p => ({ ...p, closing: false })) }
  }

  const fetchClosingEntries = async () => {
    if (!member?.id) return
    setLoading(p => ({ ...p, entries: true }))
    try {
      const q = query(collection(db, 'closing_payment'), where('memberId', '==', member.id), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      const data = snap.docs.map(d => ({ id: d.id, ...d.data(), date: d.data().createdAt?.toDate?.() || new Date() }))
      const missing = data.filter(e => !e.closingGroupName && e.closingGroupId)
      if (missing.length > 0) {
        const uniqueIds = [...new Set(missing.map(e => e.closingGroupId))]
        const nameMap = {}
        await Promise.all(uniqueIds.map(async (gid) => {
          try { const gs = await getDoc(doc(db, 'groupClosings', gid)); if (gs.exists()) nameMap[gid] = gs.data().groupName } catch (_) {}
        }))
        data.forEach(e => { if (!e.closingGroupName && e.closingGroupId && nameMap[e.closingGroupId]) e.closingGroupName = nameMap[e.closingGroupId] })
      }
      setClosingEntries(data)
    } catch (err) { console.error(err) }
    finally { setLoading(p => ({ ...p, entries: false })) }
  }

  const getToken = async () => {
    const auth = getAuth()
    return auth.currentUser?.getIdToken()
  }

  const handleDeleteJoinFee = async (record) => {
    if (record.id === 'initial-join-fee') {
      message.warning('Cannot delete legacy join fee record')
      return
    }
    try {
      const token = await getToken()
      const res = await fetch('/api/join-fees-revert-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ feeDocId: record.id }),
      })
      const data = await res.json()
      if (data.success) {
        message.success('Join fee transaction reverted')
        // Remove from transaction list
        setTransactions(prev => prev.filter(t => t.id !== record.id))
        // Update summary cards immediately
        const amt = Number(record.amount || 0)
        setStats(prev => {
          const newPaid    = Math.max(0, prev.paidAmount - amt)
          const newPending = prev.pendingAmount + amt
          const total      = prev.joinFees || 0
          const newPct     = total > 0 ? Math.min((newPaid / total) * 100, 100) : 0
          return { ...prev, paidAmount: newPaid, pendingAmount: newPending, paymentPercentage: Math.round(newPct * 100) / 100 }
        })
        if (onDeleteSuccess) onDeleteSuccess('joinFee', record)
      } else {
        message.error(data.message || 'Failed to revert transaction')
      }
    } catch {
      message.error('Network error while reverting')
    }
  }

  const handleDeleteClosingFee = async (record) => {
    try {
      const token = await getToken()
      const res = await fetch('/api/closing-fees-revert-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ feeDocId: record.id }),
      })
      const data = await res.json()
      if (data.success) {
        message.success('Closing fee transaction reverted')
        // Remove from transaction list
        setClosingTransactions(prev => prev.filter(t => t.id !== record.id))
        // Update summary cards immediately
        const amt = Number(record.amount || record.amountPaid || 0)
        setStats(prev => {
          const newPaid    = Math.max(0, prev.closing_paidAmount - amt)
          const newPending = prev.closing_pendingAmount + amt
          const total      = prev.closing_totalAmount || 0
          const newPct     = total > 0 ? Math.min((newPaid / total) * 100, 100) : 0
          return {
            ...prev,
            closing_paidAmount:        newPaid,
            closing_pendingAmount:     newPending,
            closing_paymentPercentage: Math.round(newPct * 100) / 100,
            paidClosingCount:          Math.max(0, prev.paidClosingCount - 1),
          }
        })
        if (onDeleteSuccess) onDeleteSuccess('closingFee', record)
      } else {
        message.error(data.message || 'Failed to revert transaction')
      }
    } catch {
      message.error('Network error while reverting')
    }
  }

  const joinFeeTotal = transactions.reduce((s, t) => s + (t.amount || 0), 0)
  const closingTotal = closingTransactions.reduce((s, t) => s + (t.amount || t.amountPaid || 0), 0)

  const txnColumns = [
    {
      title: 'Transaction', key: 'txn', width: 180,
      render: (_, r) => (
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${r.transactionType === 'join_fee' ? 'bg-blue-50' : 'bg-green-50'}`}>
            {r.transactionType === 'join_fee'
              ? <CheckCircleOutlined className="text-blue-600" style={{fontSize:12}} />
              : <CreditCardOutlined className="text-green-600" style={{fontSize:12}} />}
          </div>
          <div>
            <div className="text-xs font-medium">
              {r.transactionType === 'join_fee' ? 'Join Fee' : r.transactionType === 'join_fee_approval' ? 'Approval' : 'Additional'}
            </div>
            <div className="text-[10px] text-gray-400">{dayjs(r.date).format('DD MMM YY, hh:mm A')}</div>
          </div>
        </div>
      ),
    },
    { title: 'Amount', key: 'amt', width: 80, render: (_, r) => <span className="font-semibold text-green-600">₹{r.amount?.toLocaleString()}</span> },
    { title: 'Mode', key: 'mode', width: 60, render: (_, r) => <Tag color={{ cash: 'green', online: 'blue' }[r.paymentMode] || 'default'} style={{fontSize:9}}>{r.paymentMode}</Tag> },
    { title: 'Status', key: 'status', width: 70, render: (_, r) => <Badge status={r.status === 'completed' ? 'success' : 'processing'} text={<span className="text-xs">{r.status}</span>} /> },
    { title: 'Txn ID', key: 'txnId', width: 90, render: (_, r) => <Tag style={{fontSize:9, fontFamily:'monospace'}}>{r.transactionId || '—'}</Tag> },
    ...(isSuperAdmin ? [{
      title: '', key: 'action', width: 40,
      render: (_, r) => (
        <Popconfirm
          title="Revert this join fee?"
          description={<span>₹{r.amount?.toLocaleString()} will be <strong>reversed</strong>. This cannot be undone.</span>}
          icon={<WarningOutlined style={{color:'red'}} />}
          onConfirm={() => handleDeleteJoinFee(r)}
          okText="Yes, Revert" okButtonProps={{ danger: true }}
          cancelText="Cancel"
        >
          <Tooltip title="Revert transaction">
            <Button danger icon={<DeleteOutlined />} size="small" type="text" />
          </Tooltip>
        </Popconfirm>
      ),
    }] : []),
  ]

  const closingTxnColumns = [
    { title: 'Date', key: 'date', width: 110, render: (_, r) => <span className="text-xs">{dayjs(r.date).format('DD MMM YY, hh:mm A')}</span> },
    { title: 'Amount', key: 'amt', width: 80, render: (_, r) => <span className="font-semibold text-purple-600">₹{(r.amount || r.amountPaid || 0).toLocaleString()}</span> },
    { title: 'Mode', key: 'mode', width: 60, render: (_, r) => <Tag color={{ cash: 'green', online: 'blue' }[r.paymentMode] || 'default'} style={{fontSize:9}}>{r.paymentMode}</Tag> },
    { title: 'Note', key: 'note', render: (_, r) => <span className="text-[10px] text-gray-500">{r.paymentNote || '—'}</span> },
    ...(isSuperAdmin ? [{
      title: '', key: 'action', width: 40,
      render: (_, r) => (
        <Popconfirm
          title="Revert this closing payment?"
          description={<span>₹{(r.amount || r.amountPaid || 0).toLocaleString()} will be <strong>reversed</strong>. This cannot be undone.</span>}
          icon={<WarningOutlined style={{color:'red'}} />}
          onConfirm={() => handleDeleteClosingFee(r)}
          okText="Yes, Revert" okButtonProps={{ danger: true }}
          cancelText="Cancel"
        >
          <Tooltip title="Revert transaction">
            <Button danger icon={<DeleteOutlined />} size="small" type="text" />
          </Tooltip>
        </Popconfirm>
      ),
    }] : []),
  ]

  return (
    <Drawer
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <WalletOutlined style={{ color: '#fff', fontSize: 16 }} />
          </div>
          <div>
            <div className="font-bold text-base">{member?.displayName} {member?.fatherName}</div>
            <div className="text-xs text-gray-400 flex items-center gap-2">
              <BarcodeOutlined /> {member?.registrationNumber}
            </div>
          </div>
        </div>
      }
      placement="right"
      onClose={onClose}
      open={visible}
      width={700}
      destroyOnClose
      extra={
        <PDFDownloadLink
          document={<PaymentDetailsPdf member={member} transactions={transactions} closingTransactions={closingTransactions} closingEntries={closingEntries} />}
          fileName={`${member?.registrationNumber || 'member'}_payment_details.pdf`}
        >
          {({ loading: l }) => (
            <Button icon={<FilePdfOutlined />} size="small" loading={l}
              style={{ background: '#D3292F', borderColor: '#D3292F', color: '#fff' }}>
              PDF
            </Button>
          )}
        </PDFDownloadLink>
      }
    >
      <div className="space-y-4">
        {/* ── Join Fee Summary — uses local stats so updates immediately on delete ── */}
        <Card size="small" title={<span className="text-sm"><DollarOutlined className="mr-1 text-blue-600" />Join Fee Summary</span>}>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Total Fees', value: stats.joinFees,    color: '#1890ff' },
              { label: 'Paid',       value: stats.paidAmount,  color: '#52c41a' },
              { label: 'Pending',    value: stats.pendingAmount, color: stats.pendingAmount > 0 ? '#ff4d4f' : '#52c41a' },
            ].map((s, i) => (
              <div key={i} className="text-center bg-gray-50 rounded-lg p-2">
                <div className="text-lg font-bold" style={{ color: s.color }}>₹{s.value.toLocaleString()}</div>
                <div className="text-[10px] text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="text-center mt-2">
            <Tag
              color={stats.paymentPercentage >= 100 ? 'green' : stats.paymentPercentage > 0 ? 'orange' : 'red'}
              style={{fontSize:10}}
            >
              {stats.paymentPercentage || 0}% Paid
            </Tag>
          </div>
        </Card>

        {/* ── Closing Summary — uses local stats ── */}
        {stats.closing_totalAmount > 0 && (
          <Card size="small" title={<span className="text-sm"><MoneyCollectOutlined className="mr-1 text-purple-600" />Closing Summary</span>}>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Total',   value: stats.closing_totalAmount,   color: '#722ed1' },
                { label: 'Paid',    value: stats.closing_paidAmount,    color: '#52c41a' },
                { label: 'Pending', value: stats.closing_pendingAmount, color: stats.closing_pendingAmount > 0 ? '#ff4d4f' : '#52c41a' },
                { label: 'Events',  value: `${stats.paidClosingCount}/${stats.totalClosingCount}`, color: '#1890ff' },
              ].map((s, i) => (
                <div key={i} className="text-center bg-gray-50 rounded-lg p-2">
                  <div className="text-lg font-bold" style={{ color: s.color }}>
                    {s.label === 'Events' ? s.value : `₹${s.value.toLocaleString()}`}
                  </div>
                  <div className="text-[10px] text-gray-500">{s.label}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Closing Entries ── */}
        {closingEntries.length > 0 && (
          <Card size="small" title={<span className="text-sm"><MoneyCollectOutlined className="mr-1 text-purple-600" />Closing Entries</span>}>
            <Spin spinning={loading.entries}>
              <div className="space-y-2">
                {closingEntries.map(entry => {
                  const totalAmt = entry.totalAmount || 0
                  const paidAmt  = entry.paidAmount || 0
                  const isPaid   = entry.status === 'paid'
                  const isPartial = entry.status === 'partial'
                  const displayStatus = isPaid ? 'PAID' : isPartial ? 'PARTIAL' : 'PENDING'
                  const statusColor   = isPaid ? '#52c41a' : isPartial ? '#faad14' : '#ff4d4f'
                  return (
                    <div key={entry.id} className="border rounded-lg p-3 bg-gray-50/50">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Tag color={isPaid ? 'green' : isPartial ? 'orange' : 'red'} style={{fontSize:9, margin:0}}>
                            {displayStatus}
                          </Tag>
                          <span className="font-semibold text-sm" style={{color: statusColor}}>
                            ₹{totalAmt.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-gray-400">({entry.closingCount || 0} members)</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {(entry.closingGroupName || entry.closingGroupId) && (
                            <Tag color="purple" style={{fontSize:9, margin:0}}>
                              {entry.closingGroupName || entry.closingGroupId.slice(-6)}
                            </Tag>
                          )}
                          <span className="text-[10px] text-gray-400">
                            {isPaid ? 'Paid' : isPartial ? `₹${paidAmt.toLocaleString()}/${totalAmt.toLocaleString()}` : 'Pending'}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {entry.closingDetails?.map((d, i) => (
                          <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded bg-white border text-xs">
                            <span className="text-gray-400 w-4 shrink-0">{i + 1}.</span>
                            <span className="font-medium min-w-[120px]">{d.closed_memberName}</span>
                            <span className="text-gray-400 hidden sm:inline text-[10px]">{d.closed_fatherName ? `• ${d.closed_fatherName}` : ''}</span>
                            <span className="text-[10px] text-gray-500 ml-auto flex items-center gap-1">
                              <span className="text-gray-400">Reg:</span>
                              <span className="font-mono font-medium">{d.closed_registrationNumber || entry.closing_registrationNumber || entry.registrationNumber || '—'}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Spin>
          </Card>
        )}

        <Divider style={{margin: '8px 0'}} />

        {/* ── Join Fee Transactions ── */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold"><DollarOutlined className="mr-1 text-blue-600" />Join Fee Transactions</span>
            <span className="text-xs text-gray-400">{transactions.length} records · ₹{joinFeeTotal.toLocaleString()}</span>
          </div>
          <Spin spinning={loading.txn}>
            {transactions.length > 0
              ? <Table columns={txnColumns} dataSource={transactions} rowKey="id" size="small" pagination={false} />
              : <Empty description="No join fee transactions" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            }
          </Spin>
        </div>

        {/* ── Closing Transactions ── */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold"><MoneyCollectOutlined className="mr-1 text-purple-600" />Closing Transactions</span>
            <span className="text-xs text-gray-400">{closingTransactions.length} records · ₹{closingTotal.toLocaleString()}</span>
          </div>
          <Spin spinning={loading.closing}>
            {closingTransactions.length > 0
              ? <Table columns={closingTxnColumns} dataSource={closingTransactions} rowKey="id" size="small" pagination={false} />
              : <Empty description="No closing transactions" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            }
          </Spin>
        </div>
      </div>
    </Drawer>
  )
}

export default PaymentDetailsDrawer
