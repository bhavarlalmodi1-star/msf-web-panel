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
  Statistic,
  Input as AntInput
} from 'antd';
import { 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined,
  EnvironmentOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SearchOutlined
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

const CityManagementPage = () => {
  // State Management
  const [cities, setCities] = useState([]);
  const [states, setStates] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [filteredDistricts, setFilteredDistricts] = useState([]); // Districts filtered by state
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCity, setEditingCity] = useState(null);
  const [form] = Form.useForm();
  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [selectedStateId, setSelectedStateId] = useState(null); // Track selected state

  // Statistics
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0
  });

  // Firebase collection references
  const citiesCollectionRef = collection(db, 'cities');
  const statesCollectionRef = collection(db, 'states');
  const districtsCollectionRef = collection(db, 'districts');

  // Fetch all data
  const fetchAllData = async () => {
    setLoading(true);
    try {
      // Fetch cities
      const citiesSnapshot = await getDocs(citiesCollectionRef);
      const citiesData = citiesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      console.log(citiesData,'citiesData')
      citiesData.sort((a, b) => a.name.localeCompare(b.name));
      setCities(citiesData);
      calculateStats(citiesData);

      // Fetch states (active only)
      const statesSnapshot = await getDocs(statesCollectionRef);
      const statesData = statesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setStates(statesData.filter(state => state.status === 'active'));

      // Fetch districts (active only)
      const districtsSnapshot = await getDocs(districtsCollectionRef);
      const districtsData = districtsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setDistricts(districtsData.filter(district => district.status === 'active'));

    } catch (error) {
      console.error('Error fetching data:', error);
      message.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  // Calculate statistics
  const calculateStats = (data) => {
    const total = data.length;
    const active = data.filter(city => city.status === 'active').length;
    const inactive = total - active;
    
    setStats({
      total,
      active,
      inactive
    });
  };

  // Initial fetch
  useEffect(() => {
    fetchAllData();
  }, []);

  // Filter districts when state changes
  useEffect(() => {
    if (selectedStateId) {
      const filtered = districts.filter(district => district.stateId === selectedStateId);
      setFilteredDistricts(filtered);
    } else {
      setFilteredDistricts([]);
    }
  }, [selectedStateId, districts]);

  // Filter cities based on selected district and search
  const filteredCities = cities.filter(city => {
    // District filter
    if (selectedDistrict && city.districtId !== selectedDistrict) {
      return false;
    }
    
    // Search filter
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      return (
        city.name?.toLowerCase().includes(searchLower) ||
        city.hindiName?.toLowerCase().includes(searchLower) ||
        city.districtName?.toLowerCase().includes(searchLower) ||
        city.stateName?.toLowerCase().includes(searchLower)
      );
    }
    
    return true;
  });

  // Handle form submission (Add/Edit)
  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      
      // Get selected district and state info
      const selectedDistrictData = districts.find(d => d.id === values.districtId);
      const selectedStateData = states.find(s => s.id === selectedDistrictData?.stateId);
      
      const cityData = {
        ...values,
        districtName: selectedDistrictData?.name || '',
        districtHindiName: selectedDistrictData?.hindiName || '',
        stateId: selectedDistrictData?.stateId || '',
        stateName: selectedStateData?.name || '',
        stateHindiName: selectedStateData?.hindiName || '',
        updated_at: serverTimestamp()
      };

      if (editingCity) {
        // Update existing city
        const cityRef = doc(db, 'cities', editingCity.id);
        await updateDoc(cityRef, cityData);
        
        message.success('City updated successfully!');
      } else {
        // Add new city
        await addDoc(citiesCollectionRef, {
          ...cityData,
          created_at: serverTimestamp()
        });
        
        message.success('City added successfully!');
      }
      
      setModalVisible(false);
      form.resetFields();
      setEditingCity(null);
      setSelectedStateId(null);
      fetchAllData();
    } catch (error) {
      console.error('Error saving city:', error);
      message.error('Failed to save city');
    } finally {
      setLoading(false);
    }
  };

  // Handle edit
  const handleEdit = (record) => {
    setEditingCity(record);
    setSelectedStateId(record.stateId); // Set the state for filtering
    
    const formValues = {
      ...record,
      stateId: record.stateId
    };
    form.setFieldsValue(formValues);
    setModalVisible(true);
  };

  // Handle delete
  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, 'cities', id));
      message.success('City deleted successfully!');
      fetchAllData();
    } catch (error) {
      console.error('Error deleting city:', error);
      message.error('Failed to delete city');
    }
  };

  // Toggle status
  const toggleStatus = async (id, currentStatus) => {
    try {
      const cityRef = doc(db, 'cities', id);
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
      
      await updateDoc(cityRef, {
        status: newStatus,
        updated_at: serverTimestamp()
      });
      
      message.success(`City marked as ${newStatus}`);
      fetchAllData();
    } catch (error) {
      console.error('Error updating status:', error);
      message.error('Failed to update status');
    }
  };

  // Handle state change in form
  const handleStateChange = (stateId) => {
    setSelectedStateId(stateId);
    form.setFieldsValue({ districtId: undefined }); // Reset district selection
  };

  // Table columns
  const columns = [
    {
      title: 'City Name (English)',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (text) => (
        <span className="font-medium text-gray-800">{text}</span>
      ),
    },
    {
      title: 'City Name (Hindi)',
      dataIndex: 'hindiName',
      key: 'hindiName',
      width: 180,
      render: (text) => (
        <span className="font-medium">{text || 'N/A'}</span>
      ),
    },
    {
      title: 'District',
      dataIndex: 'districtName',
      key: 'districtName',
      width: 150,
      render: (text, record) => (
        <div>
          <div className="font-medium">{text}</div>
          <div className="text-sm text-gray-500">{record.districtHindiName}</div>
        </div>
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
      width: 100,
      render: (status) => (
        <Tag 
          color={status === 'active' ? 'green' : 'red'}
          className="px-3 py-1 rounded-full"
        >
          {status === 'active' ? 'Active' : 'Inactive'}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 140,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
            className="text-blue-600 hover:text-blue-800"
            title="Edit"
          />
          
          <Switch
            checked={record.status === 'active'}
            onChange={() => toggleStatus(record.id, record.status)}
            size="small"
            className={record.status === 'active' ? 'bg-green-500' : ''}
          />
          
          <Popconfirm
            title="Delete City"
            description="Are you sure you want to delete this city?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
            okButtonProps={{ className: 'bg-red-600 hover:bg-red-700' }}
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              title="Delete"
              className="hover:text-red-700"
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
            <h1 className="text-2xl font-bold text-gray-800">City Management</h1>
            <p className="text-gray-600">Manage cities within districts and states</p>
          </div>
          
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingCity(null);
              setSelectedStateId(null);
              form.resetFields();
              form.setFieldsValue({ status: 'active' });
              setModalVisible(true);
            }}
            className="bg-gradient-to-r from-rose-600 to-orange-600 hover:shadow-lg hover:shadow-rose-200"
            size="large"
          >
            Add New City
          </Button>
        </div>

        {/* Statistics Cards */}
        <Row gutter={[16, 16]} className="mb-6">
          <Col xs={24} sm={8}>
            <Card className="shadow-md hover:shadow-lg transition-shadow border-l-4 border-rose-500">
              <Statistic
                title="Total Cities"
                value={stats.total}
                prefix={<EnvironmentOutlined className="text-rose-600" />}
                valueStyle={{ color: 'var(--primary)', fontWeight: 'bold' }}
                className="text-center"
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card className="shadow-md hover:shadow-lg transition-shadow border-l-4 border-green-500">
              <Statistic
                title="Active Cities"
                value={stats.active}
                prefix={<CheckCircleOutlined className="text-green-600" />}
                valueStyle={{ color: '#16a34a', fontWeight: 'bold' }}
                className="text-center"
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card className="shadow-md hover:shadow-lg transition-shadow border-l-4 border-red-500">
              <Statistic
                title="Inactive Cities"
                value={stats.inactive}
                prefix={<CloseCircleOutlined className="text-red-600" />}
                valueStyle={{ color: '#dc2626', fontWeight: 'bold' }}
                className="text-center"
              />
            </Card>
          </Col>
        </Row>

        {/* Filters Section */}
        <Card className="shadow-md mb-6">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="flex-1">
              <AntInput
                placeholder="Search by city name, district, or state..."
                prefix={<SearchOutlined className="text-gray-400" />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full"
                size="large"
                allowClear
              />
            </div>
            
            <div className="w-full md:w-auto">
              <Select
                placeholder="Filter by District"
                className="w-full md:w-64"
                size="large"
                allowClear
                value={selectedDistrict}
                onChange={setSelectedDistrict}
              >
                {districts.map(district => (
                  <Option key={district.id} value={district.id}>
                    {district.name} ({district.hindiName})
                  </Option>
                ))}
              </Select>
            </div>
            
            {(searchText || selectedDistrict) && (
              <Button
                onClick={() => {
                  setSearchText('');
                  setSelectedDistrict(null);
                }}
                className="whitespace-nowrap"
              >
                Clear Filters
              </Button>
            )}
          </div>
        </Card>
      </div>

      {/* Cities Table */}
      <Card className="shadow-md">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-800">
            {selectedDistrict 
              ? `Cities in ${districts.find(d => d.id === selectedDistrict)?.name || 'Selected District'}`
              : 'All Cities'}
            <span className="text-gray-500 ml-2">
              ({filteredCities.length} cities found)
            </span>
          </h2>
        </div>
        
        <Table
          columns={columns}
          dataSource={filteredCities}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `${total} cities`,
            showQuickJumper: true,
          }}
          scroll={{ x: 900 }}
          className="ant-table-theme"
        />
      </Card>

      {/* Add/Edit Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <EnvironmentOutlined className="text-rose-600" />
            {editingCity ? 'Edit City' : 'Add New City'}
          </div>
        }
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
          setEditingCity(null);
          setSelectedStateId(null);
        }}
        footer={null}
        width={600}
        className="rounded-lg"
        styles={{
          header: { borderBottom: '1px solid #e5e7eb' }
        }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          className="space-y-4"
        >
          {/* State Selection */}
          <Form.Item
            name="stateId"
            label="Select State"
            rules={[{ required: true, message: 'Please select a state' }]}
          >
            <Select
              placeholder="Select state first"
              size="large"
              showSearch
              onChange={handleStateChange}
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

          {/* District Selection - Fixed: Remove disabled prop and use filteredDistricts */}
          <Form.Item
            name="districtId"
            label="Select District"
            rules={[{ required: true, message: 'Please select a district' }]}
          >
            <Select
              placeholder={selectedStateId ? "Select district" : "Please select a state first"}
              size="large"
              showSearch
              loading={loading}
              optionFilterProp="children"
              filterOption={(input, option) =>
                option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
              }
            >
              {filteredDistricts.map(district => (
                <Option key={district.id} value={district.id}>
                  {district.name} ({district.hindiName})
                </Option>
              ))}
            </Select>
          </Form.Item>

          {/* City Names */}
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="City Name (English)"
                rules={[
                  { required: true, message: 'Please enter city name' },
                  { min: 2, message: 'City name must be at least 2 characters' }
                ]}
              >
                <Input 
                  placeholder="e.g., Mumbai" 
                  size="large"
                  className="hover:border-rose-300"
                />
              </Form.Item>
            </Col>
            
            <Col span={12}>
              <Form.Item
                name="hindiName"
                label="City Name (Hindi)"
                rules={[
                  { required: true, message: 'Please enter Hindi name' }
                ]}
              >
                <Input 
                  placeholder="e.g., मुंबई" 
                  size="large"
                  className="hover:border-rose-300"
                />
              </Form.Item>
            </Col>
          </Row>
          
          {/* Status */}
          <Form.Item
            name="status"
            label="Status"
            initialValue="active"
          >
            <Select size="large">
              <Option value="active">
                <Tag color="green" className="w-full text-center">Active</Tag>
              </Option>
              <Option value="inactive">
                <Tag color="red" className="w-full text-center">Inactive</Tag>
              </Option>
            </Select>
          </Form.Item>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              onClick={() => {
                setModalVisible(false);
                form.resetFields();
                setEditingCity(null);
                setSelectedStateId(null);
              }}
              size="large"
              className="border-gray-300 hover:border-rose-300"
            >
              Cancel
            </Button>
            
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              size="large"
              className="bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-700 hover:to-orange-700"
              icon={editingCity ? <EditOutlined /> : <PlusOutlined />}
            >
              {editingCity ? 'Update City' : 'Add City'}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default CityManagementPage;