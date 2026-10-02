'use client'
// Closing form for a closed member — enter the settlement, save, download.
//
// The amounts a member ALREADY contributed are not typed by hand: they are read
// from that member's closing_payment docs, the same source the receipts and the
// audit use. Only what is being handed over (amountGiven, mode, old pending) is
// entered, and the net is derived.
//
// The settlement is saved onto the member as `closingFormData` before the PDF
// is offered, so the form can be reprinted later with identical figures instead
// of being retyped from memory.

import React, { useState, useEffect, useMemo } from 'react'
import {
  Drawer, Button, Space, Form, InputNumber, Select, Input, Card, Statistic,
  Row, Col, Alert, Spin, Typography, message, Divider, Tag, Checkbox, DatePicker,
} from 'antd'
import { FilePdfOutlined, SaveOutlined, ReloadOutlined } from '@ant-design/icons'
import { PDFDownloadLink } from '@react-pdf/renderer'
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import dayjs from 'dayjs'
import { db } from '../../../../../lib/firbase-client'
import ClosingFormPdf from './ClosingFormPdf'

const { Text, Title } = Typography

const ClosingFormDrawer = ({ open, onClose, member, programList = [], onSaved }) => {
  const [form]      = Form.useForm()
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [docs, setDocs]         = useState([])
  const [error, setError]       = useState(null)
  const [settlement, setSettlement] = useState(null)

  const programName = useMemo(() => {
    const p = programList.find(x => x.id === member?.programId)
    return p?.hindiName || p?.name || member?.programName || ''
  }, [programList, member])

  // ── What the member has actually been charged and has paid ────────────────
  const totals = useMemo(() => {
    let total = 0, paid = 0, events = 0
    for (const d of docs) {
      if (d.isReversed === true) continue
      total  += Number(d.totalAmount  || 0)
      paid   += Number(d.paidAmount   || 0)
      events += Number(d.closingCount || 0)
    }
    return { total, paid, pending: Math.max(0, total - paid), events }
  }, [docs])

  const load = async () => {
    if (!member?.id) return
    setLoading(true); setError(null)
    try {
      const snap = await getDocs(
        query(collection(db, 'closing_payment'), where('memberId', '==', member.id))
      )
      setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      console.error(e)
      setError('क्लोजिंग रिकॉर्ड नहीं पढ़े जा सके — ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open || !member?.id) return
    setSettlement(member.closingFormData || null)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, member?.id])

  // Seed the form once the charges are known, or from a previously saved form.
  useEffect(() => {
    if (!open) return
    const prev = member?.closingFormData
    form.setFieldsValue({
      amountGiven: prev?.amountGiven ?? 0,
      paymentMode: prev?.paymentMode ?? 'नकद',
      // Outstanding closing instalments are the member's own old pending by
      // default — the usual thing deducted from the payout.
      oldPending:  prev?.oldPending ?? totals.pending,
      note:        prev?.note ?? '',
      paymentDone: prev?.paymentDone ?? false,
      // Default to the day the money actually changed hands, not "today
      // whenever this form is reopened" — so a form prepared now and marked
      // paid next week records next week.
      paymentDate: prev?.paymentDate ? dayjs(prev.paymentDate) : dayjs(),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, totals.pending, member?.id])

  const values   = Form.useWatch([], form) || {}
  const netAmount = Math.max(0, Number(values.amountGiven || 0) - Number(values.oldPending || 0))

  const save = async () => {
    try {
      const v = await form.validateFields()
      if (Number(v.amountGiven || 0) <= 0) {
        message.error('सदस्य को दी जा रही राशि डालें')
        return
      }
      if (v.paymentDone && !v.paymentDate) {
        message.error('भुगतान की दिनांक चुनें')
        return
      }
      setSaving(true)

      const data = {
        // From the closing records, not typed — so the form cannot disagree
        // with the receipts.
        memberContributed: totals.paid,
        membersCount:      totals.events,
        totalCharged:      totals.total,
        // Entered
        amountGiven: Number(v.amountGiven || 0),
        paymentMode: v.paymentMode || 'नकद',
        oldPending:  Number(v.oldPending || 0),
        note:        v.note || '',
        netAmount,
        // Handover status. paymentDate is only meaningful once paid, so it is
        // cleared otherwise rather than left as a date nothing happened on.
        paymentDone: !!v.paymentDone,
        paymentDate: v.paymentDone && v.paymentDate
          ? dayjs(v.paymentDate).startOf('day').toISOString()
          : null,
        preparedAt:  new Date().toISOString(),
      }

      await updateDoc(doc(db, 'members', member.id), {
        closingFormData: data,
        closingFormAt:   serverTimestamp(),
        updated_at:      serverTimestamp(),
      })

      setSettlement(data)
      message.success('समापन पत्र सहेजा गया — अब डाउनलोड कर सकते हैं')
      onSaved?.(member.id, data)
    } catch (e) {
      if (e?.errorFields) return         // form validation, already shown
      console.error(e)
      message.error('सहेजा नहीं जा सका: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const fileName = `ClosingForm_${member?.registrationNumber || member?.id || 'member'}_${dayjs().format('YYYY-MM-DD')}.pdf`

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={720}
      title={
        <div>
          <Title level={5} style={{ margin: 0 }}>सदस्यता समापन पत्र</Title>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {member?.displayName} · {member?.registrationNumber}
          </Text>
        </div>
      }
      extra={
        <Space>
          <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={load}>
            Refresh
          </Button>
          {settlement ? (
            <PDFDownloadLink
              fileName={fileName}
              document={
                <ClosingFormPdf
                  member={member}
                  settlement={settlement}
                  programName={programName}
                />
              }
            >
              {({ loading: l }) => (
                <Button type="primary" size="small" icon={<FilePdfOutlined />} loading={l}
                  style={{ background: '#D3292F', border: 'none' }}>
                  डाउनलोड PDF
                </Button>
              )}
            </PDFDownloadLink>
          ) : (
            <Button type="primary" size="small" icon={<SaveOutlined />} loading={saving} onClick={save}>
              सहेजें और PDF बनाएं
            </Button>
          )}
        </Space>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {error && <Alert type="error" showIcon message={error} />}

          {!member?.member_closed && (
            <Alert
              type="warning" showIcon
              message="यह सदस्य अभी क्लोज नहीं हुआ है"
              description="समापन पत्र आमतौर पर क्लोजिंग के बाद ही दिया जाता है।"
            />
          )}

          {/* From the closing records */}
          <Card size="small" title={<span style={{ fontSize: 12 }}>क्लोजिंग रिकॉर्ड से</span>}>
            <Row gutter={[12, 12]}>
              <Col xs={12} md={6}>
                <Statistic title={<span style={{ fontSize: 11 }}>कुल राशि</span>}
                  value={totals.total} prefix="₹" valueStyle={{ fontSize: 17, color: '#722ed1' }} />
              </Col>
              <Col xs={12} md={6}>
                <Statistic title={<span style={{ fontSize: 11 }}>चुकाई गई</span>}
                  value={totals.paid} prefix="₹" valueStyle={{ fontSize: 17, color: '#16a34a' }} />
              </Col>
              <Col xs={12} md={6}>
                <Statistic title={<span style={{ fontSize: 11 }}>बकाया</span>}
                  value={totals.pending} prefix="₹"
                  valueStyle={{ fontSize: 17, color: totals.pending > 0 ? '#dc2626' : '#16a34a' }} />
              </Col>
              <Col xs={12} md={6}>
                <Statistic title={<span style={{ fontSize: 11 }}>क्लोजिंग</span>}
                  value={totals.events} valueStyle={{ fontSize: 17, color: '#2563eb' }} />
              </Col>
            </Row>
            <Text style={{ fontSize: 10, color: '#9ca3af' }}>
              ये आंकड़े सदस्य के closing_payment रिकॉर्ड से लिए गए हैं — हाथ से नहीं भरे जाते,
              इसलिए रसीद और यह पत्र कभी अलग नहीं होंगे।
            </Text>
          </Card>

          <Divider style={{ margin: '4px 0' }} />

          {/* Entered */}
          <Form form={form} layout="vertical" size="small">
            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item name="amountGiven" label="सदस्य को दी जा रही राशि" required
                  rules={[{ required: true, message: 'राशि डालें' }]}>
                  <InputNumber style={{ width: '100%' }} min={0} precision={0} prefix="₹"
                    placeholder="0" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="paymentMode" label="भुगतान माध्यम">
                  <Select options={[
                    { label: 'नकद',   value: 'नकद' },
                    { label: 'चेक',   value: 'चेक' },
                    { label: 'ऑनलाइन', value: 'ऑनलाइन' },
                  ]} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="oldPending" label="पुरानी बकाया (कटौती)"
                  help={<span style={{ fontSize: 10 }}>क्लोजिंग बकाया से भरा गया — बदल सकते हैं</span>}>
                  <InputNumber style={{ width: '100%' }} min={0} precision={0} prefix="₹" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="नेट राशि (स्वतः)">
                  <InputNumber style={{ width: '100%', background: '#f6ffed', fontWeight: 700 }}
                    value={netAmount} disabled prefix="₹" />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item name="paymentDone" valuePropName="checked" style={{ marginBottom: 6 }}>
                  <Checkbox>
                    <b>भुगतान हो गया</b>
                    <Text style={{ fontSize: 11, color: '#6b7280', marginLeft: 6 }}>
                      (राशि सदस्य को सौंप दी गई है)
                    </Text>
                  </Checkbox>
                </Form.Item>
              </Col>

              {/* Only meaningful once the money has changed hands. */}
              {values.paymentDone && (
                <Col xs={24} md={12}>
                  <Form.Item
                    name="paymentDate"
                    label="भुगतान दिनांक"
                    rules={[{ required: true, message: 'दिनांक चुनें' }]}
                  >
                    <DatePicker
                      style={{ width: '100%' }}
                      format="DD-MM-YYYY"
                      // A handover cannot be in the future.
                      disabledDate={(d) => d && d > dayjs().endOf('day')}
                    />
                  </Form.Item>
                </Col>
              )}

              <Col span={24}>
                <Form.Item name="note" label="टिप्पणी">
                  <Input.TextArea rows={2} maxLength={300} showCount />
                </Form.Item>
              </Col>
            </Row>
          </Form>

          {settlement && (
            <Alert
              type="success" showIcon
              message={<span style={{ fontSize: 12 }}>
                समापन पत्र सहेजा गया — नेट ₹{Number(settlement.netAmount || 0).toLocaleString('en-IN')}
              </span>}
              description={
                <Space size={4} wrap>
                  <Text style={{ fontSize: 11 }}>
                    {settlement.preparedAt ? dayjs(settlement.preparedAt).format('DD-MM-YYYY hh:mm A') : ''}
                  </Text>
                  <Tag style={{ fontSize: 10 }}>{settlement.paymentMode}</Tag>
                  {settlement.paymentDone
                    ? <Tag color="success" style={{ fontSize: 10 }}>
                        भुगतान हो गया{settlement.paymentDate ? ` · ${dayjs(settlement.paymentDate).format('DD-MM-YYYY')}` : ''}
                      </Tag>
                    : <Tag color="warning" style={{ fontSize: 10 }}>भुगतान बाकी</Tag>}
                  <Button size="small" type="link" style={{ fontSize: 11, padding: 0 }}
                    loading={saving} onClick={save}>
                    बदलकर फिर सहेजें
                  </Button>
                </Space>
              }
            />
          )}
        </Space>
      )}
    </Drawer>
  )
}

export default ClosingFormDrawer
