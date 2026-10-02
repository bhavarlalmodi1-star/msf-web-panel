import React, { useState } from 'react';
import { 
  PlusCircleOutlined, 
  EditOutlined, 
  DeleteOutlined,
  TagOutlined,
  CheckOutlined,
  CloseOutlined,
  SearchOutlined,
  SortAscendingOutlined,
  MoreOutlined,
  CopyOutlined,
  EyeOutlined
} from '@ant-design/icons';
import {
  Card,
  Row,
  Col,
  Button,
  Modal,
  Form,
  Input,
  ColorPicker,
  Space,
  Tag,
  Empty,
  message,
  Popconfirm,
  Divider,
  InputNumber,
  Dropdown,
  Tooltip,
  Badge,
  Statistic,
  Progress,
  Select,
  Avatar,
  Drawer
} from 'antd';
import { 
  addDoc, 
  collection, 
  deleteDoc, 
  doc, 
  Timestamp, 
  updateDoc,
  getDocs,
  query,
  where
} from 'firebase/firestore';
import { db } from '../../../../../lib/firbase-client';

const { Option } = Select;

const CategoryManager = ({ categories, onCategoryUpdate, expenses }) => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isDrawerVisible, setIsDrawerVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [newCategoryColor, setNewCategoryColor] = useState('#1677ff');
  const [newCategoryIcon, setNewCategoryIcon] = useState('🏷️');
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  // Icons for selection
  const categoryIcons = [
    '🏷️', '🍔', '🚗', '🛍️', '🎮', '📱', '🏥', '📚', '📦',
    '🏠', '✈️', '🎬', '🏋️', '🍽️', '🎓', '💊', '💡', '💧',
    '📺', '🎧', '💻', '🐶', '🌹', '🎁', '🏦', '💰', '🎯',
    '⚽', '🎨', '🎤', '🚕', '🍕', '☕', '📸', '🛏️', '👔'
  ];

  // Get category stats
  const getCategoryStats = (categoryId) => {
    if (!expenses || !categoryId) return { count: 0, total: 0, average: 0 };
    
    const categoryExpenses = expenses.filter(exp => exp.category === categoryId);
    const count = categoryExpenses.length;
    const total = categoryExpenses.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0);
    const average = count > 0 ? total / count : 0;
    
    return { count, total, average };
  };

  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      
      const categoryData = {
        ...values,
        color: newCategoryColor,
        icon: newCategoryIcon,
        updatedAt: Timestamp.now(),
      };

      if (editingCategory) {
        await updateDoc(doc(db, 'categories', editingCategory.id), categoryData);
        message.success('Category updated successfully!');
      } else {
        categoryData.createdAt = Timestamp.now();
        await addDoc(collection(db, 'categories'), categoryData);
        message.success('Category added successfully!');
      }
      
      setIsModalVisible(false);
      setEditingCategory(null);
      form.resetFields();
      setNewCategoryColor('#1677ff');
      setNewCategoryIcon('🏷️');
      
      if (onCategoryUpdate) onCategoryUpdate();
    } catch (error) {
      console.error('Error saving category:', error);
      message.error('Failed to save category');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (categoryId) => {
    try {
      // Check if category has expenses
      const categoryExpenses = expenses.filter(exp => exp.category === categoryId);
      if (categoryExpenses.length > 0) {
        Modal.confirm({
          title: 'Cannot Delete Category',
          content: `This category has ${categoryExpenses.length} expenses. Move or delete expenses first.`,
          okText: 'OK',
          okType: 'danger',
          cancelText: null,
          closable: true
        });
        return;
      }

      await deleteDoc(doc(db, 'categories', categoryId));
      message.success('Category deleted successfully!');
      if (onCategoryUpdate) onCategoryUpdate();
    } catch (error) {
      console.error('Error deleting category:', error);
      message.error('Failed to delete category');
    }
  };

  const handleDuplicate = async (category) => {
    try {
      setLoading(true);
      await addDoc(collection(db, 'categories'), {
        ...category,
        name: `${category.name} (Copy)`,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
      message.success('Category duplicated successfully!');
      if (onCategoryUpdate) onCategoryUpdate();
    } catch (error) {
      console.error('Error duplicating category:', error);
      message.error('Failed to duplicate category');
    } finally {
      setLoading(false);
    }
  };

  const showCategoryDetails = (category) => {
    setSelectedCategory(category);
    setIsDrawerVisible(true);
  };

  // Filter categories based on search
  const filteredCategories = categories.filter(category =>
    category.name.toLowerCase().includes(searchText.toLowerCase())
  );

  // Calculate total stats
  const totalCategories = categories.length;
  const totalExpensesInAll = expenses?.length || 0;
  const totalAmountInAll = expenses?.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0) || 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}


      {/* Header and Actions */}
      <Card className="shadow-sm border-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100">
              <TagOutlined className="text-purple-500 text-xl" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 m-0">Category Manager</h1>
              <p className="text-gray-500 text-sm m-0">
                Manage and organize your expense categories
              </p>
            </div>
          </div>

          <Space className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Search categories..."
              prefix={<SearchOutlined className="text-gray-400" />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full sm:w-auto"
              allowClear
            />
            <Button
              type="primary"
              icon={<PlusCircleOutlined />}
              onClick={() => setIsModalVisible(true)}
              className="bg-gradient-to-r from-green-500 to-teal-600 border-0"
              size="large"
            >
              New Category
            </Button>
          </Space>
        </div>

        {filteredCategories.length === 0 ? (
          <Empty
            description={
              <div className="text-center py-8">
                <p className="text-gray-600 mb-2">
                  {categories.length === 0 
                    ? 'No categories found. Create your first category!' 
                    : 'No categories match your search'}
                </p>
                {searchText && (
                  <Button type="link" onClick={() => setSearchText('')}>
                    Clear Search
                  </Button>
                )}
              </div>
            }
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <Row gutter={[16, 16]}>
            {filteredCategories.map(category => {
              const stats = getCategoryStats(category.id);
              const percentage = totalAmountInAll > 0 ? (stats.total / totalAmountInAll) * 100 : 0;
              
              return (
                <Col xs={24} sm={12} lg={8} xl={6} key={category.id}>
                  <Card 
                    className="hover:shadow-lg transition-all duration-300 border-0 cursor-pointer"
                    style={{ 
                      borderLeft: `4px solid ${category.color}`,
                      borderTop: `1px solid ${category.color}20`
                    }}
                    onClick={() => showCategoryDetails(category)}
                    actions={[
                      <Tooltip title="View Details" key="view">
                        <EyeOutlined 
                          className="text-blue-500 hover:text-blue-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            showCategoryDetails(category);
                          }}
                        />
                      </Tooltip>,
                      <Tooltip title="Edit" key="edit">
                        <EditOutlined 
                          className="text-green-500 hover:text-green-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCategory(category);
                            form.setFieldsValue(category);
                            setNewCategoryColor(category.color);
                            setNewCategoryIcon(category.icon);
                            setIsModalVisible(true);
                          }}
                        />
                      </Tooltip>,
                      <Tooltip title="Delete" key="delete">
                        <Popconfirm
                          title="Delete Category"
                          description={
                            <div>
                              <p>Are you sure you want to delete "{category.name}"?</p>
                              {stats.count > 0 && (
                                <p className="text-red-500 text-sm mt-1">
                                  This category has {stats.count} expenses
                                </p>
                              )}
                            </div>
                          }
                          onConfirm={(e) => {
                            e?.stopPropagation();
                            handleDelete(category.id);
                          }}
                          okText="Delete"
                          okType="danger"
                          cancelText="Cancel"
                        >
                          <DeleteOutlined 
                            className="text-red-500 hover:text-red-700"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </Popconfirm>
                      </Tooltip>
                    ]}
                  >
                    <div className="text-center">
                      <div 
                        className="w-20 h-20 rounded-full flex items-center justify-center text-4xl mx-auto mb-4"
                        style={{ 
                          backgroundColor: category.color,
                          color: '#fff',
                          boxShadow: `0 4px 12px ${category.color}40`
                        }}
                      >
                        {category.icon}
                      </div>
                      
                      <h3 className="font-bold text-gray-900 text-lg mb-2 truncate">
                        {category.name}
                      </h3>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Expenses:</span>
                          <span className="font-bold">{category.transactionCount}</span>
                        </div>
                        
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Total:</span>
                          <span className="font-bold text-green-600">
                            ₹{category.totalAmount}
                          </span>
                        </div>
                        
                       
                      </div>
                      
                 
                    </div>
                  </Card>
                </Col>
              );
            })}
          </Row>
        )}
      </Card>

      {/* Category Form Modal */}
      <Modal
        title={
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100">
              {editingCategory ? (
                <EditOutlined className="text-green-500 text-lg" />
              ) : (
                <PlusCircleOutlined className="text-green-500 text-lg" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 m-0">
                {editingCategory ? 'Edit Category' : 'Add New Category'}
              </h2>
              <p className="text-gray-500 text-sm m-0">
                {editingCategory ? 'Update category details' : 'Create a new expense category'}
              </p>
            </div>
          </div>
        }
        open={isModalVisible}
        onCancel={() => {
          setIsModalVisible(false);
          setEditingCategory(null);
          form.resetFields();
          setNewCategoryColor('#1677ff');
          setNewCategoryIcon('🏷️');
        }}
        footer={null}
        width={600}
        centered
        className="rounded-lg"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          size="large"
        >
          <Form.Item
            label={
              <span className="font-medium text-gray-900">
                Category Name <span className="text-red-500">*</span>
              </span>
            }
            name="name"
            rules={[
              { required: true, message: 'Please enter category name' },
              { max: 50, message: 'Name must be less than 50 characters' }
            ]}
          >
            <Input 
              placeholder="e.g., Grocery, Rent, Entertainment, Transportation" 
              className="rounded-lg"
              showCount
              maxLength={50}
            />
          </Form.Item>

          <Form.Item
            label={
              <span className="font-medium text-gray-900">Icon</span>
            }
          >
            <div className="mb-4">
              <div className="flex items-center gap-4 mb-4">
                <div 
                  className="w-16 h-16 rounded-full flex items-center justify-center text-3xl shadow-md"
                  style={{ 
                    backgroundColor: newCategoryColor,
                    color: '#fff'
                  }}
                >
                  {newCategoryIcon}
                </div>
                <div>
                  <p className="text-gray-600 text-sm mb-1">Selected Icon</p>
                  <p className="text-gray-500 text-xs">
                    Click on any icon below to select
                  </p>
                </div>
              </div>
              
              <div className="border rounded-lg p-4 max-h-60 overflow-y-auto">
                <div className="grid grid-cols-6 gap-2">
                  {categoryIcons.map((icon, index) => (
                    <Button
                      key={index}
                      type={newCategoryIcon === icon ? "primary" : "text"}
                      onClick={() => setNewCategoryIcon(icon)}
                      className={`text-2xl h-12 w-12 flex items-center justify-center rounded-lg ${
                        newCategoryIcon === icon 
                          ? 'shadow-md' 
                          : 'hover:bg-gray-100'
                      }`}
                      style={{
                        backgroundColor: newCategoryIcon === icon ? newCategoryColor : 'transparent',
                        borderColor: newCategoryIcon === icon ? newCategoryColor : '#d9d9d9'
                      }}
                    >
                      {icon}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </Form.Item>

          <Form.Item
            label={
              <span className="font-medium text-gray-900">Color</span>
            }
          >
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <ColorPicker
                  value={newCategoryColor}
                  onChange={(color) => setNewCategoryColor(color.toHexString())}
                  size="large"
                  showText
                  format="hex"
                  presets={[
                    {
                      label: 'Recommended Colors',
                      colors: [
                        '#1677ff', '#52c41a', '#fa8c16', '#f5222d', '#722ed1',
                        '#13c2c2', '#eb2f96', '#faad14', '#a0d911', '#1890ff'
                      ],
                    }
                  ]}
                />
                <div className="flex flex-col">
                  <div 
                    className="w-16 h-16 rounded-lg shadow-md mb-2"
                    style={{ backgroundColor: newCategoryColor }}
                  />
                  <span className="text-xs text-gray-500 font-mono">
                    {newCategoryColor}
                  </span>
                </div>
              </div>
            </div>
          </Form.Item>

          <Divider />

          <div className="flex justify-end gap-3">
            <Button 
              onClick={() => {
                setIsModalVisible(false);
                setEditingCategory(null);
                form.resetFields();
                setNewCategoryColor('#1677ff');
                setNewCategoryIcon('🏷️');
              }} 
              size="large"
            >
              Cancel
            </Button>
            <Button 
              type="primary" 
              htmlType="submit" 
              size="large"
              icon={editingCategory ? <CheckOutlined /> : <PlusCircleOutlined />}
              loading={loading}
              className="bg-gradient-to-r from-green-500 to-teal-600 border-0"
            >
              {editingCategory ? 'Update Category' : 'Add Category'}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Category Details Drawer */}
      <Drawer
        title={
          <div className="flex items-center gap-3">
            {selectedCategory && (
              <Avatar 
                size="large"
                style={{ 
                  backgroundColor: selectedCategory.color,
                  color: '#fff',
                  fontSize: '20px'
                }}
              >
                {selectedCategory.icon}
              </Avatar>
            )}
            <div>
              <h2 className="text-lg font-bold text-gray-900 m-0">
                {selectedCategory?.name}
              </h2>
              <p className="text-gray-500 text-sm m-0">Category Details</p>
            </div>
          </div>
        }
        open={isDrawerVisible}
        onClose={() => setIsDrawerVisible(false)}
        width={500}
        extra={
          <Button
            type="text"
            icon={<CloseOutlined />}
            onClick={() => setIsDrawerVisible(false)}
          />
        }
      >
        {selectedCategory && (
          <div className="space-y-6">
            <div className="text-center py-4">
              <div 
                className="w-24 h-24 rounded-full flex items-center justify-center text-5xl mx-auto mb-4"
                style={{ 
                  backgroundColor: selectedCategory.color,
                  color: '#fff',
                  boxShadow: `0 8px 25px ${selectedCategory.color}40`
                }}
              >
                {selectedCategory.icon}
              </div>
              <Tag 
                color={selectedCategory.color}
                className="text-white px-4 py-1 rounded-full text-lg font-medium"
              >
                {selectedCategory.name}
              </Tag>
            </div>

            <Divider />

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-700">Color Code:</span>
                <div className="flex items-center gap-2">
                  <div 
                    className="w-6 h-6 rounded"
                    style={{ backgroundColor: selectedCategory.color }}
                  />
                  <span className="font-mono">{selectedCategory.color}</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-700">Total Expenses:</span>
                <span className="font-bold">
                  {selectedCategory.transactionCount}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-700">Total Amount:</span>
                <span className="font-bold text-green-600">
                  ₹{selectedCategory.totalAmount}
                </span>
              </div>

            
            </div>

            <Divider />

            <div className="flex gap-3">
              <Button
                type="default"
                icon={<EditOutlined />}
                onClick={() => {
                  setIsDrawerVisible(false);
                  setEditingCategory(selectedCategory);
                  form.setFieldsValue(selectedCategory);
                  setNewCategoryColor(selectedCategory.color);
                  setNewCategoryIcon(selectedCategory.icon);
                  setIsModalVisible(true);
                }}
                block
              >
                Edit Category
              </Button>
              
              <Popconfirm
                title="Delete Category"
                description="Are you sure you want to delete this category?"
                onConfirm={() => {
                  handleDelete(selectedCategory.id);
                  setIsDrawerVisible(false);
                }}
                okText="Delete"
                okType="danger"
              >
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  block
                >
                  Delete
                </Button>
              </Popconfirm>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default CategoryManager;