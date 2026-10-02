import React, { useState, useEffect } from 'react';
import {
  PlusOutlined,
  EditOutlined,
  UploadOutlined,
  DeleteOutlined,
  CloseOutlined,
  DollarOutlined,
  TagOutlined
} from '@ant-design/icons';
import {
  Drawer,
  Form,
  Input,
  Select,
  DatePicker,
  Button,
  Row,
  Col,
  Space,
  Upload,
  message,
  Card,
  Divider,
  Image,
  InputNumber
} from 'antd';
import dayjs from 'dayjs';
import { 
  addDoc, 
  updateDoc, 
  doc, 
  Timestamp, 
  collection,
  increment 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../../../../lib/firbase-client';

const { Option } = Select;
const { TextArea } = Input;

const ExpenseForm = ({ visible, onClose, categories, expense, onSuccess }) => {
  const [form] = Form.useForm();
  const [uploading, setUploading] = useState(false);
  const [fileList, setFileList] = useState([]);

  // Reset form
  useEffect(() => {
    if (expense) {
      form.setFieldsValue({
        ...expense,
        date: dayjs(expense.date),
        category: expense.category
      });
      
      if (expense.billUrls?.length > 0) {
        setFileList(expense.billUrls.map((url, index) => ({
          uid: `-${index}`,
          name: `bill-${index + 1}.jpg`,
          status: 'done',
          url: url,
        })));
      }
    } else {
      form.resetFields();
      setFileList([]);
      form.setFieldsValue({
        date: dayjs(),
        category: categories[0]?.id
      });
    }
  }, [expense, form, categories]);

  // Upload file
  const uploadFile = async (file) => {
    const storageRef = ref(storage, `bills/${Date.now()}_${file.name}`);
    const snapshot = await uploadBytes(storageRef, file);
    return await getDownloadURL(snapshot.ref);
  };

  // Main save function - YAHI IMPORTANT HAI
const handleSubmit = async (values) => {
  try {
    setUploading(true);
    
    const amount = parseFloat(values.amount);
    const categoryId = values.category;
    
    // Upload files if any
    let billUrls = [];
    if (fileList.length > 0) {
      const filesToUpload = fileList.filter(f => f.originFileObj).map(f => f.originFileObj);
      for (const file of filesToUpload) {
        const url = await uploadFile(file);
        billUrls.push(url);
      }
    }
    
    const expenseData = {
      ...values,
      amount: amount,
      date: Timestamp.fromDate(values.date.toDate()),
      billUrls: [], // Initialize with empty array
      updatedAt: Timestamp.now()
    };

    // Handle bill URLs properly based on mode
    if (billUrls.length > 0) {
      // New files were uploaded
      expenseData.billUrls = billUrls;
    } else if (expense && expense.billUrls && expense.billUrls.length > 0) {
      // Edit mode: keep existing bill URLs if no new files uploaded
      expenseData.billUrls = expense.billUrls;
    }

    // YEH IMPORTANT PART HAI - Category update karna
    if (expense) {
      // EDIT MODE - Update existing expense
      
      // Pehle old expense ka data dekho
      const oldAmount = parseFloat(expense.amount);
      const oldCategoryId = expense.category;
      const newCategoryId = values.category;
      const amountDifference = amount - oldAmount;
      
      // Update expense
      await updateDoc(doc(db, 'expenses', expense.id), expenseData);
      
      // Category update karo based on changes
      if (oldCategoryId === newCategoryId) {
        // Same category hai, sirf amount update karo
        await updateDoc(doc(db, 'categories', oldCategoryId), {
          totalAmount: increment(amountDifference),
          transactionCount: increment(0) // Count same rahega
        });
      } else {
        // Category change hua hai
        // Old category se amount ghatao
        await updateDoc(doc(db, 'categories', oldCategoryId), {
          totalAmount: increment(-oldAmount),
          transactionCount: increment(-1)
        });
        
        // New category mein amount jodo
        await updateDoc(doc(db, 'categories', newCategoryId), {
          totalAmount: increment(amount),
          transactionCount: increment(1)
        });
      }
      
      message.success('Expense updated!');
    } else {
      // ADD MODE - New expense
      
      // Generate voucher number
      const voucherNo = `EXP-${dayjs().format('YYYYMMDD')}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      
      expenseData.voucherNo = voucherNo;
      expenseData.createdAt = Timestamp.now();
      
      // Add expense
      await addDoc(collection(db, 'expenses'), expenseData);
      
      // Category update karo - amount jodo aur count badhao
      await updateDoc(doc(db, 'categories', categoryId), {
        totalAmount: increment(amount),
        transactionCount: increment(1)
      });
      
      message.success('Expense added!');
    }

    onSuccess();
    onClose();
  } catch (error) {
    console.error('Error:', error);
    message.error('Failed to save expense');
  } finally {
    setUploading(false);
  }
};

  // Upload settings
  const uploadProps = {
    onRemove: (file) => {
      setFileList(fileList.filter(f => f.uid !== file.uid));
    },
    beforeUpload: (file) => {
      // Max 3 files
      if (fileList.length >= 3) {
        message.error('Max 3 files allowed');
        return false;
      }
      
      // Image check
      if (!file.type.startsWith('image/')) {
        message.error('Only images allowed');
        return false;
      }
      
      // Size check (5MB)
      if (file.size > 5 * 1024 * 1024) {
        message.error('File must be < 5MB');
        return false;
      }
      
      const newFile = {
        uid: Date.now(),
        name: file.name,
        status: 'done',
        originFileObj: file,
        url: URL.createObjectURL(file)
      };
      
      setFileList([...fileList, newFile]);
      return false;
    },
    fileList,
    multiple: true
  };

  return (
    <Drawer
      title={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {expense ? <EditOutlined className="text-blue-500" /> : <PlusOutlined className="text-green-500" />}
            <span className="text-lg font-bold">
              {expense ? 'Edit Expense' : 'Add Expense'}
            </span>
          </div>
          <Button
            type="text"
            icon={<CloseOutlined />}
            onClick={onClose}
          />
        </div>
      }
      open={visible}
      onClose={onClose}
      width={600}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        size="large"
      >
        {/* Title */}
        <Form.Item
          label="Expense Title"
          name="title"
          rules={[{ required: true, message: 'Title required' }]}
        >
          <Input placeholder="e.g., Grocery Shopping" />
        </Form.Item>

        <Row gutter={16}>
          {/* Amount */}
          <Col span={12}>
            <Form.Item
              label="Amount (₹)"
              name="amount"
              rules={[{ required: true, message: 'Amount required' }]}
            >
              <InputNumber
                style={{ width: '100%' }}
                placeholder="0.00"
                min={0}
                step={0.01}
                formatter={value => `₹ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              />
            </Form.Item>
          </Col>

          {/* Date */}
          <Col span={12}>
            <Form.Item
              label="Date"
              name="date"
              rules={[{ required: true, message: 'Date required' }]}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        {/* Category */}
        <Form.Item
          label="Category"
          name="category"
          rules={[{ required: true, message: 'Category required' }]}
        >
          <Select placeholder="Select category">
            {categories.map(cat => (
              <Option key={cat.id} value={cat.id}>
                <Space>
                  <span style={{ color: cat.color }}>{cat.icon}</span>
                  <span>{cat.name}</span>
                  <span className="text-gray-400 text-xs">
                    (₹{cat.totalAmount?.toLocaleString() || 0}, {cat.transactionCount || 0} expenses)
                  </span>
                </Space>
              </Option>
            ))}
          </Select>
        </Form.Item>

        {/* Description */}
        <Form.Item label="Description" name="description">
          <TextArea rows={3} placeholder="Optional notes..." />
        </Form.Item>

        {/* File Upload */}
        <Form.Item label="Bill Photos (Max 3)">
          <Upload.Dragger {...uploadProps}>
            <p className="ant-upload-drag-icon">
              <UploadOutlined />
            </p>
            <p className="ant-upload-text">Click or drag files here</p>
            <p className="ant-upload-hint">Max 3 images, 5MB each</p>
          </Upload.Dragger>
        </Form.Item>

        {/* Preview uploaded files */}
        {fileList.length > 0 && (
          <div className="mb-4">
            <div className="text-sm text-gray-600 mb-2">
              {fileList.length} file{fileList.length > 1 ? 's' : ''} selected
            </div>
            <div className="grid grid-cols-3 gap-2">
              {fileList.map((file, index) => (
                <div key={file.uid} className="relative">
                  <Image
                    src={file.url}
                    alt={file.name}
                    className="rounded-md h-20 object-cover"
                    preview
                  />
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    className="absolute top-1 right-1"
                    onClick={() => {
                      const newList = [...fileList];
                      newList.splice(index, 1);
                      setFileList(newList);
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <Divider />

        {/* Submit Button */}
        <div className="flex justify-end gap-3">
          <Button onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={uploading}
            icon={expense ? <EditOutlined /> : <PlusOutlined />}
          >
            {expense ? 'Update' : 'Add Expense'}
          </Button>
        </div>
      </Form>
    </Drawer>
  );
};

export default ExpenseForm;