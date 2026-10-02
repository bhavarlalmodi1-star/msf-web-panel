"use client";
import React, { useState } from 'react';
import {
  Form,
  Input,
  Select,
  Button,
  Card,
  Row,
  Col,
  DatePicker,
  InputNumber,
  Table,
  Space,
  Popconfirm,
  message,
  Typography,
  Tag,
  Radio,
  Tooltip,
  Alert
} from 'antd';
import {
  GlobalOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { 
  PlusOutlined, 
  DeleteOutlined,
  SaveOutlined
} from '@ant-design/icons';
import { 
  collection, 
  addDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import dayjs from 'dayjs';
import { db } from '../../../../../lib/firbase-client';


const { Option } = Select;
const { Title, Text } = Typography;
const { TextArea } = Input;

const ProgramsFormPage = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  // Registration numbers are random 5-digit values, so the prefix is the only
  // thing worth previewing here
  const watchPrefix = Form.useWatch('regNoPrefix', form);

  // For age groups table
  const [ageGroups, setAgeGroups] = useState([]);
  const [programType, setProgramType] = useState('other');
  // For member groups
  const [memberGroups, setMemberGroups] = useState([]);
  const [certificateRule, setCertificateRule] = useState('');
  // Global date range — applied to ALL periods at once when set
  const [globalDateRange, setGlobalDateRange] = useState([null, null]);
  // Generate unique ID for groups
  const generateGroupId = () => {
    return 'GRP_' + Math.random().toString(36).substr(2, 9).toUpperCase();
  };

  // Apply global date range to every period in every age group
  const applyGlobalDateRange = (dates) => {
    if (!dates || !dates[0] || !dates[1]) return;
    const startDate = dates[0].format('DD-MM-YYYY');
    const endDate   = dates[1].format('DD-MM-YYYY');
    setAgeGroups(prev =>
      prev.map(group => ({
        ...group,
        periods: group.periods.map(period => ({ ...period, startDate, endDate }))
      }))
    );
    message.success(`Date range applied to all ${ageGroups.reduce((t, g) => t + g.periods.length, 0)} period(s)`);
  };

  // Handle form submission
  const handleSubmit = async (values) => {
    try {
      setLoading(true);

      const rawPrefix = (values.regNoPrefix || 'MEM').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const regNoPrefix = rawPrefix || 'MEM';

      // Prepare program data
      const programData = {
        name: values.name,
        hindiName: values.hindiName,
        description: values.description,
        programType,
        certificateRule,
        regNoPrefix,
        ageGroups,
        memberGroups: memberGroups.map(group => ({
          id: group.id,
          groupName: group.groupName,
          code: group.code
        })),
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      };
      
      // Save to Firebase
      await addDoc(collection(db, 'programs'), programData);
      
      message.success('Program added successfully!');
      
      // Reset form
      form.resetFields();
      setAgeGroups([]);
      setMemberGroups([]);
      
    } catch (error) {
      console.error('Error saving program:', error);
      message.error('Failed to save program');
    } finally {
      setLoading(false);
    }
  };

  // Add new age group
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
        joinFees: 0,
        fixedJoinFees:0,
        payAmount: 0
      }]
    };
    setAgeGroups([...ageGroups, newAgeGroup]);
  };

  // Update age group field
  const updateAgeGroup = (id, field, value) => {
    setAgeGroups(ageGroups.map(group => 
      group.id === id ? { ...group, [field]: value } : group
    ));
  };

  // Add period to age group
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

  // Update period field
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

  // Remove period
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

  // Remove age group
  const removeAgeGroup = (id) => {
    setAgeGroups(ageGroups.filter(group => group.id !== id));
  };

  // Add new member group
  const addMemberGroup = () => {
    const newMemberGroup = {
      id: generateGroupId(),
      groupName: '',
      code: ''
    };
    setMemberGroups([...memberGroups, newMemberGroup]);
  };

  // Update member group field
  const updateMemberGroup = (id, field, value) => {
    setMemberGroups(memberGroups.map(group => 
      group.id === id ? { ...group, [field]: value } : group
    ));
  };

  // Remove member group
  const removeMemberGroup = (id) => {
    setMemberGroups(memberGroups.filter(group => group.id !== id));
  };

  // Age group columns for table
  const ageGroupColumns = [
    {
      title: 'Age Group',
      dataIndex: 'ageGroupName',
      key: 'ageGroupName',
      width: 150,
      render: (_, record) => (
        <Input
          value={record.ageGroupName}
          onChange={(e) => updateAgeGroup(record.id, 'ageGroupName', e.target.value)}
          placeholder="e.g., Youth"
          size="small"
        />
      ),
    },
    {
      title: 'Start Age',
      dataIndex: 'startAge',
      key: 'startAge',
      width: 100,
      render: (_, record) => (
        <InputNumber
          value={record.startAge}
          onChange={(value) => updateAgeGroup(record.id, 'startAge', value)}
          min={0}
          max={100}
          placeholder="From"
          size="small"
          className="w-full"
        />
      ),
    },
    {
      title: 'End Age',
      dataIndex: 'endAge',
      key: 'endAge',
      width: 100,
      render: (_, record) => (
        <InputNumber
          value={record.endAge}
          onChange={(value) => updateAgeGroup(record.id, 'endAge', value)}
          min={0}
          max={100}
          placeholder="To"
          size="small"
          className="w-full"
        />
      ),
    },
    {
      title: 'Periods & Fees',
      key: 'periods',
      render: (_, record) => (
        <div className="space-y-3">
          {record.periods.map((period) => (
            <div key={period.id} className="p-3 border rounded bg-gray-50">
              <div className="flex gap-2 items-center mb-3">
                <div className="flex-1">
                  <div className="text-xs text-gray-500 mb-1">Date Range</div>
                  <div className="flex gap-2">
                    <DatePicker
                      placeholder="Start Date"
                      format="DD-MM-YYYY"
                      value={period.startDate ? dayjs(period.startDate, 'DD-MM-YYYY') : null}
                      onChange={(date) => updatePeriod(record.id, period.id, 'startDate', date ? date.format('DD-MM-YYYY') : '')}
                      className="w-32"
                      size="small"
                    />
                    <span className="text-gray-400">to</span>
                    <DatePicker
                      placeholder="End Date"
                      format="DD-MM-YYYY"
                      value={period.endDate ? dayjs(period.endDate, 'DD-MM-YYYY') : null}
                      onChange={(date) => updatePeriod(record.id, period.id, 'endDate', date ? date.format('DD-MM-YYYY') : '')}
                      className="w-32"
                      size="small"
                    />
                  </div>
                </div>
                
                {record.periods.length > 1 && (
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => removePeriod(record.id, period.id)}
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
                    onChange={(value) => updatePeriod(record.id, period.id, 'joinFees', value)}
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
                    onChange={(value) => updatePeriod(record.id, period.id, 'fixedJoinFees', value)}
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
                    onChange={(value) => updatePeriod(record.id, period.id, 'payAmount', value)}
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
            onClick={() => addPeriod(record.id)}
            icon={<PlusOutlined />}
            size="small"
            block
          >
            Add Another Period
          </Button>
        </div>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 80,
      render: (_, record) => (
        <Popconfirm
          title="Remove this age group?"
          onConfirm={() => removeAgeGroup(record.id)}
          okText="Yes"
          cancelText="No"
        >
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            size="small"
          />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <Title level={2} className="text-gray-800 mb-2">
            Create New Program
          </Title>
          <Text className="text-gray-500">
            Add a new program with age-based pricing and group categories
          </Text>
        </div>

        {/* Main Form */}
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          className="space-y-8 flex flex-col gap-3"
        >
          {/* Basic Info Card */}
          <Card title="Program Details" className="shadow-md">
            <Row gutter={24}>
              <Col span={10}>
                <Form.Item
                  name="name"
                  label="Program Name (English)"
                  rules={[{ required: true, message: 'Please enter program name' }]}
                >
                  <Input
                    placeholder="e.g., Senior Citizen Scheme"
                    size="large"
                    className="hover:border-rose-300"
                  />
                </Form.Item>
              </Col>
              <Col span={10}>
                <Form.Item
                  name="hindiName"
                  label="Program Name (Hindi)"
                  rules={[{ required: true, message: 'Please enter Hindi name' }]}
                >
                  <Input
                    placeholder="e.g., वरिष्ठ नागरिक योजना"
                    size="large"
                    className="hover:border-rose-300"
                  />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item
                  name="regNoPrefix"
                  label={
                    <span className="flex items-center gap-1">
                      Reg. Prefix
                      <Tooltip title="Members of this yojna will get registration numbers starting with this prefix (e.g. MEM → MEM00012507, SCH → SCH00012507). Only letters/digits allowed.">
                        <InfoCircleOutlined className="text-gray-400 text-xs" />
                      </Tooltip>
                    </span>
                  }
                  initialValue="MEM"
                  rules={[
                    { required: true, message: 'Required' },
                    {
                      validator(_, value) {
                        if (!value) return Promise.resolve(); // required rule handles empty
                        const clean = value.replace(/[^A-Z0-9]/gi, '');
                        if (clean.length >= 1 && clean.length <= 8) return Promise.resolve();
                        return Promise.reject(new Error('1–8 letters or digits (e.g. R, SC, MEM, SADI)'));
                      }
                    }
                  ]}
                >
                  <Input
                    placeholder="MEM"
                    size="large"
                    maxLength={8}
                    className="hover:border-rose-300 uppercase font-mono"
                    onChange={e => form.setFieldValue('regNoPrefix', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  />
                </Form.Item>
              </Col>
            </Row>

            {/* Format reminder — numbers are random, not sequential */}
            <div className="mb-4 -mt-2 flex items-center gap-2 flex-wrap">
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
              rules={[{ required: true, message: 'Please enter description' }]}
            >
              <TextArea 
                placeholder="Brief description about the program..." 
                rows={3}
                size="large"
                maxLength={500}
                showCount
                className="hover:border-rose-300"
              />
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

          {/* Age Groups Card */}
          <Card
            title={
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-lg font-semibold">Age Groups & Pricing</span>
                  <div className="text-sm text-gray-500 mt-1">
                    Define different age categories with their fee structure
                  </div>
                </div>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={addAgeGroup}
                  className="bg-gradient-to-r from-rose-600 to-orange-600"
                >
                  Add Age Group
                </Button>
              </div>
            }
            className="shadow-md"
          >
            {/* ── Global Date Range ───────────────────────────────────── */}
            <div className="mb-5 p-4 rounded-xl border-2 border-blue-100 bg-blue-50">
              <div className="flex items-center gap-2 mb-3">
                <GlobalOutlined className="text-blue-600" />
                <span className="font-semibold text-blue-700">Global Date Range</span>
                <span className="text-xs text-blue-500 ml-1">— sets dates on ALL periods at once</span>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <DatePicker.RangePicker
                  format="DD-MM-YYYY"
                  value={globalDateRange}
                  onChange={dates => setGlobalDateRange(dates || [null, null])}
                  size="middle"
                  placeholder={['Global Start', 'Global End']}
                  className="flex-1 min-w-[260px]"
                />
                <Button
                  type="primary"
                  icon={<GlobalOutlined />}
                  disabled={!globalDateRange[0] || !globalDateRange[1] || ageGroups.length === 0}
                  onClick={() => applyGlobalDateRange(globalDateRange)}
                  style={{ background: '#2563eb', border: 'none' }}
                >
                  Apply to All Periods
                </Button>
                <Button
                  onClick={() => setGlobalDateRange([null, null])}
                  disabled={!globalDateRange[0]}
                >
                  Clear
                </Button>
              </div>
              {ageGroups.length === 0 && (
                <div className="text-xs text-blue-400 mt-2">Add at least one age group first to apply global dates.</div>
              )}
            </div>

            {ageGroups.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed rounded-lg bg-gray-50">
                <div className="text-gray-400 mb-4">
                  <div className="text-lg mb-2">No age groups added yet</div>
                  <div className="text-sm">Add age groups to define pricing for different age categories</div>
                </div>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={addAgeGroup}
                  className="bg-gradient-to-r from-rose-600 to-orange-600"
                  size="large"
                >
                  Add First Age Group
                </Button>
              </div>
            ) : (
              <Table
                dataSource={ageGroups}
                columns={ageGroupColumns}
                rowKey="id"
                pagination={false}
                size="small"
                className="border rounded-lg"
                scroll={{ x: 800 }}
              />
            )}
          </Card>

          {/* Member Groups Card - Simplified */}
          <Card 
            title={
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-lg font-semibold">Member Group Categories</span>
                  <div className="text-sm text-gray-500 mt-1">
                    Create group categories (like A1, Group2, etc.)
                  </div>
                </div>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={addMemberGroup}
                  className="bg-gradient-to-r from-rose-600 to-orange-600"
                >
                  Add Group
                </Button>
              </div>
            }
            className="shadow-md"
          >
            {memberGroups.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed rounded-lg">
                <Text className="text-gray-400">No member groups added yet</Text>
              </div>
            ) : (
              <div className="space-y-3">
                {memberGroups.map((group) => (
                  <div key={group.id} className="border rounded-lg p-4 bg-white">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Tag color="blue" className="px-3 py-1 font-mono">
                            {group.id}
                          </Tag>
                        </div>
                        <div className="flex items-center gap-4">
                          <div>
                            <div className="text-xs text-gray-500 mb-1">Group Name</div>
                            <Input
                              value={group.groupName}
                              onChange={(e) => updateMemberGroup(group.id, 'groupName', e.target.value)}
                              placeholder="e.g., Family Group"
                              className="w-48"
                              size="small"
                            />
                          </div>
                          <div>
                            <div className="text-xs text-gray-500 mb-1">Group Code</div>
                            <Input
                              value={group.code}
                              onChange={(e) => updateMemberGroup(group.id, 'code', e.target.value)}
                              placeholder="e.g., A1, B2, GROUP1"
                              className="w-32"
                              size="small"
                            />
                          </div>
                        </div>
                      </div>
                      
                      <Popconfirm
                        title="Remove this group?"
                        onConfirm={() => removeMemberGroup(group.id)}
                        okText="Yes"
                        cancelText="No"
                      >
                        <Button
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          size="small"
                        />
                      </Popconfirm>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
  
          </Card>

          {/* Submit Button */}
          <div className="flex justify-end space-x-4 pt-6 border-t">
            <Button
              onClick={() => {
                form.resetFields();
                setAgeGroups([]);
                setMemberGroups([]);
              }}
              size="large"
              className="border-gray-300 hover:border-rose-300"
            >
              Reset Form
            </Button>
            
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              size="large"
              icon={<SaveOutlined />}
              className="bg-gradient-to-r from-rose-600 to-orange-600 hover:shadow-lg px-8"
            >
              Create Program
            </Button>
          </div>
        </Form>
      </div>
    </div>
  );
};

export default ProgramsFormPage;