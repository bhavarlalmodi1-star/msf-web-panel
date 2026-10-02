'use client';
import { panelTheme } from '@/utils/trust/trustStore';
import { trustHtml } from '@/utils/trust/trustStore';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Table, Card, Tag, Button, Space, Typography,
  Badge, Spin, Empty, message, Select, DatePicker,
  Flex, Input, Modal, Tooltip
} from 'antd';
import {
  DownloadOutlined, FileExcelOutlined, FilePdfOutlined,
  SearchOutlined,
  DownOutlined, RightOutlined, ReloadOutlined,
  DeleteOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { auth } from '../../../../lib/firbase-client';
import { useSelector } from 'react-redux';
import { useAuth } from '@/components/Base/AuthProvider';

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

const C = {
  get primary() { return panelTheme().primary; },
  get secondary() { return panelTheme().secondary; },
  success: '#16a34a',
  error: '#dc2626',
  info: '#2563eb',
  get bg() { return panelTheme().background; },
  get border() { return panelTheme().border; },
  surface: '#ffffff',
  fg: '#3e1f1a',
  muted: '#9ca3af',
};

const PAGE_SIZE = 100;

const PaymentHistoryPage = () => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'superadmin';

  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [groups, setGroups] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalGroups: 0, totalPages: 0, totalTransactions: 0, totalAmount: 0 });
  const [expandedRowKeys, setExpandedRowKeys] = useState([]);
  const debounceRef = useRef(null);

  const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs().endOf('month')]);
  const [methodFilter, setMethodFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState('all');
  const [searchText, setSearchText] = useState('');
  const searchRef   = useRef('');          // always holds latest value — avoids stale closure
  const [currentPage, setCurrentPage] = useState(1);
  const agentList = useSelector((state) => state.data.agentList || []);

  const fetchData = useCallback(async (page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page || 1));
      params.set('pageSize', String(PAGE_SIZE));
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (methodFilter !== 'all') params.set('method', methodFilter);
      if (agentFilter !== 'all') params.set('agentId', agentFilter);
      if (dateRange?.[0]) params.set('startDate', dateRange[0].startOf('day').toISOString());
      if (dateRange?.[1]) params.set('endDate', dateRange[1].endOf('day').toISOString());
      // Use ref so debounced calls always get the latest typed value (avoids stale closure)
      if (searchRef.current.trim()) params.set('search', searchRef.current.trim());

      const token = await auth.currentUser?.getIdToken();
      if (!token) { message.error('Not authenticated'); setLoading(false); return; }
      const res = await fetch(`/api/payment-history?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();

      if (data.success) {
        setGroups(data.data);
        setPagination(data.pagination);
      } else {
        message.error(data.message || 'Failed to load');
      }
    } catch (e) {
      console.error(e);
      message.error('Failed to load payment history');
    } finally {
      setLoading(false);
    }
  }, [typeFilter, methodFilter, agentFilter, dateRange]);

  useEffect(() => {
    fetchData(currentPage);
  }, [currentPage, typeFilter, methodFilter, agentFilter, dateRange]);

  const handleSearch = (val) => {
    setSearchText(val);
    searchRef.current = val;               // update ref immediately (no async delay)
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setCurrentPage(1);
      fetchData(1);                        // fetchData reads searchRef.current — always fresh
    }, 500);
  };

  // ── Delete a payment group (superadmin only) ────────────────────────────────
  const handleDelete = (record) => {
    const isClosing = record.paymentType === 'closingPayment';
    const label     = isClosing ? 'Closing Payment' : 'Join Fees';
    const amount    = (record.totalAmount || 0).toLocaleString();
    const txCount   = (record.transactions || []).length;

    Modal.confirm({
      title: `Delete ${label} Group?`,
      icon: <ExclamationCircleOutlined style={{ color: '#dc2626' }} />,
      content: (
        <div style={{ marginTop: 8 }}>
          <p>This will <strong>permanently delete</strong> this payment group and reverse all stats:</p>
          <ul style={{ marginTop: 8, paddingLeft: 16, color: '#374151' }}>
            <li>Amount: <strong>₹{amount}</strong></li>
            <li>Transactions: <strong>{txCount} member(s)</strong></li>
            <li>Agent: <strong>{record.agent?.name || record.agentId || '—'}</strong></li>
          </ul>
          <p style={{ marginTop: 10, color: '#dc2626', fontWeight: 600 }}>
            This cannot be undone. Member paid/pending amounts will be reversed.
          </p>
        </div>
      ),
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        setDeletingId(record.id);
        try {
          const token  = await auth.currentUser?.getIdToken();
          const route  = isClosing ? '/api/closing-fees-revert' : '/api/join-fees-revert';
          const res    = await fetch(route, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body:    JSON.stringify({ paymentGroupId: record.id }),
          });
          const data = await res.json();
          if (data.success) {
            message.success(data.message || 'Payment group deleted');
            // Remove from local state immediately — no full refetch needed
            setGroups(prev => prev.filter(g => g.id !== record.id));
            setPagination(prev => ({
              ...prev,
              totalGroups:        prev.totalGroups - 1,
              totalTransactions:  prev.totalTransactions - txCount,
              totalAmount:        prev.totalAmount - (record.totalAmount || 0),
            }));
          } else {
            message.error(data.message || 'Delete failed');
          }
        } catch (e) {
          message.error('Delete failed: ' + e.message);
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  const buildExportParams = () => {
    const params = new URLSearchParams();
    params.set('export', 'true');
    if (typeFilter !== 'all') params.set('type', typeFilter);
    if (methodFilter !== 'all') params.set('method', methodFilter);
    if (agentFilter !== 'all') params.set('agentId', agentFilter);
    if (dateRange?.[0]) params.set('startDate', dateRange[0].startOf('day').toISOString());
    if (dateRange?.[1]) params.set('endDate', dateRange[1].endOf('day').toISOString());
    if (searchRef.current.trim()) params.set('search', searchRef.current.trim());
    return params;
  };

  const flattenExportData = (groups) => {
    const list = [];
    groups.forEach(g => {
      (g.transactions || []).forEach(tx => {
        list.push({
          key: `${g.id}_${tx.id}`,
          groupDate:     g.paymentDate ? dayjs(g.paymentDate).format('DD/MM/YYYY') : '—',
          agentName:     g.agent?.name || '—',
          agentPhone:    String(g.agent?.phone1 || ''),
          memberName:    tx.memberName || '—',
          memberPhone:   String(tx.memberPhone || ''),
          regNo:         tx.memberRegNo || tx.registrationNumber || '—',
          programName:   tx.programName || '—',
          paymentType:   g.paymentType === 'closingPayment' ? 'Closing' : 'Join Fees',
          amount:        tx.amount || 0,
          method:        g.paymentMethod || '—',
          // tx-level field has it for new records; fall back to group-level for older ones
          transactionId: tx.transactionId || g.transactionId || '—',
          paymentNote:   g.paymentNote || '',
        });
      });
    });
    return list;
  };

  const fetchExportData = async () => {
    setExportLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) { message.error('Not authenticated'); return null; }
      const params = buildExportParams();
      const res = await fetch(`/api/payment-history?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!data.success) { message.error(data.message); return null; }
      return flattenExportData(data.data);
    } catch (e) {
      console.error(e);
      message.error('Export failed');
      return null;
    } finally {
      setExportLoading(false);
    }
  };

  const exportCSV = async () => {
    const allTx = await fetchExportData();
    if (!allTx || !allTx.length) { message.warning('No data'); return; }

    // Helper: wrap text in CSV-safe double-quotes, escape internal quotes
    const q  = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    // Helper: force phone numbers to display as text in Excel (="number" trick)
    const ph = (v) => v ? `="${String(v).replace(/"/g, '')}"` : '';

    const headers = ['Date', 'Agent Name', 'Agent Phone', 'Member Name', 'Member Phone', 'Reg No', 'Yojna / Program', 'Payment Type', 'Amount', 'Method', 'UTR / Cash ID'];
    const rows = allTx.map(r => [
      q(r.groupDate),
      q(r.agentName),
      ph(r.agentPhone),
      q(r.memberName),
      ph(r.memberPhone),
      q(r.regNo),
      q(r.programName),
      q(r.paymentType),
      r.amount,
      q(r.method),
      q(r.transactionId),
    ]);

    const csv = [headers.map(q).join(','), ...rows.map(r => r.join(','))].join('\r\n');

    // Use explicit UTF-8 BOM bytes + TextEncoder to guarantee proper encoding for Hindi
    const bom     = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const encoded = new TextEncoder().encode(csv);
    const blob    = new Blob([bom, encoded], { type: 'text/csv;charset=utf-8;' });

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `payment-history_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    message.success(`Exported ${rows.length} records`);
  };

  const exportExcel = async () => {
    const allTx = await fetchExportData();
    if (!allTx || !allTx.length) { message.warning('No data'); return; }

    // Helper: explicit string cell — XLSX will never auto-convert to number
    const s = (v) => ({ t: 's', v: String(v ?? '') });
    // Helper: number cell
    const n = (v) => ({ t: 'n', v: Number(v) || 0 });

    const header = ['Date', 'Agent Name', 'Agent Phone', 'Member Name', 'Member Phone', 'Reg No', 'Yojna / Program', 'Type', 'Amount', 'Method', 'UTR / Cash ID'];

    const dataRows = allTx.map(r => [
      s(r.groupDate),
      s(r.agentName),
      s(r.agentPhone),    // explicit string → no scientific notation
      s(r.memberName),
      s(r.memberPhone),   // explicit string → no scientific notation
      s(r.regNo),
      s(r.programName),
      s(r.paymentType),
      n(r.amount),
      s(r.method),
      s(r.transactionId),
    ]);

    const total = allTx.reduce((acc, r) => acc + r.amount, 0);
    const totalRow = [s(''), s('TOTAL'), s(''), s(''), s(''), s(''), s(''), s(''), n(total), s(''), s('')];

    // aoa_to_sheet with explicit cell objects = full type control, no XLSX auto-inference
    const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows, totalRow]);

    ws['!cols'] = [
      { wch: 12 }, // Date
      { wch: 22 }, // Agent Name
      { wch: 14 }, // Agent Phone
      { wch: 22 }, // Member Name
      { wch: 14 }, // Member Phone
      { wch: 14 }, // Reg No
      { wch: 26 }, // Yojna
      { wch: 12 }, // Type
      { wch: 10 }, // Amount
      { wch: 10 }, // Method
      { wch: 22 }, // UTR
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Payments');
    XLSX.writeFile(wb, `payment-history_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`);
    message.success(`Exported ${allTx.length} records`);
  };

  const exportPDF = async () => {
    const allTx = await fetchExportData();
    if (!allTx || !allTx.length) { message.warning('No data'); return; }

    // Escape HTML entities to prevent injection / broken cells
    const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const rows = allTx.map((r, i) => `<tr>
      <td class="c">${i + 1}</td>
      <td class="c">${esc(r.groupDate)}</td>
      <td><div class="nm">${esc(r.agentName)}</div>${r.agentPhone ? `<div class="ph">${esc(r.agentPhone)}</div>` : ''}</td>
      <td><div class="nm">${esc(r.memberName)}</div>${r.memberPhone ? `<div class="ph">${esc(r.memberPhone)}</div>` : ''}</td>
      <td class="c reg">${esc(r.regNo)}</td>
      <td>${esc(r.programName)}</td>
      <td class="c">${esc(r.paymentType)}</td>
      <td class="c amt">₹${(r.amount || 0).toLocaleString()}</td>
      <td class="c">${esc(r.method)}</td>
      <td class="txid">${esc(r.transactionId)}</td>
    </tr>`).join('');

    const t = allTx.reduce((s, r) => s + r.amount, 0);

    const html = `<!DOCTYPE html><html><head>
      <meta charset="utf-8"><title>Payment History</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;700&family=Noto+Sans:wght@400;700&display=swap" rel="stylesheet">
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Noto Sans Devanagari','Noto Sans',Arial,sans-serif;background:#b0b0b0;color:#111}
        .print-bar{position:sticky;top:0;z-index:100;padding:10px 20px;background:${trustHtml().pdfColorPrimary};display:flex;gap:12px;align-items:center}
        .btn-print{background:${trustHtml().pdfColorAccent};color:#fff;border:none;padding:8px 24px;border-radius:6px;cursor:pointer;font-weight:700;font-size:13px}
        .btn-close{background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);padding:8px 18px;border-radius:6px;cursor:pointer;font-size:13px}
        /* A4 landscape for more column space */
        .page{width:270mm;min-height:190mm;background:#fff;margin:16px auto;padding:8mm;box-shadow:0 6px 28px rgba(0,0,0,.25)}
        h2{text-align:center;color:${trustHtml().pdfColorPrimary};margin-bottom:3px;font-size:16px;font-family:'Noto Sans Devanagari','Noto Sans',Arial,sans-serif}
        .sub{text-align:center;color:${trustHtml().pdfColorAccent};font-size:11px;margin-bottom:8px;font-family:'Noto Sans Devanagari','Noto Sans',Arial,sans-serif}
        table{width:100%;border-collapse:collapse;border:1.5px solid #999;font-size:8.5px;table-layout:fixed}
        th{padding:5px 2px;font-weight:700;color:${trustHtml().pdfColorPrimary};text-align:center;border:1px solid #999;background:#f0f0f0;word-wrap:break-word;overflow-wrap:break-word}
        td{padding:3px 2px;color:#111;border:0.8px solid #c0c8d4;vertical-align:top;word-wrap:break-word;overflow-wrap:break-word}
        td.c{text-align:center}
        td.reg{font-family:monospace;color:${trustHtml().theme.primary};font-size:8px;text-align:center}
        td.amt{font-weight:700;text-align:center}
        td.txid{font-size:7.5px;color:#555;word-break:break-all}
        .nm{font-weight:600;line-height:1.3}
        .ph{font-size:7.5px;color:#555;margin-top:1px}
        .total-row td{font-weight:700;background:#fff3f0}
        .footer{text-align:center;margin-top:8px;font-size:9px;color:#666;border-top:1.5px solid ${trustHtml().pdfColorAccent};padding-top:5px}
        @media print{
          @page{size:A4 landscape;margin:6mm}
          body{background:#fff}
          .print-bar{display:none!important}
          .page{margin:0;box-shadow:none;padding:0;width:100%}
        }
      </style>
    </head><body>
      <div class="print-bar">
        <button class="btn-print" onclick="window.print()">🖨 Print / Save PDF</button>
        <button class="btn-close" onclick="window.close()">✕ Close</button>
        <span style="color:#fff;font-size:12px">📄 ${allTx.length} records &nbsp;|&nbsp; Total: ₹${t.toLocaleString()}</span>
      </div>
      <div class="page">
        <h2>${trustHtml().name}</h2>
        <div class="sub">भुगतान इतिहास रिपोर्ट — Generated ${dayjs().format('DD MMM YYYY hh:mm A')}</div>
        <table>
          <colgroup>
            <col style="width:22px">   <!-- # -->
            <col style="width:52px">   <!-- Date -->
            <col style="width:88px">   <!-- Agent (name+phone) -->
            <col style="width:88px">   <!-- Member (name+phone) -->
            <col style="width:72px">   <!-- Reg No -->
            <col>                      <!-- Yojna (flex) -->
            <col style="width:46px">   <!-- Type -->
            <col style="width:52px">   <!-- Amount -->
            <col style="width:40px">   <!-- Method -->
            <col style="width:72px">   <!-- UTR -->
          </colgroup>
          <thead><tr>
            <th>#</th>
            <th>Date</th>
            <th>Agent</th>
            <th>Member</th>
            <th>Reg No</th>
            <th>Yojna / Program</th>
            <th>Type</th>
            <th>Amount</th>
            <th>Method</th>
            <th>UTR / Cash ID</th>
          </tr></thead>
          <tbody>${rows}
            <tr class="total-row">
              <td colspan="7" style="text-align:right;padding-right:6px;font-size:9px">Total (${allTx.length} records):</td>
              <td class="c">₹${t.toLocaleString()}</td>
              <td colspan="2"></td>
            </tr>
          </tbody>
        </table>
        <div class="footer">Generated by ${trustHtml().shortName} &nbsp;•&nbsp; ${dayjs().format('DD MMM YYYY hh:mm A')}</div>
      </div>
    </body></html>`;

    const win = window.open('', '_blank');
    if (!win) { message.error('Popup blocked! Please allow popups for this site.'); return; }
    win.document.write(html);
    win.document.close();
  };

  const expandedRowRender = (record) => {
    const txs = record.transactions || [];
    if (!txs.length) return <Empty description="No transactions" style={{ margin: 16 }} />;
    return (
      <div style={{ padding: '8px 16px', background: 'var(--pink-50)', borderRadius: 8 }}>
        <Table
          columns={[
            { title: 'Member', key: 'member', width: 200,
              render: (_, tx) => (
                <div>
                  <Text strong style={{ display: 'block', fontSize: 13 }}>{tx.memberName || '—'}</Text>
                  <Text style={{ fontSize: 11, color: C.primary, fontFamily: 'monospace' }}>
                    {tx.memberRegNo || tx.registrationNumber || '—'}
                  </Text>
                </div>
              ),
            },
            { title: 'Program', dataIndex: 'programName', key: 'program', width: 150 },
            { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 100, align: 'right',
              render: (v) => <Text strong>₹{(v || 0).toLocaleString()}</Text> },
            { title: 'Method', dataIndex: 'paymentMode', key: 'method', width: 80,
              render: (v) => <Tag color={v === 'cash' ? 'green' : 'blue'}>{v || '—'}</Tag> },
            { title: 'Tx ID', dataIndex: 'transactionId', key: 'txId', width: 130,
              render: (v) => <Text copyable style={{ fontSize: 11 }}>{v || '—'}</Text> },
          ]}
          dataSource={txs}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </div>
    );
  };

  const columns = [
    { title: 'Date', dataIndex: 'paymentDate', key: 'date', width: 100,
      render: (d) => <Text>{d ? dayjs(d).format('DD/MM/YYYY') : '—'}</Text> },
    { title: 'Agent', key: 'agent', width: 170,
      render: (_, r) => (
        <Space size={4}>
          <Text strong style={{ fontSize: 12 }}>{r.agent?.name || '—'}</Text>
          <Text style={{ fontSize: 10, color: C.muted }}>{r.agent?.phone1 || ''}</Text>
        </Space>
      ),
    },
    { title: 'Type', dataIndex: 'paymentType', key: 'type', width: 85,
      render: (v) => (
        <Tag color={v === 'closingPayment' ? 'volcano' : 'geekblue'} style={{ borderRadius: 10 }}>
          {v === 'closingPayment' ? 'Closing' : 'Join Fees'}
        </Tag>
      ),
    },
    { title: 'Amount', dataIndex: 'totalAmount', key: 'amount', width: 100, align: 'right',
      render: (v) => <Text strong>₹{(v || 0).toLocaleString()}</Text> },
    { title: 'Method', dataIndex: 'paymentMethod', key: 'method', width: 75,
      render: (v) => <Tag color={v === 'cash' ? 'success' : 'processing'}>{v === 'cash' ? 'Cash' : 'Online'}</Tag> },
    { title: 'Tx ID', dataIndex: 'transactionId', key: 'txId', width: 110,
      render: (v) => <Text style={{ fontSize: 11 }}>{v || '—'}</Text> },
    { title: 'Members', key: 'members', width: 70, align: 'center',
      render: (_, r) => <Badge count={(r.transactions || []).length} style={{ backgroundColor: C.info }} showZero /> },
    { title: 'Note', dataIndex: 'paymentNote', key: 'note', width: 110, ellipsis: true,
      render: (v) => <Text style={{ fontSize: 11, color: C.muted }}>{v || '—'}</Text> },
    ...(isSuperAdmin ? [{
      title: 'Action', key: 'action', width: 70, align: 'center', fixed: 'right',
      render: (_, record) => (
        <Tooltip title="Delete payment group & reverse stats">
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            loading={deletingId === record.id}
            onClick={() => handleDelete(record)}
            style={{ borderRadius: 6 }}
          />
        </Tooltip>
      ),
    }] : []),
  ];

  return (
    <div style={{ padding: 20, background: C.bg, minHeight: '100vh' }}>
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ margin: 0, color: C.primary }}>Payment History</Title>
        <Text type="secondary">All join fees & closing payment transactions — max {PAGE_SIZE} per page</Text>
      </div>

      <Card style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.surface, marginBottom: 16 }}
        bodyStyle={{ padding: '12px 16px' }}>
        <Flex wrap="wrap" gap={12} align="center">
          <div>
            <Text style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 2 }}>Date Range</Text>
            <RangePicker value={dateRange} onChange={(d) => { setDateRange(d || [dayjs().startOf('month'), dayjs().endOf('month')]); setCurrentPage(1); }}
              format="DD/MM/YYYY" size="small" style={{ width: 220 }} allowClear={false} />
          </div>
          <div>
            <Text style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 2 }}>Method</Text>
            <Select value={methodFilter} onChange={(v) => { setMethodFilter(v); setCurrentPage(1); }} size="small" style={{ width: 110 }}>
              <Select.Option value="all">All</Select.Option>
              <Select.Option value="cash">Cash</Select.Option>
              <Select.Option value="online">Online</Select.Option>
            </Select>
          </div>
          <div>
            <Text style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 2 }}>Type</Text>
            <Select value={typeFilter} onChange={(v) => { setTypeFilter(v); setCurrentPage(1); }} size="small" style={{ width: 120 }}>
              <Select.Option value="all">All Types</Select.Option>
              <Select.Option value="joinFees">Join Fees</Select.Option>
              <Select.Option value="closingPayment">Closing</Select.Option>
            </Select>
          </div>
          <div>
            <Text style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 2 }}>Agent</Text>
            <Select value={agentFilter} onChange={(v) => { setAgentFilter(v); setCurrentPage(1); }} size="small" showSearch optionFilterProp="children" style={{ width: 200 }}>
              <Select.Option value="all">All Agents</Select.Option>
              {agentList.map((a) => (
                <Select.Option key={a.id} value={a.id}>{a.name} - {a.phone1 || ''}</Select.Option>
              ))}
            </Select>
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <Text style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 2 }}>Search</Text>
            <Input placeholder="Member name / Tx ID ..." prefix={<SearchOutlined />} size="small"
              onChange={(e) => handleSearch(e.target.value)} allowClear style={{ width: '100%' }} />
          </div>
          <div style={{ alignSelf: 'flex-end' }}>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={() => fetchData(currentPage)} loading={loading} size="small" />
              <Button icon={<DownloadOutlined />} onClick={exportCSV} loading={exportLoading} size="small">CSV</Button>
              <Button icon={<FileExcelOutlined style={{ color: '#217346' }} />} onClick={exportExcel} loading={exportLoading} size="small"
                style={{ borderColor: '#217346', color: '#217346' }}>Excel</Button>
              <Button type="primary" icon={<FilePdfOutlined />} onClick={exportPDF} loading={exportLoading} size="small"
                style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.secondary})`, border: 'none' }}>PDF</Button>
            </Space>
          </div>
        </Flex>
      </Card>

      <Card style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.surface }}
        bodyStyle={{ padding: 0 }}
        extra={
          <Text style={{ fontSize: 11, color: C.muted }}>
            {pagination.totalGroups} groups · {pagination.totalTransactions} transactions · <Text strong style={{ color: C.primary }}>₹{(pagination.totalAmount || 0).toLocaleString()}</Text> total
          </Text>
        }>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
        ) : groups.length === 0 ? (
          <Empty description="No payment history found" style={{ padding: 60 }} />
        ) : (
          <Table
            columns={columns}
            dataSource={groups}
            rowKey="id"
            pagination={{
              current: currentPage,
              pageSize: PAGE_SIZE,
              total: pagination.totalGroups,
              onChange: (p) => setCurrentPage(p),
              showTotal: (t) => `${t} groups`,
              size: 'small',
              showSizeChanger: false,
            }}
            size="middle"
            scroll={{ x: isSuperAdmin ? 1200 : 1100 }}
            expandable={{
              expandedRowRender,
              expandedRowKeys,
              onExpand: (exp, rec) => setExpandedRowKeys(exp ? [rec.id] : []),
              expandIcon: ({ expanded, onExpand, record }) =>
                expanded
                  ? <DownOutlined onClick={(e) => onExpand(record, e)} style={{ color: C.primary, cursor: 'pointer' }} />
                  : <RightOutlined onClick={(e) => onExpand(record, e)} style={{ color: C.primary, cursor: 'pointer' }} />,
            }}
          />
        )}
      </Card>
    </div>
  );
};

export default PaymentHistoryPage;
