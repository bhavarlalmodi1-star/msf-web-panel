import React, { useState, useEffect } from 'react'
import {
  Button, Card, Space, Tag, Avatar, Badge, Tooltip, Row, Col,
  message, Modal, Drawer, Descriptions, Divider, Tabs, Timeline,
  Alert, Typography, Empty, Statistic, Progress, Spin
} from 'antd'
import {
  CheckCircleOutlined, CloseCircleOutlined,
  UserOutlined, PhoneOutlined, IdcardOutlined,
  FileTextOutlined, CalendarOutlined,
  MailOutlined, HomeOutlined, EnvironmentOutlined,
  SafetyCertificateOutlined, EyeOutlined,
  LeftOutlined, RightOutlined, ClockCircleOutlined,
  UserSwitchOutlined, FilePdfOutlined, DownloadOutlined,
  PercentageOutlined, WalletOutlined, TrophyOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useAuth } from '@/components/Base/AuthProvider'


const { Text, Title } = Typography

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmtDate     = (d) => d ? dayjs(d, 'DD-MM-YYYY').format('DD MMM YYYY') : 'N/A'
const fmtDateTime = (d) => d ? dayjs(d).format('DD MMM YYYY, hh:mm A')     : 'N/A'

const getProgramName = (member, programList) => {
  if (!member?.programId || !programList) return member?.programName || '—'
  return programList.find(p => p.id === member.programId)?.name || member.programName || '—'
}

// ─── Document section with info overlay ───────────────────────────────────────
const DocumentSection = ({ member }) => {
  const [activeIdx,     setActiveIdx]     = useState(0)
  const [sliderVisible, setSliderVisible] = useState(false)

  const docs = [
    { key: 'front',    title: 'Aadhaar Front',  url: member?.documentFrontURL,    icon: <IdcardOutlined />, color: '#faad14' },
    { key: 'back',     title: 'Aadhaar Back',   url: member?.documentBackURL,     icon: <IdcardOutlined />, color: '#fa8c16' },
    { key: 'photo',    title: 'Member Photo',   url: member?.photoURL,            icon: <UserOutlined />,   color: '#1890ff' },
    { key: 'guardian', title: 'Guardian Photo', url: member?.guardianPhotoURL,    icon: <SafetyCertificateOutlined />, color: '#52c41a' },
    { key: 'guardDoc', title: 'Guardian Doc',   url: member?.guardianDocumentURL, icon: <FileTextOutlined />, color: '#722ed1' },
  ].filter(d => d.url)

  const openSlider = (idx) => { setActiveIdx(idx); setSliderVisible(true) }

  // Info to overlay on the Aadhaar front card
  const aadhaarInfo = {
    name:    [member?.displayName, member?.fatherName, member?.surname].filter(Boolean).join(' '),
    dob:     fmtDate(member?.dobDate),
    aadhaar: member?.aadhaarNo,
    age:     member?.age ? `${member.age} years` : null,
  }

  return (
    <div>
      <Row gutter={[12, 12]}>
        {docs.map((d, i) => (
          <Col xs={24} sm={12} md={8} key={d.key}>
            <Card
              bodyStyle={{ padding: 0 }}
              className="overflow-hidden"
              style={{ border: `1px solid ${d.color}40`, borderRadius: 10 }}
            >
              {/* ── header ── */}
              <div className="flex items-center gap-2 px-3 py-2" style={{ background: `${d.color}12`, borderBottom: `1px solid ${d.color}30` }}>
                <span style={{ color: d.color }}>{d.icon}</span>
                <span className="font-semibold text-sm">{d.title}</span>
                <Button
                  type="link" size="small" className="ml-auto p-0"
                  icon={<EyeOutlined />}
                  onClick={() => window.open(d.url, '_blank')}
                >
                  Open
                </Button>
              </div>

              {/* ── image ── */}
              <div
                className="relative cursor-pointer group"
                style={{ height: 170, overflow: 'hidden', background: '#f5f5f5' }}
                onClick={() => openSlider(i)}
              >
                {d.url?.includes('.pdf') ? (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                    <FilePdfOutlined style={{ fontSize: 40, color: '#ff4d4f' }} />
                    <span className="text-sm text-gray-500">PDF Document</span>
                    <Button size="small" icon={<DownloadOutlined />} href={d.url} target="_blank">Download</Button>
                  </div>
                ) : (
                  <>
                    <img src={d.url} alt={d.title} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                    <div
                      className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background:'rgba(0,0,0,0.45)' }}
                    >
                      <span className="text-white font-medium flex items-center gap-1"><EyeOutlined /> Inspect</span>
                    </div>
                  </>
                )}
              </div>

              {/* ── info overlay for Aadhaar front ── */}
              {d.key === 'front' && (
                <div className="px-3 py-2 space-y-1 text-xs" style={{ background:'#fffbf0', borderTop:`1px solid ${d.color}30` }}>
                  <div className="font-semibold text-gray-700 mb-1 flex items-center gap-1">
                    <IdcardOutlined style={{ color: d.color }} /> Verify Against Document
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <div>
                      <span className="text-gray-500">Name:</span>
                      <div className="font-medium text-gray-800 truncate" title={aadhaarInfo.name}>{aadhaarInfo.name}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">DOB:</span>
                      <div className="font-medium text-gray-800">{aadhaarInfo.dob}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Aadhaar:</span>
                      <div className="font-medium text-gray-800 font-mono">{aadhaarInfo.aadhaar}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Age:</span>
                      <div className="font-medium text-gray-800">{aadhaarInfo.age}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── info for member photo ── */}
              {d.key === 'photo' && (
                <div className="px-3 py-2 text-xs" style={{ background:'#f0f9ff', borderTop:`1px solid ${d.color}30` }}>
                  <div className="font-semibold text-gray-700 mb-1">Member Details</div>
                  <div><span className="text-gray-500">Name: </span><span className="font-medium">{aadhaarInfo.name}</span></div>
                  <div><span className="text-gray-500">Phone: </span><span className="font-medium">{member?.phone}</span></div>
                </div>
              )}

              {/* ── info for guardian photo ── */}
              {d.key === 'guardian' && (
                <div className="px-3 py-2 text-xs" style={{ background:'#f6ffed', borderTop:`1px solid ${d.color}30` }}>
                  <div className="font-semibold text-gray-700 mb-1">Guardian Details</div>
                  <div><span className="text-gray-500">Name: </span><span className="font-medium">{member?.guardian}</span></div>
                  <div><span className="text-gray-500">Relation: </span><Tag color="cyan" style={{fontSize:10}}>{member?.guardianRelation}</Tag></div>
                </div>
              )}
            </Card>
          </Col>
        ))}
      </Row>

      {/* Image slider */}
      <Modal open={sliderVisible} footer={null} onCancel={() => setSliderVisible(false)} width={860} centered>
        <div className="flex items-center gap-4 mt-4">
          <Button icon={<LeftOutlined />} onClick={() => setActiveIdx(p => p > 0 ? p-1 : docs.length-1)} disabled={docs.length <= 1} />
          <div className="flex-1 flex items-center justify-center" style={{ minHeight: 400 }}>
            {docs[activeIdx]?.url?.includes('.pdf') ? (
              <div className="text-center">
                <FilePdfOutlined style={{ fontSize: 60, color:'#ff4d4f' }} />
                <div className="mt-2"><Button href={docs[activeIdx].url} target="_blank">Open PDF</Button></div>
              </div>
            ) : (
              <img src={docs[activeIdx]?.url} alt="" style={{ maxWidth:'100%', maxHeight:480, objectFit:'contain' }} />
            )}
          </div>
          <Button icon={<RightOutlined />} onClick={() => setActiveIdx(p => p < docs.length-1 ? p+1 : 0)} disabled={docs.length <= 1} />
        </div>
        <div className="text-center mt-3 text-gray-500">
          <span className="font-medium">{docs[activeIdx]?.title}</span> · {activeIdx+1}/{docs.length}
        </div>
        {/* Thumbnails */}
        <div className="flex gap-2 justify-center mt-3">
          {docs.map((d, i) => (
            <div
              key={d.key}
              onClick={() => setActiveIdx(i)}
              className="cursor-pointer rounded overflow-hidden transition-all"
              style={{ width: 54, height: 40, border: i === activeIdx ? '2px solid #1890ff' : '2px solid transparent', opacity: i === activeIdx ? 1 : 0.6 }}
            >
              <img src={d.url} alt={d.title} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}

// ─── Program detail card ──────────────────────────────────────────────────────
const ProgramDetailCard = ({ member, programList }) => {
  if (!member?.programId) return <Empty description="No program enrolled" image={Empty.PRESENTED_IMAGE_SIMPLE} />

  const pct      = member.paymentPercentage || 0
  const progName = getProgramName(member, programList)

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <Row gutter={16}>
        {[
          { title:'Join Fees',  value: member.joinFees    || 0, color:'#1890ff', icon:<WalletOutlined /> },
          { title:'Paid',       value: member.paidAmount  || 0, color:'#52c41a', icon:<CheckCircleOutlined /> },
          { title:'Pending',    value: member.pendingAmount || 0, color: (member.pendingAmount||0) > 0 ? '#ff4d4f' : '#52c41a', icon:<ClockCircleOutlined /> },
        ].map((s, i) => (
          <Col span={8} key={i}>
            <Card size="small">
              <Statistic title={s.title} value={s.value} prefix={<span style={{color:s.color}}>{s.icon}</span>} valueStyle={{color:s.color, fontSize:18}}
                formatter={v => `₹${Number(v).toLocaleString()}`} />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Program card */}
      <Card size="small" style={{ borderLeft:'4px solid #1890ff' }}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
            <TrophyOutlined style={{ color:'#1890ff', fontSize:18 }} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-bold text-base">{progName}</span>
              {member.ageGroupName && <Tag color="blue" style={{fontSize:11}}>{member.ageGroupName}</Tag>}
              <Tag color={pct===100?'green':pct>0?'orange':'red'} className="ml-auto">
                {pct===100?'FULLY PAID':pct>0?'PARTIAL':'PENDING'}
              </Tag>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600 mb-3">
              {member.periodStartDate && (
                <div><span className="font-medium text-gray-500">Period:</span> {member.periodStartDate} → {member.periodEndDate}</div>
              )}
              {member.memberGroupName && (
                <div><span className="font-medium text-gray-500">Group:</span> <Tag color="cyan">{member.memberGroupName}</Tag></div>
              )}
              <div><span className="font-medium text-gray-500">Join Date:</span> {member.dateJoin}</div>
              <div><span className="font-medium text-gray-500">Pay Amount:</span> ₹{member.payAmount || 0}/month</div>
            </div>

            <Progress
              percent={pct}
              strokeColor={pct===100?'#52c41a':pct>0?'#faad14':'#ff4d4f'}
              size="small"
            />
            <div className="flex gap-6 mt-2 text-sm">
              <span><Text type="secondary">Fees: </Text><Text strong>₹{(member.joinFees||0).toLocaleString()}</Text></span>
              <span><Text type="secondary">Paid: </Text><Text strong style={{color:'#52c41a'}}>₹{(member.paidAmount||0).toLocaleString()}</Text></span>
              <span><Text type="secondary">Due: </Text><Text strong style={{color:(member.pendingAmount||0)>0?'#ff4d4f':'#52c41a'}}>₹{(member.pendingAmount||0).toLocaleString()}</Text></span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ─── Main Drawer ──────────────────────────────────────────────────────────────
const ViewRequests = ({
  activeTab, open, setOpen, selectedMember, setSelectedMember,
  handleApproveMember, handleRejectMember,
  programList, getAgentName, agentList
}) => {
  if (!selectedMember) return null
  const { user }    = useAuth()
const isSuperAdmin =  user?.role === 'superadmin';
  const usersPermissions = user?.permissions || {};
  const progName = getProgramName(selectedMember, programList)
  const [aadhaarModalOpen, setAadhaarModalOpen] = useState(false)
  const [zoomFront, setZoomFront] = useState(100)
  const [zoomBack, setZoomBack] = useState(100)
  return (
    <>
    <Drawer
      title={
        <Space align="center">
          <Avatar icon={<UserOutlined />} src={selectedMember.photoURL} size={44} />
          <div>
            <Title level={5} style={{margin:0}}>
              {selectedMember.displayName} {selectedMember.fatherName} {selectedMember.surname}
            </Title>
            <Space size={4}>
              <Badge
                status={activeTab === 'pending' ? 'processing' : 'error'}
                text={<Text type="secondary">{activeTab === 'pending' ? 'Pending Approval' : 'Rejected'}</Text>}
              />
              <Divider type="vertical" />
              <Text type="secondary" copyable={{ text: selectedMember.registrationNumber }}>
                {selectedMember.registrationNumber}
              </Text>
            </Space>
          </div>
        </Space>
      }
      placement="right" width={1000}
      onClose={() => { setOpen(false); setSelectedMember(null) }}
      open={open}
      extra={
        activeTab === 'pending' ? (
          <Space>
        {(isSuperAdmin || usersPermissions?.actions?.reject) && (
    <Button
      danger
      icon={<CloseCircleOutlined />}
      onClick={() => handleRejectMember(selectedMember)}
    >
      Reject
    </Button>
  )}

  {/* ✅ APPROVE */}
  {(isSuperAdmin || usersPermissions?.actions?.approve) && (
    <Button
      type="primary"
      icon={<CheckCircleOutlined />}
      style={{ background: '#52c41a', borderColor: '#52c41a' }}
      onClick={() => handleApproveMember(selectedMember)}
    >
      Approve
    </Button>
  )}
          </Space>
        ) : null
      }
    >
      <Tabs
        defaultActiveKey="details"
        items={[
          {
            key: 'details',
            label: <span><UserOutlined className="mr-1" />Personal</span>,
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Card title={<span style={{ fontSize: 16 }}><UserOutlined className="mr-2" />Basic Information</span>}>
                      <Descriptions column={2} bordered>
                        <Descriptions.Item label={<b>Full Name</b>} span={2}>
                          <span style={{ fontSize: 15, fontWeight: 600 }}>{selectedMember.displayName} {selectedMember.fatherName} {selectedMember.surname}</span>
                        </Descriptions.Item>
                        <Descriptions.Item label={<b>Phone</b>}>
                          <PhoneOutlined className="mr-1" /><span style={{ fontSize: 14 }}>{selectedMember.phone}</span>
                          {selectedMember.phoneAlt && <span className="text-gray-500 ml-2">/ {selectedMember.phoneAlt}</span>}
                        </Descriptions.Item>
                        <Descriptions.Item label={<b>Email</b>}>
                          <MailOutlined className="mr-1" /><span style={{ fontSize: 14 }}>{selectedMember.email || 'N/A'}</span>
                        </Descriptions.Item>
                        <Descriptions.Item label={<b>Date of Birth</b>}>
                          <CalendarOutlined className="mr-1" /><span style={{ fontSize: 14 }}>{fmtDate(selectedMember.dobDate)} (Age: {selectedMember.age})</span>
                        </Descriptions.Item>
                        <Descriptions.Item label={<b>Aadhaar</b>}>
                          <IdcardOutlined className="mr-1" /><span style={{ fontSize: 14 }} className="font-mono">{selectedMember.aadhaarNo}</span>
                          {selectedMember.documentFrontURL && (
                            <Button type="link" size="small" icon={<IdcardOutlined />} onClick={() => setAadhaarModalOpen(true)} style={{ marginLeft: 8 }}>
                              Verify Card
                            </Button>
                          )}
                        </Descriptions.Item>
                        <Descriptions.Item label={<b>Caste</b>}>
                          <Tag color="purple" style={{ fontSize: 13 }}>{selectedMember.caste || 'N/A'}</Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label={<b>Age Group</b>}>
                          <Tag color="blue" style={{ fontSize: 13 }}>{selectedMember.ageGroup?.toUpperCase() || 'N/A'}</Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label={<b>Agent</b>} span={2}>
                          <UserSwitchOutlined className="mr-1" style={{ color: '#1890ff' }} />
                          <span style={{ fontSize: 14 }}>{getAgentName(selectedMember.agentId, agentList)}</span>
                        </Descriptions.Item>
                      </Descriptions>
                    </Card>

                    <Card title={<span style={{ fontSize: 16 }}><EnvironmentOutlined className="mr-2" />Address</span>}>
                      <Descriptions column={2} bordered>
                        <Descriptions.Item label={<b>Address</b>} span={2}>
                          <span style={{ fontSize: 14 }}>{selectedMember.currentAddress}</span>
                        </Descriptions.Item>
                        <Descriptions.Item label={<b>Village</b>}><span style={{ fontSize: 14 }}>{selectedMember.village || 'N/A'}</span></Descriptions.Item>
                        <Descriptions.Item label={<b>City</b>}><span style={{ fontSize: 14 }}>{selectedMember.city}</span></Descriptions.Item>
                        <Descriptions.Item label={<b>District</b>}><span style={{ fontSize: 14 }}>{selectedMember.district}</span></Descriptions.Item>
                        <Descriptions.Item label={<b>State</b>}><span style={{ fontSize: 14 }}>{selectedMember.state}</span></Descriptions.Item>
                        <Descriptions.Item label={<b>PIN</b>}><span style={{ fontSize: 14 }}>{selectedMember.pinCode}</span></Descriptions.Item>
                      </Descriptions>
                    </Card>

                    <Card title={<span style={{ fontSize: 16 }}><SafetyCertificateOutlined className="mr-2" />Guardian Information</span>}>
                      <Descriptions column={2} bordered>
                        <Descriptions.Item label={<b>Guardian Name</b>} span={2}>
                          <span style={{ fontSize: 15, fontWeight: 600 }}>{selectedMember.guardian}</span>
                        </Descriptions.Item>
                        <Descriptions.Item label={<b>Relation</b>}>
                          <Tag color="cyan" style={{ fontSize: 13 }}>{selectedMember.guardianRelation}</Tag>
                        </Descriptions.Item>
                      </Descriptions>
                    </Card>
                  </div>
            )
          },
          {
            key: 'program',
            label: <span><TrophyOutlined className="mr-1" />Program</span>,
            children: (
              <div className="mt-2">
                <ProgramDetailCard member={selectedMember} programList={programList} />
              </div>
            )
          },
          {
            key: 'documents',
            label: <span><FileTextOutlined className="mr-1" />Documents</span>,
            children: (
              <div className="mt-2">
                <Alert
                  message="Document Verification"
                  description="Compare the information below each document with what is visible in the image before approving."
                  type="info" showIcon className="mb-4"
                />
                <DocumentSection member={selectedMember} />
              </div>
            )
          },
          {
            key: 'history',
            label: <span><ClockCircleOutlined className="mr-1" />History</span>,
            children: (
              <Card title="Request Timeline" size="small" className="mt-2">
                <Timeline mode="left" items={[
                  {
                    dot: <UserSwitchOutlined style={{color:'#1890ff'}} />, color: 'blue',
                    children: (
                      <div>
                        <Text strong>Request Created</Text><br />
                        <Text type="secondary">By: {selectedMember.requestedByName} ({selectedMember.requestedByEmail})</Text><br />
                        <Text type="secondary">{fmtDateTime(selectedMember.requestedAt)}</Text>
                      </div>
                    )
                  },
                  ...(selectedMember.agentId ? [{
                    dot: <UserOutlined style={{color:'#52c41a'}} />, color: 'green',
                    children: (
                      <div>
                        <Text strong>Submitted by Agent</Text><br />
                        <Text type="secondary">{getAgentName(selectedMember.agentId, agentList)}</Text>
                      </div>
                    )
                  }] : []),
                  ...(selectedMember.status === 'rejected' ? [{
                    dot: <CloseCircleOutlined style={{color:'#ff4d4f'}} />, color: 'red',
                    children: (
                      <div>
                        <Text strong type="danger">Rejected</Text><br />
                        <Text type="secondary">By: {selectedMember.rejectedByName || 'Unknown'}</Text><br />
                        <Text type="secondary">{fmtDateTime(selectedMember.rejectedAt)}</Text>
                        {selectedMember.rejectionReason && (
                          <Alert message="Reason" description={selectedMember.rejectionReason} type="error" showIcon className="mt-2" />
                        )}
                      </div>
                    )
                  }] : [])
                ]} />
              </Card>
            )
          }
        ]}
      />
    </Drawer>

      {/* ── Aadhaar Verify Modal ─────────────────────────────────────────── */}
      <Modal
        title={<span style={{ fontSize: 18 }}><IdcardOutlined style={{ color: '#faad14', marginRight: 10 }} />Aadhaar Card Verification</span>}
        open={aadhaarModalOpen}
        onCancel={() => setAadhaarModalOpen(false)}
        footer={null}
        width={800}
        centered
      >
        <Row gutter={24}>
          <Col xs={24} md={10}>
            <Card size="small" style={{ height: '100%' }}>
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label={<b>Name</b>}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{selectedMember.displayName} {selectedMember.fatherName} {selectedMember.surname}</span>
                </Descriptions.Item>
                <Descriptions.Item label={<b>DOB</b>}>
                  <span style={{ fontSize: 15 }}>{fmtDate(selectedMember.dobDate)}</span>
                </Descriptions.Item>
                <Descriptions.Item label={<b>Aadhaar No</b>}>
                  <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: 2 }} className="font-mono">{selectedMember.aadhaarNo}</span>
                </Descriptions.Item>
                <Descriptions.Item label={<b>Father's Name</b>}>
                  <span style={{ fontSize: 15 }}>{selectedMember.fatherName || '—'}</span>
                </Descriptions.Item>
                <Descriptions.Item label={<b>Gender</b>}>
                  <span style={{ fontSize: 15 }}>{selectedMember.gender || 'N/A'}</span>
                </Descriptions.Item>
                <Descriptions.Item label={<b>Phone</b>}>
                  <span style={{ fontSize: 15 }}>{selectedMember.phone}</span>
                </Descriptions.Item>
                <Descriptions.Item label={<b>Address</b>}>
                  <span style={{ fontSize: 14 }}>{selectedMember.currentAddress}, {selectedMember.village}, {selectedMember.city}, {selectedMember.district}, {selectedMember.state} - {selectedMember.pinCode}</span>
                </Descriptions.Item>
                <Descriptions.Item label={<b>Registration</b>}>
                  <span style={{ fontSize: 14 }}>{selectedMember.registrationNumber}</span>
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>
          <Col xs={24} md={14}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {selectedMember.documentFrontURL && (
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 14, color: '#faad14' }}>Aadhaar Card (Front)</div>
                  <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 8, background: '#fafafa', textAlign: 'center', overflow: 'auto', maxHeight: 420 }}>
                    <img
                      src={selectedMember.documentFrontURL}
                      alt="Aadhaar Front"
                      style={{ transform: `scale(${zoomFront / 100})`, transformOrigin: 'top left', transition: 'transform 0.15s', maxWidth: '100%', display: 'block' }}
                    />
                  </div>
                  <ZoomControls zoom={zoomFront} onZoomIn={() => setZoomFront(p => Math.min(300, p + 25))} onZoomOut={() => setZoomFront(p => Math.max(50, p - 25))} onReset={() => setZoomFront(100)} />
                </div>
              )}
              {selectedMember.documentBackURL && (
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 14, color: '#fa8c16' }}>Aadhaar Card (Back)</div>
                  <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 8, background: '#fafafa', textAlign: 'center', overflow: 'auto', maxHeight: 420 }}>
                    <img
                      src={selectedMember.documentBackURL}
                      alt="Aadhaar Back"
                      style={{ transform: `scale(${zoomBack / 100})`, transformOrigin: 'top left', transition: 'transform 0.15s', maxWidth: '100%', display: 'block' }}
                    />
                  </div>
                  <ZoomControls zoom={zoomBack} onZoomIn={() => setZoomBack(p => Math.min(300, p + 25))} onZoomOut={() => setZoomBack(p => Math.max(50, p - 25))} onReset={() => setZoomBack(100)} />
                </div>
              )}
            </div>
          </Col>
        </Row>
      </Modal>
    </>
  )
}

export default ViewRequests

const ZoomControls = ({ zoom, onZoomIn, onZoomOut, onReset }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 6 }}>
    <Button size="small" onClick={onZoomOut} disabled={zoom <= 50}>−</Button>
    <span style={{ fontSize: 12, minWidth: 50, textAlign: 'center', fontWeight: 600 }}>{zoom}%</span>
    <Button size="small" onClick={onZoomIn} disabled={zoom >= 300}>+</Button>
    {zoom !== 100 && <Button size="small" type="text" onClick={onReset} style={{ fontSize: 11 }}>Reset</Button>}
  </div>
)