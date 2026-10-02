import React, { useState } from 'react';
import { 
  FilterOutlined, 
  CloseOutlined, 
  SearchOutlined,
  CaretDownOutlined 
} from '@ant-design/icons';
import {
  Card,
  Input,
  Select,
  Button,
  DatePicker,
  Row,
  Col,
  Space,
  Divider
} from 'antd';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Option } = Select;

const ExpenseFilters = ({ onFilterChange, categories }) => {
  const [period, setPeriod] = useState('all');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [dates, setDates] = useState(null);

  const handleFilterUpdate = () => {
    onFilterChange({ period, category, search, dates });
  };

  const handleClearFilters = () => {
    setPeriod('all');
    setCategory('all');
    setSearch('');
    setDates(null);
    onFilterChange({ period: 'all', category: 'all', search: '', dates: null });
  };

  return (
    <Card className="shadow-lg border-0 mb-6">
      <div className="flex items-center gap-2 mb-6">
        <FilterOutlined className="text-purple-500 text-lg" />
        <h3 className="text-xl font-bold text-gray-900">Filters & Search</h3>
      </div>
      
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Input
            placeholder="Search expenses..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setTimeout(handleFilterUpdate, 300);
            }}
            size="large"
            className="rounded-lg"
            allowClear
          />
        </Col>
        
        <Col xs={24} md={6}>
          <Select
            value={period}
            onChange={(value) => {
              setPeriod(value);
              handleFilterUpdate();
            }}
            size="large"
            className="w-full rounded-lg"
            placeholder="Time Period"
            suffixIcon={<CaretDownOutlined />}
          >
            <Option value="all">All Time</Option>
            <Option value="today">Today</Option>
            <Option value="week">This Week</Option>
            <Option value="month">This Month</Option>
          </Select>
        </Col>
        
        <Col xs={24} md={6}>
          <Select
            value={category}
            onChange={(value) => {
              setCategory(value);
              handleFilterUpdate();
            }}
            size="large"
            className="w-full rounded-lg"
            placeholder="Category"
            suffixIcon={<CaretDownOutlined />}
          >
            <Option value="all">All Categories</Option>
            {categories.map(cat => (
              <Option key={cat.id} value={cat.id}>
                <Space>
                  <span>{cat.icon}</span>
                  <span>{cat.name}</span>
                </Space>
              </Option>
            ))}
          </Select>
        </Col>
        
        <Col xs={24} md={4}>
          <RangePicker
            value={dates}
            onChange={(value) => {
              setDates(value);
              handleFilterUpdate();
            }}
            size="large"
            className="w-full rounded-lg"
            format="DD/MM/YYYY"
          />
        </Col>
      </Row>

      {(period !== 'all' || category !== 'all' || search || dates) && (
        <div className="mt-4 flex justify-end">
          <Button
            type="link"
            onClick={handleClearFilters}
            icon={<CloseOutlined />}
            className="text-red-500"
          >
            Clear All Filters
          </Button>
        </div>
      )}
    </Card>
  );
};

export default ExpenseFilters;