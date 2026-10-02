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
  Switch 
} from 'antd';
import { 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined 
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

const StateManagementPage = () => {
  // State Management
  const [states, setStates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingState, setEditingState] = useState(null);
  const [form] = Form.useForm();

  // Firebase collection reference
  const statesCollectionRef = collection(db, 'states');

  // Fetch states from Firebase
  const fetchStates = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(statesCollectionRef);
      const statesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Sort by name
      statesData.sort((a, b) => a.name.localeCompare(b.name));
      
      setStates(statesData);
    } catch (error) {
      console.error('Error fetching states:', error);
      message.error('Failed to fetch states');
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchStates();
  }, []);

  // Handle form submission (Add/Edit)
  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      
      if (editingState) {
        // Update existing state
        const stateRef = doc(db, 'states', editingState.id);
        await updateDoc(stateRef, {
          ...values,
          updated_at: serverTimestamp()
        });
        
        message.success('State updated successfully!');
      } else {
        // Add new state
        await addDoc(statesCollectionRef, {
          ...values,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp()
        });
        
        message.success('State added successfully!');
      }
      
      setModalVisible(false);
      form.resetFields();
      setEditingState(null);
      fetchStates();
    } catch (error) {
      console.error('Error saving state:', error);
      message.error('Failed to save state');
    } finally {
      setLoading(false);
    }
  };

  // Handle edit
  const handleEdit = (record) => {
    setEditingState(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  // Handle delete
  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, 'states', id));
      message.success('State deleted successfully!');
      fetchStates();
    } catch (error) {
      console.error('Error deleting state:', error);
      message.error('Failed to delete state');
    }
  };

  // Toggle status
  const toggleStatus = async (id, currentStatus) => {
    try {
      const stateRef = doc(db, 'states', id);
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
      
      await updateDoc(stateRef, {
        status: newStatus,
        updated_at: serverTimestamp()
      });
      
      message.success(`State marked as ${newStatus}`);
      fetchStates();
    } catch (error) {
      console.error('Error updating status:', error);
      message.error('Failed to update status');
    }
  };

  // Table columns
  const columns = [
    {
      title: 'State Name (English)',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (text) => (
        <span className="font-medium">{text}</span>
      ),
    },
    {
      title: 'State Name (Hindi)',
      dataIndex: 'hindiName',
      key: 'hindiName',
      width: 200,
      render: (text) => (
        <span className="font-medium">{text || 'N/A'}</span>
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
            title="Delete State"
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
    <div className="p-4">
      {/* Header Section */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold">State Management</h1>
            <p className="text-gray-500">Manage states and their status</p>
          </div>
          
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingState(null);
              form.resetFields();
              form.setFieldsValue({ status: 'active' });
              setModalVisible(true);
            }}
            className="bg-gradient-to-r from-rose-600 to-orange-600"
          >
            Add New State
          </Button>
        </div>
      </div>

      {/* States Table */}
      <div className="bg-white rounded-lg shadow">
        <Table
          columns={columns}
          dataSource={states}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
          }}
          scroll={{ x: 600 }}
        />
      </div>

      {/* Add/Edit Modal */}
      <Modal
        title={editingState ? 'Edit State' : 'Add New State'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
          setEditingState(null);
        }}
        footer={null}
        width={400}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="name"
            label="State Name (English)"
            rules={[
              { required: true, message: 'Please enter state name' }
            ]}
          >
            <Input placeholder="e.g., Maharashtra" />
          </Form.Item>
          
          <Form.Item
            name="hindiName"
            label="State Name (Hindi)"
            rules={[
              { required: true, message: 'Please enter Hindi name' }
            ]}
          >
            <Input placeholder="e.g., महाराष्ट्र" />
          </Form.Item>
          
          <Form.Item
            name="status"
            label="Status"
            initialValue="active"
          >
            <Select>
              <Option value="active">Active</Option>
              <Option value="inactive">Inactive</Option>
            </Select>
          </Form.Item>

          <div className="flex justify-end gap-2 mt-6">
            <Button
              onClick={() => {
                setModalVisible(false);
                form.resetFields();
                setEditingState(null);
              }}
            >
              Cancel
            </Button>
            
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              className="bg-gradient-to-r from-rose-600 to-orange-600"
            >
              {editingState ? 'Update' : 'Add'}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default StateManagementPage;