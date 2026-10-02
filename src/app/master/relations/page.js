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

const RelationsManagementPage = () => {
  // State Management
  const [relations, setRelations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRelation, setEditingRelation] = useState(null);
  const [form] = Form.useForm();

  // Firebase collection reference
  const relationsCollectionRef = collection(db, 'relations');

  // Fetch relations from Firebase
  const fetchRelations = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(relationsCollectionRef);
      const relationsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Sort by name
      relationsData.sort((a, b) => a.name.localeCompare(b.name));
      console.log(relationsData,'relationsData')
      setRelations(relationsData);
    } catch (error) {
      console.error('Error fetching relations:', error);
      message.error('Failed to fetch relations');
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchRelations();
  }, []);

  // Handle form submission (Add/Edit)
  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      
      if (editingRelation) {
        // Update existing relation
        const relationRef = doc(db, 'relations', editingRelation.id);
        await updateDoc(relationRef, {
          ...values,
          updated_at: serverTimestamp()
        });
        
        message.success('Relation updated successfully!');
      } else {
        // Add new relation
        await addDoc(relationsCollectionRef, {
          ...values,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp()
        });
        
        message.success('Relation added successfully!');
      }
      
      setModalVisible(false);
      form.resetFields();
      setEditingRelation(null);
      fetchRelations();
    } catch (error) {
      console.error('Error saving relation:', error);
      message.error('Failed to save relation');
    } finally {
      setLoading(false);
    }
  };

  // Handle edit
  const handleEdit = (record) => {
    setEditingRelation(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  // Handle delete
  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, 'relations', id));
      message.success('Relation deleted successfully!');
      fetchRelations();
    } catch (error) {
      console.error('Error deleting relation:', error);
      message.error('Failed to delete relation');
    }
  };

  // Toggle status
  const toggleStatus = async (id, currentStatus) => {
    try {
      const relationRef = doc(db, 'relations', id);
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
      
      await updateDoc(relationRef, {
        status: newStatus,
        updated_at: serverTimestamp()
      });
      
      message.success(`Relation marked as ${newStatus}`);
      fetchRelations();
    } catch (error) {
      console.error('Error updating status:', error);
      message.error('Failed to update status');
    }
  };

  // Table columns
  const columns = [
    {
      title: 'Relation Name (English)',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (text) => (
        <span className="font-medium">{text}</span>
      ),
    },
    {
      title: 'Relation Name (Hindi)',
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
            title="Delete Relation"
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
            <h1 className="text-2xl font-bold">Relations Management</h1>
            <p className="text-gray-500">Manage relations and their status</p>
          </div>
          
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingRelation(null);
              form.resetFields();
              form.setFieldsValue({ status: 'active' });
              setModalVisible(true);
            }}
            className="bg-gradient-to-r from-rose-600 to-orange-600"
          >
            Add New Relation
          </Button>
        </div>
      </div>

      {/* Relations Table */}
      <div className="bg-white rounded-lg shadow">
        <Table
          columns={columns}
          dataSource={relations}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
          }}
          scroll={{ x: 700 }}
        />
      </div>

      {/* Add/Edit Modal */}
      <Modal
        title={editingRelation ? 'Edit Relation' : 'Add New Relation'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
          setEditingRelation(null);
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
            label="Relation Name (English)"
            rules={[
              { required: true, message: 'Please enter relation name' }
            ]}
          >
            <Input placeholder="e.g., Brother" />
          </Form.Item>
          
          <Form.Item
            name="hindiName"
            label="Relation Name (Hindi)"
            rules={[
              { required: true, message: 'Please enter Hindi name' }
            ]}
          >
            <Input placeholder="e.g., भाई" />
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
                setEditingRelation(null);
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
              {editingRelation ? 'Update' : 'Add'}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default RelationsManagementPage;