import React, { useState } from 'react'
import { Card, Row, Col, Form, Input, DatePicker, Select, Alert, Spin, Radio } from 'antd'
import dayjs from "dayjs"
import { LoadingOutlined } from '@ant-design/icons'

const BasicInfoForm = ({
  handleDobChange, age, castes, form, onAadhaarCheck, existingMember, setExistingMember,
  isEditMode = false, currentUserRole,
}) => {
  const [checkingAadhaar, setCheckingAadhaar] = useState(false)

  // A member's name is printed on their certificate and baked into receipts and
  // search keywords, so editing it after registration is restricted to superadmin.
  // Adding a new member is unaffected.
  const canEditName = !isEditMode || currentUserRole === 'superadmin'

  
  const handleAadhaarChange = async (e) => {
    const aadhaarNo = e.target.value
    
    // Form में value set करें
    form.setFieldsValue({ aadhaarNo })
    
    // पूरा 12-digit होने पर check करें
    if (aadhaarNo.length === 12 && /^\d+$/.test(aadhaarNo)) {
      setCheckingAadhaar(true)
      try {
        const result = await onAadhaarCheck(aadhaarNo)
        setExistingMember(result)
      } catch (error) {
        console.error('Error checking Aadhaar:', error)
      } finally {
        setCheckingAadhaar(false)
      }
    } else {
      setExistingMember(null)
    }
  }

  return (
    <Card title="Aadhaar & Basic Information" size="small" className="mb-4">
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            label="Aadhaar Number"
            name="aadhaarNo"
            rules={[
              { required: true, message: 'Please enter Aadhaar number' },
              { pattern: /^[0-9]{12}$/, message: 'Please enter valid 12-digit Aadhaar' }
            ]}
            validateStatus={existingMember ? 'warning' : ''}
            help={checkingAadhaar ? (
              <Spin indicator={<LoadingOutlined style={{ fontSize: 14 }} spin />} />
            ) : existingMember ? (
              'This Aadhaar is already registered'
            ) : null}
          >
            <Input 
              placeholder="Enter 12-digit Aadhaar number" 
              maxLength={12}
              onChange={handleAadhaarChange}
              disabled={checkingAadhaar}
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            label="Name"
            name="name"
            rules={[{ required: true, message: 'Please enter name' }]}
            tooltip={!canEditName ? 'Only a superadmin can change a member\'s name' : undefined}
            extra={!canEditName
              ? <span style={{ fontSize: 11, color: '#d97706' }}>🔒 Only superadmin can change the name</span>
              : undefined}
          >
            <Input placeholder="Enter full name" disabled={!canEditName} />
          </Form.Item>
        </Col>
      </Row>

      {/* Existing Member Information Alert */}
      {existingMember && (
        <Alert
          message="This Aadhaar number is already registered!"
          description={
            <div>
              <p><strong>Existing Member Details:</strong></p>
              <ul style={{ marginBottom: 0 }}>
                <li><strong>Name:</strong> {existingMember.displayName}</li>
                <li><strong>Father's Name:</strong> {existingMember.fatherName || 'Not available'}</li>
                <li><strong>Registration Number:</strong> {existingMember.registrationNumber}</li>
                <li><strong>Phone:</strong> {existingMember.phone}</li>
                <li><strong>Join Date:</strong> {existingMember.dateJoin || 'Not joined yet'}</li>
                <li>
                  <strong>Yojna / Program:</strong>{' '}
                  {existingMember.programName || existingMember.program?.programName || 'Not assigned'}
                </li>
                <li>
                  <strong>Status:</strong>{' '}
                  {existingMember.status === 'active' ? '✅ Active'
                    : existingMember.status === 'pending_approval' ? '⏳ Pending Approval'
                    : existingMember.status === 'rejected' ? '❌ Rejected'
                    : existingMember.status || 'Unknown'}
                </li>
              </ul>
              <p style={{ marginTop: 8, marginBottom: 0 }}>
                <small>
                  <em>If this is a different person, please verify the Aadhaar number.</em>
                </small>
              </p>
            </div>
          }
          type="warning"
          showIcon
          className="mb-3"
        />
      )}

      <Row gutter={16}>
        <Col span={8}>
          <Form.Item
            label="Father's Name"
            name="fatherName"
            rules={[{ required: true, message: "Please enter father's name" }]}
          >
            <Input placeholder="Enter father's name" />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item
            label="Caste"
            name="caste"
            rules={[{ required: true, message: 'Please select caste' }]}
          >
            <Select
              placeholder="Select caste"
              options={castes.map(c => ({ label: c.name, value: c.id }))}
              loading={castes.length === 0}
            />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item
            label="Surname (Gotar)"
            name="surname"
            rules={[{ required: true, message: 'Please enter surname (Gotar)' }]}
          >
            <Input placeholder="Enter surname (Gotar)" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={8}>
          <Form.Item
            label="Date of Birth"
            name="bobDate"
            rules={[{ required: true, message: 'Please select date of birth' }]}
          >
            <DatePicker
              format="DD-MM-YYYY"
              style={{ width: '100%' }}
              placeholder="Select date of birth"
              onChange={handleDobChange}
              disabledDate={(current) => current && current > dayjs().endOf('day')}
            />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item
            label="Gender"
            name="gender"
            rules={[{ required: true, message: 'Please select gender' }]}
          >
            <Radio.Group buttonStyle="solid">
              <Radio.Button value="male">Male</Radio.Button>
              <Radio.Button value="female">Female</Radio.Button>
              <Radio.Button value="other">Other</Radio.Button>
            </Radio.Group>
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item
            label="Phone Number"
            name="phone"
            rules={[
              { required: true, message: 'Please enter phone number' },
              { pattern: /^[0-9]{10}$/, message: 'Please enter valid 10-digit number' }
            ]}
          >
            <Input placeholder="Enter phone number" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={8}>
          <Form.Item
            label="Alternate Phone"
            name="phoneAlt"
          >
            <Input placeholder="Enter alternate phone (optional)" />
          </Form.Item>
        </Col>
      </Row>
    </Card>
  )
}

export default BasicInfoForm