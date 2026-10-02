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

const CasteManagementPage = () => {
  // State Management
  const [castes, setCastes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCaste, setEditingCaste] = useState(null);
  const [form] = Form.useForm();

  // Firebase collection reference
  const castesCollectionRef = collection(db, 'castes');

  // Fetch castes from Firebase
  const fetchCastes = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(castesCollectionRef);
      const castesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Sort by name
      castesData.sort((a, b) => a.name.localeCompare(b.name));
      
      setCastes(castesData);
    } catch (error) {
      console.error('Error fetching castes:', error);
      message.error('Failed to fetch castes');
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchCastes();
  }, []);

  // Handle form submission (Add/Edit)
  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      
      if (editingCaste) {
        // Update existing caste
        const casteRef = doc(db, 'castes', editingCaste.id);
        await updateDoc(casteRef, {
          ...values,
          updated_at: serverTimestamp()
        });
        
        message.success('Caste updated successfully!');
      } else {
        // Add new caste
        await addDoc(castesCollectionRef, {
          ...values,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp()
        });
        
        message.success('Caste added successfully!');
      }
      
      setModalVisible(false);
      form.resetFields();
      setEditingCaste(null);
      fetchCastes();
    } catch (error) {
      console.error('Error saving caste:', error);
      message.error('Failed to save caste');
    } finally {
      setLoading(false);
    }
  };

  // Handle edit
  const handleEdit = (record) => {
    setEditingCaste(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  // Handle delete
  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, 'castes', id));
      message.success('Caste deleted successfully!');
      fetchCastes();
    } catch (error) {
      console.error('Error deleting caste:', error);
      message.error('Failed to delete caste');
    }
  };

  // Toggle status
  const toggleStatus = async (id, currentStatus) => {
    try {
      const casteRef = doc(db, 'castes', id);
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
      
      await updateDoc(casteRef, {
        status: newStatus,
        updated_at: serverTimestamp()
      });
      
      message.success(`Caste marked as ${newStatus}`);
      fetchCastes();
    } catch (error) {
      console.error('Error updating status:', error);
      message.error('Failed to update status');
    }
  };

  // Table columns
  const columns = [
    {
      title: 'Caste Name (English)',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (text) => (
        <span className="font-medium">{text}</span>
      ),
    },
    {
      title: 'Caste Name (Hindi)',
      dataIndex: 'hindiName',
      key: 'hindiName',
      width: 200,
      render: (text) => (
        <span className="font-medium">{text || 'N/A'}</span>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (text) => (
        <span className="text-gray-500">{text || 'No description'}</span>
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
            title="Delete Caste"
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
            <h1 className="text-2xl font-bold">Caste Management</h1>
            <p className="text-gray-500">Manage castes and their status</p>
          </div>
          
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingCaste(null);
              form.resetFields();
              form.setFieldsValue({ status: 'active' });
              setModalVisible(true);
            }}
            className="bg-gradient-to-r from-rose-600 to-orange-600"
          >
            Add New Caste
          </Button>
        </div>
      </div>

      {/* Castes Table */}
      <div className="bg-white rounded-lg shadow">
        <Table
          columns={columns}
          dataSource={castes}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
          }}
          scroll={{ x: 800 }}
        />
      </div>

      {/* Add/Edit Modal */}
      <Modal
        title={editingCaste ? 'Edit Caste' : 'Add New Caste'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
          setEditingCaste(null);
        }}
        footer={null}
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="name"
            label="Caste Name (English)"
            rules={[
              { required: true, message: 'Please enter caste name' }
            ]}
          >
            <Input placeholder="e.g., Brahmin" />
          </Form.Item>
          
          <Form.Item
            name="hindiName"
            label="Caste Name (Hindi)"
            rules={[
              { required: true, message: 'Please enter Hindi name' }
            ]}
          >
            <Input placeholder="e.g., ब्राह्मण" />
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
                setEditingCaste(null);
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
              {editingCaste ? 'Update' : 'Add'}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default CasteManagementPage;