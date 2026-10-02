import { Button, Drawer, Form, Spin, Alert, Radio, Input, Row, Col, Typography, message, App, DatePicker, Checkbox } from 'antd'
import React, { useState, useEffect } from 'react'
import { 
  CheckCircleOutlined,
  LoadingOutlined
} from '@ant-design/icons'
import { doc, serverTimestamp, updateDoc, runTransaction } from 'firebase/firestore'
import { db } from '../../../../lib/firbase-client'
import { auth } from '../../../../lib/firbase-client'
import dayjs from 'dayjs'
import isBetween from 'dayjs/plugin/isBetween'
import { createClosingPayment, createSearchIndex, generateRegistrationNumber, getNextMemberSrNo, memberAccoiuntCreate, recordJoinFeeTransaction, sendJoinCertificate } from '@/app/members/components/components/firebaseUtils'
import { notifyAgent } from '@/app/utils/notifyAgent'

dayjs.extend(isBetween)

const { Text } = Typography

const ApproveModal = ({ open, setOpen, selectedMember, setSelectedMember, fetchAllData, programList, user }) => {
  const [form] = Form.useForm()
  const { message } = App.useApp()
  const [loading, setLoading]         = useState(false)
  const [joinFeesDone, setJoinFeesDone] = useState(false)
  const [paymentMode, setPaymentMode] = useState('cash')
  const [paidAmount, setPaidAmount]   = useState(0)
  const [programDetail, setProgramDetail] = useState(null)   // single object

  // Join date drives which period (and therefore which join fee) applies.
  // Because changing it changes the money charged, only a superadmin may edit
  // it — everyone else sees the date the agent submitted, read-only.
  const [joinDate, setJoinDate] = useState(null)
  const canEditJoinDate = user?.role === 'superadmin'

  // ── Notification options (both default ON) ─────────────────────────────────
  // WhatsApp sends are opt-in — messages cost money and go to real people, so
  // they should be a deliberate choice rather than something that fires by default
  const [sendWhatsApp, setSendWhatsApp]           = useState(false)
  const [sendAgentWhatsApp, setSendAgentWhatsApp] = useState(false)
  const [sendNotification, setSendNotification]   = useState(true)

  // Seed the join date from the request whenever a new member is opened
  useEffect(() => {
    if (!selectedMember) { setJoinDate(null); return }
    const d = selectedMember.dateJoin
      ? dayjs(selectedMember.dateJoin, 'DD-MM-YYYY')
      : dayjs()
    setJoinDate(d.isValid() ? d : dayjs())
  }, [selectedMember])

  // ── Recalculate whenever the member, program list or join date changes ──────
  useEffect(() => {
    if (selectedMember && programList) {
      calculateProgramDetail()
    }
  }, [selectedMember, programList, joinDate])

  // ── Resolve program detail from member doc (single program) ────────────────
  const calculateProgramDetail = () => {
    if (!selectedMember || !programList) return

    // Member doc already has programId as a flat field (not an array)
    const programId = selectedMember.programId
    if (!programId) {
      setProgramDetail(null)
      return
    }

    const program = programList.find(p => p.id === programId)
    if (!program) {
      setProgramDetail(null)
      return
    }

    const calculatedAge = selectedMember.age || 0
    // Prefer the date currently in the picker so edits re-resolve the period
    const joinDateStr   = joinDate?.isValid?.()
      ? joinDate.format('DD-MM-YYYY')
      : selectedMember.dateJoin

    const ageGroup = program.ageGroups?.find(
      ag => calculatedAge >= ag.startAge && calculatedAge <= ag.endAge
    ) || null

    const period = ageGroup?.periods?.find(p => {
      const start = dayjs(p.startDate, 'DD-MM-YYYY')
      const end   = dayjs(p.endDate,   'DD-MM-YYYY')
      const join  = dayjs(joinDateStr,  'DD-MM-YYYY')
      return join.isBetween(start, end, null, '[]')
    }) || null

    const detail = {
      programId:       program.id,
      programName:     program.name,
      ageGroupId:      ageGroup?.id,
      ageGroupName:    ageGroup?.ageGroupName,
      // Use period.joinFees if the period was found; never fall back to
      // program.joinFees — that top-level field may not exist or may be stale.
      joinFees:        period ? (Number(period.joinFees) || 0) : 0,
      fixedJoinFees:   period?.fixedJoinFees  || 0,
      payAmount:       period?.payAmount      || 0,
      periodStartDate: period?.startDate,
      periodEndDate:   period?.endDate,
      memberGroupId:   program?.memberGroups?.[0]?.id        || selectedMember?.memberGroupId || '',
      memberGroupName: program?.memberGroups?.[0]?.groupName || selectedMember?.memberGroupName || '',
      memberGroupCode: program?.memberGroups?.[0]?.code      || selectedMember?.memberGroupCode || '',
      hasPeriod:       !!period,
    }

    setProgramDetail(detail)
    // Pre-fill paid amount with join fees
    setPaidAmount(detail.joinFees)
    form.setFieldsValue({ paidAmount: detail.joinFees })
  }

  const joinFees = programDetail?.joinFees || 0

  // ── Payment helpers ─────────────────────────────────────────────────────────
  const handleJoinFeesDoneChange = (e) => {
    const isDone = e.target.value
    setJoinFeesDone(isDone)
    if (isDone) {
      setPaidAmount(joinFees)
      form.setFieldsValue({ paidAmount: joinFees })
    } else {
      setPaidAmount(0)
      form.setFieldsValue({ paidAmount: 0 })
    }
  }

  const handlePaidAmountChange = (e) => {
    const value = parseFloat(e.target.value) || 0
    setPaidAmount(value)
    if (value > joinFees) {
      message.warning(`Paid amount cannot exceed total join fees of ₹${joinFees}`)
    }
  }

  // ── Main approval ───────────────────────────────────────────────────────────
  const executeApproval = async () => {
    if (!selectedMember || !programDetail) return

    try {
      setLoading(true)

      // Clamp paid amount to [0, joinFees] to prevent negative or over-cap values
      const actualPaidAmount = Math.min(Math.max(0, parseFloat(paidAmount || 0)), joinFees)

      if (joinFeesDone && parseFloat(paidAmount || 0) > joinFees) {
        message.error(`Paid amount (₹${parseFloat(paidAmount || 0)}) cannot exceed join fees (₹${joinFees})`)
        setLoading(false)
        return
      }

      const finalPaid       = joinFeesDone ? actualPaidAmount : 0
      // pendingAmount is always non-negative and never exceeds joinFees
      const finalPending    = Math.max(0, joinFees - finalPaid)
      const paymentPct      = joinFees > 0 ? Math.round((finalPaid / joinFees) * 100) : 0
      const paymentStatus   = paymentPct === 100 ? 'paid' : paymentPct > 0 ? 'partial' : 'pending'

      // Final registration number — use program's prefix + per-program sequence
      const finalRegNumber = await generateRegistrationNumber(programDetail.programId)

      // Atomically assign a global Sr. No.
      const srNo = await getNextMemberSrNo()

      const searchIndex = createSearchIndex({
        name:               selectedMember.displayName,
        fatherName:         selectedMember.fatherName,
        surname:            selectedMember.surname,
        phone:              selectedMember.phone,
        aadhaarNo:          selectedMember.aadhaarNo,
        registrationNumber: finalRegNumber,
        village:            selectedMember.village,
        city:               selectedMember.city,
        district:           selectedMember.district,
        state:              selectedMember.state,
        caste:              selectedMember.caste,
        guardian:           selectedMember.guardian,
        programName:        programDetail.programName,
        ageGroupName:       programDetail.ageGroupName,
      })

      // The submitted date is the baseline; only a superadmin's edit overrides it.
      // A disabled picker alone isn't enough — this decides the fee charged.
      const submittedJoinDate = selectedMember.dateJoin
        ? dayjs(selectedMember.dateJoin, 'DD-MM-YYYY')
        : dayjs()

      const finalJoinDate = (canEditJoinDate && joinDate?.isValid?.())
        ? joinDate
        : (submittedJoinDate.isValid() ? submittedJoinDate : dayjs())

      // ── Update member doc — all program fields embedded flat ──────────────
      const memberUpdate = {
        status:        'active',
        active_flag:   true,
        dateJoin:      finalJoinDate.format('DD-MM-YYYY'),
        // fields derived from the join date (used in filters/stats)
        programJoinDate: finalJoinDate.format('DD-MM-YYYY'),
        joinYear:      finalJoinDate.year(),
        joinMonth:     finalJoinDate.month() + 1,
        joinYearMonth: finalJoinDate.format('YYYY-MM'),
        // Sortable copy — DD-MM-YYYY strings can't be range-queried
        joinDateTs:    finalJoinDate.startOf('day').toDate(),
        isPendingApproval: false,
        registrationNumber: finalRegNumber,
        search_registrationNumber: finalRegNumber,
        search_keywords: searchIndex,

        srNo,
        approvedBy:     user?.uid,
        approvedByName: user?.displayName || user?.email,
        approvedAt:     serverTimestamp(),
        createdAt:      selectedMember.createdAt || serverTimestamp(),
        updated_at:     serverTimestamp(),

        // ── Embedded program details (resolved at approval time) ────────────
        programId:       programDetail.programId,
        programName:     programDetail.programName,
        ageGroupId:      programDetail.ageGroupId,
        ageGroupName:    programDetail.ageGroupName,
        periodStartDate: programDetail.periodStartDate,
        periodEndDate:   programDetail.periodEndDate,
        memberGroupId:   programDetail.memberGroupId,
        memberGroupName: programDetail.memberGroupName,
        memberGroupCode: programDetail.memberGroupCode,
        payAmount:       programDetail.payAmount || 0,

        // ── Financial fields ────────────────────────────────────────────────
        joinFees,
        fixedJoinFees:     programDetail.fixedJoinFees || 0,
        joinFeesDone,
        paymentMode:       joinFeesDone ? paymentMode : null,
        paidAmount:        finalPaid,
        pendingAmount:     finalPending,
        paymentPercentage: paymentPct,
        paymentStatus,
        joinFeesTxtId:     joinFeesDone ? (form.getFieldValue('joinFeesTxtId') || '') : '',
        transactionDate:   joinFeesDone && form.getFieldValue('transactionDate')
                             ? form.getFieldValue('transactionDate').format('DD-MM-YYYY')
                             : null,
        hasPendingPayments: finalPending > 0,
      }

      await updateDoc(doc(db, 'members', selectedMember.id), memberUpdate)

      // ── Record transaction if payment was made ─────────────────────────────
      let approvalPaymentGroupId = ''
      if (joinFeesDone && finalPaid > 0) {
        const txResult = await recordJoinFeeTransaction(
          {
            memberId:           selectedMember.id,
            displayName:        selectedMember.displayName,
            registrationNumber: finalRegNumber,
            fatherName:         selectedMember.fatherName,
            aadhaarNo:          selectedMember.aadhaarNo,
            phone:              selectedMember.phone,
            agentId:            selectedMember.agentId || '',
            createdBy:          user?.uid,
          },
          {
            paidAmount:         finalPaid,
            totalPendingAmount: finalPending,
            previousBalance:    0,
            paymentMode,
            transactionId:   form.getFieldValue('joinFeesTxtId'),
            transactionDate: form.getFieldValue('transactionDate'),
            programId:       programDetail.programId,
            programName:     programDetail.programName,
            notes:           'Join fee payment during approval',
          }
        )
        approvalPaymentGroupId = txResult?.groupId || ''
      }

      // ── Create / update auth account + credit commission (server-side) ──────
      const commissionPayload = (joinFeesDone && finalPaid > 0 && selectedMember.agentId)
        ? {
            agentId: selectedMember.agentId,
            amount: finalPaid,
            memberName: selectedMember.displayName,
            memberFatherName: selectedMember.fatherName || '',
            memberRegNo: finalRegNumber || '',
            programId: programDetail.programId,
            programName: programDetail.programName,
            description: `Join Fee Commission (25%) - Member Approval`,
            paymentGroupId: approvalPaymentGroupId
          }
        : null
      await memberAccoiuntCreate({ ...selectedMember, ...memberUpdate, id: selectedMember.id }, commissionPayload)
      await createClosingPayment({ ...selectedMember, id: selectedMember.id })
      message.success(`Member approved! Registration: ${finalRegNumber}`)

      // ── Generate certificate + send WhatsApp join message ──────────────────
      // Non-critical: never block approval if this fails.
      // Always runs so every approved member gets a certificate saved on their
      // record; the checkboxes only control whether it's also messaged out.
      await sendJoinCertificate(selectedMember.id, {
        sendToMember: sendWhatsApp,
        sendToAgent:  sendAgentWhatsApp,
      })

      // ── Notify agent (in-app push) ─────────────────────────────────────────
      if (sendNotification && selectedMember.agentId) {
        notifyAgent(
          selectedMember.agentId,
          "New Member Approved",
          `${selectedMember.displayName} has been approved. Registration: ${finalRegNumber}`,
          { click_action: "/members" }
        )
      }
      setOpen(false)
      setSelectedMember(null)
      resetForm()
      fetchAllData()

    } catch (error) {
      console.error('Error approving member:', error)
      message.error('Failed to approve member: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    form.resetFields()
    setJoinFeesDone(false)
    setPaymentMode('cash')
    setPaidAmount(0)
    setProgramDetail(null)
    setJoinDate(null)
    setSendWhatsApp(false)
    setSendAgentWhatsApp(false)
    setSendNotification(true)
  }

  const handleClose = () => {
    if (!loading) { setOpen(false); resetForm() }
  }

  const finalPaid    = joinFeesDone ? parseFloat(paidAmount || 0) : 0
  const finalPending = Math.max(0, joinFees - finalPaid)
  const paymentPct   = joinFees > 0 ? Math.round((finalPaid / joinFees) * 100) : 0

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      width={700}
      title={
        <div className="flex items-center gap-2">
          <CheckCircleOutlined className="text-green-500" />
          <span>Approve Member Request</span>
        </div>
      }
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button onClick={handleClose} disabled={loading}>Cancel</Button>
          <Button
            type="primary"
            onClick={executeApproval}
            loading={loading}
            icon={<CheckCircleOutlined />}
            disabled={!programDetail}
          >
            Approve Member
          </Button>
        </div>
      }
      maskClosable={!loading}
      closable={!loading}
      destroyOnHidden
    >
      <Spin spinning={loading} indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />}>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ joinFeesDone: false, paymentMode: 'cash' }}
          disabled={loading}
        >
          {selectedMember && (
            <div className="space-y-4">

              {/* ── Member summary ─────────────────────────────────────────── */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-gray-500">Member Name</div>
                    <div className="font-medium">
                      {selectedMember.displayName} {selectedMember.fatherName} {selectedMember.surname}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Pending Registration</div>
                    <div className="font-medium text-orange-600">{selectedMember.registrationNumber}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Phone</div>
                    <div>{selectedMember.phone}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Agent ID</div>
                    <div>{selectedMember.agentId || '—'}</div>
                  </div>
                </div>

                {/* Join date — decides which period's fee applies, so editing
                    is limited to superadmin */}
                <div className="mt-3 pt-3 border-t border-blue-100">
                  <div className="text-xs text-gray-500 mb-1">
                    Join Date
                    <span className="ml-2 text-[11px] text-gray-400">
                      (decides the period &amp; join fees)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <DatePicker
                      value={joinDate}
                      onChange={(d) => setJoinDate(d)}
                      format="DD-MM-YYYY"
                      allowClear={false}
                      disabled={!canEditJoinDate}
                      style={{ width: 180 }}
                    />
                    {!canEditJoinDate && (
                      <span className="text-[11px] text-amber-600">
                        🔒 Only superadmin can change the join date
                      </span>
                    )}
                    {canEditJoinDate && selectedMember.dateJoin && joinDate
                      && joinDate.format('DD-MM-YYYY') !== selectedMember.dateJoin && (
                      <span className="text-[11px] text-amber-600">
                        Changed from {selectedMember.dateJoin}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Program info ────────────────────────────────────────────── */}
              <div className="border rounded-lg p-4">
                <div className="font-medium mb-3">Program Details</div>
                {programDetail ? (
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Program</span>
                      <span className="font-medium">{programDetail.programName}</span>
                    </div>
                    {programDetail.ageGroupName && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Age Group</span>
                        <span>{programDetail.ageGroupName}</span>
                      </div>
                    )}
                    {programDetail.periodStartDate && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Period</span>
                        <span>{programDetail.periodStartDate} → {programDetail.periodEndDate}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-500">Join Fees</span>
                      <span className="font-semibold text-blue-600">₹{joinFees}</span>
                    </div>
                    {!programDetail.hasPeriod && (
                      <Alert
                        message="No matching period found for this join date. Default fees applied."
                        type="warning"
                        showIcon
                        className="mt-2"
                      />
                    )}
                  </div>
                ) : (
                  <Alert message="Program details could not be resolved." type="error" showIcon />
                )}
              </div>

              {/* ── Join fees section ───────────────────────────────────────── */}
              <div className="border rounded-lg p-4">
                <div className="font-medium mb-4">Join Fees</div>

                <Form.Item label="Join Fees Paid?" name="joinFeesDone">
                  <Radio.Group onChange={handleJoinFeesDoneChange}>
                    <Radio value={true}>Yes</Radio>
                    <Radio value={false}>No</Radio>
                  </Radio.Group>
                </Form.Item>

                {joinFeesDone && (
                  <>
                    <Form.Item label="Payment Mode" name="paymentMode">
                      <Radio.Group onChange={e => setPaymentMode(e.target.value)} value={paymentMode}>
                        <Radio value="cash">Cash</Radio>
                        <Radio value="online">Online</Radio>
                      </Radio.Group>
                    </Form.Item>

                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item
                          label="Paid Amount"
                          name="paidAmount"
                          rules={[
                            { required: true, message: 'Please enter paid amount' },
                            {
                              validator: (_, value) =>
                                parseFloat(value) > joinFees
                                  ? Promise.reject(`Cannot exceed ₹${joinFees}`)
                                  : Promise.resolve()
                            }
                          ]}
                        >
                          <Input
                            type="number"
                            placeholder="Enter paid amount"
                            value={paidAmount}
                            onChange={handlePaidAmountChange}
                            addonBefore="₹"
                            min={0}
                            max={joinFees}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item label="Total Join Fees">
                          <Input value={`₹${joinFees}`} disabled />
                        </Form.Item>
                      </Col>
                    </Row>

                    {paymentMode === 'online' && (
                      <Row gutter={16}>
                        <Col span={12}>
                          <Form.Item
                            label="Transaction ID"
                            name="joinFeesTxtId"
                            rules={[{ required: true, message: 'Transaction ID required' }]}
                          >
                            <Input placeholder="Enter transaction/UTR number" />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item
                            label="Transaction Date"
                            name="transactionDate"
                            rules={[{ required: true, message: 'Transaction date required' }]}
                          >
                            <DatePicker format="DD-MM-YYYY" style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                      </Row>
                    )}

                    {/* Payment summary */}
                    <div className="bg-gray-50 rounded p-3 text-sm space-y-1 mt-2">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Paid</span>
                        <Text type="success">₹{finalPaid}</Text>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Pending</span>
                        <Text type={finalPending > 0 ? 'danger' : 'success'}>₹{finalPending}</Text>
                      </div>
                      <div className="flex justify-between font-medium">
                        <span>Status</span>
                        <Text style={{ color: paymentPct === 100 ? 'green' : paymentPct > 0 ? 'orange' : 'red' }}>
                          {paymentPct === 100 ? 'Fully Paid' : paymentPct > 0 ? `${paymentPct}% Paid` : 'Pending'}
                        </Text>
                      </div>
                    </div>
                  </>
                )}

                {!joinFeesDone && (
                  <Alert
                    message="No payment will be recorded"
                    description="Member will be approved with pending payment status."
                    type="info"
                    showIcon
                  />
                )}
              </div>

              {/* ── Notification options ────────────────────────────────────── */}
              <div className="border rounded-lg p-4">
                <div className="mb-3">
                  <div className="font-medium">Notifications</div>
                  <p className="text-xs text-gray-500">Choose what to send after approval</p>
                </div>

                <div className="flex flex-col gap-3">
                  <Checkbox
                    checked={sendWhatsApp}
                    onChange={(e) => setSendWhatsApp(e.target.checked)}
                    disabled={loading}
                  >
                    <span className="text-sm">
                      Send WhatsApp message to member
                      {sendWhatsApp && (
                        <span className="text-xs text-green-600 ml-2">
                          (with membership certificate
                          {selectedMember?.phone ? ` → ${selectedMember.phone}` : ''})
                        </span>
                      )}
                    </span>
                  </Checkbox>

                  {sendWhatsApp && !selectedMember?.phone && (
                    <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded ml-6">
                      ⚠️ This member has no phone number — WhatsApp message cannot be sent.
                    </div>
                  )}

                  <Checkbox
                    checked={sendAgentWhatsApp}
                    onChange={(e) => setSendAgentWhatsApp(e.target.checked)}
                    disabled={loading}
                  >
                    <span className="text-sm">
                      Send WhatsApp message to agent
                      {sendAgentWhatsApp && (
                        <span className="text-xs text-green-600 ml-2">
                          (same details + certificate to the agent&apos;s number)
                        </span>
                      )}
                    </span>
                  </Checkbox>

                  {sendAgentWhatsApp && !selectedMember?.agentId && (
                    <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded ml-6">
                      ⚠️ This member has no agent assigned — there is no number to send the copy to.
                    </div>
                  )}

                  <Checkbox
                    checked={sendNotification}
                    onChange={(e) => setSendNotification(e.target.checked)}
                    disabled={loading}
                  >
                    <span className="text-sm">
                      Send in-app notification to agent
                      {sendNotification && (
                        <span className="text-xs text-blue-600 ml-2">
                          (agent will be notified of the approval)
                        </span>
                      )}
                    </span>
                  </Checkbox>

                  {sendNotification && !selectedMember?.agentId && (
                    <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded ml-6">
                      ⚠️ This member has no agent assigned — no notification will be sent.
                    </div>
                  )}
                </div>

                {!sendWhatsApp && !sendAgentWhatsApp && !sendNotification && (
                  <div className="mt-3 text-xs text-amber-600 bg-amber-50 p-2 rounded">
                    ⚠️ No notification method selected. Neither the member nor the agent will be informed.
                  </div>
                )}
              </div>

              {/* ── Confirm box ─────────────────────────────────────────────── */}
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="flex items-start gap-2">
                  <CheckCircleOutlined className="text-green-500 mt-1" />
                  <div>
                    <div className="font-medium text-green-700">Confirm Approval</div>
                    <div className="text-sm text-green-600">
                      This will activate the member and generate a permanent registration number.
                      {joinFeesDone && ` A payment of ₹${finalPaid} will be recorded.`}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}
        </Form>
      </Spin>
    </Drawer>
  )
}

export default ApproveModal