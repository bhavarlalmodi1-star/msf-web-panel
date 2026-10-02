import React from 'react'
import { Card, Row, Col, Form, DatePicker, Select, Alert, Tag, Progress, Tooltip } from 'antd'
import { CheckCircleOutlined, ClockCircleOutlined, TrophyOutlined, TeamOutlined, LockOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'

const ProgramSelection = ({
  joinDate,
  handleJoinDateChange,
  programs,
  selectedProgram,
  handleProgramChange,
  dobDate,
  programDetail,
  isEditMode = false,
  existingMember,
  selectedMemberGroup,
  handleMemberGroupChange,
  currentUserRole,
  blockedProgramId,        // yojna the person already belongs to (e.g. when copying)
}) => {
  const isSuperAdmin = currentUserRole === 'superadmin'
  const joinDateLocked = isEditMode && !isSuperAdmin

  const programOptions = programs?.map(p => {
    const blocked = existingMember?.programId === p.id || blockedProgramId === p.id
    return {
      label: blocked ? `${p.name} — already registered` : p.name,
      value: p.id,
      disabled: blocked,
    }
  }) || []

  const groups = programDetail?.memberGroups || []
  const showGroupSelect = groups.length > 1

  return (
    <Card title="Join Date & Program Selection" size="small" className="mb-4">
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            label={
              <span className="flex items-center gap-1">
                Join Date
                {joinDateLocked && <LockOutlined style={{ color: '#faad14', fontSize: 12 }} />}
              </span>
            }
            name="joinDate"
            rules={[{ required: true, message: 'Please select join date' }]}
            extra={joinDateLocked
              ? <span style={{ color: '#faad14', fontSize: 12 }}>🔒 To change join date, please contact Super Admin.</span>
              : null
            }
          >
            <Tooltip
              title={joinDateLocked ? 'Only Super Admin can change join date. Please contact Super Admin.' : ''}
              placement="top"
            >
              <DatePicker
                format="DD-MM-YYYY"
                style={{ width: '100%' }}
                value={joinDate}
                onChange={joinDateLocked ? undefined : handleJoinDateChange}
                disabledDate={isSuperAdmin ? undefined : (current => current && current > dayjs().endOf('day'))}
                disabled={joinDateLocked}
              />
            </Tooltip>
          </Form.Item>
        </Col>

        <Col span={12}>
          <Form.Item
            label="Select Program"
            name="program"
            rules={[{ required: true, message: 'Please select a program' }]}
          >
            <Select
              placeholder="Select a program"
              options={programOptions}
              onChange={handleProgramChange}
              value={selectedProgram || undefined}
              style={{ width: '100%' }}
              allowClear
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
        </Col>
      </Row>

      {!selectedProgram && (
        <Alert message="Please select a program" type="info" showIcon className="mt-2" />
      )}

      {selectedProgram && !dobDate && (
        <Alert message="Please enter Date of Birth to calculate program fees" type="warning" showIcon className="mt-2" />
      )}

      {selectedProgram && dobDate && programDetail && (
        <div className="mt-3">
          {programDetail.error ? (
            <Alert
              message={`Program Error: ${programDetail.programName}`}
              description={programDetail.error}
              type="error"
              showIcon
            />
          ) : (
            <div
              style={{
                border: '1px solid #e6f4ff',
                borderLeft: '4px solid #1890ff',
                borderRadius: 8,
                padding: '14px 16px',
                background: '#f0f8ff',
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrophyOutlined style={{ color: '#1890ff', fontSize: 16 }} />
                  <span className="font-bold text-base">{programDetail.programName}</span>
                  {programDetail.ageGroupName && (
                    <Tag color="blue" style={{ fontSize: 11 }}>{programDetail.ageGroupName}</Tag>
                  )}
                </div>
                <Tag color="green" icon={<CheckCircleOutlined />} style={{ fontWeight: 600 }}>
                  Active
                </Tag>
              </div>

              <Row gutter={[12, 8]} className="mb-3">
                <Col span={8}>
                  <div style={{ background: '#fff', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Join Fees</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#1890ff' }}>
                      ₹{(programDetail.joinFees || 0).toLocaleString()}
                    </div>
                  </div>
                </Col>
                <Col span={8}>
                  <div style={{ background: '#fff', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Fixed Join Fees</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#722ed1' }}>
                      ₹{(programDetail.fixedJoinFees || 0).toLocaleString()}
                    </div>
                  </div>
                </Col>
                <Col span={8}>
                  <div style={{ background: '#fff', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Pay Amount/mo</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#52c41a' }}>
                      ₹{(programDetail.payAmount || 0).toLocaleString()}
                    </div>
                  </div>
                </Col>
              </Row>

              <div className="flex flex-wrap gap-3 text-sm text-gray-600 items-center">
                {programDetail.periodStartDate && (
                  <span>
                    <ClockCircleOutlined className="mr-1 text-gray-400" />
                    Period: <b>{programDetail.periodStartDate}</b> → <b>{programDetail.periodEndDate}</b>
                  </span>
                )}
                {showGroupSelect ? (
                  <Select
                    placeholder="Select Member Group"
                    style={{ width: 200 }}
                    value={selectedMemberGroup?.id || undefined}
                    onChange={handleMemberGroupChange}
                    options={groups.map(g => ({ label: g.groupName, value: g.id }))}
                  />
                ) : programDetail.memberGroupName ? (
                  <Tag color="cyan" icon={<TeamOutlined />}>{programDetail.memberGroupName}</Tag>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

export default ProgramSelection
