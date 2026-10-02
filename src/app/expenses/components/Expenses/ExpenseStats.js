import React from 'react';
import { 
  DollarOutlined, 
  PieChartOutlined, 
  ArrowUpOutlined,
  ShoppingOutlined 
} from '@ant-design/icons';
import { Card, Statistic, Row, Col, Progress } from 'antd';
import dayjs from 'dayjs';

const ExpenseStats = ({ expenses, categories }) => {
  const calculateStats = () => {
    const total = expenses.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0);
    const average = expenses.length > 0 ? total / expenses.length : 0;
    const todayTotal = expenses.filter(exp => 
      dayjs(exp.date).isSame(dayjs(), 'day')
    ).reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0);
    
    const topCategory = categories.reduce((top, cat) => {
      const catTotal = expenses
        .filter(exp => exp.category === cat.id)
        .reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0);
      return catTotal > top.total ? { ...cat, total: catTotal } : top;
    }, { name: 'None', total: 0, icon: '📊', color: '#ccc' });

    return { total, average, todayTotal, topCategory };
  };

  const { total, average, todayTotal, topCategory } = calculateStats();

  return (
    <Row gutter={[16, 16]} className="mb-6">
      <Col xs={24} sm={12} md={6}>
        <Card className="shadow-lg border-0 hover:shadow-xl transition-all duration-300">
          <Statistic
            title="Total Spent"
            value={total}
            precision={2}
            prefix="₹"
            valueStyle={{ color: '#3f51b5' }}
            prefix={<DollarOutlined className="text-blue-500 mr-2" />}
          />
          <div className="text-gray-500 text-sm mt-2">
            {expenses.length} transactions
          </div>
        </Card>
      </Col>
      
      <Col xs={24} sm={12} md={6}>
        <Card className="shadow-lg border-0 hover:shadow-xl transition-all duration-300">
          <Statistic
            title="Average Expense"
            value={average}
            precision={2}
            prefix="₹"
            valueStyle={{ color: '#f44336' }}
            prefix={<ArrowUpOutlined className="text-red-500 mr-2" />}
          />
          <div className="text-gray-500 text-sm mt-2">
            per transaction
          </div>
        </Card>
      </Col>
      
      <Col xs={24} sm={12} md={6}>
        <Card className="shadow-lg border-0 hover:shadow-xl transition-all duration-300">
          <Statistic
            title="Today's Spend"
            value={todayTotal}
            precision={2}
            prefix="₹"
            valueStyle={{ color: '#4caf50' }}
            prefix={<ShoppingOutlined className="text-green-500 mr-2" />}
          />
          <div className="text-gray-500 text-sm mt-2">
            today's total
          </div>
        </Card>
      </Col>
      
      <Col xs={24} sm={12} md={6}>
        <Card className="shadow-lg border-0 hover:shadow-xl transition-all duration-300">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{topCategory.icon}</span>
              <span className="font-semibold text-gray-900">{topCategory.name}</span>
            </div>
            <PieChartOutlined className="text-purple-500" />
          </div>
          <div className="font-bold text-gray-900 text-xl mb-2 font-mono">
            ₹{topCategory.total.toLocaleString()}
          </div>
          <Progress
            percent={(topCategory.total / (total || 1)) * 100}
            strokeColor={topCategory.color}
            showInfo={false}
            size="small"
          />
          <div className="text-gray-500 text-sm mt-2">
            Top spending category
          </div>
        </Card>
      </Col>
    </Row>
  );
};

export default ExpenseStats;