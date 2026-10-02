"use client";
import { panelTheme } from '@/utils/trust/trustStore';
import { fetchMembersByAgent } from '@/app/members/components/firebase-helpers';
import { useParams, useSearchParams } from 'next/navigation';
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useAuth } from '@/components/Base/AuthProvider';
import {
  Table, Card, Tag, Button, Space, Typography, InputNumber, message,
  Row, Col, Avatar, Select, Checkbox, Empty, Radio, Input, Badge,
  Tooltip, Progress, Statistic, Divider, Modal, Flex, theme,
  ConfigProvider
} from 'antd';
import {
  UserOutlined, SearchOutlined, TeamOutlined, BankOutlined,
  WalletOutlined, ClockCircleOutlined, HistoryOutlined,
  DollarCircleOutlined, CheckCircleOutlined, ThunderboltOutlined,
  ArrowRightOutlined, InfoCircleOutlined,
  SortAscendingOutlined, CalendarOutlined, SwapOutlined,
  RiseOutlined, FallOutlined, OrderedListOutlined,
  FilePdfOutlined, FilterOutlined, CloseCircleOutlined,
  ReloadOutlined, EyeOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { auth, db } from '../../../../../lib/firbase-client';
import { paymentApi } from '@/utils/api';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import TransactionDetailDrawer from '../../join-fees/components/TransactionDetailDrawer';
import ClosingPaymentConfirmationDrawer from '../components/PaymentConfirmationDrawer';
import ClosingPaymentHistoryDrawer from '../components/PaymentHistoryDrawer';
import RasidGroupClosingDrawer from '../components/RasidComponent/RasidGroupClosingDrawer';
import AgentAdvancePanel from '../../join-fees/components/AgentAdvancePanel';
import { uploadFile } from '@/utils/uploadUtils/common';

const { Title, Text } = Typography;
const { Option } = Select;

// ─── Brand colors ─────────────────────────────────────────────────────────────
const C = {
  get primary() { return panelTheme().primary; },
  get primaryLight() { return panelTheme().pink100; },
  get primaryMid() { return panelTheme().pink300; },
  get secondary() { return panelTheme().secondary; },
  accent:     '#059669',
  warning:    '#f59e0b',
  success:    '#16a34a',
  successLight: '#dcfce7',
  error:      '#dc2626',
  errorLight: '#fee2e2',
  info:       '#2563eb',
  infoLight:  '#dbeafe',
  get bg() { return panelTheme().background; },
  surface:    '#ffffff',
  get border() { return panelTheme().pink100; },
  get borderMid() { return panelTheme().pink200; },
  text:       '#1e1e2e',
  textMuted:  '#6b7280',
  textLight:  '#9ca3af',
};

// ─── Sort options ──────────────────────────────────────────────────────────────
const SORT_OPTIONS = [
  { value: 'pending_desc', label: 'Pending ↓', icon: <FallOutlined />, tooltip: 'Highest pending first', fn: (a, b) => (b.closing_pendingAmount || 0) - (a.closing_pendingAmount || 0) },
  { value: 'paid_desc',    label: 'Paid ↓',    icon: <RiseOutlined />, tooltip: 'Highest paid first',    fn: (a, b) => (b.closing_paidAmount || 0) - (a.closing_paidAmount || 0) },
  { value: 'name_asc',     label: 'Name A→Z',  icon: <SortAscendingOutlined />, tooltip: 'Alphabetical', fn: (a, b) => (a.displayName || '').localeCompare(b.displayName || '') },
  { value: 'reg_asc',      label: 'Reg No.',   icon: <OrderedListOutlined />, tooltip: 'By registration number', fn: (a, b) => (a.registrationNumber || '').localeCompare(b.registrationNumber || '') },
  { value: 'created_desc', label: 'Newest',    icon: <CalendarOutlined />, tooltip: 'Most recently added first',
    fn: (a, b) => {
      const aT = a.createdAt?.toMillis?.() || new Date(a.createdAt || 0).getTime();
      const bT = b.createdAt?.toMillis?.() || new Date(b.createdAt || 0).getTime();
      return bT - aT;
    },
  },
];

// ─── Waterfall distributor ────────────────────────────────────────────────────
const waterfallDistribute = (totalAmount, sortedIds, membersMap) => {
  const result = {};
  let remaining = totalAmount;
  for (const id of sortedIds) {
    if (remaining <= 0) { result[id] = 0; continue; }
    const m = membersMap[id];
    if (!m || m.isDeleted) { result[id] = 0; continue; }
    const allocated = Math.min(remaining, m.closing_pendingAmount || 0);
    result[id] = allocated;
    remaining -= allocated;
  }
  return result;
};

// ─── Compact Stat Card ────────────────────────────────────────────────────────
const CompactStatCard = ({ label, value, sub, color, icon, extra }) => (
  <div style={{
    background: C.surface,
    borderRadius: 12,
    padding: '8px 12px',
    border: `1px solid ${C.border}`,
    transition: 'all 0.2s',
    height: '100%'
  }}>
    <Flex justify="space-between" align="center" wrap="wrap" gap={4}>
      <Space size={4} direction="vertical" style={{ gap: 0 }}>
        <Text style={{ fontSize: 10, color: C.textMuted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
          {label}
        </Text>
        <Text style={{ fontSize: 20, fontWeight: 700, color: color || C.text, lineHeight: 1.2 }}>
          {value}
        </Text>
        {sub && <Text style={{ fontSize: 9, color: C.textLight }}>{sub}</Text>}
      </Space>
      <div style={{ fontSize: 24, opacity: 0.3 }}>{icon}</div>
    </Flex>
    {extra}
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────
const ClosingMemberPaymentPage = () => {
  const params       = useParams();
  const searchParams = useSearchParams();
  const programList  = useSelector(s => s.data.programList);
  const agentList    = useSelector(s => s.data.agentList || []);
  const { token } = theme.useToken();
  const { user }     = useAuth();
  const isSuperAdmin = user?.role === 'superadmin';

  const agentId      = params?.agentId;
  const programId    = searchParams.get('programId');
  const currentAgent = agentList.find(a => a.uid === agentId);

  // ── State ────────────────────────────────────────────────────────────────
  const [members,              setMembers]              = useState([]);
  const [loading,              setLoading]              = useState(false);
  const [historyLoading,       setHistoryLoading]       = useState(false);
  const [searchText,           setSearchText]           = useState('');
  const [selectedProgram,      setSelectedProgram]      = useState(programId || 'all');
  const [sortKey,              setSortKey]              = useState('pending_desc');
  const [paymentFilter,        setPaymentFilter]        = useState('all');
  const [selectedMembers,      setSelectedMembers]      = useState([]);
  const [globalPaymentAmount,  setGlobalPaymentAmount]  = useState('');
  const [paymentMethod,        setPaymentMethod]        = useState('cash');
  const [transactionId,        setTransactionId]        = useState('');
  const [memberPayments,       setMemberPayments]       = useState({});
  const [programOptions,       setProgramOptions]       = useState([]);

  const [advanceBalance,             setAdvanceBalance]             = useState(0);

  const [historyDrawerVisible,       setHistoryDrawerVisible]       = useState(false);
  const [selectedMemberForHistory,   setSelectedMemberForHistory]   = useState(null);
  const [memberTransactions,         setMemberTransactions]         = useState([]);
  const [selectedTransaction,        setSelectedTransaction]        = useState(null);
  const [transactionDetailVisible,   setTransactionDetailVisible]   = useState(false);
  const [isPaymentDrawerVisible,     setIsPaymentDrawerVisible]     = useState(false);
  const [paymentDate,                setPaymentDate]                = useState(dayjs());
  const [paymentNote,                setPaymentNote]                = useState('');
  const [uploadedFile,               setUploadedFile]               = useState(null);
  const [uploading,                  setUploading]                  = useState(false);
  const [processingPayments,         setProcessingPayments]         = useState([]);
  const [closingGroupsMap,           setClosingGroupsMap]           = useState({});
  const [openRasidDrawer,            setOpenRasidDrawer]            = useState(false);

  // Idempotency key for the in-flight payment. Held in a ref so retrying the
  // SAME submission reuses it (server rejects the replay), while a new payment
  // — drawer reopened — gets a fresh key. Without this, cash closing payments
  // had no duplicate protection at all: the UTR check only fires for online.
  const idempotencyKeyRef = useRef(null);

  // ── Derived ──────────────────────────────────────────────────────────────
  const membersMap = useMemo(() => Object.fromEntries(members.map(m => [m.id, m])), [members]);

  const filteredMembers = useMemo(() => {
    let list = [...members];
    if (selectedProgram !== 'all') list = list.filter(m => m.programId === selectedProgram);
    if (paymentFilter === 'pending') list = list.filter(m => !m.isDeleted && (m.closing_pendingAmount || 0) > 0);
    else if (paymentFilter === 'paid') list = list.filter(m => !m.isDeleted && m.closing_pendingAmount === 0 && (m.closing_paidAmount || 0) > 0);
    if (searchText.trim()) {
      const s = searchText.toLowerCase();
      list = list.filter(m =>
        m.displayName?.toLowerCase().includes(s) ||
        m.phone?.includes(searchText) ||
        m.registrationNumber?.toLowerCase().includes(s) ||
        m.fatherName?.toLowerCase().includes(s)
      );
    }
    const sortFn = SORT_OPTIONS.find(o => o.value === sortKey)?.fn ?? SORT_OPTIONS[0].fn;
    list.sort((a, b) => {
      if (a.isDeleted !== b.isDeleted) return a.isDeleted ? 1 : -1;
      return sortFn(a, b);
    });
    return list;
  }, [members, selectedProgram, paymentFilter, searchText, sortKey]);

  const activeMembers     = members.filter(m => !m.isDeleted);
  const totalOverallPaid  = activeMembers.reduce((s, m) => s + (m.closing_paidAmount || 0), 0);
  const totalOverallPending = activeMembers.reduce((s, m) => s + (m.closing_pendingAmount || 0), 0);
  const totalSelectedPending = members.filter(m => selectedMembers.includes(m.id) && !m.isDeleted).reduce((s, m) => s + m.closing_pendingAmount, 0);
  const totalPaymentAmount   = selectedMembers.reduce((s, id) => s + (parseFloat(memberPayments[id]) || 0), 0);
  const selectableCount      = filteredMembers.filter(m => !m.isDeleted && m.closing_pendingAmount > 0).length;
  const pendingCount  = activeMembers.filter(m => (m.closing_pendingAmount || 0) > 0).length;
  const paidCount     = activeMembers.filter(m => m.closing_pendingAmount === 0 && (m.closing_paidAmount || 0) > 0).length;
  const fullyPaidCount = activeMembers.filter(m => m.closing_pendingAmount === 0).length;
  const selectedMembersData = members.filter(m => selectedMembers.includes(m.id) && !m.isDeleted && parseFloat(memberPayments[m.id]) > 0);

  const waterfallOrder = useMemo(() => {
    const order = {};
    let rank = 1;
    filteredMembers.forEach(m => {
      if (selectedMembers.includes(m.id) && (parseFloat(memberPayments[m.id]) || 0) > 0)
        order[m.id] = rank++;
    });
    return order;
  }, [filteredMembers, selectedMembers, memberPayments]);

  // ── Fetch agent advance balance ───────────────────────────────────────────
  const fetchAdvanceBalance = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res   = await fetch(`/api/agents/advance?agentId=${agentId}&limit=1`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const result = await res.json();
      if (result.success && result.data?.length > 0) {
        setAdvanceBalance(result.data[0]?.balanceAfter ?? 0);
      }
    } catch (e) { console.error('fetchAdvanceBalance error:', e); }
  };

  const deductFromAdvance = async (amount, description) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res   = await fetch('/api/agents/advance', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, amount, action: 'deduct', description }),
      });
      const result = await res.json();
      if (result.success) setAdvanceBalance(result.data.newBalance);
      return result;
    } catch (e) { console.error('deductFromAdvance error:', e); return { success: false }; }
  };

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => { if (agentId) { fetchMember(); fetchAdvanceBalance(); } }, [agentId]);

  useEffect(() => {
    const programs = new Set();
    members.forEach(m => {
      if (m.programId && !m.delete_flag) {
        const p = programList?.find(p => p.id === m.programId);
        if (p) programs.add(JSON.stringify({ id: p.id, name: p.name }));
      }
    });
    setProgramOptions(Array.from(programs).map(p => JSON.parse(p)));
  }, [members, programList]);

  // ── Data ─────────────────────────────────────────────────────────────────
  const fetchMember = async () => {
    setLoading(true);
    try {
      const data = await fetchMembersByAgent(agentId);
      const processed = data.map(m => ({
        ...m, key: m.id,
        // Derive pending from total − paid when the field is missing on the doc.
        // With `|| 0` an older member whose closing_pendingAmount was never
        // written showed ₹0 pending, so they could never be selected for payment.
        closing_pendingAmount: m.delete_flag
          ? 0
          : (m.closing_pendingAmount ?? Math.max(0, (m.closing_totalAmount || 0) - (m.closing_paidAmount || 0))),
        closing_paidAmount:    m.closing_paidAmount || 0,
        closing_totalAmount:   m.delete_flag ? 0 : (m.closing_totalAmount || 0),
        totalClosingCount:     m.totalClosingCount || 0,
        pendingClosingCount:   m.pendingClosingCount || 0,
        paidClosingCount:      m.paidClosingCount || 0,
        programNames: m.programIds?.map(pid => programList?.find(p => p.id === pid)?.name).filter(Boolean).join(', ') || 'No Program',
        isDeleted: m.delete_flag || false,
      }));
      setMembers(processed);
      const init = {};
      processed.forEach(m => { init[m.id] = 0; });
      setMemberPayments(init);
    } catch (e) {
      console.error(e);
      message.error('Failed to fetch members');
    } finally {
      setLoading(false);
    }
  };

  const fetchMemberPaymentHistory = async (memberId) => {
    setHistoryLoading(true);
    try {
      // where('memberId') + orderBy('createdAt') needs a composite index — sort in JS instead
      const q = query(collection(db, 'memberClosingFees'), where('memberId', '==', memberId));
      const snap = await getDocs(q);
      const rows = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toDate?.() || d.data().createdAt,
      }));
      rows.sort((a, b) => {
        const aT = a.createdAt instanceof Date ? a.createdAt.getTime() : (a.createdAt?.toMillis?.() ?? 0);
        const bT = b.createdAt instanceof Date ? b.createdAt.getTime() : (b.createdAt?.toMillis?.() ?? 0);
        return bT - aT;
      });
      setMemberTransactions(rows);
    } catch (e) {
      message.error('Failed to load payment history: ' + e.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  // ── Selection ─────────────────────────────────────────────────────────────
  const handleMemberSelect = (memberId, checked) => {
    const m = membersMap[memberId];
    if (m?.isDeleted) return;
    const newSel = checked ? [...selectedMembers, memberId] : selectedMembers.filter(id => id !== memberId);
    setSelectedMembers(newSel);
    if (globalPaymentAmount) {
      const sorted = filteredMembers.filter(m => newSel.includes(m.id)).map(m => m.id);
      setMemberPayments(prev => ({ ...prev, ...waterfallDistribute(Number(globalPaymentAmount), sorted, membersMap) }));
    } else if (checked) {
      // Same behaviour as join fees: ticking a member fills their full pending
      // amount, so "Review & Pay" is usable without typing anything.
      setMemberPayments(prev => ({ ...prev, [memberId]: m?.closing_pendingAmount || 0 }));
    } else {
      setMemberPayments(prev => ({ ...prev, [memberId]: 0 }));
    }
  };

  const handleSelectAll = (checked) => {
    const selectable = filteredMembers.filter(m => !m.isDeleted && m.closing_pendingAmount > 0).map(m => m.id);
    const newSel = checked ? selectable : [];
    setSelectedMembers(newSel);
    if (globalPaymentAmount && checked)
      setMemberPayments(prev => ({ ...prev, ...waterfallDistribute(Number(globalPaymentAmount), newSel, membersMap) }));
    else if (checked) {
      // Auto-fill each member's full pending amount (join-fees behaviour)
      const filled = {};
      selectable.forEach(id => { filled[id] = membersMap[id]?.closing_pendingAmount || 0; });
      setMemberPayments(prev => ({ ...prev, ...filled }));
    } else if (!checked) {
      const cleared = {};
      selectable.forEach(id => { cleared[id] = 0; });
      setMemberPayments(prev => ({ ...prev, ...cleared }));
    }
  };

  const handlePaymentAmountChange = (memberId, value) => {
    const m = membersMap[memberId];
    if (m?.isDeleted) return;
    if (value > m.closing_pendingAmount) { message.warning(`Cannot exceed ₹${m.closing_pendingAmount.toLocaleString()}`); return; }
    setMemberPayments(prev => ({ ...prev, [memberId]: value || 0 }));
  };

  const applyGlobalPayment = () => {
    if (!globalPaymentAmount || selectedMembers.length === 0) return;
    const amount = Number(globalPaymentAmount);
    if (isNaN(amount) || amount <= 0) { message.warning('Enter a valid amount'); return; }
    const sortedSelected = filteredMembers.filter(m => selectedMembers.includes(m.id)).map(m => m.id);
    const dist = waterfallDistribute(amount, sortedSelected, membersMap);
    setMemberPayments(prev => ({ ...prev, ...dist }));
    message.success(`₹${amount.toLocaleString()} distributed across ${Object.values(dist).filter(v => v > 0).length} member(s)`);
  };

  const handleProcessPayments = async () => {
    const valid = selectedMembers.filter(id => {
      const amt = parseFloat(memberPayments[id]) || 0;
      const m = membersMap[id];
      return !m?.isDeleted && amt > 0 && amt <= m.closing_pendingAmount;
    });
    if (!valid.length) { message.warning('No valid payment amounts entered.'); return; }
    if (paymentMethod === 'online' && !transactionId) { message.warning('Enter Transaction ID'); return; }
    const total = valid.reduce((s, id) => s + (parseFloat(memberPayments[id]) || 0), 0);
    if (paymentMethod === 'advance') {
      if (advanceBalance <= 0) { message.error('No advance balance available'); return; }
      if (total > advanceBalance) { message.error(`Advance balance ₹${advanceBalance.toLocaleString()} is less than total ₹${total.toLocaleString()}`); return; }
    }

    // ── Fetch closing_payment docs for each selected member to build per-group data ──
    const cgMap = {};
    const cgPromises = valid.map(async (id) => {
      const m = membersMap[id];
      if (!m) return;
      try {
        const q = query(
          collection(db, 'closing_payment'),
          where('memberId', '==', id),
          where('status', 'in', ['pending', 'partial'])
        );
        const snap = await getDocs(q);
        cgMap[id] = snap.docs.map(d => {
          const dta = d.data();
          return {
            id: d.id,
            closingGroupId:   dta.closingGroupId,
            closingGroupName: dta.closingGroupName || '',
            totalAmount: Number(dta.totalAmount || 0),
            paidAmount: Number(dta.paidAmount || 0),
            pendingAmount: Number(dta.pendingAmount || (dta.totalAmount || 0) - (dta.paidAmount || 0)),
            closingCount: Number(dta.closingCount || 0),
            payAmount: Number(dta.payAmount || 0),
            closingDetails: dta.closingDetails || [],
            programId: dta.programId,
          };
        });
      } catch (e) {
        console.warn(`Failed to fetch closing groups for member ${id}:`, e);
        cgMap[id] = [];
      }
    });
    await Promise.all(cgPromises);
    setClosingGroupsMap(cgMap);

    // ── Build per-group payment entries ───────────────────────────────────────
    // For each member, distribute their payment amount across their pending groups (oldest-first)
    const allEntries = [];
    for (const id of valid) {
      const m = membersMap[id];
      const memberAmt = parseFloat(memberPayments[id]) || 0;
      const groups = cgMap[id] || [];
      let remaining = memberAmt;
      for (const g of groups) {
        if (remaining <= 0) break;
        const allocAmt = Math.min(remaining, g.pendingAmount);
        if (allocAmt > 0) {
          allEntries.push({
            memberId: id,
            memberName: m.displayName,
            closingGroupId: g.closingGroupId,
            amount: allocAmt,
          });
          remaining -= allocAmt;
        }
      }
    }

    setProcessingPayments(allEntries);
    setIsPaymentDrawerVisible(true);
  };

  const confirmPayment = async () => {
    try {
      if (!auth.currentUser) { message.error('No authenticated user'); return; }
      setUploading(true);

      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current =
          `cp_${agentId}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      }

      let fileUrl = null;
      if (uploadedFile) {
        const result = await uploadFile(uploadedFile, `memberpayments/JoinFees/${agentId}/${Date.now()}_${uploadedFile.name}`);
        fileUrl = result?.url || null;
      }
      const totalAmt = processingPayments.reduce((s, p) => s + p.amount, 0);
      const res = await paymentApi.closedPaymentUpdate({
        closingPayments: processingPayments,
        paymentDate: paymentDate.toISOString(),
        paymentMethod: paymentMethod === 'advance' ? 'advance' : paymentMethod,
        paymentNote, transactionId,
        fileUrl,
        totalAmount: totalAmt,
        agentId,
        programId: selectedProgram !== 'all' ? selectedProgram : null,
        idempotencyKey: idempotencyKeyRef.current,
      });

      // Server recognised this as a replay — the payment already exists
      if (res.alreadyProcessed) {
        message.warning(res.message || 'This payment was already recorded.');
        setIsPaymentDrawerVisible(false);
        fetchMember();
        setSelectedMembers([]);
        setMemberPayments({});
        setGlobalPaymentAmount('');
        idempotencyKeyRef.current = null;
        return;
      }

      if (res.success) {
        idempotencyKeyRef.current = null;   // this payment is done
        if (paymentMethod === 'advance') {
          const deductResult = await deductFromAdvance(totalAmt, `Closing Payment — ${processingPayments.length} member(s)`);
          if (!deductResult.success) message.warning('Payment recorded but advance deduction failed: ' + deductResult.message);
        }
        message.success(`Processed ${processingPayments.length} closing payment(s)`);
        setIsPaymentDrawerVisible(false);
        fetchMember();
        setSelectedMembers([]);
        setMemberPayments({});
        setGlobalPaymentAmount('');
      }
    } catch (e) {
      if (e.message?.toLowerCase().includes('duplicate transaction')) {
        Modal.error({
          title: '⚠️ Duplicate Transaction Detected',
          content: e.message,
          okText: 'OK, I\'ll check',
          width: 520,
        });
      } else {
        message.error('Payment failed: ' + e.message);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadPDF = () => setOpenRasidDrawer(true);

  // ── Table columns (Compact & Optimized) ──────────────────────────────────────────
  const columns = [
    {
      title: () => (
        <Checkbox
          onChange={e => handleSelectAll(e.target.checked)}
          checked={selectedMembers.length === selectableCount && selectableCount > 0}
          indeterminate={selectedMembers.length > 0 && selectedMembers.length < selectableCount}
        />
      ),
      key: 'sel', width: 40,
      render: (_, r) => (
        <Checkbox
          checked={selectedMembers.includes(r.id)}
          onChange={e => handleMemberSelect(r.id, e.target.checked)}
          disabled={r.isDeleted || r.closing_pendingAmount === 0}
        />
      ),
    },
    {
      title: '#', key: 'order', width: 36,
      render: (_, r) => {
        const n = waterfallOrder[r.id];
        return n
          ? <div style={{ width: 22, height: 22, borderRadius: '50%', background: `linear-gradient(135deg, ${C.primary}, ${C.secondary})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700, margin: '0 auto' }}>{n}</div>
          : <div style={{ textAlign: 'center', color: C.textLight, fontSize: 10 }}>—</div>;
      },
    },
    {
      title: 'Member', key: 'member', width: 200,
      render: (_, r) => {
        const total = r.closing_totalAmount || 0;
        const paid  = r.closing_paidAmount || 0;
        const pct   = total > 0 ? Math.round((paid / total) * 100) : 0;
        return (
          <Flex gap={8} align="center">
            <Avatar
              src={r.photoURL}
              icon={!r.photoURL && <UserOutlined />}
              size={32}
              style={{
                backgroundColor: r.isDeleted ? '#d1d5db' : C.primary,
                border: `1.5px solid ${r.isDeleted ? '#d1d5db' : C.primaryMid}`,
                opacity: r.isDeleted ? 0.5 : 1,
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Flex align="center" gap={4} wrap="wrap">
                <Text strong style={{ fontSize: 12, textDecoration: r.isDeleted ? 'line-through' : 'none', color: r.isDeleted ? C.textLight : C.text }}>
                  {r.displayName}
                </Text>
                {r.payAmount && (
                  <Tag color="volcano" style={{ fontSize: 9, margin: 0, padding: '0 4px', lineHeight: '16px', borderRadius: 10 }}>
                    ₹{r.payAmount?.toLocaleString()}
                  </Tag>
                )}
                {r.isDeleted && <Tag color="red" style={{ fontSize: 9, margin: 0, padding: '0 4px', lineHeight: '16px' }}>Del</Tag>}
                {pct === 100 && !r.isDeleted && <CheckCircleOutlined style={{ color: C.success, fontSize: 11 }} />}
              </Flex>
              <div style={{ fontSize: 10, color: C.textLight }}>
                {r.registrationNumber} · {r.phone}
              </div>
              {!r.isDeleted && total > 0 && (
                <Progress
                  percent={pct} size="small" showInfo={false}
                  strokeColor={pct === 100 ? C.success : C.primary}
                  style={{ marginTop: 2, marginBottom: 0, width: '100%' }}
                />
              )}
            </div>
          </Flex>
        );
      },
    },
    {
      title: 'Closings', key: 'closings', width: 80,
      render: (_, r) => {
        const { totalClosingCount: total = 0, pendingClosingCount: pending = 0, paidClosingCount: paid = 0 } = r;
        return (
          <Tooltip title={r.programNames}>
            <div>
              <Tag color={r.isDeleted ? 'default' : 'geekblue'} style={{ fontSize: 10, margin: 0 }}>
                {total}
              </Tag>
              {total > 0 && (
                <div style={{ fontSize: 9, color: pending === 0 ? C.success : C.warning }}>
                  {paid}/{total}
                </div>
              )}
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: 'Total', dataIndex: 'closing_totalAmount', width: 70, align: 'right',
      render: (f, r) => (
        <Text style={{ fontSize: 11, fontWeight: 500, color: r.isDeleted ? C.textLight : C.text }}>
          ₹{r.isDeleted ? 0 : (f?.toLocaleString() || 0)}
        </Text>
      ),
    },
    {
      title: 'Paid', dataIndex: 'closing_paidAmount', width: 70, align: 'right',
      render: (p, r) => (
        <Text style={{ fontSize: 11, fontWeight: 500, color: r.isDeleted ? C.textLight : C.success }}>
          ₹{r.isDeleted ? 0 : (p?.toLocaleString() || 0)}
        </Text>
      ),
    },
    {
      title: 'Pending', dataIndex: 'closing_pendingAmount', width: 100, align: 'right',
      render: (pending, r) => {
        if (r.isDeleted) return <Text style={{ color: C.textLight, fontSize: 11 }}>₹0</Text>;
        if (pending === 0) return (
          <Tag color="success" icon={<CheckCircleOutlined />} style={{ fontSize: 9, borderRadius: 12, margin: 0 }}>
            Paid
          </Tag>
        );
        const paying = parseFloat(memberPayments[r.id]) || 0;
        const after  = pending - paying;
        return (
          <div>
            <Text style={{ fontSize: 11, fontWeight: 600, color: C.error }}>₹{pending.toLocaleString()}</Text>
            {paying > 0 && (
              <div style={{ fontSize: 9, color: after === 0 ? C.success : C.warning }}>
                → {after === 0 ? 'Cleared' : `₹${after.toLocaleString()}`}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Joined', key: 'joined', width: 65, align: 'center',
      render: (_, r) => {
        if (!r.createdAt) return <Text type="secondary" style={{ fontSize: 10 }}>—</Text>;
        const d = r.createdAt?.toDate?.() || r.createdAt;
        return <Text style={{ fontSize: 10, color: C.textLight }}>{dayjs(d).format('DD/MM/YY')}</Text>;
      },
    },
    {
      title: 'Pay Amt', key: 'pay', width: 100,
      render: (_, r) => {
        if (r.isDeleted) return <Text type="secondary" style={{ fontSize: 10 }}>N/A</Text>;
        if (r.closing_pendingAmount === 0) return (
          <Text style={{ color: C.success, fontSize: 10 }}>
            <CheckCircleOutlined /> Done
          </Text>
        );
        const isSelected = selectedMembers.includes(r.id);
        const val = memberPayments[r.id] || 0;
        return (
          <InputNumber
            size="small"
            placeholder="₹"
            value={val || null}
            onChange={v => handlePaymentAmountChange(r.id, v)}
            disabled={!isSelected}
            min={0} max={r.closing_pendingAmount} precision={0}
            style={{
              width: '100%',
              borderColor: val > 0 ? C.primary : undefined,
              borderRadius: 6,
            }}
            formatter={v => v ? `₹${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
            parser={v => v.replace(/₹\s?|(,*)/g, '')}
          />
        );
      },
    },
    {
      title: '', key: 'hist', width: 40, fixed: 'right',
      render: (_, r) => (
        <Tooltip title="History">
          <Button
            type="text"
            size="small"
            icon={<HistoryOutlined />}
            onClick={() => {
              setSelectedMemberForHistory(r);
              fetchMemberPaymentHistory(r.id);
              setHistoryDrawerVisible(true);
            }}
            style={{ color: C.info }}
          />
        </Tooltip>
      ),
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <ConfigProvider
      theme={{
        components: {
          Table: {
            cellPaddingBlock: 8,
            cellPaddingInline: 8,
            headerBg: '#fafafa',
          },
          InputNumber: { inputFontSizeSM: 12 },
          Tag: { fontSizeSM: 10 },
        },
      }}
    >
      <div style={{ background: C.bg, minHeight: '100vh', padding: '16px 20px' }}>

        {/* ── 1. Agent Header (Compact) ─────────────────────────────────────────────── */}
<Card
  size="small"
  style={{ marginBottom: 12, borderRadius: 14, borderColor: C.borderMid }}
  bodyStyle={{ padding: '12px 16px' }}
>
  <Flex justify="space-between" align="center" wrap="wrap" gap={16}>
    <Flex gap={12} align="center">
      <Avatar
        size={44}
        src={currentAgent?.photoUrl}
        icon={!currentAgent?.photoUrl && <UserOutlined />}
        style={{
          backgroundColor: C.primary,
          border: `2px solid ${C.primaryMid}`,
        }}
      />
      <div>
        <Flex align="center" gap={8} wrap="wrap">
          <Text strong style={{ fontSize: 16, color: C.text }}>
            {currentAgent?.name || 'Agent'}
          </Text>
          <Tag style={{ background: C.primaryLight, color: C.primary, border: `1px solid ${C.primaryMid}`, borderRadius: 16, fontSize: 10 }}>
            Closing Payments
          </Tag>
        </Flex>
        <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {currentAgent?.phone1 && (
            <Tag icon={<UserOutlined />} style={{ borderRadius: 12, fontSize: 10, margin: 0 }}>
              {currentAgent.phone1}
            </Tag>
          )}
          {currentAgent?.village && (
            <Tag style={{ borderRadius: 12, fontSize: 10, margin: 0 }}>
              📍 {currentAgent.village}
            </Tag>
          )}
        </div>
      </div>
    </Flex>

    {/* Stats Row - Moved here */}
    <div style={{ 
      display: 'grid', 
      gridTemplateColumns: 'repeat(4, minmax(140px, auto))', 
      gap: 12,
      flex: 1,
      maxWidth: 'fit-content'
    }}>
      <CompactStatCard 
        label="Members" 
        value={activeMembers.length} 
        sub={`${members.filter(m => m.isDeleted).length} deleted`} 
        icon={<TeamOutlined />} 
        color={C.info} 
      />
      <CompactStatCard 
        label="Collected" 
        value={`₹${totalOverallPaid.toLocaleString()}`} 
        sub="all time" 
        icon={<WalletOutlined />} 
        color={C.success} 
      />
      <CompactStatCard 
        label="Pending" 
        value={`₹${totalOverallPending.toLocaleString()}`} 
        sub={`${pendingCount} members`} 
        icon={<ClockCircleOutlined />} 
        color={C.error} 
      />
      <CompactStatCard 
        label="Fully Paid" 
        value={fullyPaidCount} 
        sub={`${paidCount} with history`} 
        icon={<CheckCircleOutlined />} 
        color={C.primary} 
      />
    </div>

    <Button
      icon={<FilePdfOutlined />}
      onClick={handleDownloadPDF}
      type="primary"
      style={{
        background: `linear-gradient(135deg, ${C.primary}, ${C.secondary})`,
        border: 'none', borderRadius: 10,
        fontWeight: 600, fontSize: 12, height: 36,
        boxShadow: `0 2px 8px rgba(var(--primary-rgb), 0.25)`,
      }}
    >
      PDF Rasid
    </Button>
  </Flex>
</Card>

        {/* ── Advance Payment Panel ─────────────────────────────────────────────── */}
        <AgentAdvancePanel agentId={agentId} />

        {/* ── 3. Filters & Controls (Compact Row) ──────────────────────────────────── */}
        <Card size="small" style={{ marginBottom: 12, borderRadius: 12 }} bodyStyle={{ padding: '12px' }}>
          <Flex wrap="wrap" gap={12} align="center" justify="space-between">
            <Input
              placeholder="Search name, phone, reg no..."
              prefix={<SearchOutlined style={{ color: C.textLight }} />}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              allowClear
              style={{ width: 200, borderRadius: 8 }}
              size="small"
            />
            <Select
              style={{ width: 140 }}
              placeholder="Program"
              value={selectedProgram}
              onChange={setSelectedProgram}
              size="small"
            >
              <Option value="all">All Programs</Option>
              {programOptions.map(p => <Option key={p.id} value={p.id}>{p.name}</Option>)}
            </Select>
            <div>
              <Radio.Group value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)} size="small" buttonStyle="solid">
                <Radio.Button value="all">All ({activeMembers.length})</Radio.Button>
                <Radio.Button value="pending">Pending ({pendingCount})</Radio.Button>
                <Radio.Button value="paid">Paid ({paidCount})</Radio.Button>
              </Radio.Group>
            </div>
            <Select
              style={{ width: 130 }}
              value={sortKey}
              onChange={setSortKey}
              size="small"
              options={SORT_OPTIONS.map(opt => ({ value: opt.value, label: opt.label }))}
            />
            <div style={{ fontSize: 11, background: C.primaryLight, padding: '2px 10px', borderRadius: 20, color: C.primary }}>
              {filteredMembers.length} results
            </div>
          </Flex>
        </Card>

        {/* ── 4. Waterfall & Payment Actions ───────────────────────────────────────── */}
        <Card size="small" style={{ marginBottom: 12, borderRadius: 12 }} bodyStyle={{ padding: '12px' }}>
          <Flex wrap="wrap" gap={12} align="center" justify="space-between">
            <Flex gap={8} align="center">
              <Checkbox
                onChange={e => handleSelectAll(e.target.checked)}
                checked={selectedMembers.length === selectableCount && selectableCount > 0}
                indeterminate={selectedMembers.length > 0 && selectedMembers.length < selectableCount}
              >
                <Text style={{ fontSize: 12 }}>Select All</Text>
              </Checkbox>
              {selectedMembers.length > 0 && (
                <Badge count={selectedMembers.length} style={{ backgroundColor: C.primary }} />
              )}
            </Flex>

            <Flex gap={8} align="center">
              <InputNumber
                placeholder="₹ Total to distribute"
                value={globalPaymentAmount}
                onChange={setGlobalPaymentAmount}
                style={{ width: 150 }}
                size="small"
                formatter={v => v ? `₹ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                parser={v => v.replace(/[^\d]/g, '')}
                precision={0}
              />
              <Button
                type="primary" icon={<ThunderboltOutlined />} size="small"
                onClick={applyGlobalPayment}
                disabled={!globalPaymentAmount || selectedMembers.length === 0}
                style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.secondary})`, border: 'none' }}
              >
                Waterfall
              </Button>
            </Flex>

            <Flex gap={8} align="center">
              <Radio.Group value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} size="small" buttonStyle="solid">
                <Radio.Button value="cash">Cash</Radio.Button>
                <Radio.Button value="online">Online</Radio.Button>
                {advanceBalance > 0 && (
                  <Radio.Button value="advance" style={{ color: paymentMethod === 'advance' ? undefined : '#059669' }}>
                    Advance ₹{advanceBalance.toLocaleString()}
                  </Radio.Button>
                )}
              </Radio.Group>
              {paymentMethod === 'online' ? (
                <Input
                  placeholder="Transaction ID"
                  value={transactionId}
                  onChange={e => setTransactionId(e.target.value)}
                  style={{ width: 160 }}
                  size="small"
                />
              ) : paymentMethod === 'advance' ? (
                <div style={{ background: '#f0fdf4', border: '1px solid #a7f3d0', borderRadius: 6, padding: '2px 10px' }}>
                  <Text style={{ fontSize: 11, color: '#065f46' }}>Available:</Text>
                  <Text strong style={{ fontSize: 13, color: '#059669', marginLeft: 4 }}>₹{advanceBalance.toLocaleString()}</Text>
                  {totalPaymentAmount > advanceBalance && (
                    <Text style={{ fontSize: 11, color: '#dc2626', marginLeft: 6 }}>⚠ Insufficient</Text>
                  )}
                </div>
              ) : (
                <div>
                  <Text style={{ fontSize: 11, color: C.textMuted }}>To Pay:</Text>
                  <Text strong style={{ fontSize: 14, color: C.success, marginLeft: 4 }}>₹{totalPaymentAmount.toLocaleString()}</Text>
                </div>
              )}
            </Flex>

            <Button
              type="primary"
              icon={<DollarCircleOutlined />}
              onClick={handleProcessPayments}
              disabled={totalPaymentAmount === 0 || (paymentMethod === 'online' && !transactionId) || (paymentMethod === 'advance' && totalPaymentAmount > advanceBalance)}
              style={{
                background: `linear-gradient(135deg, ${C.primary}, ${C.secondary})`,
                border: 'none', borderRadius: 8,
                fontWeight: 600, fontSize: 12, height: 32,
              }}
            >
              Review & Pay (₹{totalPaymentAmount.toLocaleString()})
            </Button>
          </Flex>
          {selectedMembers.length > 0 && globalPaymentAmount && (
            <div style={{ marginTop: 8, fontSize: 10, background: C.primaryLight, padding: '4px 8px', borderRadius: 6, color: C.primary }}>
              <InfoCircleOutlined style={{ marginRight: 4 }} />
              Waterfall follows <strong>{SORT_OPTIONS.find(o => o.value === sortKey)?.label}</strong> order — ₹{Number(globalPaymentAmount).toLocaleString()} across selected.
            </div>
          )}
        </Card>

        {/* ── 5. Members Table (Compact, Scrollable on X) ───────────────────────────── */}
        <Card
          size="small"
          style={{ borderRadius: 14, overflow: 'hidden', boxShadow: 'none' }}
          bodyStyle={{ padding: 0 }}
        >
          <Table
            columns={columns}
            dataSource={filteredMembers}
            rowKey="id"
            loading={loading}
            size="small"
            pagination={{
              pageSize: 12,
              showSizeChanger: true,
              pageSizeOptions: ['10', '12', '20', '50'],
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
              size: 'small',
            }}
            scroll={{ x: 950 }}
            rowClassName={r =>
              (!r.isDeleted && selectedMembers.includes(r.id) && parseFloat(memberPayments[r.id]) > 0)
                ? 'paying-row' : ''
            }
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No members found" style={{ margin: '20px 0' }} /> }}
          />
        </Card>
      </div>

      {/* Drawers remain same but with compact styles */}
      <style jsx global>{`
        .paying-row td { background: rgba(var(--primary-rgb), 0.03) !important; }
        .ant-table-row:hover.paying-row td { background: rgba(var(--primary-rgb), 0.06) !important; }
        .ant-table-cell { font-size: 12px; }
        .ant-pagination-options-size-changer .ant-select-selector { font-size: 12px; }
      `}</style>

      {/* ── Drawers ──────────────────────────────────────────────────────────── */}
      <ClosingPaymentHistoryDrawer
        visible={historyDrawerVisible}
        onClose={() => { setHistoryDrawerVisible(false); setSelectedMemberForHistory(null); setMemberTransactions([]); }}
        selectedMember={selectedMemberForHistory}
        memberTransactions={memberTransactions}
        loading={historyLoading}
        programList={programList}
        onTransactionClick={t => { setSelectedTransaction(t); setTransactionDetailVisible(true); }}
        colors={C}
      />
      <TransactionDetailDrawer
        visible={transactionDetailVisible}
        onClose={() => { setTransactionDetailVisible(false); setSelectedTransaction(null); }}
        transaction={selectedTransaction}
        selectedMember={selectedMemberForHistory}
        programList={programList}
        colors={C}
        isSuperAdmin={isSuperAdmin}
        // Closing transactions live in memberClosingFees — must NOT be reverted
        // through the join-fees endpoint this drawer defaults to.
        revertEndpoint="/api/closing-fees-revert-single"
        onDeleteSuccess={(deletedTx) => {
          setTransactionDetailVisible(false);
          setSelectedTransaction(null);
          setMemberTransactions(prev => prev.filter(t => t.id !== deletedTx.id));
          fetchMember();
        }}
      />
      <ClosingPaymentConfirmationDrawer
        visible={isPaymentDrawerVisible}
        onClose={() => {
          // Abandoning the drawer ends this attempt — the next payment must get
          // a fresh key, or the server would reject it as a duplicate.
          idempotencyKeyRef.current = null;
          setIsPaymentDrawerVisible(false);
        }}
        onConfirm={confirmPayment}
        uploading={uploading}
        processingPayments={processingPayments}
        selectedMembersData={selectedMembersData}
        memberPayments={memberPayments}
        closingGroupsMap={closingGroupsMap}
        currentAgent={currentAgent}
        paymentMethod={paymentMethod}
        transactionId={transactionId}
        totalPaymentAmount={totalPaymentAmount}
        paymentDate={paymentDate}
        setPaymentDate={setPaymentDate}
        paymentNote={paymentNote}
        setPaymentNote={setPaymentNote}
        uploadedFile={uploadedFile}
        setUploadedFile={setUploadedFile}
        colors={C}
      />
      <RasidGroupClosingDrawer
        open={openRasidDrawer}
        setOpen={setOpenRasidDrawer}
        agentId={agentId}
        programList={programList}
        agent={currentAgent}
      />
    </ConfigProvider>
  );
};

export default ClosingMemberPaymentPage;