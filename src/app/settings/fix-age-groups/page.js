"use client";
// Maintenance tool — repair age-group / fee mismatches.
//
// For each member it recomputes the age group from DOB + join date, then resets
// joinFees, fixedJoinFees and payAmount from that age group's matching period.
// Always preview (dry run) first: this changes money fields on many members.

import React, { useState } from 'react';
import {
  Card, Button, Select, Typography, Space, Progress, Alert, Table, Tag,
  Statistic, Row, Col, message, Modal, Switch, Empty,
} from 'antd';
import {
  ToolOutlined, PlayCircleOutlined, EyeOutlined, WarningOutlined,
  CheckCircleOutlined, ReloadOutlined, DownloadOutlined,
} from '@ant-design/icons';
import { useSelector } from 'react-redux';
import { auth } from '../../../../lib/firbase-client';
import { useAuth } from '@/components/Base/AuthProvider';

const { Title, Text, Paragraph } = Typography;

export default function FixAgeGroupsPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'superadmin';
  const programList = useSelector((s) => s.data.programList || []);

  const [programId, setProgramId] = useState('all');
  const [dryRun, setDryRun]       = useState(true);
  const [running, setRunning]     = useState(false);
  const [progress, setProgress]   = useState(null);   // { scanned, changed, ... }
  const [result, setResult]       = useState(null);

  const run = async (isDryRun) => {
    setRunning(true);
    setResult(null);
    setProgress({ scanned: 0, considered: 0, changed: 0, alreadyOk: 0, problemCount: 0 });

    const totals = { scanned: 0, considered: 0, changed: 0, alreadyOk: 0, skipped: 0, problemCount: 0 };
    const problems = [];
    const samples  = [];
    let cursor = null;
    let guard = 0;

    try {
      const token = await auth.currentUser?.getIdToken();

      // Chunked loop — the server returns a cursor so this completes regardless
      // of how many members there are.
      while (guard++ < 500) {
        const res = await fetch('/api/members/fix-age-groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ programId, cursor, batchSize: 300, dryRun: isDryRun }),
        });
        const data = await res.json();

        if (!data.success) {
          message.error(data.message || 'Repair failed');
          return;
        }

        totals.scanned      += data.scanned || 0;
        totals.considered   += data.considered || 0;
        totals.changed      += data.changed || 0;
        totals.alreadyOk    += data.alreadyOk || 0;
        totals.skipped      += data.skipped || 0;
        totals.problemCount += data.problemCount || 0;
        // Keep every row — the CSV must be a complete record, not a sample
        if (data.problems?.length) problems.push(...data.problems);
        if (data.samples?.length)  samples.push(...data.samples);

        setProgress({ ...totals });

        if (!data.hasMore) break;
        cursor = data.nextCursor;
      }

      setResult({ ...totals, problems, samples, dryRun: isDryRun });

      if (isDryRun) {
        message.info(`Preview complete — ${totals.changed} member(s) would be updated`);
      } else {
        message.success(`${totals.changed} member(s) updated`);
      }
    } catch (e) {
      console.error(e);
      message.error('Repair failed: ' + e.message);
    } finally {
      setRunning(false);
    }
  };

  // ── CSV of everything this run touched ─────────────────────────────────────
  // One file, with a Result column separating members that changed from those
  // that couldn't be resolved — that's the record someone actually works from.
  const downloadCsv = () => {
    if (!result) return;

    const q  = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    // Long digit strings become 9.87E+09 if Excel reads them as numbers
    const ph = (v) => (v ? `="${String(v).replace(/["=]/g, '')}"` : '""');

    const headers = [
      'Result', 'Registration No', 'Name', 'Father Name', 'Phone', 'Village',
      'Yojna', 'DOB', 'Join Date', 'Age at Join',
      'Age Group (old)', 'Age Group (new)',
      'Pay Amount (old)', 'Pay Amount (new)',
      'Join Fees (unchanged)', 'Paid', 'Changed Fields / Reason',
    ];

    const changedRows = (result.samples || []).map(r => [
      q(result.dryRun ? 'Would change' : 'Changed'),
      q(r.regNo), q(r.name), q(r.fatherName), ph(r.phone), q(r.village),
      q(r.programName), q(r.dob), q(r.joinDate), r.age ?? '',
      q(r.from?.ageGroup), q(r.to?.ageGroup),
      r.from?.payAmount ?? '', r.to?.payAmount ?? '',
      r.joinFees ?? '', r.paid ?? '',
      q((r.fields || []).join(', ')),
    ]);

    const problemRows = (result.problems || []).map(r => [
      q('Not resolved'),
      q(r.regNo), q(r.name), q(r.fatherName), ph(r.phone), q(r.village),
      q(r.programName), q(r.dob), q(r.joinDate), r.age ?? '',
      q(r.currentAgeGroup), q(''),
      r.payAmount ?? '', '',
      r.joinFees ?? '', '',
      q(r.reason),
    ]);

    const csv = [
      headers.map(q).join(','),
      ...changedRows.map(r => r.join(',')),
      ...problemRows.map(r => r.join(',')),
    ].join('\r\n');

    // Explicit UTF-8 BOM bytes — Hindi names render as mojibake in Excel without it
    const bom     = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const encoded = new TextEncoder().encode(csv);
    const blob    = new Blob([bom, encoded], { type: 'text/csv;charset=utf-8;' });

    const progName = programId === 'all'
      ? 'all-yojna'
      : (programList.find(p => p.id === programId)?.name || programId)
          .replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `age-group-fix_${progName}_${result.dryRun ? 'preview' : 'applied'}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    message.success(`Exported ${changedRows.length + problemRows.length} row(s)`);
  };

  const confirmApply = () => {
    Modal.confirm({
      title: 'Apply these changes?',
      icon: <WarningOutlined style={{ color: '#faad14' }} />,
      width: 520,
      content: (
        <div style={{ fontSize: 13 }}>
          <p>
            This will update <strong>{result?.changed ?? 0} member(s)</strong> —
            age group and pay amount.
          </p>
          <p style={{ marginBottom: 0, color: '#16a34a' }}>
            Join fees, paid and pending amounts are left untouched, so no agent
            or program totals change.
          </p>
        </div>
      ),
      okText: 'Yes, apply',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: () => run(false),
    });
  };

  if (!isSuperAdmin) {
    return (
      <div style={{ padding: 24 }}>
        <Alert type="warning" showIcon
          message="Superadmin only"
          description="This tool changes fee amounts across many members, so it's restricted to superadmin." />
      </div>
    );
  }

  const sampleCols = [
    { title: 'Member', dataIndex: 'member', key: 'member', width: 200,
      render: (v) => <Text style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Age', dataIndex: 'age', key: 'age', width: 50, align: 'center',
      render: (v) => <Tag style={{ fontSize: 11 }}>{v}</Tag> },
    { title: 'Join Date', dataIndex: 'joinDate', key: 'joinDate', width: 90,
      render: (v) => <Text style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Age Group', key: 'ag', width: 160,
      render: (_, r) => (
        <span style={{ fontSize: 11 }}>
          <Text delete type="secondary">{r.from.ageGroup}</Text>
          {' → '}
          <Text strong style={{ color: '#16a34a' }}>{r.to.ageGroup}</Text>
        </span>
      ) },
    { title: 'Pay Amount', key: 'pa', width: 130,
      render: (_, r) => r.from.payAmount !== r.to.payAmount ? (
        <span style={{ fontSize: 11 }}>
          <Text delete type="secondary">₹{r.from.payAmount}</Text>
          {' → '}
          <Text strong style={{ color: '#16a34a' }}>₹{r.to.payAmount}</Text>
        </span>
      ) : <Text type="secondary" style={{ fontSize: 11 }}>₹{r.to.payAmount}</Text> },
    // Context only — this run never modifies join fees
    { title: 'Join Fees (unchanged)', key: 'jf', width: 140,
      render: (_, r) => (
        <Text type="secondary" style={{ fontSize: 11 }}>
          ₹{r.joinFees} · paid ₹{r.paid}
        </Text>
      ) },
  ];

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <ToolOutlined style={{ color: 'var(--primary)', marginRight: 8 }} />
          Fix Age Group &amp; Fees
        </Title>
        <Text type="secondary" style={{ fontSize: 13 }}>
          Recomputes each member&apos;s age group from their DOB and join date, and
          resets the pay amount from the matching period.
        </Text>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="What this changes"
        description={
          <div style={{ fontSize: 12 }}>
            <div>
              Updates <strong>age group</strong> and <strong>pay amount</strong> only.
            </div>
            <div style={{ marginTop: 4 }}>
              <strong>Join fees are not touched</strong> — members have already been billed
              and paid against them, so pending amounts, payment status and agent
              totals all stay exactly as they are.
            </div>
            <div style={{ marginTop: 4, color: '#6b7280' }}>
              Age is taken <strong>on the join date</strong> (joinDate − DOB), not today&apos;s
              age — the same rule Add Member uses. The period is then matched by join
              date within that age group.
            </div>
          </div>
        }
      />

      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={10}>
            <Text style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Yojna</Text>
            <Select
              value={programId}
              onChange={setProgramId}
              style={{ width: '100%' }}
              disabled={running}
              showSearch
              optionFilterProp="label"
              options={[
                { value: 'all', label: 'All Yojna' },
                ...programList.map(p => ({ value: p.id, label: p.name })),
              ]}
            />
          </Col>
          <Col xs={24} md={6}>
            <Text style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Mode</Text>
            <Space>
              <Switch checked={dryRun} onChange={setDryRun} disabled={running}
                checkedChildren="Preview" unCheckedChildren="Apply" />
              <Text style={{ fontSize: 12 }}>
                {dryRun ? 'Preview only — nothing is written' : 'Will write changes'}
              </Text>
            </Space>
          </Col>
          <Col xs={24} md={8} style={{ textAlign: 'right' }}>
            <Space>
              <Button icon={<EyeOutlined />} loading={running && dryRun}
                onClick={() => run(true)} disabled={running}>
                Preview Changes
              </Button>
              <Button
                type="primary" danger
                icon={<PlayCircleOutlined />}
                disabled={running || !result || result.changed === 0}
                onClick={confirmApply}
              >
                Apply {result?.changed ? `(${result.changed})` : ''}
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* ── Progress ─────────────────────────────────────────────────────── */}
      {running && progress && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Progress percent={100} status="active" showInfo={false} strokeColor="var(--primary)" />
          <Row gutter={12} style={{ marginTop: 8 }}>
            <Col span={6}><Statistic title="Scanned"    value={progress.scanned}    valueStyle={{ fontSize: 18 }} /></Col>
            <Col span={6}><Statistic title="In Yojna"   value={progress.considered} valueStyle={{ fontSize: 18 }} /></Col>
            <Col span={6}><Statistic title="To change"  value={progress.changed}    valueStyle={{ fontSize: 18, color: '#d97706' }} /></Col>
            <Col span={6}><Statistic title="Already OK" value={progress.alreadyOk}  valueStyle={{ fontSize: 18, color: '#16a34a' }} /></Col>
          </Row>
        </Card>
      )}

      {/* ── Result ───────────────────────────────────────────────────────── */}
      {result && !running && (
        <>
          <Alert
            type={result.dryRun ? 'warning' : 'success'}
            showIcon
            icon={result.dryRun ? <EyeOutlined /> : <CheckCircleOutlined />}
            style={{ marginBottom: 12 }}
            action={
              (result.changed > 0 || result.problemCount > 0) && (
                <Button size="small" icon={<DownloadOutlined />} onClick={downloadCsv}>
                  CSV
                </Button>
              )
            }
            message={result.dryRun
              ? `Preview — ${result.changed} member(s) would be updated`
              : `Done — ${result.changed} member(s) updated`}
            description={
              result.dryRun && result.changed > 0
                ? 'Review the table below, then press Apply to write these changes.'
                : !result.dryRun
                  ? 'Join fees and payment records were not affected, so no stats rebuild is needed.'
                  : 'Nothing to change — every member already matches their age group.'
            }
          />

          <Row gutter={12} style={{ marginBottom: 16 }}>
            <Col xs={12} md={5}><Card size="small"><Statistic title="Scanned"     value={result.scanned}      valueStyle={{ fontSize: 20 }} /></Card></Col>
            <Col xs={12} md={5}><Card size="small"><Statistic title="In Yojna"    value={result.considered}   valueStyle={{ fontSize: 20 }} /></Card></Col>
            <Col xs={12} md={5}><Card size="small"><Statistic title={result.dryRun ? 'Would change' : 'Changed'} value={result.changed} valueStyle={{ fontSize: 20, color: '#d97706' }} /></Card></Col>
            <Col xs={12} md={5}><Card size="small"><Statistic title="Already OK"  value={result.alreadyOk}    valueStyle={{ fontSize: 20, color: '#16a34a' }} /></Card></Col>
            <Col xs={24} md={4}><Card size="small"><Statistic title="Problems"    value={result.problemCount} valueStyle={{ fontSize: 20, color: result.problemCount ? '#dc2626' : '#9ca3af' }} /></Card></Col>
          </Row>


          {result.samples?.length > 0 && (
            <Card
              size="small"
              title={`Changes (${result.samples.length})`}
              extra={
                <Button size="small" icon={<DownloadOutlined />} onClick={downloadCsv}>
                  Download CSV
                </Button>
              }
              style={{ marginBottom: 16 }}
            >
              {/* Only the first 200 are rendered — the CSV has every row.
                  Painting thousands of rows here would lock the page up. */}
              <Table
                dataSource={result.samples.slice(0, 200)}
                columns={sampleCols}
                rowKey="id"
                size="small"
                pagination={false}
                scroll={{ x: 900, y: 320 }}
              />
              {result.samples.length > 200 && (
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                  Showing the first 200 of {result.samples.length}. Download the CSV for the full list.
                </Text>
              )}
            </Card>
          )}

          {result.problems?.length > 0 && (
            <Card size="small"
              title={<span style={{ color: '#dc2626' }}>
                <WarningOutlined /> Could not resolve ({result.problemCount})
              </span>}
              extra={
                <Button size="small" icon={<DownloadOutlined />} onClick={downloadCsv}>
                  Download CSV
                </Button>
              }>
              <Paragraph type="secondary" style={{ fontSize: 12 }}>
                These members were left untouched — fix the underlying data (DOB,
                join date, or the yojna&apos;s age groups/periods) and run again.
              </Paragraph>
              <Table
                dataSource={result.problems.slice(0, 200).map((p, i) => ({ ...p, key: p.id || i }))}
                columns={[
                  { title: 'Member', dataIndex: 'member', key: 'member', width: 220,
                    render: (v) => <Text style={{ fontSize: 12 }}>{v}</Text> },
                  { title: 'Reason', dataIndex: 'reason', key: 'reason',
                    render: (v) => <Text type="danger" style={{ fontSize: 12 }}>{v}</Text> },
                ]}
                size="small"
                pagination={false}
                scroll={{ y: 260 }}
              />
              {result.problems.length > 200 && (
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                  Showing the first 200 of {result.problems.length} — all are included in the CSV.
                </Text>
              )}
            </Card>
          )}
        </>
      )}

      {!result && !running && (
        <Empty
          description="Choose a yojna and press Preview Changes"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ marginTop: 40 }}
        />
      )}
    </div>
  );
}
