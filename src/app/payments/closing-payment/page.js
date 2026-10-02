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
  Select
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
  FilterOutlined
} from '@ant-design/icons';
import { message as antMessage } from 'antd';
import { auth } from '../../../../lib/firbase-client';
import { useRouter } from 'next/navigation';

// Import custom components

// Import constants and helpers
import { processAgentStats } from '@/utils/agentUtils';
import SummaryCards from '../join-fees/components/SummaryCards';
import ClosingPaymentHistoryDrawerAgent from './components/PaymentHistoryDrawerAgent';
import { useClosingPaymentHistory } from '@/utils/hooks/useClosingPaymentHistory';
import ClosingGroupDetailDrawer from './components/GroupDetailDrawer';
import ClosingAgentDetailDrawer from './components/AgentDetailDrawer';

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
const ClosingPayment = () => {
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
  const [programFilter, setProgramFilter] = useState('all');

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
  } = useClosingPaymentHistory();

  // Re-fetch agents from Firestore on mount so closing stats are always current
  useEffect(() => {
    const refreshAgents = async () => {
      try {
        const snap = await getDocs(collection(db, 'agents'));
        const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        dispatch(setAgentList(fresh));
      } catch (e) {
        console.warn('closing-payment: failed to refresh agents', e.message);
      }
    };
    refreshAgents();
  }, []);

  // Process agents with stats
  const agentsWithStats = processAgentStats(agentList, programList);
  const activeAgents = agentsWithStats.filter((a) => a.active_flag && !a.delete_flag);

  // Programme options built from the agents actually on screen, so the dropdown
  // never lists a yojna nobody collects closing for.
  const programFilterOptions = React.useMemo(() => {
    const seen = new Map();
    activeAgents.forEach(a => {
      (a.programs || []).forEach(p => {
        if (!p.programId) return;
        if (!seen.has(p.programId)) seen.set(p.programId, p.programName || p.programId);
      });
    });
    return [
      { label: '📋 All Yojna', value: 'all' },
      ...[...seen.entries()]
        .sort((a, b) => String(a[1]).localeCompare(String(b[1])))
        .map(([value, label]) => ({ label, value })),
    ];
  }, [agentList, programList]);

  // Closing pending for one agent, narrowed to the selected yojna.
  const closingPendingFor = (a) => {
    if (programFilter === 'all') return a.closing_pendingAmount || 0;
    const p = (a.programs || []).find(p => p.programId === programFilter);
    return p?.totalClosingPendingAmount || 0;
  };

  // Search + programme + status filter, then pending-first ordering so the
  // agents who still owe money are always at the top of the list.
  const filteredAgents = activeAgents
    .filter((a) => {
      const q = searchText.trim().toLowerCase();
      if (q) {
        const nameMatch  = (a.name   || '').toLowerCase().includes(q);
        const phoneMatch = (a.phone1 || a.phone || '').toLowerCase().includes(q);
        const villMatch  = (a.village || '').toLowerCase().includes(q);
        const codeMatch  = (a.agentCode || '').toLowerCase().includes(q);
        if (!nameMatch && !phoneMatch && !villMatch && !codeMatch) return false;
      }
      if (programFilter !== 'all') {
        const inProgram = (a.programs || []).some(p => p.programId === programFilter);
        if (!inProgram) return false;
      }
      if (statusFilter === 'pending') return closingPendingFor(a) > 0;
      if (statusFilter === 'paid')    return closingPendingFor(a) === 0;
      return true;
    })
    .sort((a, b) => closingPendingFor(b) - closingPendingFor(a));

  // Summary calculations
  const totalPending = activeAgents.reduce((s, a) => s + (a.closing_pendingAmount || 0), 0);
  const totalCollected = activeAgents.reduce((s, a) => s + (a.closing_paidAmount || 0), 0);
  const totalFees = activeAgents.reduce((s, a) => s + (a.closing_totalAmount || 0), 0);
  const overallProgress = totalFees ? Math.round((totalCollected / totalFees) * 100) : 0;

  const handleGoToPayPage = (agent, program = null) => {
    // Carry the yojna filter through to the collect page, so the row-level Pay
    // button lands on the same programme the user is currently looking at.
    const programId = program?.programId || programFilter || 'all';
    const url = `closing-payment/${agent.uid}?programId=${programId}`;
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
  // Same endpoint join-fees uses — it rebuilds both join-fee and closing totals,
  // which is the fix when an agent's closing_pendingAmount has drifted.
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
        dataIndex: 'totalClosingAmount',
        key: 'totalClosingAmount',
        width: 110,
        align: 'right',
        render: (v) => <Text>₹{v?.toLocaleString() || 0}</Text>,
      },
      {
        title: 'Paid (₹)',
        dataIndex: 'totalClosingPaidAmount',
        key: 'totalClosingPaidAmount',
        width: 110,
        align: 'right',
        render: (v) => <Text style={{ color: colors.success, fontWeight: 600 }}>₹{v?.toLocaleString() || 0}</Text>,
      },
      {
        title: 'Pending (₹)',
        dataIndex: 'totalClosingPendingAmount',
        key: 'totalClosingPendingAmount',
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
          prog.totalClosingPendingAmount > 0 ? (
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

    // When a yojna is selected above, the expanded rows show only that yojna —
    // otherwise the filter would look like it hadn't applied.
    const rows = programFilter === 'all'
      ? record.programs
      : (record.programs || []).filter(p => p.programId === programFilter);

    return (
      <div style={{ padding: '8px 16px', background: 'var(--pink-50)', borderRadius: 8 }}>
        <Table
          columns={programColumns}
          dataSource={rows}
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
        <Text strong>₹{r.closing_totalAmount?.toLocaleString() || 0}</Text>
      ),
    },
    {
      title: 'Paid',
      key: 'paid',
      width: 110,
      align: 'right',
      render: (_, r) => (
        <Text style={{ color: colors.success, fontWeight: 600 }}>
          ₹{r.closing_paidAmount?.toLocaleString() || 0}
        </Text>
      ),
    },
    {
      title: 'Pending',
      key: 'pending',
      width: 110,
      align: 'right',
      render: (_, r) => (
        <Text style={{ color: r.closing_pendingAmount > 0 ? colors.error : colors.success, fontWeight: 600 }}>
          ₹{r.closing_pendingAmount?.toLocaleString()}
        </Text>
      ),
    },
    {
      title: 'Progress',
      key: 'progress',
      width: 130,
      render: (_, r) => (
        <Progress
          percent={Math.round((r.closing_paidAmount / (r.closing_totalAmount || 1)) * 100)}
          size="small"
          strokeColor={r.closing_pendingAmount === 0 ? colors.success : colors.primary}
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
          {/* Closing page must key off the CLOSING pending amount. This used to
              read totalJoinFeesPending, so an agent with closing dues but no
              join-fees dues never saw a Pay button. */}
          {(record.closing_pendingAmount || 0) > 0 && (
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
            Closing Form Management
          </Title>
          <Text type="secondary">Track and manage agent closing payments across programs</Text>
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
            prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
            placeholder="Search by agent name, code, phone or village..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            style={{ width: 300, borderRadius: 8, borderColor: colors.border }}
          />
          <Select
            value={programFilter}
            onChange={setProgramFilter}
            style={{ width: 200 }}
            showSearch
            optionFilterProp="label"
            options={programFilterOptions}
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 170 }}
            prefix={<FilterOutlined />}
            options={[
              { label: '🔵 All Agents',  value: 'all'     },
              { label: '🟡 Has Pending', value: 'pending' },
              { label: '🟢 Fully Paid',  value: 'paid'    },
            ]}
          />
          {(searchText || statusFilter !== 'all' || programFilter !== 'all') && (
            <Button
              size="small"
              onClick={() => { setSearchText(''); setStatusFilter('all'); setProgramFilter('all'); }}
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
      <ClosingPaymentHistoryDrawerAgent
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
      <ClosingGroupDetailDrawer
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
          if (selectedAgentForHistory?.uid) {
            fetchPaymentGroups(selectedAgentForHistory.uid);
          }
          if (selectedAgentForHistory?.uid) {
            refreshAgentInRedux(selectedAgentForHistory.uid);
          }
        }}
      />

      {/* Agent Detail Drawer */}
      <ClosingAgentDetailDrawer
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

export default ClosingPayment;