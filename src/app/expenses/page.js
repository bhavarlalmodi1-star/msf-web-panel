'use client';

import React, { useState, useEffect } from 'react';
import { 
  PlusOutlined, 
  EyeOutlined,
  FileImageOutlined,
  CloudUploadOutlined 
} from '@ant-design/icons';
import {
  Card,
  Button,
  Row,
  Col,
  Space,
  message,
  Tabs
} from 'antd';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import ExpenseTable from './components/Expenses/ExpenseTable';
import ExpenseStats from './components/Expenses/ExpenseStats';
import ExpenseFilters from './components/Filters/ExpenseFilters';
import CategoryManager from './components/Expenses/CategoryManager';
import ExpenseDetails from './components/Expenses/ExpenseDetails';
import Header from './components/Layout/Header';
import { db } from '../../../lib/firbase-client';
import ExpenseForm from './components/Expenses/ExpenseForm';
import ExpenseReport from './components/Expenses/ExpenseReport';


const expensesCollection = collection(db, 'expenses');
const categoriesCollection = collection(db, 'categories');

export default function ExpenseManager() {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filteredExpenses, setFilteredExpenses] = useState([]);
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [activeTab, setActiveTab] = useState('expenses');
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [isDetailsVisible, setIsDetailsVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Filter states
  const [filterPeriod, setFilterPeriod] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState(null);

  // Fetch data from Firebase
  useEffect(() => {
    const unsubscribeCategories = onSnapshot(categoriesCollection, (snapshot) => {
      const categoriesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setCategories(categoriesData);
    });

    const unsubscribeExpenses = onSnapshot(
      query(expensesCollection, orderBy('date', 'desc')),
      (snapshot) => {
        const expensesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          date: doc.data().date?.toDate().toISOString().split('T')[0]
        }));
        setExpenses(expensesData);
        setFilteredExpenses(expensesData);
        setLoading(false);
      }
    );

    return () => {
      unsubscribeCategories();
      unsubscribeExpenses();
    };
  }, []);

  // Handle expense selection for details view
  const handleViewDetails = (expense) => {
    setSelectedExpense(expense);
    setIsDetailsVisible(true);
  };

  // Handle filter change
  const handleFilterChange = (filters) => {
    const { period, category, search, dates } = filters;
    setFilterPeriod(period);
    setFilterCategory(category);
    setSearchTerm(search);
    setDateRange(dates);
  };

  // Filter expenses
  useEffect(() => {
    let filtered = [...expenses];

    // Apply filters
    if (filterPeriod !== 'all') {
      const now = dayjs();
      filtered = filtered.filter(expense => {
        const expenseDate = dayjs(expense.date);
        switch(filterPeriod) {
          case 'today': return expenseDate.isSame(now, 'day');
          case 'week': return expenseDate.isSame(now, 'week');
          case 'month': return expenseDate.isSame(now, 'month');
          default: return true;
        }
      });
    }

    if (dateRange?.[0] && dateRange?.[1]) {
      filtered = filtered.filter(expense => {
        const expenseDate = dayjs(expense.date);
        return expenseDate.isAfter(dateRange[0]) && expenseDate.isBefore(dateRange[1]);
      });
    }

    if (filterCategory !== 'all') {
      filtered = filtered.filter(expense => expense.category === filterCategory);
    }

    if (searchTerm) {
      filtered = filtered.filter(expense => 
        expense.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        expense.voucherNo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        expense.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredExpenses(filtered);
  }, [expenses, filterPeriod, filterCategory, searchTerm, dateRange]);

  // Tab items
  const tabItems = [
    {
      key: 'expenses',
      label: 'Expenses',
      children: (
        <>


          
          <ExpenseTable
            expenses={filteredExpenses}
            categories={categories}
            loading={loading}
            onViewDetails={handleViewDetails}
            onEdit={(expense) => {
              setSelectedExpense(expense);
              setIsFormVisible(true);
            }}
          />
        </>
      ),
    },
    {
      key: 'categories',
      label: 'Categories',
      children: <CategoryManager categories={categories} />,
    },
    {
      key: 'reports',
      label: 'Reports',
      children: (
      <ExpenseReport expenses={filteredExpenses} categories={categories} />
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="w-full">


        {/* Action Buttons */}


        {/* Main Content Tabs */}
        <Card className="shadow-lg border-0 relative">
            <div className=" absolute right-1 top-1 z-50">
                    <Button
              type="primary"
              icon={<PlusOutlined />}
              size="large"
              className="w-full h-16 bg-gradient-to-r from-purple-500 to-pink-600 border-0"
              onClick={() => setIsFormVisible(true)}
            >
              Add Expense
            </Button>
            </div>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={tabItems}
            size="large"
          />
        </Card>

        {/* Expense Form Modal */}
        <ExpenseForm
          visible={isFormVisible}
          onClose={() => {
            setIsFormVisible(false);
            setSelectedExpense(null);
          }}
          categories={categories}
          expense={selectedExpense}
          onSuccess={() => {
            setIsFormVisible(false);
            setSelectedExpense(null);
            message.success(selectedExpense ? 'Expense updated!' : 'Expense added!');
          }}
        />

        {/* Expense Details Drawer */}
        <ExpenseDetails
          visible={isDetailsVisible}
          expense={selectedExpense}
          category={categories.find(c => c.id === selectedExpense?.category)}
          onClose={() => {
            setIsDetailsVisible(false);
            setSelectedExpense(null);
          }}
          onEdit={() => {
            setIsDetailsVisible(false);
            setIsFormVisible(true);
          }}
        />

      </div>
    </div>
  );
}