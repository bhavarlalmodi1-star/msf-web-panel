"use client";
import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Row, 
  Col, 
  Statistic, 
  Typography, 
  Progress, 
  Table, 
  Space, 
  Button,
  Avatar,
  Tag,
  Select,
  DatePicker,
  Spin,
  Badge,
  Divider,
  Tooltip,
  message
} from 'antd';
import { 
  UserOutlined, 
  TeamOutlined, 
  CheckCircleOutlined, 
  CloseCircleOutlined,
  DollarOutlined,
  RiseOutlined,
  FallOutlined,
  CalendarOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  EyeOutlined,
  DownloadOutlined,
  FilterOutlined,
  BarChartOutlined,
  PieChartOutlined,
  AreaChartOutlined,
  LineChartOutlined,
  AppstoreOutlined,
  BankOutlined,
  IdcardOutlined,
  PhoneOutlined,
  MailOutlined,
  EnvironmentOutlined,
  WalletOutlined,
  CreditCardOutlined,
  SwapOutlined,
  GiftOutlined,
  FundOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { collection, query, where, getDocs, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firbase-client';
import { useAuth } from '@/components/Base/AuthProvider';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

const DashboardHomePage = () => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'superadmin';
  const can = (key) => isSuperAdmin || user?.permissions?.actions?.[key];
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    totalMembers: 0,
    activeMembers: 0,
    inactiveMembers: 0,
    closingMembers: 0,
    totalAgents: 0,
    activeAgents: 0,
    inactiveAgents: 0,
    totalPrograms: 0,
    activePrograms: 0,
    totalJoinFees: 0,
    totalPaidAmount: 0,
    totalPendingAmount: 0,
    totalClosingAmount: 0,
    totalClosingPaid: 0,
    totalClosingPending: 0,
    todayNewMembers: 0,
    thisMonthNewMembers: 0,
    thisWeekNewMembers: 0
  });
  
  const [programStats, setProgramStats] = useState([]);
  const [recentMembers, setRecentMembers] = useState([]);
  const [topAgents, setTopAgents] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [recentClosingPayments, setRecentClosingPayments] = useState([]);
  const [recentClosingGenerated, setRecentClosingGenerated] = useState([]);
  const [timeRange, setTimeRange] = useState('week');
  const [organizationStats, setOrganizationStats] = useState(null);

  // Load dashboard data
  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Fetch all data in parallel
      const [
        membersData,
        agentsData,
        programsData,
        orgStats,
        recentMembersData,
        recentTransactionsData,
        recentClosingData,
        recentClosingGeneratedData,
        programStatsData
      ] = await Promise.allSettled([
        fetchMembersStats(),
        fetchAgentsStats(),
        fetchProgramsStats(),
        fetchOrganizationStats(),
        fetchRecentMembers(),
        fetchRecentTransactions(),
        fetchRecentClosingPayments(),
        fetchRecentClosingGenerated(),
        fetchProgramDetailsStats()
      ]);

      // Process members stats
      if (membersData.status === 'fulfilled') {
        setStats(prev => ({ ...prev, ...membersData.value }));
      }

      // Process agents stats
      if (agentsData.status === 'fulfilled') {
        setStats(prev => ({ ...prev, ...agentsData.value }));
      }

      // Process programs stats
      if (programsData.status === 'fulfilled') {
        setStats(prev => ({ ...prev, ...programsData.value }));
      }

      // Process program details
      if (programStatsData.status === 'fulfilled') {
        setProgramStats(programStatsData.value || []);
      }

      // Process organization stats
      if (orgStats.status === 'fulfilled' && orgStats.value) {
        const orgData = orgStats.value;
        setOrganizationStats(orgData);
        
        // Update stats with organization data
        setStats(prev => ({
          ...prev,
          // Join Fees Stats
          totalJoinFees: orgData.totalJoinFees || 0,
          totalPaidAmount: orgData.totalJoinFeesPaid || 0,
          totalPendingAmount: orgData.totalJoinFeesPending || 0,
          
          // Closing Stats
          totalClosingAmount: orgData.totalClosingAmount || 0,
          totalClosingPaid: orgData.totalClosingPaidAmount || 0,
          totalClosingPending: orgData.totalClosingPendingAmount || 0
        }));
      }

      // Set recent data
      if (recentMembersData.status === 'fulfilled') {
        setRecentMembers(recentMembersData.value);
      }

      if (recentTransactionsData.status === 'fulfilled') {
        setRecentTransactions(recentTransactionsData.value);
      }

      if (recentClosingData.status === 'fulfilled') {
        setRecentClosingPayments(recentClosingData.value);
      }

      if (recentClosingGeneratedData.status === 'fulfilled') {
        setRecentClosingGenerated(recentClosingGeneratedData.value);
      }

      // Fetch top agents
      const topAgentsResult = await fetchTopAgents();
      setTopAgents(topAgentsResult);

    } catch (error) {
      console.error('Error loading dashboard data:', error);
      message.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  // Fetch members statistics
  const fetchMembersStats = async () => {
    try {
      const membersRef = collection(db, 'members');

      // Helper: only active (accepted) non-deleted members
      const isActive = (doc) => {
        const d = doc.data();
        return d.active_flag === true && d.delete_flag !== true;
      };

      const [activeSnap, inactiveSnap, closingSnap, todaySnap, weekSnap, monthSnap] = await Promise.all([
        getDocs(query(membersRef, where('status', '==', 'active'), where('delete_flag', '==', false))),
        getDocs(query(membersRef, where('status', '==', 'inactive'), where('delete_flag', '==', false))),
        getDocs(query(membersRef, where('member_closed', '==', true), where('delete_flag', '==', false))),
        // Time-based queries: fetch then filter client-side to exclude pending members
        getDocs(query(membersRef, where('joinYear', '==', dayjs().year()), where('joinMonth', '==', dayjs().month() + 1))),
        getDocs(query(membersRef, where('joinYearMonth', '>=', dayjs().subtract(7, 'day').format('YYYY-MM')))),
        getDocs(query(membersRef, where('joinYearMonth', '>=', dayjs().subtract(30, 'day').format('YYYY-MM'))))
      ]);

      return {
        totalMembers: activeSnap.size + inactiveSnap.size,
        activeMembers: activeSnap.size,
        inactiveMembers: inactiveSnap.size,
        closingMembers: closingSnap.size,
        // Only count accepted (active_flag=true) non-deleted members for time-based stats
        todayNewMembers:      todaySnap.docs.filter(isActive).length,
        thisWeekNewMembers:   weekSnap.docs.filter(isActive).length,
        thisMonthNewMembers:  monthSnap.docs.filter(isActive).length,
      };
    } catch (error) {
      console.error('Error fetching members stats:', error);
      return {};
    }
  };

  // Fetch agents statistics
  const fetchAgentsStats = async () => {
    try {
      const agentsRef = collection(db, 'agents');
      const [activeSnap, inactiveSnap] = await Promise.all([
        getDocs(query(agentsRef, where('status', '==', 'active'))),
        getDocs(query(agentsRef, where('status', '==', 'inactive')))
      ]);

      return {
        totalAgents: activeSnap.size + inactiveSnap.size,
        activeAgents: activeSnap.size,
        inactiveAgents: inactiveSnap.size
      };
    } catch (error) {
      console.error('Error fetching agents stats:', error);
      return {};
    }
  };

  // Fetch programs statistics
  const fetchProgramsStats = async () => {
    try {
      const programsRef = collection(db, 'programs');
      const activeSnap = await getDocs(query(programsRef));

      return {
        totalPrograms: activeSnap.size,
        activePrograms: activeSnap.size,
        inactivePrograms: 0
      };
    } catch (error) {
      console.error('Error fetching programs stats:', error);
      return {};
    }
  };

  // Fetch program details with member counts
const fetchProgramDetailsStats = async () => {
  try {
    const programsRef = collection(db, 'programs');
    const programsSnap = await getDocs(query(programsRef));
    
    const programStatsData = [];
    
    for (const programDoc of programsSnap.docs) {
      const programData = programDoc.data();
      
      programStatsData.push({
        id: programDoc.id,
        name: programData.name || programData.programName || 'N/A',
        hindiName: programData.hindiName || '',
        programType: programData.programType || '',
        description: programData.description || '',
        certificateRule: programData.certificateRule || '',
        
        // Member counts
        memberCount: programData.memberCount || 0,
        
        // Join Fees Stats
        totalJoinFees: programData.totalJoinFees || 0,
        totalJoinFeesPaid: programData.totalJoinFeesPaid || 0,
        totalJoinFeesPending: programData.totalJoinFeesPending || 0,
        
        // Closing Stats
        totalClosingAmount: programData.totalClosingAmount || 0,
        totalClosingPaidAmount: programData.totalClosingPaidAmount || 0,
        totalClosingPendingAmount: programData.totalClosingPendingAmount || 0,
        
        // Closing Counts
        totalClosingCount: programData.totalClosingCount || 0,
        paidClosingCount: programData.paidClosingCount || 0,
        pendingClosingCount: programData.pendingClosingCount || 0,
        
        // Member Groups
        memberGroups: programData.memberGroups || [],
        
        status: programData.status || 'active',
        
        // Timestamps
        created_at: programData.created_at,
        updated_at: programData.updated_at
      });
    }
    
    return programStatsData;
  } catch (error) {
    console.error('Error fetching program details:', error);
    return [];
  }
};
  // Fetch organization stats
  const fetchOrganizationStats = async () => {
    try {
      const orgRef = doc(db, 'organizationStats', 'current');
      const orgSnap = await getDoc(orgRef);
      
      if (orgSnap.exists()) {
        return orgSnap.data();
      }
      return null;
    } catch (error) {
      console.error('Error fetching organization stats:', error);
      return null;
    }
  };

  // Fetch recent members
  const fetchRecentMembers = async () => {
    try {
      const membersRef = collection(db, 'members');
      // Fetch more than needed so client-side filter to active-only still gives 5
      const q = query(membersRef, orderBy('createdAt', 'desc'), limit(30));
      const snapshot = await getDocs(q);
      return snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data(), key: doc.id }))
        .filter(d => d.active_flag === true && d.delete_flag !== true)
        .slice(0, 5);
    } catch (error) {
      console.error('Error fetching recent members:', error);
      return [];
    }
  };

  // Fetch recent join fee transactions
  const fetchRecentTransactions = async () => {
    try {
      const transactionsRef = collection(db, 'memberJoinFees');
      const q = query(
        transactionsRef,
        orderBy('createdAt', 'desc'),
        limit(5)
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        key: doc.id,
        createdAt: doc.data().createdAt?.toDate()
      }));
    } catch (error) {
      console.error('Error fetching recent transactions:', error);
      return [];
    }
  };

  // Fetch recent closing payments (paid)
  const fetchRecentClosingPayments = async () => {
    try {
      const closingRef = collection(db, 'closing_payment');
      const q = query(
        closingRef,
        where('status', '==', 'paid'), 
        orderBy('createdAt', 'desc'),
        limit(5)
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        key: doc.id,
        createdAt: doc.data().createdAt?.toDate(),
        type: 'paid'
      }));
    } catch (error) {
      console.error('Error fetching recent closing payments:', error);
      return [];
    }
  };

  // Fetch recent closing generated (pending)
  const fetchRecentClosingGenerated = async () => {
    try {
      const closingRef = collection(db, 'closing_payment');
      const q = query(
        closingRef,
        where('status', '==', 'pending'),
        orderBy('createdAt', 'desc'),
        limit(5)
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        key: doc.id,
        createdAt: doc.data().createdAt?.toDate(),
        type: 'pending'
      }));
    } catch (error) {
      console.error('Error fetching recent closing generated:', error);
      return [];
    }
  };

  // Fetch top agents by performance
  const fetchTopAgents = async () => {
    try {
      const agentsRef = collection(db, 'agents');
      const snapshot = await getDocs(query(agentsRef, where('status', '==', 'active'), limit(5)));
      
      const agentsWithStats = [];
      
      for (const agentDoc of snapshot.docs) {
        const agentData = agentDoc.data();
        
        // Get member count for this agent
        const membersRef = collection(db, 'members');
        const membersSnap = await getDocs(
          query(membersRef, where('agentId', '==', agentDoc.id))
        );
        
        // Calculate performance based on target vs actual
        const memberCount = membersSnap.size;
        const target = agentData.monthlyTarget || 20;
        const performance = target > 0 ? Math.round((memberCount / target) * 100) : 0;
        
        agentsWithStats.push({
          id: agentDoc.id,
          name: agentData.name || agentData.displayName,
          members: memberCount,
          target: target,
          performance: Math.min(performance, 100),
          status: agentData.status,
          totalJoinFees: agentData.totalJoinFeesPaid || 0,
          totalClosingAmount: agentData.closing_totalAmount || 0,
          closingPaid: agentData.closing_paidAmount || 0,
          closingPending: agentData.closing_pendingAmount || 0
        });
      }
      
      // Sort by performance
      return agentsWithStats.sort((a, b) => b.performance - a.performance);
    } catch (error) {
      console.error('Error fetching top agents:', error);
      return [];
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Handle time range change
  const handleTimeRangeChange = (value) => {
    setTimeRange(value);
    loadDashboardData();
  };

  // Format percentage
  const formatPercentage = (value, total) => {
    return total > 0 ? Math.round((value / total) * 100) : 0;
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  // Main stats cards
  const mainStatsCards = [
    {
      title: 'Total Members',
      value: stats.totalMembers,
      icon: <TeamOutlined className="text-2xl" />,
      color: '#1890ff',
      change: stats.thisWeekNewMembers > 0 ? `+${stats.thisWeekNewMembers}` : '0',
      trend: stats.thisWeekNewMembers > 0 ? 'up' : 'down',
      description: `${stats.activeMembers} active, ${stats.inactiveMembers} inactive`
    },
    {
      title: 'Active Members',
      value: stats.activeMembers,
      icon: <CheckCircleOutlined className="text-2xl" />,
      color: '#52c41a',
      change: stats.activeMembers > 0 ? `${formatPercentage(stats.activeMembers, stats.totalMembers)}%` : '0%',
      trend: 'up',
      description: `${stats.todayNewMembers} joined today`
    },
    {
      title: 'Total Agents',
      value: stats.totalAgents,
      icon: <UserOutlined className="text-2xl" />,
      color: '#722ed1',
      change: `${stats.activeAgents} active`,
      trend: stats.activeAgents > stats.inactiveAgents ? 'up' : 'down',
      description: `${stats.inactiveAgents} inactive`
    },
    {
      title: 'Closing Members',
      value: stats.closingMembers,
      icon: <SwapOutlined className="text-2xl" />,
      color: '#fa8c16',
      change: stats.totalClosingAmount > 0 ? formatCurrency(stats.totalClosingAmount) : '₹0',
      trend: stats.totalClosingAmount > 0 ? 'up' : 'down',
      description: `${stats.closingMembers} members in closing`
    }
  ];

  // Join Fees Stats Cards
  const joinFeesStatsCards = [
    {
      title: 'Total Join Fees',
      value: formatCurrency(stats.totalJoinFees),
      icon: <WalletOutlined className="text-2xl" />,
      color: '#13c2c2',
      description: `${stats.totalPrograms} active programs`
    },
    {
      title: 'Join Fees Paid',
      value: formatCurrency(stats.totalPaidAmount),
      icon: <CreditCardOutlined className="text-2xl" />,
      color: '#52c41a',
      description: `${formatPercentage(stats.totalPaidAmount, stats.totalJoinFees)}% collected`
    },
    {
      title: 'Join Fees Pending',
      value: formatCurrency(stats.totalPendingAmount),
      icon: <DollarOutlined className="text-2xl" />,
      color: '#faad14',
      description: `${stats.totalMembers} members pending`
    }
  ];

  // Closing Stats Cards
  const closingStatsCards = [
    {
      title: 'Total Closing Amount',
      value: formatCurrency(stats.totalClosingAmount),
      icon: <FundOutlined className="text-2xl" />,
      color: '#722ed1',
      description: `Total closing value`
    },
    {
      title: 'Closing Paid',
      value: formatCurrency(stats.totalClosingPaid),
      icon: <CheckCircleOutlined className="text-2xl" />,
      color: '#52c41a',
      description: `${formatPercentage(stats.totalClosingPaid, stats.totalClosingAmount)}% completed`
    },
    {
      title: 'Closing Pending',
      value: formatCurrency(stats.totalClosingPending),
      icon: <GiftOutlined className="text-2xl" />,
      color: '#f5222d',
      description: `Pending for ${stats.closingMembers} members`
    }
  ];

  // Recent members columns
  const recentMembersColumns = [
    {
      title: 'Member',
      dataIndex: 'displayName',
      key: 'name',
      render: (text, record) => (
        <div className="flex items-center gap-2">
          <Avatar 
            size="small" 
            src={record.photoURL} 
            icon={!record.photoURL && <UserOutlined />}
          />
          <div>
            <div className="font-medium">{text}</div>
            <div className="text-xs text-gray-500">{record.registrationNumber}</div>
          </div>
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag 
          color={
            status === 'active' ? 'green' : 
            status === 'inactive' ? 'red' : 
            'orange'
          }
          className="capitalize"
        >
          {status}
        </Tag>
      ),
    },
    {
      title: 'Programs',
      dataIndex: 'programIds',
      key: 'programs',
      render: (programs) => programs?.length || 0,
    },
    {
      title: 'Agent',
      dataIndex: 'addedByName',
      key: 'agent',
      render: (text) => text || 'N/A',
    },
    {
      title: 'Join Date',
      dataIndex: 'dateJoin',
      key: 'joinDate',
      render: (date) => date || 'N/A',
    },
    {
      title: 'Join Fees',
      key: 'joinFees',
      render: (_, record) => (
        <div>
          <div className="text-xs">{formatCurrency(record.paidAmount)} / {formatCurrency(record.joinFees)}</div>
          <Progress percent={record.paymentPercentage || 0} size="small" showInfo={false} />
        </div>
      ),
    },
    {
      title: 'Action',
      key: 'action',
      render: (_, record) => (
        <Button type="link" size="small" icon={<EyeOutlined />} href={`/members/${record.id}`}>
          View
        </Button>
      ),
    },
  ];

  // Recent join fee transactions columns
  const transactionColumns = [
    {
      title: 'Member',
      dataIndex: 'memberName',
      key: 'member',
      render: (text, record) => (
        <div className="flex items-center gap-2">
          <Avatar size="small" icon={<UserOutlined />} />
          <span>{text}</span>
        </div>
      ),
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount) => (
        <Text strong className="text-green-600">
          {formatCurrency(amount)}
        </Text>
      ),
    },
    {
      title: 'Payment Mode',
      dataIndex: 'paymentMode',
      key: 'mode',
      render: (mode) => (
        <Tag color="blue">{mode}</Tag>
      ),
    },
    {
      title: 'Date',
      dataIndex: 'transactionDate',
      key: 'date',
      render: (date) => date || dayjs().format('DD/MM/YYYY'),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Badge status="success" text="Completed" />
      ),
    },
  ];

  // Recent closing payments (paid) columns
  const closingPaymentColumns = [
    {
      title: 'Member',
      dataIndex: 'memberName',
      key: 'member',
      render: (text) => (
        <div className="flex items-center gap-2">
          <Avatar size="small" icon={<UserOutlined />} />
          <span>{text}</span>
        </div>
      ),
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount) => (
        <Text strong className="text-green-600">
          {formatCurrency(amount)}
        </Text>
      ),
    },
    {
      title: 'Closing Count',
      dataIndex: 'validClosingsCount',
      key: 'count',
      render: (count) => (
        <Tag color="green">{count} closings</Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: () => (
        <Tag color="green">PAID</Tag>
      ),
    },
    {
      title: 'Paid Date',
      dataIndex: 'paidAt',
      key: 'paidAt',
      render: (date) => date ? dayjs(date).format('DD/MM/YYYY') : 'N/A',
    },
  ];

  // Recent closing generated (pending) columns
  const closingGeneratedColumns = [
    {
      title: 'Member',
      dataIndex: 'memberName',
      key: 'member',
      render: (text) => (
        <div className="flex items-center gap-2">
          <Avatar size="small" icon={<UserOutlined />} />
          <span>{text}</span>
        </div>
      ),
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount) => (
        <Text strong className="text-orange-600">
          {formatCurrency(amount)}
        </Text>
      ),
    },
    {
      title: 'Closing Count',
      dataIndex: 'validClosingsCount',
      key: 'count',
      render: (count) => (
        <Tag color="orange">{count} closings</Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: () => (
        <Tag color="orange">PENDING</Tag>
      ),
    },
    {
      title: 'Generated',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date) => date ? dayjs(date).format('DD/MM/YYYY') : 'N/A',
    },
  ];

  // Top agents columns
  const topAgentsColumns = [
    {
      title: 'Agent',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <div className="flex items-center gap-2">
          <Avatar size="small" icon={<UserOutlined />} />
          <div>
            <div className="font-medium">{text}</div>
            <div className="text-xs text-gray-500">{record.members} members</div>
          </div>
        </div>
      ),
    },
    {
      title: 'Performance',
      key: 'performance',
      render: (_, record) => (
        <div className="flex items-center gap-2">
          <Progress 
            percent={record.performance} 
            size="small" 
            strokeColor={record.performance >= 80 ? '#52c41a' : record.performance >= 50 ? '#faad14' : '#f5222d'}
            showInfo={false}
          />
          <span className="text-sm text-gray-600">{record.performance}%</span>
        </div>
      ),
    },
    {
      title: 'Join Fees',
      dataIndex: 'totalJoinFees',
      key: 'joinFees',
      render: (fees) => formatCurrency(fees),
    },
    {
      title: 'Closing',
      key: 'closing',
      render: (_, record) => (
        <div>
          <div className="text-xs">Paid: {formatCurrency(record.closingPaid)}</div>
          <div className="text-xs text-orange-500">Pending: {formatCurrency(record.closingPending)}</div>
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Badge status={status === 'active' ? 'success' : 'error'} text={status} />
      ),
    },
  ];

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <Title level={2} className="text-gray-800 mb-2 flex items-center gap-3">
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-2 rounded-lg">
                  <BarChartOutlined className="text-xl" />
                </div>
                Dashboard Overview
              </Title>
              <Text className="text-gray-600 text-base">
                {dayjs().format('dddd, DD MMMM YYYY')} • {stats.thisMonthNewMembers} new members this month
              </Text>
            </div>
            
            {/* <Space>
              <Select defaultValue="week" style={{ width: 120 }} onChange={handleTimeRangeChange}>
                <Option value="today">Today</Option>
                <Option value="week">This Week</Option>
                <Option value="month">This Month</Option>
                <Option value="quarter">This Quarter</Option>
                <Option value="year">This Year</Option>
              </Select>
              <RangePicker 
                format="DD/MM/YYYY"
                onChange={(dates) => console.log(dates)}
              />
              <Button type="primary" icon={<DownloadOutlined />}>
                Export
              </Button>
            </Space> */}
          </div>
        </div>

        {/* Main Stats Cards */}
        {can('dashboard_summary') && <Row gutter={[16, 16]} className="mb-6">
          {mainStatsCards.map((stat, index) => (
            <Col xs={24} sm={12} lg={6} key={index}>
              <Card className="shadow-sm hover:shadow-md transition-all duration-300 h-full">
                <div className="flex items-start justify-between">
                  <div>
                    <Text className="text-gray-500 text-sm">{stat.title}</Text>
                    <div className="flex items-end gap-2 mt-2">
                      <Title level={2} className="mb-0 text-gray-800">
                        {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
                      </Title>
                      {stat.change !== '0' && stat.change !== '0%' && (
                        <div className={`flex items-center gap-1 text-sm ${
                          stat.trend === 'up' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {stat.trend === 'up' ? (
                            <ArrowUpOutlined />
                          ) : (
                            <ArrowDownOutlined />
                          )}
                          {stat.change}
                        </div>
                      )}
                    </div>
                    <Text type="secondary" className="text-xs mt-2 block">
                      {stat.description}
                    </Text>
                  </div>
                  <div 
                    className="p-3 rounded-full"
                    style={{ backgroundColor: `${stat.color}20` }}
                  >
                    <div style={{ color: stat.color }}>
                      {stat.icon}
                    </div>
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>}

        {/* Join Fees Stats Cards */}
        {can('dashboard_join_fees') && <Row gutter={[16, 16]} className="mb-6">
          {joinFeesStatsCards.map((stat, index) => (
            <Col xs={24} sm={8} lg={8} key={index}>
              <Card className="shadow-sm hover:shadow-md transition-all duration-300 h-full bg-gradient-to-br from-white to-gray-50">
                <div className="flex items-start justify-between">
                  <div>
                    <Text className="text-gray-500 text-sm">{stat.title}</Text>
                    <Title level={3} className="mb-0 mt-2" style={{ color: stat.color }}>
                      {stat.value}
                    </Title>
                    <Text type="secondary" className="text-xs mt-2 block">
                      {stat.description}
                    </Text>
                  </div>
                  <div 
                    className="p-3 rounded-full"
                    style={{ backgroundColor: `${stat.color}15` }}
                  >
                    <div style={{ color: stat.color }}>
                      {stat.icon}
                    </div>
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>}

        {/* Closing Stats Cards */}
        {can('dashboard_closing') && <Row gutter={[16, 16]} className="mb-6">
          {closingStatsCards.map((stat, index) => (
            <Col xs={24} sm={8} lg={8} key={index}>
              <Card className="shadow-sm hover:shadow-md transition-all duration-300 h-full bg-gradient-to-br from-white to-gray-50">
                <div className="flex items-start justify-between">
                  <div>
                    <Text className="text-gray-500 text-sm">{stat.title}</Text>
                    <Title level={3} className="mb-0 mt-2" style={{ color: stat.color }}>
                      {stat.value}
                    </Title>
                    <Text type="secondary" className="text-xs mt-2 block">
                      {stat.description}
                    </Text>
                  </div>
                  <div 
                    className="p-3 rounded-full"
                    style={{ backgroundColor: `${stat.color}15` }}
                  >
                    <div style={{ color: stat.color }}>
                      {stat.icon}
                    </div>
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>}

        {/* Program Stats Row */}
       
{can('dashboard_programs') && <Row gutter={[16, 16]} className="mb-6">
  <Col xs={24} lg={24}>
    <Card 
      title={
        <div className="flex items-center gap-2">
          <AppstoreOutlined className="text-blue-600" />
          <span>Program Performance</span>
          {programStats.length > 0 && (
            <Tag color="blue" style={{ marginLeft: 4 }}>{programStats.length}</Tag>
          )}
        </div>
      }
      className="shadow-sm"

    >
      <Row gutter={[16, 16]}>
        {/* All programs — previously capped at 4, which silently hid the rest */}
        {programStats.map((program, index) => (
          <Col xs={24} sm={12} lg={6} key={index}>
            <div className="p-4 hover:bg-gray-50 rounded-lg transition-colors border border-gray-100">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <Text strong className="text-base">{program.name}</Text>
                  {program.hindiName && (
                    <div className="text-xs text-gray-500">{program.hindiName}</div>
                  )}
                </div>
                <Tag color="blue">{program.programType || 'N/A'}</Tag>
              </div>
              
              <div className="space-y-3">
                {/* Member Count */}
                <div className="flex justify-between items-center">
                  <Text type="secondary" className="text-sm">Total Members</Text>
                  <Text strong>{program.memberCount || 0}</Text>
                </div>
                
                {/* Join Fees Stats */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span>Join Fees</span>
                    <span className="text-blue-600">
                      {formatCurrency(program.totalJoinFeesPaid || 0)} / {formatCurrency(program.totalJoinFees || 0)}
                    </span>
                  </div>
                  <Progress 
                    percent={formatPercentage(
                      program.totalJoinFeesPaid || 0, 
                      program.totalJoinFees || 1
                    )} 
                    size="small"
                    strokeColor="#1890ff"
                    showInfo={false}
                  />
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-green-600">Paid: {formatCurrency(program.totalJoinFeesPaid || 0)}</span>
                    <span className="text-orange-600">Pending: {formatCurrency(program.totalJoinFeesPending || 0)}</span>
                  </div>
                </div>
                
                {/* Closing Stats */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span>Closing</span>
                    <span className="text-purple-600">
                      {formatCurrency(program.totalClosingPaidAmount || 0)} / {formatCurrency(program.totalClosingAmount || 0)}
                    </span>
                  </div>
                  <Progress 
                    percent={formatPercentage(
                      program.totalClosingPaidAmount || 0, 
                      program.totalClosingAmount || 1
                    )} 
                    size="small"
                    strokeColor="#722ed1"
                    showInfo={false}
                  />
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-green-600">Paid: {formatCurrency(program.totalClosingPaidAmount || 0)}</span>
                    <span className="text-red-600">Pending: {formatCurrency(program.totalClosingPendingAmount || 0)}</span>
                  </div>
                </div>
                
                {/* Closing Counts */}
                <div className="flex justify-between text-xs border-t pt-2 mt-2">
                  <div>
                    <Badge status="success" text={`${program.paidClosingCount || 0} Paid`} />
                  </div>
                  <div>
                    <Badge status="warning" text={`${program.pendingClosingCount || 0} Pending`} />
                  </div>
                  <div>
                    <Badge status="default" text={`${program.totalClosingCount || 0} Total`} />
                  </div>
                </div>
                
      
              </div>
            </div>
          </Col>
        ))}
        {programStats.length === 0 && (
          <Col span={24}>
            <div className="text-center py-8 text-gray-400">
              No program data available
            </div>
          </Col>
        )}
      </Row>
    </Card>
  </Col>
</Row>}
         

        {/* Recent Members and Top Agents */}
        {/* <Row gutter={[16, 16]} className="mb-6">
          <Col xs={24} lg={12}>
            <Card 
              title={
                <div className="flex items-center gap-2">
                  <TeamOutlined className="text-blue-600" />
                  <span>Recent Members</span>
                </div>
              }
              className="shadow-sm h-full"
              extra={
                <Button type="link" size="small" href="/members">
                  View All Members
                </Button>
              }
            >
              <Table
                columns={recentMembersColumns}
                dataSource={recentMembers}
                rowKey="id"
                size="small"
                pagination={false}
                scroll={{ x: 800 }}
                loading={loading}
              />
            </Card>
          </Col>
          
          <Col xs={24} lg={12}>
            <Card 
              title={
                <div className="flex items-center gap-2">
                  <RiseOutlined className="text-green-600" />
                  <span>Top Performing Agents</span>
                </div>
              }
              className="shadow-sm h-full"
              extra={
                <Button type="link" size="small" href="/agents">
                  View All Agents
                </Button>
              }
            >
              <Table
                columns={topAgentsColumns}
                dataSource={topAgents}
                rowKey="id"
                size="small"
                pagination={false}
                scroll={{ x: 600 }}
                loading={loading}
              />
            </Card>
          </Col>
        </Row> */}

        {/* Recent Transactions */}
        {/* <Row gutter={[16, 16]} className="mb-6">
          <Col xs={24} lg={12}>
            <Card 
              title={
                <div className="flex items-center gap-2">
                  <CreditCardOutlined className="text-cyan-600" />
                  <span>Recent Join Fee Payments</span>
                </div>
              }
              className="shadow-sm h-full"
              extra={
                <Button type="link" size="small" href="/transactions">
                  View All
                </Button>
              }
            >
              <Table
                columns={transactionColumns}
                dataSource={recentTransactions}
                rowKey="id"
                size="small"
                pagination={false}
                scroll={{ x: 600 }}
                loading={loading}
              />
            </Card>
          </Col>

          <Col xs={24} lg={12}>
            <Card 
              title={
                <div className="flex items-center gap-2">
                  <DollarOutlined className="text-green-600" />
                  <span>Recent Closing Payments (Paid)</span>
                </div>
              }
              className="shadow-sm h-full"
              extra={
                <Button type="link" size="small" href="/closing-payments?status=paid">
                  View All
                </Button>
              }
            >
              <Table
                columns={closingPaymentColumns}
                dataSource={recentClosingPayments}
                rowKey="id"
                size="small"
                pagination={false}
                scroll={{ x: 600 }}
                loading={loading}
              />
            </Card>
          </Col>
        </Row> */}

        {/* Recent Closing Generated */}
        {/* <Row gutter={[16, 16]}>
          <Col xs={24} lg={24}>
            <Card 
              title={
                <div className="flex items-center gap-2">
                  <GiftOutlined className="text-orange-600" />
                  <span>Recent Closing Generated (Pending)</span>
                </div>
              }
              className="shadow-sm h-full"
              extra={
                <Button type="link" size="small" href="/closing-payments?status=pending">
                  View All
                </Button>
              }
            >
              <Table
                columns={closingGeneratedColumns}
                dataSource={recentClosingGenerated}
                rowKey="id"
                size="small"
                pagination={false}
                scroll={{ x: 600 }}
                loading={loading}
              />
            </Card>
          </Col>
        </Row> */}

        {/* Loading State */}
        {loading && (
          <div className="fixed inset-0 bg-white bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-lg shadow-xl text-center">
              <Spin size="large" />
              <div className="mt-4 text-gray-600">Loading dashboard data...</div>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        .ant-card-head {
          border-bottom: 1px solid #f0f0f0 !important;
        }
        
        .ant-card-head-title {
          font-weight: 600 !important;
        }
        
        .ant-table-thead > tr > th {
          background: #f8fafc !important;
          font-weight: 600;
        }
        
        .ant-table-tbody > tr:hover > td {
          background: #f0f9ff !important;
        }
        
        .ant-progress-circle-path {
          stroke-linecap: round;
        }
        
        .ant-tag-green {
          background: #d9f7be !important;
          color: #389e0d !important;
          border: none;
        }
        
        .ant-tag-red {
          background: #ffccc7 !important;
          color: #cf1322 !important;
          border: none;
        }
        
        .ant-tag-orange {
          background: #ffd8bf !important;
          color: #d46b08 !important;
          border: none;
        }
        
        .ant-tag-blue {
          background: #bae7ff !important;
          color: #096dd9 !important;
          border: none;
        }
        
        .hover\\:shadow-md:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
      `}</style>
    </div>
  );
};

export default DashboardHomePage;