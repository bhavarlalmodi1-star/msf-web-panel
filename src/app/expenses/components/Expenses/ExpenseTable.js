import React, { useState, useEffect, useCallback } from 'react';
import { 
  EditOutlined, 
  DeleteOutlined, 
  EyeOutlined,
  CalendarOutlined,
  DollarOutlined,
  TagOutlined,
  PictureOutlined,
  SearchOutlined,
  FilterOutlined,
  LeftOutlined,
  RightOutlined,
  DoubleLeftOutlined,
  DoubleRightOutlined
} from '@ant-design/icons';
import {
  Table,
  Tag,
  Button,
  Space,
  Tooltip,
  Empty,
  Badge,
  Avatar,
  Input,
  Select,
  Card,
  Statistic,
  Row,
  Col,
  Popconfirm,
  message,
  Modal,
  DatePicker,
  Typography,
  Pagination
} from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import { 
  deleteDoc, 
  doc, 
  increment, 
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  endBefore,
  getDocs,
  getCountFromServer,
  startAt,
  endAt,
  Timestamp
} from 'firebase/firestore';
import { db } from '../../../../../lib/firbase-client';

dayjs.extend(relativeTime);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
const { Option } = Select;
const { Text } = Typography;
const { RangePicker } = DatePicker;

const ExpenseTable = ({ 
  categories, 
  loading, 
  onViewDetails, 
  onEdit,
  onRefresh 
}) => {
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [dateRange, setDateRange] = useState(() => {
    // Default: Current month
    const startOfMonth = dayjs().startOf('month');
    const endOfMonth = dayjs().endOf('month');
    return [startOfMonth, endOfMonth];
  });
  const [sortField, setSortField] = useState('date');
  const [sortDirection, setSortDirection] = useState('desc');
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [lastVisible, setLastVisible] = useState(null);
  const [firstVisible, setFirstVisible] = useState(null);
  const [pageStack, setPageStack] = useState([]);
  
  // Data state
  const [expenses, setExpenses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [deleting, setDeleting] = useState(false);
  
  // Fetch total count for filters
  const fetchTotalCount = useCallback(async (filters = {}) => {
    try {
      let q = collection(db, 'expenses');
      const conditions = [];
      
      // Category filter
      if (filters.category && filters.category !== 'all') {
        conditions.push(where('category', '==', filters.category));
      }
      
      // Date range filter
      if (filters.dateRange && filters.dateRange.length === 2) {
        const [start, end] = filters.dateRange;
        conditions.push(
          where('date', '>=', Timestamp.fromDate(start.toDate())),
          where('date', '<=', Timestamp.fromDate(end.endOf('day').toDate()))
        );
      }
      
      // Search filter (will be handled client-side for better UX)
      
      if (conditions.length > 0) {
        q = query(q, ...conditions);
      }
      
      const snapshot = await getCountFromServer(q);
      return snapshot.data().count;
    } catch (error) {
      console.error('Error fetching count:', error);
      return 0;
    }
  }, []);
  
  // Fetch expenses with pagination and filters
  const fetchExpenses = useCallback(async (page = 1, isNext = true, filters = {}) => {
    try {
      setIsLoading(true);
      
      let q = collection(db, 'expenses');
      const conditions = [];
      
      // Category filter
      if (filters.category && filters.category !== 'all') {
        conditions.push(where('category', '==', filters.category));
      }
      
      // Date range filter
      if (filters.dateRange && filters.dateRange.length === 2) {
        const [start, end] = filters.dateRange;
        conditions.push(
          where('date', '>=', Timestamp.fromDate(start.toDate())),
          where('date', '<=', Timestamp.fromDate(end.endOf('day').toDate()))
        );
      }
      
      // Sort order
      conditions.push(orderBy(sortField, sortDirection));
      
      // Pagination
      conditions.push(limit(pageSize));
      
      // Apply cursor for pagination
      if (page > 1) {
        if (isNext && lastVisible) {
          conditions.push(startAfter(lastVisible));
        } else if (!isNext && firstVisible) {
          conditions.push(endBefore(firstVisible));
        }
      }
      
      q = query(q, ...conditions);
      const querySnapshot = await getDocs(q);
      
      const expensesData = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        expensesData.push({
          id: doc.id,
          ...data,
          date: data.date?.toDate ? data.date.toDate() : data.date
        });
      });
      
      // Update pagination cursors
      if (querySnapshot.docs.length > 0) {
        setFirstVisible(querySnapshot.docs[0]);
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
      }
      
      // Update page stack for navigation
      if (isNext && page > 1) {
        setPageStack(prev => [...prev, firstVisible]);
      } else if (!isNext && pageStack.length > 0) {
        setPageStack(prev => prev.slice(0, -1));
      }
      
      // Fetch total count with current filters
      const count = await fetchTotalCount(filters);
      setTotalExpenses(count);
      
      setExpenses(expensesData);
      setCurrentPage(page);
    } catch (error) {
      console.error('Error fetching expenses:', error);
      message.error('Failed to load expenses');
    } finally {
      setIsLoading(false);
    }
  }, [pageSize, sortField, sortDirection, lastVisible, firstVisible, pageStack, fetchTotalCount]);
  
  // Initial load and filter changes
  useEffect(() => {
    const filters = {
      category: selectedCategory,
      dateRange: dateRange
    };
    
    // Reset to first page when filters change
    setPageStack([]);
    setCurrentPage(1);
    setFirstVisible(null);
    setLastVisible(null);
    
    fetchExpenses(1, true, filters);
  }, [selectedCategory, dateRange, sortField, sortDirection, pageSize]);
  
  // Handle page change
  const handlePageChange = (page, isNext = true) => {
    const filters = {
      category: selectedCategory,
      dateRange: dateRange
    };
    fetchExpenses(page, isNext, filters);
  };
  
  // Handle next page
  const handleNextPage = () => {
    if (currentPage * pageSize < totalExpenses) {
      handlePageChange(currentPage + 1, true);
    }
  };
  
  // Handle previous page
  const handlePrevPage = () => {
    if (currentPage > 1) {
      handlePageChange(currentPage - 1, false);
    }
  };
  
  // Handle search (client-side for better UX)
  const handleSearch = (value) => {
    setSearchText(value);
  };
  
  // Handle delete expense
  const handleDelete = async (expense) => {
    Modal.confirm({
      title: 'Delete Expense',
      content: (
        <div>
          <p className="mb-2">Are you sure you want to delete this expense?</p>
          <p className="text-gray-500 text-sm">This action cannot be undone.</p>
        </div>
      ),
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      icon: null,
      centered: true,
      onOk: async () => {
        try {
          setDeleting(true);
          
          await deleteDoc(doc(db, 'expenses', expense.id));
          
          if (expense.category) {
            const categoryRef = doc(db, 'categories', expense.category);
            const expenseAmount = parseFloat(expense.amount) || 0;
            
            await updateDoc(categoryRef, {
              totalAmount: increment(-expenseAmount),
              transactionCount: increment(-1)
            });
          }
          
          message.success('Expense deleted successfully!');
          
          // Refresh data
          const filters = {
            category: selectedCategory,
            dateRange: dateRange
          };
          fetchExpenses(currentPage, true, filters);
          
          if (onRefresh) onRefresh();
        } catch (error) {
          console.error('Error deleting expense:', error);
          message.error('Failed to delete expense');
        } finally {
          setDeleting(false);
        }
      },
    });
  };
  
  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('Please select expenses to delete');
      return;
    }

    Modal.confirm({
      title: 'Delete Selected Expenses',
      content: (
        <div>
          <p>Are you sure you want to delete {selectedRowKeys.length} selected expense(s)?</p>
          <p className="text-gray-500 text-sm">This action cannot be undone.</p>
        </div>
      ),
      okText: 'Delete All',
      okType: 'danger',
      cancelText: 'Cancel',
      centered: true,
      onOk: async () => {
        try {
          setDeleting(true);
          
          const categoryUpdates = {};
          const expensesToDelete = expenses.filter(exp => selectedRowKeys.includes(exp.id));
          
          expensesToDelete.forEach(expense => {
            const categoryId = expense.category;
            const amount = parseFloat(expense.amount) || 0;
            
            if (categoryId) {
              if (!categoryUpdates[categoryId]) {
                categoryUpdates[categoryId] = {
                  totalAmount: 0,
                  count: 0
                };
              }
              categoryUpdates[categoryId].totalAmount -= amount;
              categoryUpdates[categoryId].count -= 1;
            }
          });
          
          const deletePromises = selectedRowKeys.map(id => 
            deleteDoc(doc(db, 'expenses', id))
          );
          
          const updatePromises = Object.entries(categoryUpdates).map(([categoryId, data]) => 
            updateDoc(doc(db, 'categories', categoryId), {
              totalAmount: increment(data.totalAmount),
              transactionCount: increment(data.count)
            })
          );
          
          await Promise.all([...deletePromises, ...updatePromises]);
          
          message.success(`Successfully deleted ${selectedRowKeys.length} expense(s)`);
          setSelectedRowKeys([]);
          
          // Refresh data
          const filters = {
            category: selectedCategory,
            dateRange: dateRange
          };
          fetchExpenses(currentPage, true, filters);
          
          if (onRefresh) onRefresh();
        } catch (error) {
          console.error('Error deleting expenses:', error);
          message.error('Failed to delete expenses');
        } finally {
          setDeleting(false);
        }
      },
    });
  };
  
  // Apply client-side search filter
  const filteredExpenses = React.useMemo(() => {
    if (!searchText) return expenses;
    
    return expenses.filter(expense =>
      expense.title?.toLowerCase().includes(searchText.toLowerCase()) ||
      expense.description?.toLowerCase().includes(searchText.toLowerCase()) ||
      expense.voucherNo?.toLowerCase().includes(searchText.toLowerCase())
    );
  }, [expenses, searchText]);
  
  // Calculate summary statistics
  const summaryStats = React.useMemo(() => {
    const totalAmount = filteredExpenses.reduce((sum, expense) => sum + parseFloat(expense.amount || 0), 0);
    const avgAmount = filteredExpenses.length > 0 ? totalAmount / filteredExpenses.length : 0;
    const todayExpenses = filteredExpenses.filter(expense => 
      dayjs(expense.date).isSame(dayjs(), 'day')
    ).length;
    const weekExpenses = filteredExpenses.filter(expense => 
      dayjs(expense.date).isAfter(dayjs().subtract(7, 'day'))
    ).length;

    return {
      totalAmount,
      avgAmount,
      totalCount: filteredExpenses.length,
      todayExpenses,
      weekExpenses,
      filteredCount: filteredExpenses.length
    };
  }, [filteredExpenses]);
  
  // Date presets for RangePicker
  const rangePresets = [
    { label: 'Today', value: [dayjs(), dayjs()] },
    { label: 'Yesterday', value: [dayjs().add(-1, 'd'), dayjs().add(-1, 'd')] },
    { label: 'This Week', value: [dayjs().startOf('week'), dayjs().endOf('week')] },
    { label: 'Last Week', value: [dayjs().add(-1, 'week').startOf('week'), dayjs().add(-1, 'week').endOf('week')] },
    { label: 'This Month', value: [dayjs().startOf('month'), dayjs().endOf('month')] },
    { label: 'Last Month', value: [dayjs().add(-1, 'month').startOf('month'), dayjs().add(-1, 'month').endOf('month')] },
    { label: 'Last 3 Months', value: [dayjs().add(-3, 'month'), dayjs()] },
    { label: 'This Year', value: [dayjs().startOf('year'), dayjs().endOf('year')] },
  ];
  
  const columns = [
    {
      title: (
        <div className="font-semibold text-gray-900 flex items-center gap-2">
          <TagOutlined className="text-blue-500" />
          <span>Expense</span>
        </div>
      ),
      dataIndex: 'title',
      key: 'title',
      render: (text, record) => {
        const category = categories.find(c => c.id === record.category);
        const hasBill = record.billUrls?.length > 0 || record.billUrl;
        
        return (
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <Avatar 
                size="large"
                style={{ 
                  backgroundColor: category?.color || '#1890ff',
                  color: '#fff',
                  fontSize: '16px',
                  fontWeight: 'bold'
                }}
              >
                {category?.icon || '💰'}
              </Avatar>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Text strong className="text-gray-900 text-base truncate">
                  {text}
                </Text>
                {hasBill && (
                  <Badge 
                    dot 
                    color="blue"
                    className="flex-shrink-0"
                  />
                )}
              </div>
              <Text type="secondary" className="text-sm truncate block">
                {record.description || 'No description'}
              </Text>
              <div className="flex items-center gap-3 mt-2">
                <Badge 
                  count={record.voucherNo}
                  style={{ 
                    backgroundColor: '#f0f9ff',
                    color: '#fff',
                    border: '1px solid #d1e9ff',
                    fontSize: '11px',
                    fontWeight: 'bold'
                  }}
                  className="px-2 py-1 rounded"
                />
                <span className="text-gray-400 text-xs">
                  <CalendarOutlined className="mr-1" />
                  {dayjs(record.date).format('DD MMM YYYY')}
                </span>
                <span className="text-gray-400 text-xs">
                  {dayjs(record.date).fromNow()}
                </span>
              </div>
            </div>
          </div>
        );
      },
    },
    {
      title: (
        <div className="font-semibold text-gray-900 flex items-center gap-2">
          <DollarOutlined className="text-green-500" />
          <span>Amount</span>
        </div>
      ),
      dataIndex: 'amount',
      key: 'amount',
      align: 'center',
      width: 150,
      sorter: true,
      sortOrder: sortField === 'amount' ? sortDirection : false,
      render: (amount) => (
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900 font-mono">
            ₹{parseFloat(amount).toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-gray-500">
            {parseFloat(amount).toLocaleString('en-IN', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}
          </div>
        </div>
      ),
    },
    {
      title: (
        <div className="font-semibold text-gray-900 flex items-center gap-2">
          <TagOutlined className="text-purple-500" />
          <span>Category</span>
        </div>
      ),
      dataIndex: 'category',
      key: 'category',
      width: 180,
      render: (categoryId) => {
        const category = categories.find(c => c.id === categoryId);
        if (!category) return '-';
        
        return (
          <div className="flex items-center gap-2">
            <div 
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: category.color }}
            />
            <Tag 
              color={category.color}
              style={{ 
                color: '#000',
                border: 'none',
                fontSize: '12px',
                fontWeight: 500,
                padding: '2px 8px',
                borderRadius: '12px'
              }}
            >
              {category.name}
              <span className="ml-1 text-xs opacity-80">
                (₹{(category.totalAmount || 0).toLocaleString()})
              </span>
            </Tag>
          </div>
        );
      },
    },
    {
      title: (
        <div className="font-semibold text-gray-900 flex items-center gap-2">
          <PictureOutlined className="text-orange-500" />
          <span>Bills</span>
        </div>
      ),
      key: 'bills',
      width: 120,
      render: (_, record) => {
        const billUrls = record.billUrls || (record.billUrl ? [record.billUrl] : []);
        
        if (billUrls.length === 0) {
          return (
            <span className="text-gray-400 italic text-sm">No bill</span>
          );
        }

        return (
          <div className="flex items-center gap-1">
            <Badge 
              count={billUrls.length} 
              color="blue"
              size="small"
            />
            <Button
              type="link"
              size="small"
              icon={<PictureOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                onViewDetails(record);
              }}
              className="text-blue-500"
            >
              View
            </Button>
          </div>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'center',
      width: 150,
      render: (_, record) => (
        <Space className="flex items-center justify-center">
          <Tooltip title="View Details">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                onViewDetails(record);
              }}
              className="text-green-500 hover:text-green-700 hover:bg-green-50"
              shape="circle"
            />
          </Tooltip>
          
          <Tooltip title="Edit">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                onEdit(record);
              }}
              className="text-blue-500 hover:text-blue-700 hover:bg-blue-50"
              shape="circle"
            />
          </Tooltip>
   
          <Tooltip title="Delete">
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(record);
              }}
              className="text-red-500 hover:text-red-700 hover:bg-red-50"
              shape="circle"
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  // Handle table sorting
  const handleTableChange = (pagination, filters, sorter) => {
    if (sorter.field) {
      setSortField(sorter.field);
      setSortDirection(sorter.order === 'ascend' ? 'asc' : 'desc');
    }
  };

  // Row selection configuration
  const rowSelection = {
    selectedRowKeys,
    onChange: setSelectedRowKeys,
    selections: [
      Table.SELECTION_ALL,
      Table.SELECTION_INVERT,
      Table.SELECTION_NONE,
    ],
  };

  if (isLoading && currentPage === 1) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
        <Text type="secondary">Loading expenses...</Text>
        <div className="mt-2">
          <Text type="secondary" className="text-sm">
            Please wait while we fetch your expense data
          </Text>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card className="shadow-sm border-0 h-full">
            <Statistic
              title="Total Expenses"
              value={totalExpenses}
              prefix={<TagOutlined className="text-blue-500" />}
              valueStyle={{ color: '#3f51b5', fontSize: '24px' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="shadow-sm border-0 h-full">
            <Statistic
              title="Current Page Total"
              value={summaryStats.totalAmount}
              prefix="₹"
              precision={2}
              prefix={<DollarOutlined className="text-green-500" />}
              valueStyle={{ color: '#4caf50', fontSize: '24px' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="shadow-sm border-0 h-full">
            <Statistic
              title="Average Expense"
              value={summaryStats.avgAmount}
              prefix="₹"
              precision={2}
              prefix={<DollarOutlined className="text-purple-500" />}
              valueStyle={{ color: '#9c27b0', fontSize: '24px' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="shadow-sm border-0 h-full">
            <Statistic
              title="Filtered Count"
              value={summaryStats.filteredCount}
              prefix={<FilterOutlined className="text-orange-500" />}
              valueStyle={{ color: '#ff9800', fontSize: '24px' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters and Actions Bar */}
      <Card className="shadow-sm border-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex-1">
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="Search expenses by title, description, or voucher..."
                prefix={<SearchOutlined className="text-gray-400" />}
                value={searchText}
                onChange={(e) => handleSearch(e.target.value)}
                className="max-w-md"
                size="large"
                allowClear
              />
              
              <Select
                placeholder="Category"
                value={selectedCategory}
                onChange={setSelectedCategory}
                className="min-w-[150px]"
                size="large"
                allowClear
              >
                <Option value="all">All Categories</Option>
                {categories.map(category => (
                  <Option key={category.id} value={category.id}>
                    <Space>
                      <div 
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      {category.name}
                      <span className="text-xs text-gray-500">
                        (₹{(category.totalAmount || 0).toLocaleString()})
                      </span>
                    </Space>
                  </Option>
                ))}
              </Select>

              <RangePicker
                presets={rangePresets}
                value={dateRange}
                onChange={setDateRange}
                format="DD MMM YYYY"
                placeholder={['Start Date', 'End Date']}
                className="min-w-[250px]"
                size="large"
                allowClear
              />

              <Select
                value={pageSize}
                onChange={(value) => setPageSize(value)}
                className="min-w-[100px]"
                size="large"
              >
                <Option value={5}>5 / page</Option>
                <Option value={10}>10 / page</Option>
                <Option value={20}>20 / page</Option>
                <Option value={50}>50 / page</Option>
              </Select>
            </div>
          </div>

          {selectedRowKeys.length > 0 && (
            <div className="flex items-center gap-3">
              <Text type="secondary">
                {selectedRowKeys.length} selected
              </Text>
              <Popconfirm
                title={`Delete ${selectedRowKeys.length} expense(s)?`}
                description="This will also update category amounts."
                onConfirm={handleBulkDelete}
                okText="Delete All"
                okType="danger"
                cancelText="Cancel"
              >
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  size="large"
                  loading={deleting}
                >
                  Delete Selected
                </Button>
              </Popconfirm>
            </div>
          )}
        </div>
      </Card>

      {/* Expense Table */}
      {filteredExpenses.length === 0 ? (
        <Empty
          image={
            <div className="flex flex-col items-center">
              <div className="text-6xl text-gray-300 mb-4">💰</div>
              <p className="text-gray-500 text-lg">No expenses found</p>
            </div>
          }
          description={
            <div className="space-y-2">
              <p className="text-gray-600">
                {expenses.length === 0 
                  ? 'Start by adding your first expense!' 
                  : 'Try adjusting your filters or search term'}
              </p>
              {expenses.length > 0 && (
                <Button
                  type="primary"
                  onClick={() => {
                    setSearchText('');
                    setSelectedCategory('all');
                    setDateRange([dayjs().startOf('month'), dayjs().endOf('month')]);
                  }}
                >
                  Clear All Filters
                </Button>
              )}
            </div>
          }
          className="py-16"
        />
      ) : (
        <Card className="shadow-sm border-0 overflow-hidden p-0">
          <Table
            columns={columns}
            dataSource={filteredExpenses}
            rowKey="id"
            rowSelection={rowSelection}
            loading={isLoading}
            onChange={handleTableChange}
            pagination={false}
            className="custom-expense-table"
            size="middle"
            scroll={{ x: 1000,y:400 }}
            onRow={(record) => ({
              onClick: () => onViewDetails(record),
              className: 'cursor-pointer hover:bg-blue-50 transition-colors duration-150',
            })}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row className="bg-gray-50 font-semibold">
                  <Table.Summary.Cell index={0} colSpan={2}>
                    <Text strong>Page Total ({filteredExpenses.length} expenses)</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="center">
                    <Text strong className="text-xl text-gray-900">
                      ₹{summaryStats.totalAmount.toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} colSpan={3} />
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
          
          {/* Custom Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t">
            <Text type="secondary">
              Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalExpenses)} of {totalExpenses} expenses
            </Text>
            
            <div className="flex items-center gap-2">
              <Button
                icon={<DoubleLeftOutlined />}
                onClick={() => handlePageChange(1, true)}
                disabled={currentPage === 1}
                size="small"
              />
              <Button
                icon={<LeftOutlined />}
                onClick={handlePrevPage}
                disabled={currentPage === 1}
                size="small"
              />
              
              <Pagination
                current={currentPage}
                pageSize={pageSize}
                total={totalExpenses}
                onChange={handlePageChange}
                showSizeChanger={false}
                showQuickJumper={false}
                simple
                size="small"
              />
              
              <Button
                icon={<RightOutlined />}
                onClick={handleNextPage}
                disabled={currentPage * pageSize >= totalExpenses}
                size="small"
              />
              <Button
                icon={<DoubleRightOutlined />}
                onClick={() => handlePageChange(Math.ceil(totalExpenses / pageSize), true)}
                disabled={currentPage * pageSize >= totalExpenses}
                size="small"
              />
            </div>
            
            <Select
              value={pageSize}
              onChange={(value) => setPageSize(value)}
              size="small"
              className="w-24"
            >
              <Option value={5}>5 / page</Option>
              <Option value={10}>10 / page</Option>
              <Option value={20}>20 / page</Option>
              <Option value={50}>50 / page</Option>
            </Select>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ExpenseTable;