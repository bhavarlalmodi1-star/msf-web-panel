"use client";
import React, { useState, useEffect } from 'react';
import { 
  Table, 
  Button, 
  Modal, 
  Form, 
  Input, 
  Select, 
  Tag, 
  Space, 
  Popconfirm, 
  message, 
  Switch,
  Card,
  Row,
  Col,
  Statistic
} from 'antd';
import { 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined,
  EnvironmentOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined
} from '@ant-design/icons';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../../../../lib/firbase-client';

const { Option } = Select;

const DistrictManagementPage = () => {
  // State Management
  const [districts, setDistricts] = useState([]);
  const [states, setStates] = useState([]); // For dropdown
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingDistrict, setEditingDistrict] = useState(null);
  const [form] = Form.useForm();
  const [selectedState, setSelectedState] = useState(null);

  // Statistics
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0
  });

  // Firebase collection references
  const districtsCollectionRef = collection(db, 'districts');
  const statesCollectionRef = collection(db, 'states');

  // Fetch districts from Firebase
  const fetchDistricts = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(districtsCollectionRef);
      const districtsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Sort by name
      districtsData.sort((a, b) => a.name.localeCompare(b.name));
      console.log(districtsData,'districtsData')
      
      setDistricts(districtsData);
      calculateStats(districtsData);
    } catch (error) {
      console.error('Error fetching districts:', error);
      message.error('Failed to fetch districts');
    } finally {
      setLoading(false);
    }
  };

  // Fetch states for dropdown
  const fetchStates = async () => {
    try {
      const querySnapshot = await getDocs(statesCollectionRef);
      const statesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log(statesData,"statesData")
      // Filter only active states
      const activeStates = statesData.filter(state => state.status === 'active');
      setStates(activeStates);
    } catch (error) {
      console.error('Error fetching states:', error);
      message.error('Failed to fetch states');
    }
  };

  // Calculate statistics
  const calculateStats = (data) => {
    const total = data.length;
    const active = data.filter(district => district.status === 'active').length;
    const inactive = total - active;
    
    setStats({
      total,
      active,
      inactive
    });
  };

  // Initial fetch
  useEffect(() => {
    fetchDistricts();
    fetchStates();
  }, []);

  // Filter districts by selected state
  const filteredDistricts = selectedState 
    ? districts.filter(district => district.stateId === selectedState)
    : districts;

  // Handle form submission (Add/Edit)
  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      
      // Get selected state name
      const selectedStateData = states.find(s => s.id === values.stateId);
      
      const districtData = {
        ...values,
        stateName: selectedStateData?.name || '',
        stateHindiName: selectedStateData?.hindiName || '',
        updated_at: serverTimestamp()
      };

      if (editingDistrict) {
        // Update existing district
        const districtRef = doc(db, 'districts', editingDistrict.id);
        await updateDoc(districtRef, districtData);
        
        message.success('District updated successfully!');
      } else {
        // Add new district
        await addDoc(districtsCollectionRef, {
          ...districtData,
          created_at: serverTimestamp()
        });
        
        message.success('District added successfully!');
      }
      
      setModalVisible(false);
      form.resetFields();
      setEditingDistrict(null);
      fetchDistricts();
    } catch (error) {
      console.error('Error saving district:', error);
      message.error('Failed to save district');
    } finally {
      setLoading(false);
    }
  };

  // Handle edit
  const handleEdit = (record) => {
    setEditingDistrict(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  // Handle delete
  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, 'districts', id));
      message.success('District deleted successfully!');
      fetchDistricts();
    } catch (error) {
      console.error('Error deleting district:', error);
      message.error('Failed to delete district');
    }
  };

  // Toggle status
  const toggleStatus = async (id, currentStatus) => {
    try {
      const districtRef = doc(db, 'districts', id);
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
      
      await updateDoc(districtRef, {
        status: newStatus,
        updated_at: serverTimestamp()
      });
      
      message.success(`District marked as ${newStatus}`);
      fetchDistricts();
    } catch (error) {
      console.error('Error updating status:', error);
      message.error('Failed to update status');
    }
  };

  // Table columns
  const columns = [
    {
      title: 'District Name (English)',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (text) => (
        <span className="font-medium">{text}</span>
      ),
    },
    {
      title: 'District Name (Hindi)',
      dataIndex: 'hindiName',
      key: 'hindiName',
      width: 200,
      render: (text) => (
        <span className="font-medium">{text || 'N/A'}</span>
      ),
    },
    {
      title: 'State',
      dataIndex: 'stateName',
      key: 'stateName',
      width: 150,
      render: (text, record) => (
        <div>
          <div className="font-medium">{text}</div>
          <div className="text-sm text-gray-500">{record.stateHindiName}</div>
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status) => (
        <Tag 
          color={status === 'active' ? 'green' : 'red'}
          className="px-3 py-1"
        >
          {status === 'active' ? 'Active' : 'Inactive'}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
            className="text-blue-600"
            title="Edit"
          />
          
          <Switch
            checked={record.status === 'active'}
            onChange={() => toggleStatus(record.id, record.status)}
            size="small"
          />
          
          <Popconfirm
            title="Delete District"
            description="Are you sure?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              title="Delete"
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      {/* Header Section */}
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">District Management</h1>
            <p className="text-gray-600">Manage districts within states</p>
          </div>
          
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingDistrict(null);
              form.resetFields();
              form.setFieldsValue({ status: 'active' });
              setModalVisible(true);
            }}
            className="bg-gradient-to-r from-rose-600 to-orange-600 hover:shadow-lg"
            size="large"
          >
            Add New District
          </Button>
        </div>

   

        {/* State Filter */}
        <Card className="shadow-md mb-6">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="flex-1">
              <h3 className="font-medium mb-2">Filter by State</h3>
              <Select
                placeholder="Select a state to filter districts"
                className="w-full"
                size="large"
                allowClear
                value={selectedState}
                onChange={setSelectedState}
              >
                <Option value={null}>All States</Option>
                {states.map(state => (
                  <Option key={state.id} value={state.id}>
                    {state.name} ({state.hindiName})
                  </Option>
                ))}
              </Select>
            </div>
            
            {selectedState && (
              <Button
                onClick={() => setSelectedState(null)}
                className="mt-2 md:mt-0"
              >
                Clear Filter
              </Button>
            )}
          </div>
        </Card>
      </div>

      {/* Districts Table */}
      <Card className="shadow-md">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">
            {selectedState 
              ? `Districts in ${states.find(s => s.id === selectedState)?.name || 'Selected State'}`
              : 'All Districts'}
            <span className="text-gray-500 ml-2">
              ({filteredDistricts.length} districts)
            </span>
          </h2>
        </div>
        
        <Table
          columns={columns}
          dataSource={filteredDistricts}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `${total} districts`,
          }}
          scroll={{ x: 800 }}
        />
      </Card>

      {/* Add/Edit Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            {editingDistrict ? 'Edit District' : 'Add New District'}
          </div>
        }
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
          setEditingDistrict(null);
        }}
        footer={null}
        width={500}
        className="rounded-lg"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          className="space-y-4"
        >
          <Form.Item
            name="stateId"
            label="Select State"
            rules={[{ required: true, message: 'Please select a state' }]}
          >
            <Select
              placeholder="Select state"
              size="large"
              showSearch
              optionFilterProp="children"
              filterOption={(input, option) =>
                option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
              }
            >
              {states.map(state => (
                <Option key={state.id} value={state.id}>
                  {state.name} ({state.hindiName})
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="District Name (English)"
                rules={[
                  { required: true, message: 'Please enter district name' }
                ]}
              >
                <Input placeholder="e.g., Mumbai" size="large" />
              </Form.Item>
            </Col>
            
            <Col span={12}>
              <Form.Item
                name="hindiName"
                label="District Name (Hindi)"
                rules={[
                  { required: true, message: 'Please enter Hindi name' }
                ]}
              >
                <Input placeholder="e.g., मुंबई" size="large" />
              </Form.Item>
            </Col>
          </Row>
          
          <Form.Item
            name="status"
            label="Status"
            initialValue="active"
          >
            <Select size="large">
              <Option value="active">Active</Option>
              <Option value="inactive">Inactive</Option>
            </Select>
          </Form.Item>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              onClick={() => {
                setModalVisible(false);
                form.resetFields();
                setEditingDistrict(null);
              }}
              size="large"
            >
              Cancel
            </Button>
            
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              size="large"
              className="bg-gradient-to-r from-rose-600 to-orange-600"
              icon={editingDistrict ? <EditOutlined /> : <PlusOutlined />}
            >
              {editingDistrict ? 'Update' : 'Add District'}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default DistrictManagementPage;