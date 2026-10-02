"use client";
import React, { useState, useEffect } from 'react';
import { 
  Table, 
  Card, 
  Row, 
  Col, 
  Tag, 
  Button, 
  Modal, 
  Form, 
  Input, 
  Select, 
  InputNumber, 
  DatePicker, 
  Space, 
  Popconfirm, 
  message, 
  Drawer,
  Typography,
  Divider,
  Statistic,
  Badge,
  Tooltip,
  Radio
} from 'antd';
import { 
  EyeOutlined, 
  EditOutlined, 
  DeleteOutlined, 
  PlusOutlined,
  CalendarOutlined,
  UserOutlined,
  MoneyCollectOutlined,
  SaveOutlined,
  CloseOutlined
} from '@ant-design/icons';
import { 
  collection, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp 
} from 'firebase/firestore';

import dayjs from 'dayjs';
import { db } from '../../../../lib/firbase-client';
import Router from 'next/router';
import { useRouter } from 'next/navigation';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const ProgramsViewPage = () => {
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [editingProgram, setEditingProgram] = useState(null);
  const [selectedProgram, setSelectedProgram] = useState(null);
     const [programType, setProgramType] = useState('other');
  
      const [certificateRule, setCertificateRule] = useState('');
  
  const [form] = Form.useForm();
  const [ageGroups, setAgeGroups] = useState([]);
  const [memberGroups, setMemberGroups] = useState([]);
  const [editMode, setEditMode] = useState(false);

  // Registration numbers are random 5-digit values, so only the prefix matters
  const watchPrefix = Form.useWatch('regNoPrefix', form);
const router=useRouter()
  // Firebase collection reference
  const programsCollectionRef = collection(db, 'programs');

  // Fetch programs
  const fetchPrograms = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(programsCollectionRef);
      const programsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Sort by orderNo (ascending), fallback to creation date
      programsData.sort((a, b) => {
        const aOrder = a.orderNo ?? 9999;
        const bOrder = b.orderNo ?? 9999;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return (b.created_at?.toDate() || 0) - (a.created_at?.toDate() || 0);
      });
      setPrograms(programsData);
    } catch (error) {
      console.error('Error fetching programs:', error);
      message.error('Failed to fetch programs');
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchPrograms();
  }, []);

  // View program details
  const viewProgram = (program) => {
    setSelectedProgram(program);
    setDrawerVisible(true);
    setEditMode(false);
  };

  // Edit program
  const editProgram = (program) => {
    setSelectedProgram(program);
    setEditingProgram(program);
    setAgeGroups(program.ageGroups || []);
    setMemberGroups(program.memberGroups || []);
    setCertificateRule(program.certificateRule || '')
    setProgramType(program.programType || 'other')
    setDrawerVisible(true);
    setEditMode(true);
    
    form.setFieldsValue({
      name: program.name,
      hindiName: program.hindiName,
      description: program.description,
      regNoPrefix: program.regNoPrefix || 'MEM',
      orderNo: program.orderNo ?? null,
    });
  };

  // Delete program
  const deleteProgram = async (id) => {
    try {
      await deleteDoc(doc(db, 'programs', id));
      message.success('Program deleted successfully!');
      fetchPrograms();
    } catch (error) {
      console.error('Error deleting program:', error);
      message.error('Failed to delete program');
    }
  };

  // Handle form submission for edit
  const handleEditSubmit = async (values) => {
    try {
      setLoading(true);

      const rawPrefix = (values.regNoPrefix || 'MEM').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const regNoPrefix = rawPrefix || 'MEM';

      const programData = {
        ...values,
        regNoPrefix,
        programType:programType,
        certificateRule:certificateRule,
        ageGroups: ageGroups,
        memberGroups: memberGroups,
        updated_at: serverTimestamp()
      };

      const programRef = doc(db, 'programs', editingProgram.id);
      await updateDoc(programRef, programData);
      
      message.success('Program updated successfully!');
      setDrawerVisible(false);
      setEditMode(false);
      fetchPrograms();
    } catch (error) {
      console.error('Error updating program:', error);
      message.error('Failed to update program');
    } finally {
      setLoading(false);
    }
  };

  // Age group functions
  const addAgeGroup = () => {
    const newAgeGroup = {
      id: Date.now(),
      ageGroupName: '',
      startAge: '',
      endAge: '',
      periods: [{
        id: Date.now() + 1,
        startDate: '',
        endDate: '',
        fixedJoinFees:0,
        joinFees: 0,
        payAmount: 0
      }]
    };
    setAgeGroups([...ageGroups, newAgeGroup]);
  };

  const updateAgeGroup = (id, field, value) => {
    setAgeGroups(ageGroups.map(group => 
      group.id === id ? { ...group, [field]: value } : group
    ));
  };

  const addPeriod = (ageGroupId) => {
    setAgeGroups(ageGroups.map(group => 
      group.id === ageGroupId 
        ? { 
            ...group, 
            periods: [...group.periods, {
              id: Date.now(),
              startDate: '',
              endDate: '',
              joinFees: 0,
              fixedJoinFees:0,
              payAmount: 0
            }]
          } 
        : group
    ));
  };

  const updatePeriod = (ageGroupId, periodId, field, value) => {
    setAgeGroups(ageGroups.map(group => 
      group.id === ageGroupId 
        ? { 
            ...group, 
            periods: group.periods.map(period => 
              period.id === periodId ? { ...period, [field]: value } : period
            )
          } 
        : group
    ));
  };

  const removePeriod = (ageGroupId, periodId) => {
    setAgeGroups(ageGroups.map(group => 
      group.id === ageGroupId 
        ? { 
            ...group, 
            periods: group.periods.filter(period => period.id !== periodId)
          } 
        : group
    ));
  };

  const removeAgeGroup = (id) => {
    setAgeGroups(ageGroups.filter(group => group.id !== id));
  };

  // Member group functions
  const addMemberGroup = () => {
    const newMemberGroup = {
      id: 'GRP_' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      groupName: '',
      code: ''
    };
    setMemberGroups([...memberGroups, newMemberGroup]);
  };

  const updateMemberGroup = (id, field, value) => {
    setMemberGroups(memberGroups.map(group => 
      group.id === id ? { ...group, [field]: value } : group
    ));
  };

  const removeMemberGroup = (id) => {
    setMemberGroups(memberGroups.filter(group => group.id !== id));
  };

  // Main table columns
  const columns = [
    {
      title: '#',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 60,
      align: 'center',
      render: (val) => val != null
        ? <Tag color="purple" style={{ fontWeight: 700, minWidth: 28, textAlign: 'center' }}>{val}</Tag>
        : <span className="text-gray-300">—</span>,
    },
    {
      title: 'Program Name',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (text, record) => (
        <div>
          <div className="font-semibold text-gray-800">{text}</div>
          <div className="text-sm text-gray-500">{record.hindiName}</div>
        </div>
      ),
    },
    {
      title: 'Age Groups',
      dataIndex: 'ageGroups',
      key: 'ageGroups',
      width: 150,
      render: (groups) => (
        <div>
          {groups?.length > 0 ? (
            <Space wrap>
              {groups.map((group, index) => (
                <Tag key={index} color="blue">
                  {group.ageGroupName} ({group.startAge}-{group.endAge})
                </Tag>
              ))}
            </Space>
          ) : (
            <span className="text-gray-400">No age groups</span>
          )}
        </div>
      ),
    },
    {
      title: 'Member Groups',
      dataIndex: 'memberGroups',
      key: 'memberGroups',
      width: 150,
      render: (groups) => (
        <div>
          {groups?.length > 0 ? (
            <Space wrap>
              {groups.map((group, index) => (
                <Tag key={index} color="green">
                  {group.code}
                </Tag>
              ))}
            </Space>
          ) : (
            <span className="text-gray-400">No groups</span>
          )}
        </div>
      ),
    },
    {
      title: 'Total Periods',
      key: 'periods',
      width: 120,
      render: (_, record) => {
        const totalPeriods = record.ageGroups?.reduce((sum, group) => sum + (group.periods?.length || 0), 0) || 0;
        return (
          <Statistic
            value={totalPeriods}
            prefix={<CalendarOutlined />}
            valueStyle={{ fontSize: '16px', color: '#3b82f6' }}
          />
        );
      },
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 120,
      render: (timestamp) => {
        if (!timestamp) return 'N/A';
        const date = timestamp.toDate();
        return (
          <div className="text-sm">
            <div>{date.toLocaleDateString('en-IN')}</div>
            <div className="text-gray-500">{date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="View Details">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => viewProgram(record)}
              className="text-blue-600 hover:text-blue-800"
            />
          </Tooltip>
          
          <Tooltip title="Edit Program">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => editProgram(record)}
              className="text-amber-600 hover:text-amber-800"
            />
          </Tooltip>
          
       
        </Space>
      ),
    },
  ];

  // Render age groups in view mode
  const renderAgeGroups = (groups) => {
    if (!groups || groups.length === 0) {
      return <div className="text-gray-400 text-center py-4">No age groups defined</div>;
    }

    return groups.map((group, index) => (
      <Card key={index} className="mb-4 shadow-sm">
        <div className="flex justify-between items-start mb-3">
          <div>
            <Title level={5} className="mb-1">
              {group.ageGroupName || 'Unnamed Group'}
              <span className="text-gray-500 ml-2">
                ({group.startAge || 0} - {group.endAge || 0} years)
              </span>
            </Title>
          </div>
        </div>

        {group.periods && group.periods.length > 0 ? (
          <Table
            dataSource={group.periods}
            rowKey="id"
            pagination={false}
            size="small"
            className="mt-2"
            columns={[
              {
                title: 'Period',
                key: 'period',
                width: 200,
                render: (_, period) => (
                  <div className="flex items-center">
                    <CalendarOutlined className="text-gray-400 mr-2" />
                    <span>{period.startDate || '--'} to {period.endDate || '--'}</span>
                  </div>
                ),
              },
              {
                title: 'Registration Fees',
                key: 'joinFees',
                width: 150,
                render: (_, period) => (
                  <div className="flex items-center">
                    <MoneyCollectOutlined className="text-green-500 mr-2" />
                    <span className="font-semibold">₹{period.joinFees || 0}</span>
                  </div>
                ),
              },
              {
                title: 'Monthly Payment',
                key: 'payAmount',
                width: 150,
                render: (_, period) => (
                  <div className="flex items-center">
                    <MoneyCollectOutlined className="text-blue-500 mr-2" />
                    <span className="font-semibold">₹{period.payAmount || 0}</span>
                  </div>
                ),
              },
            ]}
          />
        ) : (
          <div className="text-gray-400 text-center py-2">No periods defined</div>
        )}
      </Card>
    ));
  };

  // Render member groups in view mode
  const renderMemberGroups = (groups) => {
    if (!groups || groups.length === 0) {
      return <div className="text-gray-400 text-center py-4">No member groups defined</div>;
    }

    return (
      <Row gutter={[16, 16]}>
        {groups.map((group, index) => (
          <Col key={index} xs={24} sm={12} md={8}>
            <Card className="shadow-sm">
              <div className="flex items-center mb-2">
                <Badge count={group.code} style={{ backgroundColor: '#6366f1' }} />
                <div className="ml-3">
                  <div className="font-semibold">{group.groupName || 'Unnamed Group'}</div>
                  <div className="text-xs text-gray-500 font-mono">{group.id}</div>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    );
  };

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex justify-between items-center">
            <div>
              <Title level={2} className="text-gray-800 mb-2">
                Yojna Management
              </Title>
              <Text className="text-gray-600">
                View, edit, and manage all Yojna and their configurations
              </Text>
            </div>
            
            <Button
              type="primary"
              icon={<PlusOutlined />}
              size="large"
              className="bg-gradient-to-r from-rose-600 to-orange-600 hover:shadow-lg"
               // Adjust path as needed
               onClick={()=>{
            router.push("/programs/yojnas/add-yojna")
               }}
            >
              Add New Yojna
            </Button>
          </div>
        </div>

     

        {/* Programs Table */}
        <Card className="shadow-md">
          <div className="mb-4">
            <Title level={4} className="text-gray-800">
              All Yojna
              <span className="text-gray-500 text-sm font-normal ml-2">
                ({programs.length} Yojna)
              </span>
            </Title>
          </div>
          
          <Table
            columns={columns}
            dataSource={programs}
            rowKey="id"
            loading={loading}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showTotal: (total) => `${total} programs`,
            }}
            scroll={{ x: 800 }}
            className="border border-purple-200 rounded-lg"
          />
        </Card>

        {/* Program Details Drawer */}
        <Drawer
          title={
            <div className="flex justify-between items-center">
              <div>
                <Title level={4} className="mb-0">
                  {editMode ? 'Edit Program' : 'Program Details'}
                </Title>
                <Text className="text-gray-500 text-sm">
                  {editMode ? 'Update program information' : 'View complete program details'}
                </Text>
              </div>
              {!editMode && (
                <Button
                  type="primary"
                  icon={<EditOutlined />}
                  onClick={() => editProgram(selectedProgram)}
                  className="bg-gradient-to-r from-amber-600 to-orange-600"
                >
                  Edit
                </Button>
              )}
            </div>
          }
          // Wide enough for the age-group / period tables to breathe, but capped
          // as a viewport percentage so it never overflows on smaller laptops.
          size={1000}
          open={drawerVisible}
          destroyOnHidden
          onClose={() => {
            setDrawerVisible(false);
            setEditMode(false);
            setEditingProgram(null);
            form.resetFields();
          }}
          styles={{
            header: { borderBottom: '1px solid #e5e7eb', padding: '18px 28px', background: '#fafafa' },
            body:   { padding: '24px 28px', background: '#f7f8fa' },
            footer: { padding: '12px 28px', borderTop: '1px solid #e5e7eb', background: '#fff' },
          }}
          // Actions pinned to a footer so Save is always reachable without
          // scrolling past every age group and period
          footer={
            editMode ? (
              <div className="flex justify-between items-center gap-3">
                <Text type="secondary" className="text-xs">
                  {editingProgram?.name ? `Editing “${editingProgram.name}”` : ''}
                </Text>
                <div className="flex gap-3">
                  <Button onClick={() => setEditMode(false)}>Cancel</Button>
                  <Button
                    type="primary"
                    loading={loading}
                    icon={<SaveOutlined />}
                    onClick={() => form.submit()}
                    className="bg-gradient-to-r from-rose-600 to-orange-600"
                  >
                    Update Program
                  </Button>
                </div>
              </div>
            ) : null
          }
          extra={
            <Button
              icon={<CloseOutlined />}
              onClick={() => setDrawerVisible(false)}
            />
          }
        >
          {editMode ? (
            // Edit Mode
            <Form
              form={form}
              layout="vertical"
              onFinish={handleEditSubmit}
              className="space-y-6"
            >
              <Card title="Basic Information" className="shadow-sm">
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item
                      name="name"
                      label="Program Name (English)"
                      rules={[{ required: true, message: 'Required' }]}
                    >
                      <Input placeholder="Program name in English" />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item
                      name="hindiName"
                      label="Program Name (Hindi)"
                      rules={[{ required: true, message: 'Required' }]}
                    >
                      <Input placeholder="Program name in Hindi" />
                    </Form.Item>
                  </Col>
                  <Col span={3}>
                    <Form.Item
                      name="regNoPrefix"
                      label="Reg. Prefix"
                      rules={[
                        { required: true, message: 'Required' },
                        {
                          validator(_, value) {
                            if (!value) return Promise.resolve();
                            const clean = value.replace(/[^A-Z0-9]/gi, '');
                            if (clean.length >= 1 && clean.length <= 8) return Promise.resolve();
                            return Promise.reject(new Error('1–8 letters/digits'));
                          }
                        }
                      ]}
                    >
                      <Input
                        placeholder="MEM"
                        maxLength={8}
                        className="uppercase font-mono"
                        onChange={e => form.setFieldValue('regNoPrefix', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={5}>
                    <Form.Item
                      name="orderNo"
                      label="Order No"
                      tooltip="Display order in table (1 = first)"
                    >
                      <InputNumber
                        placeholder="1"
                        min={1}
                        className="w-full"
                        style={{ width: '100%' }}
                      />
                    </Form.Item>
                  </Col>
                </Row>

                {/* Format reminder — numbers are random, not sequential */}
                <div className="-mt-2 mb-3 flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500">Members will get numbers like:</span>
                  <span className="font-mono font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded px-2 py-0.5 text-sm">
                    {((watchPrefix || 'MEM').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'MEM')}54821
                  </span>
                  <span className="text-xs text-gray-400">(prefix + random 5 digits)</span>
                </div>
                  <Form.Item
              label="Yojna Type"
              required
            >
              <Radio.Group
                value={programType}
                onChange={(e) => setProgramType(e.target.value)}
                buttonStyle="solid"
                className="w-full"
              >
                <Row gutter={16}>
                  <Col span={6}>
                    <Radio.Button 
                      value="sadi" 
                      className="w-full text-center py-2"
                      style={{ 
                        backgroundColor: programType === 'sadi' ? 'var(--primary)' : 'white',
                        color: programType === 'sadi' ? 'white' : 'inherit'
                      }}
                    >
                      सादी
                    </Radio.Button>
                  </Col>
                  <Col span={6}>
                    <Radio.Button 
                      value="mamera" 
                      className="w-full text-center py-2"
                      style={{ 
                        backgroundColor: programType === 'mamera' ? 'var(--primary)' : 'white',
                        color: programType === 'mamera' ? 'white' : 'inherit'
                      }}
                    >
                      मामेरा
                    </Radio.Button>
                  </Col>
                  <Col span={6}>
                    <Radio.Button 
                      value="surkhsa" 
                      className="w-full text-center py-2"
                      style={{ 
                        backgroundColor: programType === 'surkhsa' ? 'var(--primary)' : 'white',
                        color: programType === 'surkhsa' ? 'white' : 'inherit'
                      }}
                    >
                      सुरक्षा
                    </Radio.Button>
                  </Col>
                  <Col span={6}>
                    <Radio.Button 
                      value="other" 
                      className="w-full text-center py-2"
                      style={{ 
                        backgroundColor: programType === 'other' ? 'var(--primary)' : 'white',
                        color: programType === 'other' ? 'white' : 'inherit'
                      }}
                    >
                      अन्य
                    </Radio.Button>
                  </Col>
                </Row>
              </Radio.Group>
            </Form.Item>
                <Form.Item
                  name="description"
                  label="Description"
                  rules={[{ required: true, message: 'Required' }]}
                >
                  <TextArea rows={3} placeholder="Program description" />
                </Form.Item>
                  <Form.Item
                              label={
                                <span>
                                  योजना नियम / Certificate Rule Line
                                </span>
                              }
                            >
                              <TextArea
                                value={certificateRule}
                                onChange={(e) => setCertificateRule(e.target.value)}
                                placeholder="e.g., यह प्रमाणपत्र जारी करने वाली संस्था की तरफ से दिया गया है..."
                                rows={2}
                                size="large"
                                maxLength={250}
                                showCount
                                className="hover:border-rose-300"
                              />
                            </Form.Item>
              </Card>

              <Card 
                title={
                  <div className="flex justify-between items-center">
                    <span>Age Groups</span>
                    <Button type="dashed" icon={<PlusOutlined />} onClick={addAgeGroup}>
                      Add Age Group
                    </Button>
                  </div>
                }
                className="shadow-sm"
              >
                {ageGroups.map((group, index) => (
                  <Card key={group.id} className="mb-3" size="small">
                    <div className="flex gap-3 mb-3">
                      <div className="flex-1">
                        <div className="text-xs text-gray-500 mb-1">Age Group Name</div>
                        <Input
                          value={group.ageGroupName}
                          onChange={(e) => updateAgeGroup(group.id, 'ageGroupName', e.target.value)}
                          placeholder="e.g., Youth"
                          size="small"
                        />
                      </div>
                      <div className="w-24">
                        <div className="text-xs text-gray-500 mb-1">Start Age</div>
                        <InputNumber
                          value={group.startAge}
                          onChange={(value) => updateAgeGroup(group.id, 'startAge', value)}
                          placeholder="From"
                          size="small"
                          className="w-full"
                          min={0}
                        />
                      </div>
                      <div className="w-24">
                        <div className="text-xs text-gray-500 mb-1">End Age</div>
                        <InputNumber
                          value={group.endAge}
                          onChange={(value) => updateAgeGroup(group.id, 'endAge', value)}
                          placeholder="To"
                          size="small"
                          className="w-full"
                          min={0}
                        />
                      </div>
                      <div className="pt-6">
                        <Popconfirm
                          title="Remove this age group?"
                          onConfirm={() => removeAgeGroup(group.id)}
                        >
                          <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                        </Popconfirm>
                      </div>
                    </div>

                    {/* Periods */}
                    <div className="space-y-2">
                      {group.periods.map((period) => (
                        <div key={period.id} className="p-2 border rounded bg-gray-50">
                          <div className="flex gap-2 items-center mb-2">
                            <div className="flex-1">
                              <div className="text-xs text-gray-500 mb-1">Date Range</div>
                              <div className="flex gap-2">
                                <DatePicker
                                  placeholder="Start Date"
                                  format="DD-MM-YYYY"
                                  value={period.startDate ? dayjs(period.startDate, 'DD-MM-YYYY') : null}
                                  onChange={(date) => updatePeriod(group.id, period.id, 'startDate', date ? date.format('DD-MM-YYYY') : '')}
                                  className="w-32"
                                  size="small"
                                />
                                <span className="text-gray-400">to</span>
                                <DatePicker
                                  placeholder="End Date"
                                  format="DD-MM-YYYY"
                                  value={period.endDate ? dayjs(period.endDate, 'DD-MM-YYYY') : null}
                                  onChange={(date) => updatePeriod(group.id, period.id, 'endDate', date ? date.format('DD-MM-YYYY') : '')}
                                  className="w-32"
                                  size="small"
                                />
                              </div>
                            </div>
                            {group.periods.length > 1 && (
                              <Button
                                type="text"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() => removePeriod(group.id, period.id)}
                                size="small"
                              />
                            )}
                          </div>
                         <Row gutter={16}>
                                      <Col span={8}>
                                        <div className="text-xs text-gray-500 mb-1">On Joining Fees</div>
                                        <InputNumber
                                          placeholder="e.g., 1100"
                                          value={period.joinFees}
                                          onChange={(value) => updatePeriod(group.id, period.id, 'joinFees', value)}
                                          className="w-full"
                                          min={0}
                                          size="small"
                                          addonBefore="₹"
                                        />
                                      </Col>
                                            <Col span={8}>
                                        <div className="text-xs text-gray-500 mb-1">Fixed Join Fees</div>
                                        <InputNumber
                                          placeholder="e.g., 1100"
                                          value={period.fixedJoinFees}
                                          onChange={(value) => updatePeriod(group.id, period.id, 'fixedJoinFees', value)}
                                          className="w-full"
                                          min={0}
                                          size="small"
                                          addonBefore="₹"
                                        />
                                        
                                      </Col>
                                      <Col span={8}>
                                        <div className="text-xs text-gray-500 mb-1">Donation Payment</div>
                                        <InputNumber
                                          placeholder="e.g., 200"
                                          value={period.payAmount}
                                          onChange={(value) => updatePeriod(group.id, period.id, 'payAmount', value)}
                                          className="w-full"
                                          min={0}
                                          size="small"
                                          addonBefore="₹"
                                        />
                                      </Col>
                                    </Row>
                        </div>
                      ))}
                      <Button
                        type="dashed"
                        onClick={() => addPeriod(group.id)}
                        icon={<PlusOutlined />}
                        size="small"
                        block
                      >
                        Add Period
                      </Button>
                    </div>
                  </Card>
                ))}
              </Card>

              <Card 
                title={
                  <div className="flex justify-between items-center">
                    <span>Member Groups</span>
                    <Button type="dashed" icon={<PlusOutlined />} onClick={addMemberGroup}>
                      Add Group
                    </Button>
                  </div>
                }
                className="shadow-sm"
              >
                {memberGroups.map((group) => (
                  <div key={group.id} className="flex gap-3 items-center mb-3 p-3 border rounded">
                    <div className="flex-1">
                      <div className="text-xs text-gray-500 mb-1">Group Name</div>
                      <Input
                        value={group.groupName}
                        onChange={(e) => updateMemberGroup(group.id, 'groupName', e.target.value)}
                        placeholder="e.g., Family Group"
                        size="small"
                      />
                    </div>
                    <div className="w-32">
                      <div className="text-xs text-gray-500 mb-1">Group Code</div>
                      <Input
                        value={group.code}
                        onChange={(e) => updateMemberGroup(group.id, 'code', e.target.value)}
                        placeholder="e.g., A1"
                        size="small"
                      />
                    </div>
                    <div className="w-40">
                      <div className="text-xs text-gray-500 mb-1">Group ID</div>
                      <Input value={group.id} readOnly size="small" />
                    </div>
                    <Popconfirm
                      title="Remove this group?"
                      onConfirm={() => removeMemberGroup(group.id)}
                    >
                      <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                    </Popconfirm>
                  </div>
                ))}
              </Card>

              {/* Save / Cancel live in the drawer footer so they stay pinned */}
            </Form>
          ) : (
            // View Mode
            selectedProgram && (
              <div className="space-y-6">
                {/* Basic Info */}
                <Card title="Basic Information" className="shadow-sm">
                  <Row gutter={[16, 16]}>
                    <Col span={10}>
                      <div>
                        <div className="text-sm text-gray-500">Program Name (English)</div>
                        <div className="text-lg font-semibold">{selectedProgram.name}</div>
                      </div>
                    </Col>
                    <Col span={10}>
                      <div>
                        <div className="text-sm text-gray-500">Program Name (Hindi)</div>
                        <div className="text-lg font-semibold">{selectedProgram.hindiName}</div>
                      </div>
                    </Col>
                    <Col span={4}>
                      <div>
                        <div className="text-sm text-gray-500">Reg. Prefix</div>
                        <div className="text-lg font-semibold font-mono text-blue-600">{selectedProgram.regNoPrefix || 'MEM'}</div>
                      </div>
                    </Col>
                  </Row>
                  <Divider />
                  <div>
                    <div className="text-sm text-gray-500 mb-2">Description</div>
                    <div className="text-gray-700 bg-gray-50 p-3 rounded">{selectedProgram.description}</div>
                  </div>
                </Card>

                {/* Age Groups */}
                <Card title="Age Groups & Pricing" className="shadow-sm">
                  {renderAgeGroups(selectedProgram.ageGroups)}
                </Card>

                {/* Member Groups */}
                <Card title="Member Groups" className="shadow-sm">
                  {renderMemberGroups(selectedProgram.memberGroups)}
                </Card>

                {/* Timestamps */}
                <Card title="Additional Information" className="shadow-sm">
                  <Row gutter={[16, 16]}>
                    <Col span={12}>
                      <div>
                        <div className="text-sm text-gray-500">Created</div>
                        <div className="font-medium">
                          {selectedProgram.created_at?.toDate().toLocaleString('en-IN') || 'N/A'}
                        </div>
                      </div>
                    </Col>
                    <Col span={12}>
                      <div>
                        <div className="text-sm text-gray-500">Last Updated</div>
                        <div className="font-medium">
                          {selectedProgram.updated_at?.toDate().toLocaleString('en-IN') || 'N/A'}
                        </div>
                      </div>
                    </Col>
                  </Row>
                </Card>
              </div>
            )
          )}
        </Drawer>
      </div>
    </div>
  );
};

export default ProgramsViewPage;