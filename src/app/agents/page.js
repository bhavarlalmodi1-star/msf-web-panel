"use client";
import { trustHtml } from '@/utils/trust/trustStore';
import React, { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Card, Row, Col, Upload,
  Checkbox, Tag, Space, Switch, Typography, Avatar, Tooltip, Badge,
  Drawer, Descriptions, notification, App, Popover, Tabs
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined,
  UserOutlined, MailOutlined, PhoneOutlined, EnvironmentOutlined,
  IdcardOutlined, SaveOutlined, UploadOutlined, SignatureOutlined,
  FileOutlined, ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined,
  SearchOutlined, FilterOutlined, FileTextOutlined, PictureOutlined,
  ExclamationCircleOutlined, StopOutlined, WalletOutlined,
  DollarOutlined, HistoryOutlined, MinusCircleOutlined, PlusCircleOutlined,
  CalculatorOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { agentApi } from '@/utils/api';
import { collection, getDocs } from 'firebase/firestore';
import { auth, db } from '../../../lib/firbase-client';
import { useAuth } from '@/components/Base/AuthProvider';
import AgentStatsEditDrawer from './components/AgentStatsEditDrawer';

const { Title, Text } = Typography;
const { Option }      = Select;
const { Password }    = Input;

// ─── helpers ─────────────────────────────────────────────────────────────────
const formatDate = (ts) => {
  if (!ts) return "N/A";
  if (typeof ts.toDate === "function") return dayjs(ts.toDate()).format("DD/MM/YYYY HH:mm");
  if (ts._seconds) return dayjs(new Date(ts._seconds * 1000 + ts._nanoseconds / 1e6)).format("DD/MM/YYYY HH:mm");
  if (ts.seconds)  return dayjs(new Date(ts.seconds  * 1000 + ts.nanoseconds  / 1e6)).format("DD/MM/YYYY HH:mm");
  return dayjs(ts).isValid() ? dayjs(ts).format("DD/MM/YYYY HH:mm") : "Invalid Date";
};

const formatFileSize = (bytes) => {
  if (!bytes) return '0 Bytes';
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`;
};

// ─────────────────────────────────────────────────────────────────────────────
const AgentsManagementPage = () => {
  const [agents,           setAgents]           = useState([]);
  const [loading,          setLoading]          = useState(false);
  const [modalVisible,     setModalVisible]     = useState(false);
  const [editingAgent,     setEditingAgent]     = useState(null);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [selectedAgent,    setSelectedAgent]    = useState(null);
  const [commissionHistory, setCommissionHistory] = useState([]);
  const [commHistoryLoading, setCommHistoryLoading] = useState(false);
  const [walletModalVisible, setWalletModalVisible] = useState(false);
  const [walletAction, setWalletAction] = useState(''); // 'pay' | 'adjust'
  const [walletAmount, setWalletAmount] = useState('');
  const [walletDesc, setWalletDesc] = useState('');
  const [walletProcessing, setWalletProcessing] = useState(false);
  // Advance payment state
  const [advanceHistory,        setAdvanceHistory]        = useState([]);
  const [advanceHistoryLoading, setAdvanceHistoryLoading] = useState(false);
  const [advanceModalVisible,   setAdvanceModalVisible]   = useState(false);
  // Amount-correction drawer (superadmin) — fixes agent aggregates that have
  // drifted from their members.
  const [statsEditAgent,        setStatsEditAgent]        = useState(null);
  const [advanceAmount,         setAdvanceAmount]         = useState('');
  const [advanceDesc,           setAdvanceDesc]           = useState('');
  const [advanceNote,           setAdvanceNote]           = useState('');
  const [advancePaymentMode,    setAdvancePaymentMode]    = useState('cash');
  const [advanceUtrId,          setAdvanceUtrId]          = useState('');
  const [advanceProcessing,     setAdvanceProcessing]     = useState(false);
  const [form] = Form.useForm();
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50, total: 0, showSizeChanger: true, pageSizeOptions: ['10','20','50','100'] });
  const [filters,    setFilters]    = useState({ status: 'all', search: '' });
  const { message } = App.useApp();
  const { user } = useAuth();
const isSuperAdmin = (user) => user?.role === 'superadmin';
  const usersPermissions = user?.permissions || {};
  // Files
  const [photoFile,      setPhotoFile]      = useState(null);
  const [photoFileInfo,  setPhotoFileInfo]  = useState(null);
  const [photoPreview,   setPhotoPreview]   = useState(null);
  const [document1File,  setDocument1File]  = useState(null);
  const [document1FileInfo, setDocument1FileInfo] = useState(null);
  const [document2File,  setDocument2File]  = useState(null);
  const [document2FileInfo, setDocument2FileInfo] = useState(null);
  const [document3File,  setDocument3File]  = useState(null);
  const [document3FileInfo, setDocument3FileInfo] = useState(null);
  const [signatureFile,  setSignatureFile]  = useState(null);
  const [signatureFileInfo, setSignatureFileInfo] = useState(null);
  const [signaturePreview,  setSignaturePreview]  = useState(null);

  // Master data
  const [castes,    setCastes]    = useState([]);
  const [states,    setStates]    = useState([]);
  const [districts, setDistricts] = useState([]);
  const [cities,    setCities]    = useState([]);

  // ── Fetch agents ────────────────────────────────────────────────────────────
  const fetchAgents = async (page = 1, customFilters = {}, pageSize) => {
    try {
      setLoading(true);
      const f = { ...filters, ...customFilters };
      const limit = pageSize ?? pagination.pageSize;
      const result = await agentApi.getAgents(page, { status: f.status, search: f.search, limit });
      if (result.success) {
        setAgents(result.data || []);
        setPagination(prev => ({ ...prev, current: page, total: result.pagination?.total || result.data?.length || 0 }));
      } else {
        message.error(result.message || 'Failed to fetch agents');
      }
    } catch (e) {
      notification.error({ message: 'Error', description: e.message || 'Failed to fetch agents' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAgents(1); loadMasterData(); }, []);

  const loadMasterData = async () => {
    try {
      const [cSnap, stSnap, dSnap, ciSnap] = await Promise.all([
        getDocs(collection(db, 'castes')),
        getDocs(collection(db, 'states')),
        getDocs(collection(db, 'districts')),
        getDocs(collection(db, 'cities')),
      ]);
      const active = (snap) => snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.status === 'active');
      setCastes(active(cSnap)); setStates(active(stSnap)); setDistricts(active(dSnap)); setCities(active(ciSnap));
    } catch (e) { message.error('Failed to load master data'); }
  };

  const handleTableChange  = (pg) => { setPagination(prev => ({ ...prev, ...pg })); fetchAgents(pg.current, {}, pg.pageSize); };
  const handleSearch       = (v)  => { setFilters(p => ({...p, search: v})); fetchAgents(1, { search: v }); };
  const handleStatusFilter = (s)  => { setFilters(p => ({...p, status: s})); fetchAgents(1, { status: s }); };
  const handleRefresh      = ()   => { fetchAgents(pagination.current); message.success('Refreshed'); };

  const fileToBase64 = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.readAsDataURL(file);
    r.onload  = () => res({ name: file.name, type: file.type, size: file.size, data: r.result.split(',')[1] });
    r.onerror = rej;
  });

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      const files = {};
      if (photoFile)     files.photoFile     = await fileToBase64(photoFile);
      if (signatureFile) files.signatureFile = await fileToBase64(signatureFile);
      if (document1File) files.document1File = await fileToBase64(document1File);
      if (document2File) files.document2File = await fileToBase64(document2File);
      if (document3File) files.document3File = await fileToBase64(document3File);

      const agentData = { ...values, ...files, sendEmail: !!values.sendEmail, status: values.status || 'active' };

      if (!editingAgent) {
        if (!values.password) { message.error('Password is required'); setLoading(false); return; }
        if (values.password !== values.confirmPassword) { message.error('Passwords do not match'); setLoading(false); return; }
        agentData.password = values.password;
      } else {
        if (values.password) {
          if (values.password !== values.confirmPassword) { message.error('Passwords do not match'); setLoading(false); return; }
          agentData.updatePassword = values.password;
        }
      }

      const result = editingAgent
        ? await agentApi.updateAgent(editingAgent.id, agentData)
        : await agentApi.createAgent(agentData);

      if (result.success) {
        message.success(result.message || `Agent ${editingAgent ? 'updated' : 'created'} successfully!`);
        if (result.data?.tempPassword) {
          Modal.info({
            title: 'Agent Created Successfully',
            content: <div><p>Temporary password for <strong>{result.data.email}</strong>:</p><p className="bg-gray-100 p-2 rounded font-mono text-lg">{result.data.tempPassword}</p><p className="text-red-600 mt-2">Please save this password.</p></div>,
            okText: 'Got it', width: 500
          });
        }
        resetForm(); fetchAgents(pagination.current);
      } else {
        message.error(result.error || result.message || 'Failed to save agent');
      }
    } catch (e) {
      notification.error({ message: 'Error', description: e.message });
    } finally { setLoading(false); }
  };

  const handleEdit = (agent) => {
    setEditingAgent(agent);
    form.setFieldsValue({
      ...agent,
      sendEmail:         false,
      password:          '',
      confirmPassword:   '',
      // default true if field was never saved on the agent doc
      commissionJoinFeesEnabled: agent.commissionJoinFeesEnabled !== false,
      commissionClosingEnabled:  agent.commissionClosingEnabled  !== false,
    });
    setPhotoPreview(agent.photoUrl || null);
    setSignaturePreview(agent.signatureUrl || null);
    setModalVisible(true);
  };

  // ── Delete — two-step: soft then hard ──────────────────────────────────────
  const handleSoftDelete = (record) => {
    Modal.confirm({
      title:   'Delete Agent',
      icon:    <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />,
      content: (
        <div>
          <p>Move <b>{record.name}</b> to trash?</p>
          <p className="text-gray-500 text-sm mt-1">The agent will be deactivated and moved to trash. You can restore them later.</p>
        </div>
      ),
      okText:   'Move to Trash',
      okType:   'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          setLoading(true);
          // Calls DELETE /api/agents?id=xxx  (soft delete — no hard=true param)
          const result = await agentApi.deleteAgent(record.id, false);
          if (result.success) { message.success('Agent moved to trash'); fetchAgents(pagination.current); }
          else message.error(result.message || 'Failed to delete agent');
        } catch (e) { notification.error({ message: 'Error', description: e.message }); }
        finally { setLoading(false); }
      }
    });
  };

  const toggleStatus = async (id, currentStatus) => {
    try {
      const result = await agentApi.toggleStatus(id, currentStatus);
      if (result.success) { message.success(`Agent ${currentStatus === 'active' ? 'deactivated' : 'activated'}`); fetchAgents(pagination.current); }
      else message.error(result.message || 'Failed to update status');
    } catch (e) { notification.error({ message: 'Error', description: e.message }); }
  };

  const viewAgentDetails = async (agent) => {
    setSelectedAgent(agent);
    setViewModalVisible(true);
    setCommissionHistory([]);
    setCommHistoryLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/commission?agentId=${agent.id}&limit=20`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await res.json();
      if (result.success) setCommissionHistory(result.data || []);
    } catch (e) {
      console.error('Failed to load commission history:', e);
    } finally {
      setCommHistoryLoading(false);
    }
  };

  const loadAdvanceHistory = async (agent) => {
    setAdvanceHistoryLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/agents/advance?agentId=${agent.id}&limit=50`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await res.json();
      if (result.success) setAdvanceHistory(result.data || []);
    } catch (e) {
      console.error('Failed to load advance history:', e);
    } finally {
      setAdvanceHistoryLoading(false);
    }
  };

  const resetAdvanceModal = () => {
    setAdvanceModalVisible(false);
    setAdvanceAmount(''); setAdvanceDesc(''); setAdvanceNote('');
    setAdvancePaymentMode('cash'); setAdvanceUtrId('');
  };

  const handleAddAdvance = async () => {
    const amt = parseFloat(advanceAmount);
    if (!amt || amt <= 0) { message.error('Enter a valid amount'); return; }
    if (advancePaymentMode === 'online' && !advanceUtrId.trim()) {
      message.error('Please enter UTR / Transaction ID for online payment'); return;
    }
    setAdvanceProcessing(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/agents/advance', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId:     selectedAgent.id,
          amount:      amt,
          description: advanceDesc || 'Advance Payment',
          note:        advanceNote,
          paymentMode: advancePaymentMode,
          utrId:       advancePaymentMode === 'online' ? advanceUtrId.trim() : '',
        }),
      });
      const result = await res.json();
      if (result.success) {
        message.success(result.message);
        resetAdvanceModal();
        setSelectedAgent(prev => ({
          ...prev,
          advanceBalance:   (prev.advanceBalance || 0) + amt,
          totalAdvancePaid: (prev.totalAdvancePaid || 0) + amt,
        }));
        await loadAdvanceHistory(selectedAgent);
        fetchAgents(pagination.current);
      } else {
        message.error(result.message || 'Failed to record advance');
      }
    } catch (e) {
      message.error(e.message || 'Error recording advance');
    } finally {
      setAdvanceProcessing(false);
    }
  };

  const printAdvanceReport = () => {
    if (!selectedAgent || advanceHistory.length === 0) return;
    const win = window.open('', '_blank');
    const rows = advanceHistory.map((tx, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td class="nowrap">${tx.createdAt ? formatDate(tx.createdAt) : '-'}</td>
        <td class="l"><b>${tx.description || 'Advance Payment'}</b>${tx.note ? `<div class="sm">${tx.note}</div>` : ''}</td>
        <td class="c">${tx.paymentMode === 'online' ? 'Online' : 'Cash'}</td>
        <td class="mono">${tx.utrId || '-'}</td>
        <td class="amt green">+₹${(tx.amount || 0).toLocaleString('en-IN')}</td>
        <td class="amt">₹${(tx.balanceAfter || 0).toLocaleString('en-IN')}</td>
      </tr>`).join('');
    const total = advanceHistory.reduce((s, t) => s + (t.amount || 0), 0);
    win.document.write(`<!DOCTYPE html><html><head>
<meta charset="utf-8"><title>Advance Report — ${selectedAgent.name}</title>
<style>
  @page{size:A4;margin:10mm 8mm 18mm 8mm}
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#1f2937;padding:12px;font-size:13px}
  .header{text-align:center;margin-bottom:14px;border-bottom:2px solid ${trustHtml().pdfColorPrimary};padding-bottom:10px}
  .header h1{font-size:20px;color:${trustHtml().pdfColorPrimary}} .header .sub{font-size:11px;color:#6b7280;margin-top:4px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{background:${trustHtml().pdfColorPrimary};color:#fff;padding:6px 8px;text-align:left}
  td{padding:5px 8px;border-bottom:1px solid #e5e7eb}
  tr:nth-child(even) td{background:#f9fafb}
  .c{text-align:center}.amt{text-align:right}.green{color:#16a34a;font-weight:600}
  .sm{font-size:10px;color:#6b7280;margin-top:2px}.mono{font-family:monospace;font-size:11px}
  .summary{margin-top:10px;text-align:right;font-size:12px;color:#374151}
</style></head><body>
<div class="header"><h1>Advance Payment Report</h1>
<div class="sub">Agent: ${selectedAgent.name} | ${new Date().toLocaleDateString('en-IN')}</div></div>
<table><thead><tr><th style="width:22px">#</th><th style="width:120px">Date</th><th>Description</th><th style="width:60px">Mode</th><th style="width:130px">UTR / Cash ID</th><th style="width:90px">Amount</th><th style="width:90px">Balance</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="summary">Total Advance Deposited: <b>₹${total.toLocaleString('en-IN')}</b></div>
<script>setTimeout(function(){window.print()},400)</script></body></html>`);
    win.document.close();
  };

  const printCommissionReport = () => {
    if (!selectedAgent || commissionHistory.length === 0) return
    const win = window.open('', '_blank')
    const rows = commissionHistory.map((tx, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td class="nowrap">${tx.createdAt ? formatDate(tx.createdAt) : '-'}</td>
        <td class="c">${tx.type === 'credit' ? 'CREDIT' : tx.type === 'reversal' ? 'REVERSAL' : 'DEBIT'}</td>
        <td class="l">
          <b>${tx.memberName || tx.description || tx.source}</b>
          ${tx.memberFatherName ? `<div class="sm">${tx.memberFatherName}</div>` : ''}
          ${tx.memberRegNo ? `<div class="sm mono">#${tx.memberRegNo}</div>` : ''}
        </td>
        <td class="c">${tx.commissionRate ? (tx.commissionRate * 100) + '%' : '-'}</td>
        <td class="c">${tx.source === 'joinFees' ? 'Join Fee' : tx.source === 'closingPayment' ? 'Closing' : tx.source === 'withdrawal' ? 'Withdrawal' : tx.source}</td>
        <td class="amt">${(() => { const b = tx.baseAmount || (tx.commissionRate > 0 ? Math.round(tx.amount / tx.commissionRate) : null); return b != null && (tx.source === 'joinFees' || tx.source === 'closingPayment') ? '₹' + b.toLocaleString('en-IN') : '-'; })()}</td>
        <td class="amt ${tx.type === 'credit' ? 'green' : 'red'}">${tx.type === 'credit' ? '+' : '-'}₹${(tx.amount || 0).toLocaleString('en-IN')}</td>
        <td class="amt ${(tx.balanceAfter || 0) < 0 ? 'red' : ''}">${(tx.balanceAfter || 0) < 0 ? '-' : ''}₹${Math.abs(tx.balanceAfter || 0).toLocaleString('en-IN')}</td>
      </tr>`).join('')

    const totalCredits = commissionHistory.filter(t => t.type === 'credit').reduce((s, t) => s + (t.amount || 0), 0)
    const totalDebits = commissionHistory.filter(t => t.type !== 'credit').reduce((s, t) => s + (t.amount || 0), 0)

    win.document.write(`<!DOCTYPE html><html lang="hi"><head>
<meta charset="utf-8"><title>Commission Report — ${selectedAgent.name}</title>
<style>
  @page { size: A4 landscape; margin: 8mm 6mm 18mm 6mm; @bottom-center { content: "Page " counter(page); font-size: 10px; color: #6b7280; } }
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#1f2937;padding:12px;font-size:14px}
  .header{text-align:center;margin-bottom:14px;border-bottom:2.5px solid ${trustHtml().pdfColorPrimary};padding-bottom:12px}
  .header h1{font-size:24px;color:${trustHtml().pdfColorPrimary};margin-bottom:6px;letter-spacing:.5px}
  .header .sub{font-size:12px;color:#6b7280}
  .agent-info{display:flex;justify-content:space-between;background:#f8fafc;padding:10px 14px;border-radius:5px;margin-bottom:12px;border:1px solid #d1d5db;font-size:13px}
  .agent-info div{flex:1}
  .agent-info .label{color:#6b7280;font-size:10px;margin-bottom:2px}
  .agent-info .val{font-weight:700;color:${trustHtml().pdfColorPrimary};font-size:14px}
  .summary-cards{display:flex;gap:10px;margin-bottom:12px}
  .scard{flex:1;padding:10px 8px;border-radius:5px;text-align:center;color:#fff}
  .scard-bal{background:linear-gradient(135deg,${trustHtml().pdfColorPrimary},#2a5a8a)}
  .scard-credit{background:linear-gradient(135deg,#047857,#059669)}
  .scard-debit{background:linear-gradient(135deg,#b91c1c,#dc2626)}
  .scard .val{font-size:18px;font-weight:700}
  .scard .lbl{font-size:10px;opacity:.9;letter-spacing:.3px}
  table{width:100%;border-collapse:collapse;font-size:12px;border:2px solid #cbd5e1}
  thead th{background:${trustHtml().pdfColorPrimary};color:#fff;padding:7px 6px;border:0.5px solid #2a4a6a;text-align:center;font-size:11px;font-weight:700;white-space:nowrap;letter-spacing:.3px}
  tbody td{padding:6px 5px;border:0.5px solid #e2e8f0;vertical-align:middle}
  tbody tr:nth-child(even){background:#f8fafc}
  td.c{text-align:center}
  td.l{text-align:left;padding-left:8px;word-break:break-word}
  td.amt{text-align:right;font-weight:700;padding-right:8px;font-size:13px}
  td.green{color:#059669}
  td.red{color:#dc2626}
  td.nowrap{white-space:nowrap}
  .sm{font-size:10px;color:#6b7280;margin-top:1px}
  .mono{font-family:'Courier New',monospace;letter-spacing:.3px}
  .footer{text-align:center;margin-top:12px;padding-top:8px;border-top:1.5px solid #d1d5db;font-size:10px;color:#9ca3af}
</style></head><body>
<div class="header">
  <h1>Agent Commission Report</h1>
  <div class="sub">${trustHtml().name}</div>
</div>
<div class="agent-info">
  <div><div class="label">Agent Name</div><div class="val">${selectedAgent.name}</div></div>
  <div><div class="label">Phone</div><div class="val">${selectedAgent.phone1 || ''}</div></div>
  <div><div class="label">Email</div><div class="val">${selectedAgent.email || ''}</div></div>
  <div><div class="label">Report Date</div><div class="val">${new Date().toLocaleDateString('en-IN', { year:'numeric', month:'long', day:'numeric' })}</div></div>
</div>
<div class="summary-cards">
  <div class="scard scard-bal"><div class="val">₹${(selectedAgent.walletBalance || 0).toLocaleString('en-IN')}</div><div class="lbl">Wallet Balance</div></div>
  <div class="scard scard-credit"><div class="val">₹${totalCredits.toLocaleString('en-IN')}</div><div class="lbl">Total Commission Earned</div></div>
  <div class="scard scard-debit"><div class="val">₹${totalDebits.toLocaleString('en-IN')}</div><div class="lbl">Total Withdrawn</div></div>
</div>
<table>
  <thead><tr>
    <th style="width:22px">#</th>
    <th style="width:100px">Date & Time</th>
    <th style="width:55px">Type</th>
    <th>Member / Father / Reg No</th>
    <th style="width:55px">Rate</th>
    <th style="width:75px">Source</th>
    <th style="width:78px">Join Fees</th>
    <th style="width:78px">Commission</th>
    <th style="width:72px">Balance</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="footer">Generated by ${trustHtml().shortName} • ${new Date().toLocaleString('en-IN')} • This is a computer-generated report</div>
<script>setTimeout(function(){window.print()},400)</script>
</body></html>`)
    win.document.close()
  }

  const handleWalletAction = async () => {
    if (!walletAmount || parseFloat(walletAmount) <= 0) {
      message.error('Please enter a valid amount');
      return;
    }
    try {
      setWalletProcessing(true);
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/commission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          action: 'pay-agent',
          agentId: selectedAgent.id,
          amount: parseFloat(walletAmount),
          description: walletDesc || `Payment to Agent - ₹${walletAmount}`,
        })
      });
      const result = await res.json();
      if (result.success) {
        message.success(result.message);
        setWalletModalVisible(false);
        setWalletAmount('');
        setWalletDesc('');
        fetchAgents(pagination.current);
        viewAgentDetails(selectedAgent);
      } else {
        message.error(result.message || 'Failed');
      }
    } catch (e) {
      message.error(e.message);
    } finally {
      setWalletProcessing(false);
    }
  };

  const resetForm = () => {
    form.resetFields(); setEditingAgent(null); setModalVisible(false);
    setPhotoFile(null); setPhotoFileInfo(null); setPhotoPreview(null);
    setDocument1File(null); setDocument1FileInfo(null);
    setDocument2File(null); setDocument2FileInfo(null);
    setDocument3File(null); setDocument3FileInfo(null);
    setSignatureFile(null); setSignatureFileInfo(null); setSignaturePreview(null);
  };

  const handleFileChange = (file, fileType) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const info = { name: file.name, size: file.size, type: file.type };
      if (fileType === 'photo')      { setPhotoPreview(e.target.result); setPhotoFile(file); setPhotoFileInfo(info); }
      if (fileType === 'signature')  { setSignaturePreview(e.target.result); setSignatureFile(file); setSignatureFileInfo(info); }
      if (fileType === 'document1')  { setDocument1File(file); setDocument1FileInfo(info); }
      if (fileType === 'document2')  { setDocument2File(file); setDocument2FileInfo(info); }
      if (fileType === 'document3')  { setDocument3File(file); setDocument3FileInfo(info); }
    };
    reader.readAsDataURL(file);
    return true;
  };

  const beforeUpload = (file, fileType) => {
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') { message.error('Image or PDF only!'); return false; }
    if (file.size / 1024 / 1024 > 5) { message.error('Max 5MB!'); return false; }
    return handleFileChange(file, fileType);
  };

  // ── Columns ─────────────────────────────────────────────────────────────────
  const columns = [
    {
      title: 'AGENT', dataIndex: 'name', key: 'name', width: 250, fixed: 'left',
      render: (text, r) => (
        <div className="flex items-center gap-3">
          {r.photoUrl ? <Avatar size={45} src={r.photoUrl} className="border border-gray-300" /> : <Avatar size={45} icon={<UserOutlined />} className="bg-blue-100 text-blue-600 border border-blue-300" />}
          <div>
            <div className="font-semibold text-gray-900">{text}</div>
            <div className="text-xs text-gray-500">Father: {r.fatherName || 'N/A'}</div>
            <div className="text-xs text-gray-500">{r.email}</div>
          </div>
        </div>
      ),
    },
    {
      title: 'CONTACT', key: 'contact', width: 180,
      render: (_, r) => (
        <div>
          <div className="flex items-center gap-2 mb-1"><PhoneOutlined className="text-blue-600 text-xs" /><span className="text-sm font-medium">{r.phone1}</span></div>
          {r.phone2 && <div className="flex items-center gap-2 mb-1"><PhoneOutlined className="text-gray-400 text-xs" /><span className="text-xs text-gray-600">{r.phone2}</span></div>}
          <div className="flex items-center gap-2"><MailOutlined className="text-gray-400 text-xs" /><span className="text-xs text-gray-600 truncate">{r.email}</span></div>
        </div>
      ),
    },
    {
      title: 'LOCATION', key: 'address', width: 200,
      render: (_, r) => (
        <div className="text-sm flex items-start gap-1">
          <EnvironmentOutlined className="text-green-600 mt-0.5 text-xs" />
          <div>
            <div className="text-gray-700">{r.city || 'N/A'}, {r.district || 'N/A'}</div>
            <div className="text-xs text-gray-500">{r.state || 'N/A'}</div>
            <div className="text-xs text-gray-500">PIN: {r.pincode || 'N/A'}</div>
          </div>
        </div>
      ),
    },
    {
      title: 'AADHAAR', dataIndex: 'aadharNo', key: 'aadharNo', width: 150,
      render: (text) => <div className="flex items-center gap-2"><IdcardOutlined className="text-purple-600" /><span className="font-mono text-sm">{text || 'N/A'}</span></div>,
    },
    {
      title: 'STATUS', dataIndex: 'status', key: 'status', width: 120,
      render: (status) => (
        <div className="flex items-center gap-2">
          {status === 'active' ? <CheckCircleOutlined className="text-green-600" /> : <CloseCircleOutlined className="text-red-600" />}
          <Tag color={status === 'active' ? 'success' : 'error'}>{status === 'active' ? 'Active' : 'Inactive'}</Tag>
        </div>
      ),
    },
    {
      title: 'WALLET', key: 'wallet', width: 200,
      render: (_, r) => (
        <div className="flex items-center gap-2">
          <WalletOutlined className="text-blue-600" />
          <div>
            <div className="font-bold text-sm">₹{(r.walletBalance || 0).toLocaleString('en-IN')}</div>
            <div className="text-xs text-gray-500">Earned: ₹{(r.totalCommissionEarned || 0).toLocaleString('en-IN')}</div>
            {(r.advanceBalance || 0) > 0 && (
              <div className="text-xs text-emerald-600 font-medium mt-0.5">
                Advance: ₹{(r.advanceBalance || 0).toLocaleString('en-IN')}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      title: 'CREATED', key: 'created_at', width: 130,
      render: (_, r) => <div className="text-xs text-gray-500">{formatDate(r.created_at)}</div>,
    },
    {
      title: 'ACTIONS', key: 'actions', width: 250, fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          {
            isSuperAdmin(user) || usersPermissions?.actions?.view ? (
              <Tooltip title="View Details">
                <Button type="text" icon={<EyeOutlined className="text-blue-600" />} size="small" onClick={() => viewAgentDetails(record)} />
              </Tooltip>
            ) : null
          }
    {
            isSuperAdmin(user) || usersPermissions?.actions?.edit ? (
              <Tooltip title="Edit Agent">
                <Button type="text" icon={<EditOutlined className="text-green-600" />} size="small" onClick={() => handleEdit(record)} />
              </Tooltip>
            ) : null
    }

    {
            isSuperAdmin(user) || usersPermissions?.actions?.edit ? (
              <Tooltip title={record.status === 'active' ? 'Deactivate' : 'Activate'}>
                <Switch
                  checked={record.status === 'active'}
              onChange={() => toggleStatus(record.id, record.status)}
              size="small" checkedChildren="ON" unCheckedChildren="OFF"
            />
          </Tooltip>
            ) : null
    }
    {
            // Rewrites agent aggregates outside the payment trail — superadmin only,
            // same bar as the member-level amount editor.
            isSuperAdmin(user) ? (
              <Tooltip title="Correct Join Fees / Closing amounts">
                <Button
                  type="text" size="small"
                  icon={<CalculatorOutlined className="text-orange-600" />}
                  onClick={() => setStatsEditAgent(record)}
                />
              </Tooltip>
            ) : null
    }
    {
            isSuperAdmin(user) || usersPermissions?.actions?.delete ? (  <Tooltip title="Move to Trash">
            <Button
              type="text" danger size="small"
              icon={<DeleteOutlined />}
              onClick={() => handleSoftDelete(record)}
            />
          </Tooltip>) : null
    }
          {/* ── Soft-delete button (Move to Trash) ── */}
        
        </Space>
      ),
    },
  ];

  return (
    <div className="p-2 bg-gray-50 min-h-screen">
      <div className="max-w-400 mx-auto">
        {/* Header */}
        <Card className="mb-2! border-0 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <Title level={3} className="text-gray-800 mb-2 flex items-center gap-3">
              <div className="bg-blue-600 text-white p-2 rounded-lg"><UserOutlined className="text-xl" /></div>
              <div>
                Agent Management
                <Text className="text-gray-600 text-sm block font-normal mt-1">Manage and monitor all agent accounts</Text>
              </div>
            </Title>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={loading}>Refresh</Button>
              {
                isSuperAdmin(user) || usersPermissions?.actions?.add_agent ? (
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)} className="bg-blue-600 border-0 shadow-md">Add New Agent</Button>
                ) : null
              }
            </Space>
          </div>

          <div className="mt-6 flex flex-col md:flex-row gap-3">
            <Input
              placeholder="Search agents by name, email, phone, aadhar, city..."
              prefix={<SearchOutlined />} value={filters.search}
              onChange={e => setFilters(p => ({...p, search: e.target.value}))}
              onPressEnter={() => handleSearch(filters.search)}
              allowClear className="md:w-96" size="large"
            />
            <Space>
              <Select placeholder="Filter by status" value={filters.status} onChange={handleStatusFilter} style={{ width: 150 }} size="large">
                <Option value="all">All Status</Option>
                <Option value="active">Active</Option>
                <Option value="inactive">Inactive</Option>
              </Select>
              <Button icon={<FilterOutlined />} onClick={() => handleSearch(filters.search)} size="large">Apply</Button>
            </Space>
          </div>
        </Card>

        {/* Table */}
        <Card className="shadow-sm rounded-lg border-0">
          <div className="mb-4 flex justify-between items-center">
            <Title level={5} className="text-gray-700">All Agents ({pagination.total})</Title>
          </div>
          <Table columns={columns} dataSource={agents} rowKey="id" loading={loading}
            pagination={pagination} onChange={handleTableChange}
            scroll={{ x: 1500 }} rowClassName="hover:bg-blue-50 transition-colors duration-200" />
        </Card>

        {/* Add/Edit Drawer */}
        <Drawer
          title={
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-lg">{editingAgent ? <EditOutlined className="text-blue-600 text-xl" /> : <PlusOutlined className="text-blue-600 text-xl" />}</div>
              <div>
                <div className="font-semibold text-lg">{editingAgent ? 'Edit Agent' : 'Add New Agent'}</div>
                <div className="text-xs text-gray-500">{editingAgent ? 'Update agent information' : 'Create a new agent account'}</div>
              </div>
            </div>
          }
          open={modalVisible} onClose={resetForm} width={800} footer={null}
        >
          <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ status: 'active' }}>
            {/* Photo + Basic */}
            <Card className="bg-gray-50 border-gray-200 mb-4">
              <Row gutter={16} align="middle">
                <Col span={6}>
                  <div className="text-center">
                    <div className="mb-2 text-sm font-medium text-gray-600">Agent Photo</div>
                    {photoPreview ? (
                      <div>
                        <Avatar size={100} src={photoPreview} className="mb-2 border-4 border-white shadow mx-auto" />
                        <Text className="text-xs text-gray-500 block mb-1">{photoFileInfo?.name || 'Photo uploaded'}</Text>
                        <Upload beforeUpload={f => beforeUpload(f, 'photo')} showUploadList={false} accept="image/*">
                          <Button size="small" icon={<UploadOutlined />}>Change</Button>
                        </Upload>
                      </div>
                    ) : (
                      <Upload beforeUpload={f => beforeUpload(f, 'photo')} showUploadList={false} accept="image/*">
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 cursor-pointer hover:border-blue-500 hover:bg-blue-50">
                          <UserOutlined className="text-3xl text-gray-400 mb-2" />
                          <div className="text-sm text-gray-600">Upload Photo</div>
                          <div className="text-xs text-gray-500">Max 5MB</div>
                        </div>
                      </Upload>
                    )}
                  </div>
                </Col>
                <Col span={18}>
                  <Row gutter={16}>
                    <Col span={12}><Form.Item name="name" label="Full Name" rules={[{ required: true }]}><Input placeholder="Full name" size="large" /></Form.Item></Col>
                    <Col span={12}><Form.Item name="fatherName" label="Father's Name" rules={[{ required: true }]}><Input placeholder="Father's name" size="large" /></Form.Item></Col>
                  </Row>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item name="caste" label="Caste" rules={[{ required: true }]}>
                        <Select placeholder="Select caste" size="large" showSearch>
                          {castes.map(c => <Option key={c.id} value={c.name}>{c.name}</Option>)}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col span={12}><Form.Item name="aadharNo" label="Aadhar No." rules={[{ required: true }, { pattern: /^\d{12}$/, message: 'Must be 12 digits' }]}><Input placeholder="12-digit Aadhar" maxLength={12} size="large" /></Form.Item></Col>
                  </Row>
                </Col>
              </Row>
            </Card>

            {/* Contact */}
            <Card title="Contact Information" className="border-gray-200 mb-4">
              <Row gutter={16}>
                <Col span={8}><Form.Item name="phone1" label="Primary Phone" rules={[{ required: true }, { pattern: /^\d{10}$/ }]}><Input placeholder="10-digit" size="large" /></Form.Item></Col>
                <Col span={8}><Form.Item name="phone2" label="Secondary Phone" rules={[{ pattern: /^\d{10}$/ }]}><Input placeholder="Optional" size="large" /></Form.Item></Col>
                <Col span={8}>
                  <Form.Item
                    name="email"
                    label="Email"
                    rules={[{ required: true }, { type: 'email' }]}
                    extra={editingAgent ? (
                      <span style={{ color: '#d97706', fontSize: 11 }}>
                        ⚠️ Changing email updates Auth. Agent must log in again with the new email.
                      </span>
                    ) : null}
                  >
                    <Input placeholder="Email" size="large" />
                  </Form.Item>
                </Col>
              </Row>
            </Card>

            {/* Security */}
            <Card title="Security" className="border-gray-200 mb-4">
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="password" label={editingAgent ? "New Password (Optional)" : "Password"}
                    rules={editingAgent ? [] : [{ required: true }, { min: 8 }]}>
                    <Password placeholder={editingAgent ? "Leave empty to keep current" : "Min 8 characters"} size="large" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="confirmPassword" label="Confirm Password" dependencies={['password']}
                    rules={[({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || !getFieldValue('password') || getFieldValue('password') === value) return Promise.resolve();
                        return Promise.reject(new Error('Passwords do not match'));
                      }
                    })]}>
                    <Password placeholder="Confirm password" size="large" />
                  </Form.Item>
                </Col>
              </Row>
            </Card>

            {/* Address */}
            <Card title="Address" className="border-gray-200 mb-4">
              <Row gutter={16}>
                <Col span={8}><Form.Item name="state" label="State" rules={[{ required: true }]}><Select placeholder="State" showSearch size="large">{states.map(s => <Option key={s.id} value={s.name}>{s.name}</Option>)}</Select></Form.Item></Col>
                <Col span={8}><Form.Item name="district" label="District" rules={[{ required: true }]}><Select placeholder="District" showSearch size="large">{districts.map(d => <Option key={d.id} value={d.name}>{d.name}</Option>)}</Select></Form.Item></Col>
                <Col span={8}><Form.Item name="city" label="City" rules={[{ required: true }]}><Select placeholder="City" showSearch size="large">{cities.map(c => <Option key={c.id} value={c.name}>{c.name}</Option>)}</Select></Form.Item></Col>
              </Row>
              <Row gutter={16}>
                <Col span={12}><Form.Item name="village" label="Village/Town" rules={[{ required: true }]}><Input placeholder="Village" size="large" /></Form.Item></Col>
                <Col span={12}><Form.Item name="pincode" label="Pincode" rules={[{ required: true }, { pattern: /^\d{6}$/ }]}><Input placeholder="6-digit" maxLength={6} size="large" /></Form.Item></Col>
              </Row>
            </Card>

            {/* Documents */}
            <Card title="Documents" className="border-gray-200 mb-4">
              <Row gutter={16}>
                {[
                  { key: 'document1', label: 'Document 1', file: document1File, info: document1FileInfo },
                  { key: 'document2', label: 'Document 2', file: document2File, info: document2FileInfo },
                  { key: 'document3', label: 'Document 3', file: document3File, info: document3FileInfo },
                ].map(doc => (
                  <Col span={8} key={doc.key}>
                    <div className="text-center">
                      <div className="mb-2 text-sm font-medium text-gray-600">{doc.label}</div>
                      {doc.file ? (
                        <div className="border border-green-200 bg-green-50 rounded p-3">
                          {doc.info?.type?.includes('image') ? <PictureOutlined className="text-green-600 text-lg" /> : <FileTextOutlined className="text-green-600 text-lg" />}
                          <Text className="text-xs block truncate mt-1">{doc.info?.name}</Text>
                          <Text className="text-xs text-gray-500">{formatFileSize(doc.info?.size)}</Text>
                          <Upload beforeUpload={f => beforeUpload(f, doc.key)} showUploadList={false} accept=".pdf,image/*">
                            <Button size="small" type="link">Change</Button>
                          </Upload>
                        </div>
                      ) : (
                        <Upload beforeUpload={f => beforeUpload(f, doc.key)} showUploadList={false} accept=".pdf,image/*">
                          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 cursor-pointer hover:border-blue-500 hover:bg-blue-50">
                            <FileOutlined className="text-2xl text-gray-400 mb-2" />
                            <div className="text-sm text-gray-600">Upload</div>
                            <div className="text-xs text-gray-500">PDF or Image</div>
                          </div>
                        </Upload>
                      )}
                    </div>
                  </Col>
                ))}
              </Row>
              <div className="mt-6">
                <div className="mb-2 text-sm font-medium text-gray-600">Signature</div>
                {signaturePreview ? (
                  <div className="border border-green-200 bg-green-50 rounded p-4 flex items-center gap-4">
                    <img src={signaturePreview} alt="Signature" className="w-48 h-24 object-contain border rounded bg-white p-2" />
                    <div>
                      <Text className="text-xs block mb-1">{signatureFileInfo?.name || 'Signature uploaded'}</Text>
                      <Text className="text-xs text-gray-500 block mb-3">{formatFileSize(signatureFileInfo?.size)}</Text>
                      <Upload beforeUpload={f => beforeUpload(f, 'signature')} showUploadList={false} accept="image/*">
                        <Button icon={<UploadOutlined />}>Change Signature</Button>
                      </Upload>
                    </div>
                  </div>
                ) : (
                  <Upload beforeUpload={f => beforeUpload(f, 'signature')} showUploadList={false} accept="image/*">
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 cursor-pointer hover:border-blue-500 hover:bg-blue-50 text-center">
                      <SignatureOutlined className="text-3xl text-gray-400 mb-2" />
                      <div className="text-sm text-gray-600">Upload Signature</div>
                      <div className="text-xs text-gray-500">Max 5MB (JPG, PNG)</div>
                    </div>
                  </Upload>
                )}
              </div>
            </Card>

            {/* Settings & Status row */}
            <Card
              className="mb-4 border-gray-100"
              bodyStyle={{ padding: '16px 20px' }}
              title={
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                  Settings &amp; Preferences
                </span>
              }
            >
              <Row gutter={[12, 12]}>

                {/* Send Welcome Email */}
                <Col xs={12} sm={12} lg={6}>
                  <div className="p-3 rounded-xl border-2 border-blue-100 bg-blue-50 h-full">
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                        <MailOutlined className="text-blue-600 text-sm" />
                      </div>
                      <Form.Item name="sendEmail" valuePropName="checked" className="mb-0">
                        <Switch size="small" />
                      </Form.Item>
                    </div>
                    <div className="text-sm font-semibold text-gray-800 leading-tight">Welcome Email</div>
                    <div className="text-xs text-gray-500 mt-0.5 leading-tight">Send login credentials to agent</div>
                  </div>
                </Col>

                {/* Join Fees Commission */}
                <Col xs={12} sm={12} lg={6}>
                  <div className="p-3 rounded-xl border-2 border-amber-100 bg-amber-50 h-full">
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                        <DollarOutlined className="text-amber-600 text-sm" />
                      </div>
                      <Form.Item name="commissionJoinFeesEnabled" valuePropName="checked" className="mb-0" initialValue={true}>
                        <Switch size="small" />
                      </Form.Item>
                    </div>
                    <div className="text-sm font-semibold text-gray-800 leading-tight">Join Commission</div>
                    <div className="text-xs text-gray-500 mt-0.5 leading-tight">Earns % on join fee payments</div>
                  </div>
                </Col>

                {/* Closing Commission */}
                <Col xs={12} sm={12} lg={6}>
                  <div className="p-3 rounded-xl border-2 border-emerald-100 bg-emerald-50 h-full">
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <DollarOutlined className="text-emerald-600 text-sm" />
                      </div>
                      <Form.Item name="commissionClosingEnabled" valuePropName="checked" className="mb-0" initialValue={true}>
                        <Switch size="small" />
                      </Form.Item>
                    </div>
                    <div className="text-sm font-semibold text-gray-800 leading-tight">Closing Commission</div>
                    <div className="text-xs text-gray-500 mt-0.5 leading-tight">Earns % on closing payments</div>
                  </div>
                </Col>

                {/* Agent Status */}
                <Col xs={12} sm={12} lg={6}>
                  <div className="p-3 rounded-xl border-2 border-gray-100 bg-gray-50 h-full">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center">
                        <UserOutlined className="text-gray-600 text-sm" />
                      </div>
                      <div className="text-sm font-semibold text-gray-800">Status</div>
                    </div>
                    <Form.Item name="status" className="mb-0">
                      <Select size="small" className="w-full">
                        <Option value="active">
                          <span className="flex items-center gap-1">
                            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                            Active
                          </span>
                        </Option>
                        <Option value="inactive">
                          <span className="flex items-center gap-1">
                            <span className="inline-block w-2 h-2 rounded-full bg-red-400 shrink-0" />
                            Inactive
                          </span>
                        </Option>
                      </Select>
                    </Form.Item>
                  </div>
                </Col>

              </Row>
            </Card>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button onClick={resetForm} disabled={loading} size="large">Cancel</Button>
              <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />} size="large" className="bg-blue-600">
                {editingAgent ? 'Update Agent' : 'Create Agent'}
              </Button>
            </div>
          </Form>
        </Drawer>

        {/* View Drawer */}
        <Drawer
          title={<div className="flex items-center gap-3"><div className="bg-blue-100 p-2 rounded-lg"><EyeOutlined className="text-blue-600 text-xl" /></div><div><div className="font-semibold text-lg">Agent Details</div><div className="text-xs text-gray-500">Complete agent information</div></div></div>}
          open={viewModalVisible} onClose={() => setViewModalVisible(false)} size={800} footer={null}
        >
          {selectedAgent && (
            <Tabs
              defaultActiveKey="details"
              className="agent-detail-tabs"
              items={[
                {
                  key: 'details',
                  label: <span><UserOutlined className="mr-1.5" />Details</span>,
                  children: (
                    <div className="space-y-4">
                      <Card className="bg-gradient-to-r from-blue-50 to-gray-50 border-blue-200">
                        <div className="flex items-center gap-4">
                          {selectedAgent.photoUrl ? <Avatar size={90} src={selectedAgent.photoUrl} className="border-4 border-white shadow" /> : <Avatar size={90} icon={<UserOutlined />} className="border-4 border-white shadow bg-blue-100 text-blue-600" />}
                          <div className="flex-1">
                            <Title level={4} className="mb-1">{selectedAgent.name}</Title>
                            <Text type="secondary">Father: {selectedAgent.fatherName}</Text>
                            <div className="mt-3 flex gap-2">
                              <Badge status={selectedAgent.status === 'active' ? 'success' : 'error'} text={selectedAgent.status === 'active' ? 'Active' : 'Inactive'} />
                              <Tag color="blue">Caste: {selectedAgent.caste || 'N/A'}</Tag>
                            </div>
                          </div>
                        </div>
                      </Card>

                      <Descriptions title="Contact" bordered column={1} size="small">
                        <Descriptions.Item label="Primary Phone"><PhoneOutlined className="mr-2 text-blue-500" />{selectedAgent.phone1}</Descriptions.Item>
                        <Descriptions.Item label="Secondary Phone"><PhoneOutlined className="mr-2 text-gray-400" />{selectedAgent.phone2 || 'N/A'}</Descriptions.Item>
                        <Descriptions.Item label="Email"><MailOutlined className="mr-2 text-red-500" />{selectedAgent.email}</Descriptions.Item>
                      </Descriptions>

                      <Descriptions title="Address" bordered column={1} size="small">
                        <Descriptions.Item label="State">{selectedAgent.state || 'N/A'}</Descriptions.Item>
                        <Descriptions.Item label="District">{selectedAgent.district || 'N/A'}</Descriptions.Item>
                        <Descriptions.Item label="City">{selectedAgent.city || 'N/A'}</Descriptions.Item>
                        <Descriptions.Item label="Village">{selectedAgent.village || 'N/A'}</Descriptions.Item>
                        <Descriptions.Item label="Pincode">{selectedAgent.pincode || 'N/A'}</Descriptions.Item>
                      </Descriptions>

                      <Descriptions title="Identification" bordered column={1} size="small">
                        <Descriptions.Item label="Aadhaar"><IdcardOutlined className="mr-2 text-purple-500" />{selectedAgent.aadharNo || 'N/A'}</Descriptions.Item>
                        <Descriptions.Item label="Created On">{formatDate(selectedAgent.created_at)}</Descriptions.Item>
                        {selectedAgent.updated_at && <Descriptions.Item label="Last Updated">{formatDate(selectedAgent.updated_at)}</Descriptions.Item>}
                      </Descriptions>

                      {selectedAgent.signatureUrl && (
                        <Card title="Signature" className="border-gray-200">
                          <img src={selectedAgent.signatureUrl} alt="Signature" className="w-64 h-32 object-contain border rounded bg-gray-50 mx-auto" />
                        </Card>
                      )}

                      {(selectedAgent.document1Url || selectedAgent.document2Url || selectedAgent.document3Url) && (
                        <Card title="Documents" className="border-gray-200">
                          <div className="grid grid-cols-3 gap-3">
                            {[selectedAgent.document1Url, selectedAgent.document2Url, selectedAgent.document3Url].filter(Boolean).map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                className="text-center p-3 border rounded hover:border-blue-500 hover:bg-blue-50 transition-colors">
                                <FileOutlined className="text-2xl mb-2 block text-blue-600" />
                                <div className="text-sm font-medium">Document {i + 1}</div>
                              </a>
                            ))}
                          </div>
                        </Card>
                      )}
                    </div>
                  )
                },
                {
                  key: 'commission',
                  label: <span><WalletOutlined className="mr-1.5" />Commission</span>,
                  children: (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="bg-blue-100 p-2 rounded-lg"><WalletOutlined className="text-blue-600 text-lg" /></div>
                          <div><div className="font-semibold text-base">Commission Wallet</div><div className="text-xs text-gray-500">Agent earnings & payout history</div></div>
                        </div>
                        <Space>
                          <Button size="small" icon={<FileTextOutlined />}
                            onClick={printCommissionReport} disabled={commissionHistory.length === 0}>
                            Download PDF
                          </Button>
                          <Button type="primary" size="small" icon={<DollarOutlined />}
                            onClick={() => { setWalletAction('pay'); setWalletModalVisible(true); }}>
                            Pay Agent
                          </Button>
                        </Space>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div className="relative p-4 bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl border border-blue-200">
                          <div className="text-3xl font-bold text-blue-700">₹{(selectedAgent.walletBalance || 0).toLocaleString('en-IN')}</div>
                          <div className="text-xs text-blue-600/70 font-medium mt-1">Wallet Balance</div>
                          <WalletOutlined className="absolute right-3 bottom-3 text-blue-200 text-2xl" />
                        </div>
                        <div className="relative p-4 bg-gradient-to-br from-green-50 to-green-100/50 rounded-xl border border-green-200">
                          <div className="text-3xl font-bold text-green-700">₹{(selectedAgent.totalCommissionEarned || 0).toLocaleString('en-IN')}</div>
                          <div className="text-xs text-green-600/70 font-medium mt-1">Total Commission Earned</div>
                          <DollarOutlined className="absolute right-3 bottom-3 text-green-200 text-2xl" />
                        </div>
                        <div className="relative p-4 bg-gradient-to-br from-red-50 to-red-100/50 rounded-xl border border-red-200">
                          <div className="text-3xl font-bold text-red-700">₹{(selectedAgent.totalCommissionWithdrawn || 0).toLocaleString('en-IN')}</div>
                          <div className="text-xs text-red-600/70 font-medium mt-1">Total Withdrawn</div>
                          <MinusCircleOutlined className="absolute right-3 bottom-3 text-red-200 text-2xl" />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <HistoryOutlined className="text-blue-600" />
                          <span className="font-semibold text-sm text-gray-700">Transaction History</span>
                          {!commHistoryLoading && commissionHistory.length > 0 && (
                            <span className="text-xs text-gray-400 ml-auto">{commissionHistory.length} entries</span>
                          )}
                        </div>
                        {commHistoryLoading ? (
                          <div className="flex items-center justify-center py-8 text-gray-400">
                            <ReloadOutlined className="animate-spin mr-2" /> Loading transactions...
                          </div>
                        ) : commissionHistory.length === 0 ? (
                          <div className="text-center py-10 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                            <HistoryOutlined className="text-3xl mb-2 block text-gray-300" />
                            <span className="text-sm">No commission transactions yet</span>
                          </div>
                        ) : (
                          <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                            <div className="overflow-y-auto" style={{ height: 'calc(100vh - 380px)', minHeight: 240 }}>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-gray-50 border-b border-gray-200">
                                    <th className="px-3 py-2.5 text-left font-semibold text-gray-600 text-[11px] uppercase tracking-wider">Date</th>
                                    <th className="px-3 py-2.5 text-left font-semibold text-gray-600 text-[11px] uppercase tracking-wider">Type</th>
                                    <th className="px-3 py-2.5 text-left font-semibold text-gray-600 text-[11px] uppercase tracking-wider">Member Details</th>
                                    <th className="px-3 py-2.5 text-center font-semibold text-gray-600 text-[11px] uppercase tracking-wider">Rate</th>
                                    <th className="px-3 py-2.5 text-center font-semibold text-gray-600 text-[11px] uppercase tracking-wider">Source</th>
                                    <th className="px-3 py-2.5 text-right font-semibold text-gray-600 text-[11px] uppercase tracking-wider">Join Fees</th>
                                    <th className="px-3 py-2.5 text-right font-semibold text-gray-600 text-[11px] uppercase tracking-wider">Commission</th>
                                    <th className="px-3 py-2.5 text-right font-semibold text-gray-600 text-[11px] uppercase tracking-wider">Balance</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {commissionHistory.map((tx, i) => (
                                    <tr key={tx.id}
                                      className={`border-t border-gray-100 transition-colors hover:bg-blue-50/50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                                      <td className="px-3 py-3 whitespace-nowrap align-top">
                                        <div className="font-medium text-gray-700 text-xs">{tx.createdAt ? formatDate(tx.createdAt) : '-'}</div>
                                        <div className="text-gray-400 text-[11px] mt-0.5">{tx.createdAt?._seconds ? dayjs.unix(tx.createdAt._seconds).format('hh:mm A') : ''}</div>
                                      </td>
                                      <td className="px-3 py-3 align-top">
                                        {tx.type === 'credit'
                                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[11px] font-medium"><PlusCircleOutlined />Credit</span>
                                          : tx.type === 'reversal'
                                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[11px] font-medium"><MinusCircleOutlined />Reversal</span>
                                          : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[11px] font-medium"><MinusCircleOutlined />Debit</span>
                                        }
                                      </td>
                                      <td className="px-3 py-3 align-top max-w-[200px]">
                                        <div className="font-semibold text-gray-800 text-xs leading-snug">{tx.memberName || tx.description || tx.source}</div>
                                        {tx.memberFatherName && <div className="text-gray-500 text-[11px] mt-0.5">{tx.memberFatherName}</div>}
                                        {tx.memberRegNo && <div className="text-gray-400 text-[11px] font-mono mt-0.5">#{tx.memberRegNo}</div>}
                                        {tx.programName && <div className="text-gray-400 text-[11px] mt-0.5 truncate">{tx.programName}</div>}
                                      </td>
                                      <td className="px-3 py-3 text-center align-top">
                                        {tx.commissionRate
                                          ? <span className="inline-flex px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[11px] font-semibold">{(tx.commissionRate * 100)}%</span>
                                          : <span className="text-gray-300">-</span>
                                        }
                                      </td>
                                      <td className="px-3 py-3 text-center align-top">
                                        <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium
                                          ${tx.source === 'joinFees' ? 'bg-purple-100 text-purple-700' :
                                            tx.source === 'closingPayment' ? 'bg-orange-100 text-orange-700' :
                                            tx.source === 'withdrawal' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                                          {tx.source === 'joinFees' ? 'Join Fee' :
                                           tx.source === 'closingPayment' ? 'Closing' :
                                           tx.source === 'withdrawal' ? 'Withdrawal' : tx.source}
                                        </span>
                                      </td>
                                      <td className="px-3 py-3 text-right align-top whitespace-nowrap">
                                        {(() => {
                                          const base = tx.baseAmount || (tx.commissionRate > 0 ? Math.round(tx.amount / tx.commissionRate) : null);
                                          return base != null && (tx.source === 'joinFees' || tx.source === 'closingPayment')
                                            ? <span className="font-medium text-gray-700 text-xs">₹{base.toLocaleString('en-IN')}</span>
                                            : <span className="text-gray-300">-</span>;
                                        })()}
                                      </td>
                                      <td className={`px-3 py-3 text-right align-top font-bold text-sm whitespace-nowrap ${tx.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                                        <span className={tx.type === 'credit' ? 'text-green-600' : 'text-red-600'}>
                                          {tx.type === 'credit' ? '+' : '-'}₹{(tx.amount || 0).toLocaleString('en-IN')}
                                        </span>
                                      </td>
                                      <td className={`px-3 py-3 text-right align-top font-bold text-sm whitespace-nowrap ${(tx.balanceAfter || 0) < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                                        {(tx.balanceAfter || 0) < 0 ? '-' : ''}₹{Math.abs(tx.balanceAfter || 0).toLocaleString('en-IN')}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                },
                {
                  key: 'advance',
                  label: <span><PlusCircleOutlined className="mr-1.5 text-emerald-600" />Advance</span>,
                  children: (
                    <div className="space-y-4">
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="bg-emerald-100 p-2 rounded-lg"><PlusCircleOutlined className="text-emerald-600 text-lg" /></div>
                          <div>
                            <div className="font-semibold text-base">Advance Payments</div>
                            <div className="text-xs text-gray-500">Agent advance deposits to organization</div>
                          </div>
                        </div>
                        <Space>
                          <Button size="small" icon={<FileTextOutlined />}
                            onClick={printAdvanceReport} disabled={advanceHistory.length === 0}>
                            Download PDF
                          </Button>
                          <Button type="primary" size="small" icon={<PlusOutlined />}
                            style={{ background: '#059669' }}
                            onClick={() => setAdvanceModalVisible(true)}>
                            Add Advance
                          </Button>
                        </Space>
                      </div>

                      {/* Balance cards */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="relative p-4 bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-xl border border-emerald-200">
                          <div className="text-3xl font-bold text-emerald-700">₹{(selectedAgent.advanceBalance || 0).toLocaleString('en-IN')}</div>
                          <div className="text-xs text-emerald-600/70 font-medium mt-1">Current Advance Balance</div>
                          <WalletOutlined className="absolute right-3 bottom-3 text-emerald-200 text-2xl" />
                        </div>
                        <div className="relative p-4 bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl border border-blue-200">
                          <div className="text-3xl font-bold text-blue-700">₹{(selectedAgent.totalAdvancePaid || 0).toLocaleString('en-IN')}</div>
                          <div className="text-xs text-blue-600/70 font-medium mt-1">Total Advance Deposited</div>
                          <DollarOutlined className="absolute right-3 bottom-3 text-blue-200 text-2xl" />
                        </div>
                      </div>

                      {/* History table */}
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <HistoryOutlined className="text-emerald-600" />
                          <span className="font-semibold text-sm text-gray-700">Payment History</span>
                          {!advanceHistoryLoading && advanceHistory.length > 0 && (
                            <span className="text-xs text-gray-400 ml-auto">{advanceHistory.length} entries</span>
                          )}
                        </div>
                        {advanceHistoryLoading ? (
                          <div className="flex items-center justify-center py-8 text-gray-400">
                            <ReloadOutlined className="animate-spin mr-2" /> Loading...
                          </div>
                        ) : advanceHistory.length === 0 ? (
                          <div className="text-center py-10 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                            <DollarOutlined className="text-3xl mb-2 block text-gray-300" />
                            <span className="text-sm">No advance payments yet</span>
                          </div>
                        ) : (
                          <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                            <div className="overflow-y-auto" style={{ height: 'calc(100vh - 360px)', minHeight: 240 }}>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-gray-50 border-b border-gray-200">
                                    <th className="px-3 py-2.5 text-left font-semibold text-gray-600 text-[11px] uppercase tracking-wider">#</th>
                                    <th className="px-3 py-2.5 text-left font-semibold text-gray-600 text-[11px] uppercase tracking-wider">Date</th>
                                    <th className="px-3 py-2.5 text-left font-semibold text-gray-600 text-[11px] uppercase tracking-wider">Description / Note</th>
                                    <th className="px-3 py-2.5 text-center font-semibold text-gray-600 text-[11px] uppercase tracking-wider">Mode</th>
                                    <th className="px-3 py-2.5 text-left font-semibold text-gray-600 text-[11px] uppercase tracking-wider">UTR / Cash ID</th>
                                    <th className="px-3 py-2.5 text-right font-semibold text-gray-600 text-[11px] uppercase tracking-wider">Amount</th>
                                    <th className="px-3 py-2.5 text-right font-semibold text-gray-600 text-[11px] uppercase tracking-wider">Balance</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {advanceHistory.map((tx, i) => (
                                    <tr key={tx.id} className={`border-t border-gray-100 hover:bg-emerald-50/30 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                                      <td className="px-3 py-3 text-gray-400 text-[11px]">{i + 1}</td>
                                      <td className="px-3 py-3 whitespace-nowrap">
                                        <div className="font-medium text-gray-700 text-xs">{tx.createdAt ? formatDate(tx.createdAt) : '-'}</div>
                                        <div className="text-gray-400 text-[11px] mt-0.5">{tx.createdAt?._seconds ? dayjs.unix(tx.createdAt._seconds).format('hh:mm A') : ''}</div>
                                      </td>
                                      <td className="px-3 py-3">
                                        <div className="font-medium text-gray-800 text-xs">{tx.description || 'Advance Payment'}</div>
                                        {tx.note && <div className="text-gray-400 text-[11px] mt-0.5">{tx.note}</div>}
                                      </td>
                                      <td className="px-3 py-3 text-center">
                                        {tx.paymentMode === 'online'
                                          ? <span className="inline-flex px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[11px] font-medium">Online</span>
                                          : <span className="inline-flex px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-medium">Cash</span>
                                        }
                                      </td>
                                      <td className="px-3 py-3">
                                        {tx.utrId
                                          ? <span className="font-mono text-[11px] text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded select-all">{tx.utrId}</span>
                                          : <span className="text-gray-300 text-[11px]">-</span>
                                        }
                                      </td>
                                      <td className="px-3 py-3 text-right font-bold text-sm text-emerald-600 whitespace-nowrap">
                                        +₹{(tx.amount || 0).toLocaleString('en-IN')}
                                      </td>
                                      <td className="px-3 py-3 text-right font-semibold text-sm text-gray-800 whitespace-nowrap">
                                        ₹{(tx.balanceAfter || 0).toLocaleString('en-IN')}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                }
              ]}
              onChange={(key) => {
                if (key === 'advance' && selectedAgent && advanceHistory.length === 0 && !advanceHistoryLoading) {
                  loadAdvanceHistory(selectedAgent);
                }
              }}
            />
          )}
        </Drawer>

        {/* Add Advance Payment Modal */}
        <Modal
          title={<><PlusCircleOutlined className="mr-2 text-emerald-600" />Add Advance Payment — {selectedAgent?.name}</>}
          open={advanceModalVisible}
          onCancel={resetAdvanceModal}
          onOk={handleAddAdvance}
          confirmLoading={advanceProcessing}
          okText="Record Advance"
          okButtonProps={{ style: { background: '#059669' } }}
        >
          <div className="space-y-4 py-2">
            <div className="bg-emerald-50 p-3 rounded-lg text-center">
              <div className="text-sm text-gray-600">Current Advance Balance</div>
              <div className="text-2xl font-bold text-emerald-700">₹{(selectedAgent?.advanceBalance || 0).toLocaleString('en-IN')}</div>
            </div>

            {/* Payment Mode */}
            <div>
              <label className="block text-sm font-medium mb-2">Payment Mode <span className="text-red-500">*</span></label>
              <div className="flex gap-3">
                {[{ value: 'cash', label: '💵 Cash' }, { value: 'online', label: '🏦 Online' }].map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => { setAdvancePaymentMode(opt.value); setAdvanceUtrId(''); }}
                    className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                      advancePaymentMode === opt.value
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* UTR ID — only for online */}
            {advancePaymentMode === 'online' && (
              <div>
                <label className="block text-sm font-medium mb-1">UTR / Transaction ID <span className="text-red-500">*</span></label>
                <Input
                  placeholder="Enter UTR or transaction reference"
                  value={advanceUtrId}
                  onChange={e => setAdvanceUtrId(e.target.value)}
                  style={{ fontFamily: 'monospace' }}
                />
              </div>
            )}

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium mb-1">Amount (₹) <span className="text-red-500">*</span></label>
              <Input
                type="number"
                prefix="₹"
                placeholder="Enter advance amount"
                value={advanceAmount}
                onChange={e => setAdvanceAmount(e.target.value)}
                size="large"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <Input
                placeholder="e.g. Advance Payment — July 2026"
                value={advanceDesc}
                onChange={e => setAdvanceDesc(e.target.value)}
              />
            </div>

            {/* Note */}
            <div>
              <label className="block text-sm font-medium mb-1">Note (optional)</label>
              <Input.TextArea
                placeholder="Any additional notes..."
                value={advanceNote}
                onChange={e => setAdvanceNote(e.target.value)}
                rows={2}
              />
            </div>
          </div>
        </Modal>

        {/* Wallet Pay Agent Modal */}
        <Modal
          title={<><DollarOutlined className="mr-2 text-green-600" />Pay Agent — {selectedAgent?.name}</>}
          open={walletModalVisible}
          onCancel={() => { setWalletModalVisible(false); setWalletAmount(''); setWalletDesc(''); }}
          onOk={handleWalletAction}
          confirmLoading={walletProcessing}
          okText="Confirm Payment"
        >
          <div className="space-y-4 py-2">
            <div className="bg-blue-50 p-3 rounded-lg text-center">
              <div className="text-sm text-gray-600">Current Wallet Balance</div>
              <div className="text-2xl font-bold text-blue-700">₹{(selectedAgent?.walletBalance || 0).toLocaleString('en-IN')}</div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Amount to Pay (₹)</label>
              <Input
                type="number"
                placeholder="Enter amount"
                value={walletAmount}
                onChange={e => setWalletAmount(e.target.value)}
                size="large"
                prefix={<DollarOutlined />}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description (Optional)</label>
              <Input
                placeholder="e.g. Commission payout for March 2026"
                value={walletDesc}
                onChange={e => setWalletDesc(e.target.value)}
                size="large"
              />
            </div>
          </div>
        </Modal>

        {/* Amount correction — agent aggregates only, superadmin */}
        <AgentStatsEditDrawer
          open={!!statsEditAgent}
          agent={statsEditAgent}
          onClose={() => setStatsEditAgent(null)}
          onSaved={() => fetchAgents(pagination.current)}
        />
      </div>

      <style jsx global>{`
        .custom-table .ant-table-thead > tr > th { background: #f8fafc !important; font-weight: 600; }
        .ant-tag-success { background: #d1fae5 !important; color: #065f46 !important; border: none; }
        .ant-tag-error   { background: #fee2e2 !important; color: #991b1b !important; border: none; }
      `}</style>
    </div>
  );
};

export default AgentsManagementPage;