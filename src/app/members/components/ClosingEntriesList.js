"use client"
import React, { useState } from 'react'
import { Card, Tag, Button, Space, Spin, Table, Text, Progress, Empty, Alert, message } from 'antd'
import {
  MoneyCollectOutlined, FilePdfOutlined, HistoryOutlined,
  CalendarOutlined, ClockCircleOutlined, CheckCircleOutlined
} from '@ant-design/icons'
import { PDFDownloadLink } from '@react-pdf/renderer'
import dayjs from 'dayjs'
import ClosingRasidPdf from './ClosingRasidPdf'
import ClosingEntryCard from './ClosingEntryCard'
import { memberLateness, LATE_LABEL, GRACE_DAYS } from './closingLateness'

const fmtDate = (d) => {
  if (!d) return '—'
  const parsed = dayjs(d)
  return parsed.isValid() ? parsed.format('DD/MM/YY') : d
}

const ClosingEntriesList = ({
  member,
  closingEntries,
  closingTransactions,
  loading,
  buildPdfData,
}) => {
  const [closingFilter, setClosingFilter] = useState('all')

  const pendingCount = closingEntries.filter(e => e.status !== 'paid').length
  const paidCount = closingEntries.filter(e => e.status === 'paid').length

  const filteredEntries = closingEntries.filter(e => {
    if (closingFilter === 'paid') return e.status === 'paid'
    if (closingFilter === 'pending') return e.status !== 'paid'
    return true
  })

  const hasClosing = (member?.closing_totalAmount || 0) > 0

  // ── Reconciliation ────────────────────────────────────────────────────────
  // The summary cards above show the member's stored rollup; the group cards
  // below are the closing_payment docs those figures are supposed to be a
  // rollup OF. When they disagree — the "table says one thing, details says
  // another" complaint — show both numbers rather than leaving two different
  // totals on screen with no explanation.
  const docTotals = closingEntries.reduce((a, e) => {
    a.total += Number(e.totalAmount   || 0)
    a.paid  += Number(e.paidAmount    || 0)
    a.count += Number(e.closingCount  || 0)
    return a
  }, { total: 0, paid: 0, count: 0 })
  docTotals.pending = Math.max(0, docTotals.total - docTotals.paid)

  const stored = {
    total:   Number(member?.closing_totalAmount   || 0),
    paid:    Number(member?.closing_paidAmount    || 0),
    pending: Number(member?.closing_pendingAmount || 0),
    count:   Number(member?.totalClosingCount     || 0),
  }

  const mismatches = !loading.entries && closingEntries.length > 0
    ? [
        ['Total',   stored.total,   docTotals.total],
        ['Paid',    stored.paid,    docTotals.paid],
        ['Pending', stored.pending, docTotals.pending],
        ['Events',  stored.count,   docTotals.count],
      ].filter(([, s, d]) => s !== d)
    : []

  // ── 45-day rule ────────────────────────────────────────────────────────────
  // Each closing instalment is due GRACE_DAYS after that closing's own date.
  const late = React.useMemo(
    () => memberLateness(closingEntries || []),
    [closingEntries]
  )

  const [rechecking, setRechecking] = useState(false)

  const recheck = async () => {
    setRechecking(true)
    try {
      const { getAuth } = await import('firebase/auth')
      const token = await getAuth().currentUser?.getIdToken()
      const res = await fetch('/api/closing/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ memberId: member.id, dryRun: false, removeInvalidEvents: false }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message)
      if (data.fixed > 0) {
        message.success('Figures recalculated — reopen the member to see the updated totals')
      } else {
        message.info('Nothing to change — the stored figures already match the groups')
      }
    } catch (e) {
      message.error('Recheck failed: ' + e.message)
    } finally {
      setRechecking(false)
    }
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Summary cards — only here, not duplicated in header */}
      {hasClosing && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { title: 'Total Closing', value: member.closing_totalAmount || 0, color: '#722ed1', prefix: '₹' },
            { title: 'Paid', value: member.closing_paidAmount || 0, color: '#52c41a', prefix: '₹' },
            { title: 'Pending', value: member.closing_pendingAmount || 0, color: (member.closing_pendingAmount || 0) > 0 ? '#ff4d4f' : '#52c41a', prefix: '₹' },
            // "Events" = individual closings charged for. The All/Pending/Paid
            // buttons below count GROUPS, which is a different number — one
            // group usually covers several events. Both used to be described as
            // "closing", so a member could look like they had 2 in one place and
            // 3 in another. If the numbers still disagree after accounting for
            // that, the rollup has drifted: Settings → Closing System Check.
            { title: 'Events charged', value: `${member.paidClosingCount || 0} paid / ${member.totalClosingCount || 0} total`, color: '#1890ff', prefix: '' },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-lg border p-3 text-center">
              <div className="text-2xs text-gray-500">{s.title}</div>
              <div className="text-lg font-bold" style={{ color: s.color }}>
                {s.prefix}{typeof s.value === 'number' ? s.value.toLocaleString() : s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stored rollup vs the groups it summarises */}
      {mismatches.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ borderRadius: 8 }}
          message={<span style={{ fontSize: 12 }}>
            These summary figures don't match the {closingEntries.length} closing group(s) listed below.
          </span>}
          description={
            <div style={{ fontSize: 11 }}>
              {mismatches.map(([label, s, d]) => (
                <div key={label}>
                  {label}: summary says <b>{label === 'Events' ? s : `₹${s.toLocaleString()}`}</b>,
                  groups add up to <b>{label === 'Events' ? d : `₹${d.toLocaleString()}`}</b>
                  {' '}<span style={{ color: '#dc2626' }}>
                    ({s > d ? '+' : ''}{label === 'Events' ? s - d : `₹${(s - d).toLocaleString()}`})
                  </span>
                </div>
              ))}
              <div style={{ marginTop: 6, color: '#6b7280' }}>
                The groups below are the source of truth. The members table shows the summary
                figure, which is why the two screens differ.
              </div>
              <Button
                size="small" type="primary" loading={rechecking} onClick={recheck}
                style={{ marginTop: 6 }}
              >
                Recalculate this member
              </Button>
            </div>
          }
        />
      )}

      {/* 45-day payment discipline */}
      {late.total > 0 && (
        <Card size="small" style={{ borderRadius: 8 }}
          title={<span style={{ fontSize: 12 }}>
            <ClockCircleOutlined style={{ marginRight: 6 }} />
            भुगतान समय — प्रत्येक क्लोजिंग की तारीख से {GRACE_DAYS} दिन के अंदर
          </span>}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { t: 'समय पर',        v: late.paidOnTime, c: '#52c41a' },
              { t: 'देर से भुगतान',  v: late.paidLate,   c: '#faad14' },
              { t: 'अतिदेय (बकाया)', v: late.overdue,    c: '#ff4d4f' },
              { t: 'समय बाकी',      v: late.pendingDue, c: '#1890ff' },
            ].map((x, i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-2 text-center">
                <div className="text-lg font-bold" style={{ color: x.c }}>{x.v}</div>
                <div className="text-2xs text-gray-500">{x.t}</div>
              </div>
            ))}
          </div>

          <div className="mt-2 text-xs text-gray-600 space-y-1">
            {late.paidLate > 0 && (
              <div>
                देर से चुकाई गई किस्तों में अधिकतम <b style={{ color: '#faad14' }}>{late.maxDaysLate} दिन</b> की देरी
                {late.avgDaysLate > 0 && <> · औसत <b>{late.avgDaysLate} दिन</b></>}
              </div>
            )}
            {late.overdue > 0 && (
              <div style={{ color: '#ff4d4f' }}>
                <b>{late.overdue}</b> किस्त अभी बकाया — सबसे पुरानी <b>{late.maxOverdueDays} दिन</b> से अतिदेय
              </div>
            )}
            {late.overdue === 0 && late.nextDueDate && (
              <div>अगली अंतिम तिथि : <b>{late.nextDueDate.format('DD-MM-YYYY')}</b></div>
            )}
            {late.unknown > 0 && (
              <div style={{ color: '#9ca3af' }}>
                {late.unknown} क्लोजिंग की तारीख उपलब्ध नहीं — उनकी देरी नहीं गिनी गई
              </div>
            )}
          </div>

          {late.hasApproximate && (
            <Alert
              type="info" showIcon style={{ marginTop: 8, borderRadius: 6 }}
              message={<span style={{ fontSize: 10 }}>
                कुछ ग्रुप आंशिक रूप से चुकाए गए हैं। भुगतान ग्रुप स्तर पर दर्ज होता है, किस्त-वार नहीं —
                इसलिए किस किस्त का भुगतान हुआ यह राशि के आधार पर (पुरानी पहले) अनुमानित है।
              </span>}
            />
          )}
        </Card>
      )}

      {/* Filter + PDF bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-gray-50 rounded-lg border">
        <Space>
          <Button size="small" type={closingFilter === 'all' ? 'primary' : 'default'}
            onClick={() => setClosingFilter('all')}
            style={closingFilter === 'all' ? { background: '#1B385A', borderColor: '#1B385A' } : {}}>
            All groups <span className="ml-1 opacity-70">({closingEntries.length})</span>
          </Button>
          <Button size="small" type={closingFilter === 'pending' ? 'primary' : 'default'}
            danger={closingFilter === 'pending'} onClick={() => setClosingFilter('pending')}
            style={closingFilter === 'pending' ? { fontWeight: 600 } : {}}>
            Pending <span className="ml-1 opacity-70">({pendingCount})</span>
          </Button>
          <Button size="small" type={closingFilter === 'paid' ? 'primary' : 'default'}
            onClick={() => setClosingFilter('paid')}
            style={closingFilter === 'paid' ? { background: '#52c41a', borderColor: '#52c41a' } : {}}>
            Paid <span className="ml-1 opacity-70">({paidCount})</span>
          </Button>
        </Space>
        {closingEntries.length > 0 && (
          <Space size={4}>
            {pendingCount > 0 && (
              <PDFDownloadLink document={<ClosingRasidPdf entries={buildPdfData(closingEntries.filter(e => e.status !== 'paid'))} />}
                fileName={`closing_pending_${member?.registrationNumber || member?.id}.pdf`}>
                {({ loading: l }) => <Button size="small" icon={<FilePdfOutlined />} loading={l}
                  style={{ background: '#ff4d4f', borderColor: '#ff4d4f', color: '#fff', borderRadius: 6, fontWeight: 500 }}>
                  Pending PDF</Button>}
              </PDFDownloadLink>
            )}
            {paidCount > 0 && (
              <PDFDownloadLink document={<ClosingRasidPdf entries={buildPdfData(closingEntries.filter(e => e.status === 'paid'))} />}
                fileName={`closing_paid_${member?.registrationNumber || member?.id}.pdf`}>
                {({ loading: l }) => <Button size="small" icon={<FilePdfOutlined />} loading={l}
                  style={{ background: '#52c41a', borderColor: '#52c41a', color: '#fff', borderRadius: 6, fontWeight: 500 }}>
                  Paid PDF</Button>}
              </PDFDownloadLink>
            )}
            <PDFDownloadLink document={<ClosingRasidPdf entries={buildPdfData(closingEntries)} />}
              fileName={`closing_all_${member?.registrationNumber || member?.id}.pdf`}>
              {({ loading: l }) => <Button size="small" icon={<FilePdfOutlined />} loading={l}
                style={{ background: '#722ed1', borderColor: '#722ed1', color: '#fff', borderRadius: 6, fontWeight: 500 }}>
                All PDF</Button>}
            </PDFDownloadLink>
          </Space>
        )}
      </div>

      {/* Closing entries */}
      <Spin spinning={loading.entries}>
        {filteredEntries.length > 0 ? (
          <div className="space-y-2">
            {filteredEntries.map(entry => (
              <ClosingEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        ) : (
          <div className="text-center py-10 text-gray-400">
            <MoneyCollectOutlined style={{ fontSize: 40, display: 'block', marginBottom: 8, opacity: 0.3 }} />
            {closingFilter === 'pending' ? 'No pending closing entries'
              : closingFilter === 'paid' ? 'No paid closing entries'
              : 'No closing entries found'}
          </div>
        )}
      </Spin>

      {/* Payment history table */}
      {closingTransactions.length > 0 && (
        <Card size="small" title={<span className="text-sm"><HistoryOutlined className="mr-1" />Payment History</span>}>
          <Table
            columns={[
              { title: 'Date', key: 'date', width: 120,
                render: (_, r) => <span className="text-sm">{dayjs(r.date).format('DD MMM YYYY, hh:mm A')}</span> },
              { title: 'Closing Group', key: 'cg', width: 100,
                render: (_, r) => r.closingGroupName
                  ? <Tag color="purple" style={{ fontSize: 9 }}>{r.closingGroupName}</Tag>
                  : r.closingGroupId ? <Tag style={{ fontSize: 9 }}>{r.closingGroupId.slice(-8)}</Tag> : '—' },
              { title: 'Amount', key: 'amt', width: 100,
                render: (_, r) => <span className="font-semibold text-purple-600">₹{(r.amount || r.amountPaid || 0).toLocaleString()}</span> },
              { title: 'Mode', key: 'mode', width: 70,
                render: (_, r) => <Tag color={{ cash: 'green', online: 'blue' }[r.paymentMode] || 'default'} style={{ fontSize: 9 }}>{r.paymentMode}</Tag> },
              { title: 'Txn ID', key: 'txnId', width: 110,
                render: (_, r) => <Tag style={{ fontSize: 9, fontFamily: 'monospace' }}>{r.transactionId || '—'}</Tag> },
              { title: 'Note', key: 'note',
                render: (_, r) => <span className="text-xs text-gray-500">{r.paymentNote || '—'}</span> },
            ]}
            dataSource={closingTransactions}
            rowKey="id"
            size="small"
            pagination={false}
          />
        </Card>
      )}
    </div>
  )
}

export default ClosingEntriesList
