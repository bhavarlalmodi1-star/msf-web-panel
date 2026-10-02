'use client';
import { panelTheme } from '@/utils/trust/trustStore';
import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useAuth } from '@/components/Base/AuthProvider';
import { setAgentList } from '@/Redux/Slice/commonSlice';
import { db } from '../../../../lib/firbase-client';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import {
  Table,
  Card,
  Tag,
  Button,
  Space,
  Typography,
  Progress,
  Tooltip,
  Row,
  Col,
  Avatar,
  Badge,
  Input,
  Select,
} from 'antd';
import {
  UserOutlined,
  TeamOutlined,
  BankOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  DownOutlined,
  RightOutlined,
  ArrowRightOutlined,
  HistoryOutlined,
  PhoneOutlined,
  EnvironmentOutlined,
  SyncOutlined,
  SearchOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import { message as antMessage } from 'antd';
import { auth } from '../../../../lib/firbase-client';
import { useRouter } from 'next/navigation';

// Import custom components
import AgentDetailDrawer from './components/AgentDetailDrawer';
import GroupDetailDrawer from './components/GroupDetailDrawer';
import SummaryCards from './components/SummaryCards';

// Import constants and helpers
import PaymentHistoryDrawerAgent from './components/PaymentHistoryDrawerAgent';
import { usePaymentHistory } from '@/utils/hooks/usePaymentHistory';
import { processAgentStats } from '@/utils/agentUtils';

const { Title, Text } = Typography;
const colors = {
  get primary() { return panelTheme().primary; },
  historyBtnBg: '#1B385A',
  get secondary() { return panelTheme().secondary; },
  accent: '#059669',
  warning: '#f59e0b',
  success: '#16a34a',
  error: '#dc2626',
  info: '#2563eb',
  get background() { return panelTheme().background; },
  surface: '#ffffff',
  get border() { return panelTheme().border; },
  foreground: '#3e1f1a',
};
const JoinFeesPage = () => {
  const router = useRouter();
  const dispatch = useDispatch();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'superadmin';
  const agentList = useSelector((state) => state.data.agentList || []);
  const programList = useSelector((state) => state.data.programList || []);
  
  const [drawerAgent, setDrawerAgent] = useState(null);
  const [expandedRowKeys, setExpandedRowKeys] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [searchText, setSearchText]     = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Payment History State
  const [historyDrawerVisible, setHistoryDrawerVisible] = useState(false);
  const [selectedAgentForHistory, setSelectedAgentForHistory] = useState(null);
  const [selectedProgramFilter, setSelectedProgramFilter] = useState('all');
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupDetailVisible, setGroupDetailVisible] = useState(false);

  // Custom hook for payment history
  const {
    paymentGroups,
    paymentTransactions,
    historyLoading,
    fetchPaymentGroups
  } = usePaymentHistory();

  // Re-fetch all agents from Firestore on mount so stats are always current
  // (Redux agentList is loaded once at app start and can be stale)
  useEffect(() => {
    const refreshAgents = async () => {
      try {
        const snap = await getDocs(collection(db, 'agents'));
        const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        dispatch(setAgentList(fresh));
      } catch (e) {
        console.warn('join-fees: failed to refresh agents from Firestore', e.message);
      }
    };
    refreshAgents();
  }, []);

  // Process agents with stats
  const agentsWithStats = processAgentStats(agentList, programList);
  const activeAgents = agentsWithStats.filter((a) => a.active_flag && !a.delete_flag);

  // Search + status filter + sort: agents with pending > 0 always first
  const filteredAgents = activeAgents
    .filter((a) => {
      const q = searchText.trim().toLowerCase();
      if (q) {
        const nameMatch  = (a.name  || '').toLowerCase().includes(q);
        const phoneMatch = (a.phone1 || a.phone || '').toLowerCase().includes(q);
        if (!nameMatch && !phoneMatch) return false;
      }
      if (statusFilter === 'pending') return (a.totalJoinFeesPending || 0) > 0;
      if (statusFilter === 'paid')    return (a.totalJoinFeesPending || 0) === 0;
      return true;
    })
    .sort((a, b) => (b.totalJoinFeesPending || 0) - (a.totalJoinFeesPending || 0));

  // Summary calculations
  const totalPending = activeAgents.reduce((s, a) => s + (a.totalJoinFeesPending || 0), 0);
  const totalCollected = activeAgents.reduce((s, a) => s + (a.totalJoinFeesPaid || 0), 0);
  const totalFees = activeAgents.reduce((s, a) => s + (a.totalJoinFees || 0), 0);
  const overallProgress = totalFees ? Math.round((totalCollected / totalFees) * 100) : 0;

  const handleGoToPayPage = (agent, program = null) => {
    const programId = program?.programId || 'all';
    const url = `join-fees/${agent.uid}?programId=${programId}`;
    router.push(url);
  };

  const showPaymentHistory = (agent) => {
    setSelectedAgentForHistory(agent);
    fetchPaymentGroups(agent.uid);
    setHistoryDrawerVisible(true);
  };

  const showGroupDetails = (group) => {
    setSelectedGroup(group);
    setGroupDetailVisible(true);
  };

  // Re-fetch a single agent doc from Firestore and update Redux so the main
  // page stats (totalJoinFeesPaid, totalJoinFeesPending, etc.) reflect the
  // reversal without a full page reload.
  const refreshAgentInRedux = async (agentId) => {
    if (!agentId) return;
    try {
      const snap = await getDoc(doc(db, 'agents', agentId));
      if (!snap.exists()) return;
      const fresh = { id: snap.id, ...snap.data() };
      dispatch(setAgentList(agentList.map(a => (a.id === agentId || a.uid === agentId) ? { ...a, ...fresh } : a)));
    } catch (e) {
      console.warn('refreshAgentInRedux failed:', e.message);
    }
  };

  // ── Recalculate all agent stats from member docs ─────────────────────────────
  const handleSyncStats = async () => {
    setSyncing(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/agents/recalculate-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      antMessage.success(`Stats synced for ${data.results?.length || 0} agent(s)`);
      // Refresh agents from Firestore to show updated numbers
      const snap = await getDocs(collection(db, 'agents'));
      dispatch(setAgentList(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    } catch (err) {
      antMessage.error(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const getStatusTag = (pending) => {
    if (pending === 0)
      return (
        <Tag
          icon={<CheckCircleOutlined />}
          color="success"
          style={{ borderRadius: 20, fontWeight: 600 }}
        >
          Fully Paid
        </Tag>
      );
    return (
      <Tag
        icon={<ClockCircleOutlined />}
        color="warning"
        style={{ borderRadius: 20, fontWeight: 600 }}
      >
        ₹{pending?.toLocaleString()} Due
      </Tag>
    );
  };

  const expandedRowRender = (record) => {
    const programColumns = [
      {
        title: 'Program',
        dataIndex: 'programName',
        key: 'programName',
        render: (text) => <Text strong style={{ color: colors.primary }}>{text}</Text>,
      },
      {
        title: 'Members',
        dataIndex: 'memberCount',
        key: 'memberCount',
        width: 90,
        align: 'center',
        render: (c) => (
          <Badge
            count={c || 0}
            style={{ backgroundColor: colors.info, fontWeight: 700 }}
            showZero
          />
        ),
      },
      {
        title: 'Total (₹)',
        dataIndex: 'totalJoinFees',
        key: 'totalJoinFees',
        width: 110,
        align: 'right',
        render: (v) => <Text>₹{v?.toLocaleString() || 0}</Text>,
      },
      {
        title: 'Paid (₹)',
        dataIndex: 'totalJoinFeesPaid',
        key: 'totalJoinFeesPaid',
        width: 110,
        align: 'right',
        render: (v) => <Text style={{ color: colors.success, fontWeight: 600 }}>₹{v?.toLocaleString() || 0}</Text>,
      },
      {
        title: 'Pending (₹)',
        dataIndex: 'totalJoinFeesPending',
        key: 'totalJoinFeesPending',
        width: 110,
        align: 'right',
        render: (v) => (
          <Text style={{ color: v > 0 ? colors.error : colors.success, fontWeight: 600 }}>
            ₹{v?.toLocaleString() || 0}
          </Text>
        ),
      },
      {
        title: 'Action',
        key: 'action',
        width: 130,
        align: 'center',
        render: (_, prog) =>
          prog.totalJoinFeesPending > 0 ? (
            <Button
              type="primary"
              size="small"
              icon={<ArrowRightOutlined />}
              onClick={() => handleGoToPayPage(record, prog)}
              style={{
                background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
                border: 'none',
                borderRadius: 20,
                fontWeight: 600,
              }}
            >
              Pay Now
            </Button>
          ) : (
            <Tag color="success" style={{ borderRadius: 20 }}>Completed</Tag>
          ),
      },
    ];

    return (
      <div style={{ padding: '8px 16px', background: 'var(--pink-50)', borderRadius: 8 }}>
        <Table
          columns={programColumns}
          dataSource={record.programs}
          rowKey="programId"
          pagination={false}
          size="small"
          bordered={false}
        />
      </div>
    );
  };

  const columns = [
    {
      title: 'Agent',
      key: 'agent',
      width: 240,
      fixed: 'left',
      render: (_, record) => (
        <Space>
          <Avatar
            src={record.photoUrl}
            icon={!record.photoUrl && <UserOutlined />}
            size={42}
            style={{
              backgroundColor: colors.primary,
              border: `2px solid ${colors.secondary}`,
              flexShrink: 0,
            }}
          />
          <div>
            <Text strong style={{ color: colors.foreground, display: 'block' }}>
              {record.name}
            </Text>
            <Text type="secondary" style={{ fontSize: 11 }}>
              <EnvironmentOutlined style={{ marginRight: 3 }} />
              {record.village}, {record.district}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Contact',
      key: 'contact',
      width: 140,
      render: (_, record) => (
        <div>
          <Text style={{ display: 'block' }}>
            <PhoneOutlined style={{ marginRight: 4 }} />
            {record.phone1}
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {record.email || '—'}
          </Text>
        </div>
      ),
    },
    {
      title: 'Members',
      key: 'members',
      width: 80,
      align: 'center',
      render: (_, record) => (
        <Badge
          count={record.memberCount}
          style={{ backgroundColor: colors.info }}
          showZero
        />
      ),
    },
    {
      title: 'Total Fees',
      key: 'totalFees',
      width: 120,
      align: 'right',
      render: (_, r) => (
        <Text strong>₹{r.totalJoinFees?.toLocaleString() || 0}</Text>
      ),
    },
    {
      title: 'Paid',
      key: 'paid',
      width: 110,
      align: 'right',
      render: (_, r) => (
        <Text style={{ color: colors.success, fontWeight: 600 }}>
          ₹{r.totalJoinFeesPaid?.toLocaleString() || 0}
        </Text>
      ),
    },
    {
      title: 'Pending',
      key: 'pending',
      width: 110,
      align: 'right',
      render: (_, r) => (
        <Text style={{ color: r.totalJoinFeesPending > 0 ? colors.error : colors.success, fontWeight: 600 }}>
          ₹{r.totalJoinFeesPending?.toLocaleString()}
        </Text>
      ),
    },
    {
      title: 'Progress',
      key: 'progress',
      width: 130,
      render: (_, r) => (
        <Progress
          percent={Math.round((r.totalJoinFeesPaid / (r.totalJoinFees || 1)) * 100)}
          size="small"
          strokeColor={r.totalJoinFeesPending === 0 ? colors.success : colors.primary}
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      fixed: 'right',
      align: 'center',
      render: (_, record) => (
        <Space size={6}>
          <Tooltip title="View Payment History">
            <Button
              size="small"
              icon={<HistoryOutlined />}
              onClick={() => showPaymentHistory(record)}
              style={{ borderColor: colors.info, color: colors.info, borderRadius: 6 }}
            />
          </Tooltip>
          <Tooltip title="View Details">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => setDrawerAgent(record)}
              style={{ borderColor: colors.primary, color: colors.primary, borderRadius: 6 }}
            />
          </Tooltip>
          {record.totalJoinFeesPending > 0 && (
            <Tooltip title="Go to Pay Page">
              <Button
                type="primary"
                size="small"
                icon={<ArrowRightOutlined />}
                onClick={() => handleGoToPayPage(record)}
                style={{
                  background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 600,
                }}
              >
                Pay
              </Button>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 20, background: colors.background, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title
            level={3}
            style={{
              margin: 0,
              background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Join Fees Management
          </Title>
          <Text type="secondary">Track and manage agent join fee payments across programs</Text>
        </div>
        <Space>
          {isSuperAdmin && (
            <Tooltip title="Recalculate all agent stats from member data to fix any mismatch">
              <Button
                icon={<SyncOutlined spin={syncing} />}
                loading={syncing}
                onClick={handleSyncStats}
                style={{
                  borderColor: colors.primary,
                  color: colors.primary,
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 12,
                  height: 36,
                }}
              >
                Sync Stats
              </Button>
            </Tooltip>
          )}
          <Button
            icon={<HistoryOutlined />}
            onClick={() => router.push('/payments/history')}
            style={{
              background: colors.historyBtnBg,
              border: 'none',
              color: '#fff',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 12,
              height: 36,
            }}
          >
            Payment History
          </Button>
        </Space>
      </div>

      {/* Summary Cards */}
      <SummaryCards 
        activeAgents={activeAgents}
        totalFees={totalFees}
        totalCollected={totalCollected}
        totalPending={totalPending}
        overallProgress={overallProgress}
        colors={colors}
      />

      {/* Main Table */}
      <Card
        style={{
          border: `1px solid ${colors.border}`,
          borderRadius: 10,
          background: colors.surface,
          boxShadow: '0 2px 8px rgba(var(--primary-rgb), 0.08)',
        }}
        bodyStyle={{ padding: 0 }}
      >
        {/* Search & Filter bar */}
        <div style={{
          display: 'flex', gap: 10, flexWrap: 'wrap',
          padding: '14px 16px',
          borderBottom: `1px solid ${colors.border}`,
          alignItems: 'center',
        }}>
          <Input
            prefix={<SearchOutlined style={{ color: colors.muted || '#9ca3af' }} />}
            placeholder="Search by agent name or phone..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            style={{ width: 280, borderRadius: 8, borderColor: colors.border }}
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 170 }}
            prefix={<FilterOutlined />}
            options={[
              { label: '🔵 All Agents',      value: 'all'     },
              { label: '🟡 Has Pending',     value: 'pending' },
              { label: '🟢 Fully Paid',      value: 'paid'    },
            ]}
          />
          {(searchText || statusFilter !== 'all') && (
            <Button
              size="small"
              onClick={() => { setSearchText(''); setStatusFilter('all'); }}
              style={{ borderRadius: 6, color: colors.primary, borderColor: colors.border }}
            >
              Clear
            </Button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9ca3af' }}>
            {filteredAgents.length} of {activeAgents.length} agents
          </span>
        </div>

        <Table
          columns={columns}
          dataSource={filteredAgents}
          rowKey="uid"
          pagination={{ pageSize: 10, size: 'small', showTotal: (t) => `${t} agents` }}
          size="middle"
          scroll={{ x: 1400, y: 520 }}
          expandable={{
            expandedRowRender,
            expandRowByClick: false,
            expandedRowKeys,
            onExpand: (expanded, record) => {
              setExpandedRowKeys(expanded ? [record.uid] : []);
            },
            expandIcon: ({ expanded, onExpand, record }) =>
              expanded ? (
                <DownOutlined
                  onClick={(e) => onExpand(record, e)}
                  style={{ color: colors.primary, cursor: 'pointer' }}
                />
              ) : (
                <RightOutlined
                  onClick={(e) => onExpand(record, e)}
                  style={{ color: colors.primary, cursor: 'pointer' }}
                />
              ),
          }}
          rowStyle={{ transition: 'background 0.2s' }}
        />
      </Card>

      {/* Payment History Drawer */}
      <PaymentHistoryDrawerAgent
        visible={historyDrawerVisible}
        onClose={() => {
          setHistoryDrawerVisible(false);
          setSelectedAgentForHistory(null);
          setSelectedProgramFilter('all');
        }}
        selectedAgent={selectedAgentForHistory}
        paymentGroups={paymentGroups}
        paymentTransactions={paymentTransactions}
        loading={historyLoading}
        programList={programList}
        selectedProgramFilter={selectedProgramFilter}
        onProgramFilterChange={setSelectedProgramFilter}
        onGroupClick={showGroupDetails}
        colors={colors}
      />

      {/* Group Detail Drawer */}
      <GroupDetailDrawer
        visible={groupDetailVisible}
        onClose={() => {
          setGroupDetailVisible(false);
          setSelectedGroup(null);
        }}
        group={selectedGroup}
        programList={programList}
        colors={colors}
        isSuperAdmin={isSuperAdmin}
        onDeleteSuccess={(deletedGroupId, closeDrawer) => {
          if (closeDrawer) {
            setGroupDetailVisible(false);
            setSelectedGroup(null);
          }
          // Refresh payment history list (removes deleted group from the drawer list)
          if (selectedAgentForHistory?.uid) {
            fetchPaymentGroups(selectedAgentForHistory.uid);
          }
          // Refresh this agent's stats in Redux (updates totals on main page)
          if (selectedAgentForHistory?.uid) {
            refreshAgentInRedux(selectedAgentForHistory.uid);
          }
        }}
      />

      {/* Agent Detail Drawer */}
      <AgentDetailDrawer
        agent={drawerAgent}
        onClose={() => setDrawerAgent(null)}
        onViewHistory={showPaymentHistory}
        onPayNow={handleGoToPayPage}
        getStatusTag={getStatusTag}
        colors={colors}
      />
    </div>
  );
};

export default JoinFeesPage;