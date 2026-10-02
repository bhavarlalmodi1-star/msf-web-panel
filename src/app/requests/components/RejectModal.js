import { Form, Input, message, Modal, Avatar, Tag } from 'antd'
import React, { useState } from 'react'
import { CloseCircleOutlined, UserOutlined } from '@ant-design/icons'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../../../../lib/firbase-client'

const RejectModal = ({ open, setOpen, selectedMember, setSelectedMember, fetchAllData, programList, user }) => {
  const [rejectionReason, setRejectionReason] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Single program name from flat field
  const progName = (() => {
    if (!selectedMember?.programId || !programList) return selectedMember?.programName || '—'
    return programList.find(p => p.id === selectedMember.programId)?.name || selectedMember.programName || '—'
  })()

  const executeRejection = async () => {
    if (!selectedMember || !rejectionReason.trim()) {
      message.error('Please provide a rejection reason'); return
    }
    try {
      setIsLoading(true)
      await updateDoc(doc(db, 'members', selectedMember.id), {
        status:          'rejected',
        active_flag:     false,
        rejectionReason: rejectionReason.trim(),
        rejectedBy:      user?.uid,
        rejectedByName:  user?.name || user?.email,
        rejectedAt:      serverTimestamp(),
        updated_at:      serverTimestamp()
      })
      message.success('Member request rejected')
      setOpen(false); setRejectionReason(''); setSelectedMember(null)
      fetchAllData()
    } catch (e) {
      console.error(e); message.error('Failed to reject member request')
    } finally { setIsLoading(false) }
  }

  return (
    <Modal
      title={
        <span className="flex items-center gap-2 text-red-600">
          <CloseCircleOutlined /> Reject Member Request
        </span>
      }
      open={open}
      onOk={executeRejection}
      okButtonProps={{ loading: isLoading, danger: true }}
      okText="Reject Request"
      onCancel={() => { setOpen(false); setRejectionReason('') }}
      cancelText="Cancel"
      width={480}
    >
      {selectedMember && (
        <div className="space-y-4">
          {/* Member summary */}
          <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg border border-red-100">
            <Avatar src={selectedMember.photoURL} icon={<UserOutlined />} size={44} />
            <div>
              <div className="font-semibold">{selectedMember.displayName} {selectedMember.fatherName}</div>
              <div className="text-sm text-gray-500">{selectedMember.registrationNumber}</div>
              <Tag color="geekblue" style={{ marginTop: 4 }}>{progName}</Tag>
            </div>
          </div>

          {/* Reason input */}
          <Form layout="vertical">
            <Form.Item label="Rejection Reason" required>
              <Input.TextArea
                rows={4}
                placeholder="Enter a clear reason for rejection (e.g. incomplete documents, duplicate Aadhaar, incorrect details...)"
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                maxLength={500}
                showCount
              />
            </Form.Item>
          </Form>

          <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
            The rejection reason will be visible to the agent and stored in the request history.
          </div>
        </div>
      )}
    </Modal>
  )
}

export default RejectModal