"use client";
import React, { useEffect, useState } from 'react';
import { Card, Tag, Flex, Typography, Spin, Collapse } from 'antd';
import { WalletOutlined, DollarCircleOutlined, HistoryOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { auth } from '../../../../../lib/firbase-client';

const { Text } = Typography;

const fmtDate = (ts) => {
  if (!ts) return '-';
  if (ts._seconds) return dayjs(new Date(ts._seconds * 1000)).format('DD/MM/YY hh:mm A');
  if (ts.seconds)  return dayjs(new Date(ts.seconds  * 1000)).format('DD/MM/YY hh:mm A');
  return '-';
};

const AgentAdvancePanel = ({ agentId }) => {
  const [data,    setData]    = useState({ balance: 0, totalPaid: 0, records: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!agentId) return;
    const load = async () => {
      setLoading(true);
      try {
        const token = await auth.currentUser?.getIdToken();
        const res   = await fetch(`/api/agents/advance?agentId=${agentId}&limit=10`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const result = await res.json();
        if (result.success && result.data?.length > 0) {
          const records     = result.data;
          const totalPaid   = records.reduce((s, r) => s + (r.amount || 0), 0);
          const balance     = records[0]?.balanceAfter ?? totalPaid;
          setData({ balance, totalPaid, records });
        }
      } catch (e) {
        console.error('AgentAdvancePanel fetch error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [agentId]);

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '8px 0', color: '#9ca3af', fontSize: 12 }}>
      <Spin size="small" /> &nbsp;Loading advance data…
    </div>
  );

  if (data.records.length === 0) return null;

  return (
    <Collapse
      size="small"
      style={{ marginBottom: 12, borderRadius: 12, border: '1px solid #a7f3d0', background: '#f0fdf4' }}
      items={[{
        key: '1',
        label: (
          <Flex gap={12} align="center">
            <DollarCircleOutlined style={{ color: '#059669', fontSize: 16 }} />
            <Text strong style={{ color: '#065f46', fontSize: 13 }}>
              Advance Balance: <span style={{ color: '#059669' }}>₹{data.balance.toLocaleString('en-IN')}</span>
            </Text>
            <Tag color="green" style={{ borderRadius: 10, fontSize: 11 }}>
              Total Deposited: ₹{data.totalPaid.toLocaleString('en-IN')}
            </Tag>
            <Text style={{ fontSize: 11, color: '#6b7280' }}>{data.records.length} payment{data.records.length !== 1 ? 's' : ''}</Text>
          </Flex>
        ),
        children: (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#dcfce7' }}>
                  <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#065f46', fontSize: 11 }}>#</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#065f46', fontSize: 11 }}>Date</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#065f46', fontSize: 11 }}>Description</th>
                  <th style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 600, color: '#065f46', fontSize: 11 }}>Mode</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#065f46', fontSize: 11 }}>UTR / Cash ID</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: '#065f46', fontSize: 11 }}>Amount</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: '#065f46', fontSize: 11 }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((tx, i) => (
                  <tr key={tx.id} style={{ borderTop: '1px solid #bbf7d0', background: i % 2 === 0 ? '#fff' : '#f0fdf4' }}>
                    <td style={{ padding: '5px 10px', color: '#9ca3af', fontSize: 11 }}>{i + 1}</td>
                    <td style={{ padding: '5px 10px', color: '#374151', fontSize: 11, whiteSpace: 'nowrap' }}>{fmtDate(tx.createdAt)}</td>
                    <td style={{ padding: '5px 10px', color: '#374151' }}>
                      <div style={{ fontWeight: 500 }}>{tx.description || 'Advance Payment'}</div>
                      {tx.note && <div style={{ fontSize: 10, color: '#9ca3af' }}>{tx.note}</div>}
                    </td>
                    <td style={{ padding: '5px 10px', textAlign: 'center' }}>
                      {tx.paymentMode === 'online'
                        ? <Tag color="blue"  style={{ fontSize: 10, margin: 0 }}>Online</Tag>
                        : <Tag color="default" style={{ fontSize: 10, margin: 0 }}>Cash</Tag>
                      }
                    </td>
                    <td style={{ padding: '5px 10px', fontFamily: 'monospace', fontSize: 11, color: tx.utrId ? '#374151' : '#d1d5db' }}>
                      {tx.utrId || '-'}
                    </td>
                    <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: 700, color: tx.type === 'deduction' ? '#dc2626' : '#16a34a', whiteSpace: 'nowrap' }}>
                      {tx.type === 'deduction' ? '-' : '+'}₹{(tx.amount || 0).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>
                      ₹{(tx.balanceAfter || 0).toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      }]}
    />
  );
};

export default AgentAdvancePanel;
