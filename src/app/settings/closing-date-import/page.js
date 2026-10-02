'use client'
// Closing Date Import
//
// Bulk-sets the closing date on already-closed members from the client's sheet
// (Application No / New Registration Number / Name / Mobile / Closing Date).
//
// Always previews first. Rows that can't be matched with confidence — unknown
// number, duplicate number, phone disagreeing with the member on file — are
// reported rather than guessed at, because writing a closing date onto the wrong
// member is much worse than leaving a row for someone to check by hand.

import { panelTheme } from '@/utils/trust/trustStore';
import React, { useState, useMemo } from 'react'
import { useAuth } from '@/components/Base/AuthProvider'
import {
  Card, Button, Upload, Table, Tag, Alert, Typography, Space, Progress,
  Statistic, Row, Col, Switch, message, Result, Modal, Tooltip, Empty, Select
} from 'antd'
import {
  InboxOutlined, PlayCircleOutlined, ThunderboltOutlined, DownloadOutlined,
  WarningOutlined, CheckCircleOutlined, FileExcelOutlined
} from '@ant-design/icons'
import * as XLSX from 'xlsx'
import dayjs from 'dayjs'
import { auth } from '../../../../lib/firbase-client'

const { Title, Text } = Typography
const { Dragger } = Upload

const C = {
  get primary() { return panelTheme().primary; }, success: '#16a34a', error: '#dc2626',
  warning: '#f59e0b', info: '#2563eb', get border() { return panelTheme().border; },
  muted: '#6b7280', light: '#9ca3af', get bg() { return panelTheme().background; },
}

const STATUS = {
  WILL_UPDATE:    { label: 'Will update',      color: 'blue',    good: true },
  UPDATED:        { label: 'Updated',          color: 'green',   good: true },
  UNCHANGED:      { label: 'Already correct',  color: 'default', good: true },
  NOT_FOUND:      { label: 'Member not found', color: 'red' },
  AMBIGUOUS:      { label: 'Duplicate number', color: 'volcano' },
  PHONE_MISMATCH: { label: 'Phone differs',    color: 'orange' },
  NOT_CLOSED:     { label: 'Not closed',       color: 'purple' },
  NO_DATE:        { label: 'No date in row',   color: 'default' },
  FAILED:         { label: 'Failed',           color: 'red' },
}

// Header names vary ("Closing Date", " Closing Date", "closing_date"…), so match
// loosely on a normalised form instead of demanding an exact string.
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

const FIELD_HINTS = {
  applicationNo:      ['applicationno', 'appno', 'oldregistrationnumber', 'oldregno', 'applicationnumber'],
  registrationNumber: ['newregistrationnumber', 'registrationnumber', 'regno', 'newregno'],
  name:               ['name', 'membername'],
  phone:              ['mobile', 'phone', 'mobileno', 'phoneno', 'contact'],
  closingDate:        ['closingdate', 'closeddate', 'newclosingdate', 'marriagedate', 'date'],
}

const ClosingDateImportPage = () => {
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'superadmin'

  const [fileName, setFileName]   = useState('')
  const [headers, setHeaders]     = useState([])
  const [rawRows, setRawRows]     = useState([])
  const [mapping, setMapping]     = useState({})
  const [results, setResults]     = useState([])
  const [counts, setCounts]       = useState(null)
  const [busy, setBusy]           = useState(false)
  const [applied, setApplied]     = useState(false)
  const [progress, setProgress]   = useState(0)
  const [allowPhoneMismatch, setAllowPhoneMismatch] = useState(false)
  const [allowNotClosed, setAllowNotClosed]         = useState(false)
  const [diagnostics, setDiagnostics]               = useState(null)

  // ── Read the workbook ─────────────────────────────────────────────────────
  const readFile = (file) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        // cellDates keeps real dates as Date objects instead of Excel serials
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, dateNF: 'yyyy-mm-dd' })
        if (!rows.length) { message.error('Sheet is empty'); return }

        const hdr = rows[0].map(h => String(h ?? '').trim())
        const body = rows.slice(1).filter(r => r.some(c => String(c ?? '').trim() !== ''))

        // Auto-map columns by fuzzy header name
        const map = {}
        Object.entries(FIELD_HINTS).forEach(([field, hints]) => {
          const idx = hdr.findIndex(h => hints.includes(norm(h)))
          if (idx >= 0) map[field] = idx
        })

        setFileName(file.name)
        setHeaders(hdr)
        setRawRows(body)
        setMapping(map)
        setResults([]); setCounts(null); setApplied(false)

        const missing = ['closingDate'].filter(f => map[f] === undefined)
        if (missing.length) message.warning('Could not find a closing date column — pick it below')
        else message.success(`${body.length} rows loaded from ${wb.SheetNames[0]}`)
      } catch (err) {
        console.error(err)
        message.error('Could not read this file: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
    return false   // never upload anywhere; parsed entirely in the browser
  }

  const mappedRows = useMemo(() => rawRows.map((r, i) => ({
    rowNo: i + 2,      // +2 = 1 for the header, 1 for 1-based rows, matches Excel
    applicationNo:      mapping.applicationNo      !== undefined ? r[mapping.applicationNo]      : '',
    registrationNumber: mapping.registrationNumber !== undefined ? r[mapping.registrationNumber] : '',
    name:               mapping.name               !== undefined ? r[mapping.name]               : '',
    phone:              mapping.phone              !== undefined ? r[mapping.phone]              : '',
    closingDate:        mapping.closingDate        !== undefined ? r[mapping.closingDate]        : '',
  })), [rawRows, mapping])

  // ── Run ───────────────────────────────────────────────────────────────────
  const run = async ({ dryRun }) => {
    if (!mappedRows.length) { message.warning('Load a file first'); return }
    if (mapping.closingDate === undefined) { message.error('Choose the closing date column'); return }
    // Phone alone is a valid way to match — it is the fallback when the client's
    // numbering scheme doesn't line up with this system's.
    if (mapping.registrationNumber === undefined
      && mapping.applicationNo === undefined
      && mapping.phone === undefined) {
      message.error('Map at least one of: registration number, application number, or mobile'); return
    }

    setBusy(true); setResults([]); setCounts(null); setProgress(0); setDiagnostics(null)
    const agg = {}
    const all = []
    const CHUNK = 300

    try {
      const token = await auth.currentUser?.getIdToken()
      for (let i = 0; i < mappedRows.length; i += CHUNK) {
        const slice = mappedRows.slice(i, i + CHUNK)
        const res = await fetch('/api/members/bulk-closing-date', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ rows: slice, dryRun, allowPhoneMismatch, allowNotClosed }),
        })
        const data = await res.json()
        if (!data.success) throw new Error(data.message)

        Object.entries(data.counts).forEach(([k, v]) => { agg[k] = (agg[k] || 0) + v })
        all.push(...data.results)
        if (data.diagnostics && !diagnostics) setDiagnostics(data.diagnostics)
        setCounts({ ...agg }); setResults([...all])
        setProgress(Math.min(100, Math.round(((i + slice.length) / mappedRows.length) * 100)))
      }

      if (dryRun) {
        message.success(`Preview done — ${agg.willUpdate || 0} row(s) would be updated`)
      } else {
        setApplied(true)
        message.success(`${agg.updated || 0} member(s) updated`)
      }
    } catch (e) {
      message.error((dryRun ? 'Preview' : 'Update') + ' failed: ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  const confirmApply = () => {
    Modal.confirm({
      title: 'Update closing dates?',
      width: 560,
      icon: <WarningOutlined style={{ color: C.warning }} />,
      content: (
        <div>
          <p><b>{counts?.willUpdate || 0}</b> member(s) will have their closing date changed.</p>
          <Alert
            type="warning" showIcon style={{ marginTop: 8 }}
            message="This changes who owes what"
            description="A member's closing date decides which closings they were charged for. After this, run Settings → Closing System Check to see and fix the knock-on effects."
          />
        </div>
      ),
      okText: 'Yes, update dates',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: () => run({ dryRun: false }),
    })
  }

  const downloadCsv = () => {
    if (!results.length) return
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const head = ['Excel Row', 'Status', 'Message', 'Application No', 'Sheet Reg No', 'Sheet Name', 'Sheet Phone',
                  'Matched By', 'Member ID', 'Member Name', 'Member Reg No', 'Member Phone', 'Program',
                  'Closed?', 'Current Date', 'New Date']
    const body = results.map(r => [
      r.rowNo, q(STATUS[r.status]?.label || r.status), q(r.message || ''),
      q(r.applicationNo), q(r.registrationNumber), q(r.sheetName), q(r.sheetPhone),
      q(r.matchedBy || ''), q(r.memberId || ''), q(r.memberName || ''), q(r.memberRegNo || ''),
      q(r.memberPhone || ''), q(r.programName || ''),
      q(r.memberClosed === undefined ? '' : r.memberClosed ? 'Yes' : 'No'),
      q(r.currentDate || ''), q(r.wantedDate || ''),
    ].join(','))
    const csv = [head.map(q).join(','), ...body].join('\r\n')
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), new TextEncoder().encode(csv)],
      { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = window.URL.createObjectURL(blob)
    a.download = `closing-date-import_${dayjs().format('YYYY-MM-DD_HHmm')}.csv`
    a.click()
    window.URL.revokeObjectURL(a.href)
  }

  if (user && !isSuperAdmin) {
    return (
      <div style={{ padding: 40, background: C.bg, minHeight: '100vh' }}>
        <Result status="403" title="Superadmin only"
          subTitle="This tool rewrites closing dates across many members." />
      </div>
    )
  }

  const columns = [
    { title: 'Row', dataIndex: 'rowNo', width: 60, align: 'center',
      render: v => <Text style={{ fontSize: 11, color: C.light }}>{v}</Text> },
    { title: 'Status', dataIndex: 'status', width: 140,
      render: (s, r) => (
        <Tooltip title={r.message || ''}>
          <Tag color={STATUS[s]?.color || 'default'} style={{ fontSize: 10, margin: 0 }}>
            {STATUS[s]?.label || s}
          </Tag>
        </Tooltip>
      ) },
    { title: 'Sheet says', key: 'sheet', width: 210,
      render: (_, r) => (
        <div style={{ fontSize: 11 }}>
          <div>{r.sheetName || '—'}</div>
          <div style={{ fontSize: 10, color: C.light }}>
            {r.registrationNumber || '—'}{r.applicationNo ? ` · old ${r.applicationNo}` : ''}
            {r.sheetPhone ? ` · ${r.sheetPhone}` : ''}
          </div>
        </div>
      ) },
    { title: 'Matched member', key: 'member', width: 210,
      render: (_, r) => r.memberId ? (
        <div style={{ fontSize: 11 }}>
          <div>{r.memberName}</div>
          <div style={{ fontSize: 10, color: C.light }}>
            {r.memberRegNo}{r.memberPhone ? ` · ${r.memberPhone}` : ''}
            {r.matchedBy === 'applicationNo' && <Tag style={{ fontSize: 8, marginLeft: 4 }}>via old no.</Tag>}
            {r.matchedBy === 'phone'         && <Tag color="gold" style={{ fontSize: 8, marginLeft: 4 }}>via phone</Tag>}
            {r.matchedBy === 'phone+name'    && <Tag color="gold" style={{ fontSize: 8, marginLeft: 4 }}>via phone+name</Tag>}
          </div>
        </div>
      ) : <Text style={{ fontSize: 11, color: C.light }}>—</Text> },
    { title: 'Closing date', key: 'date', width: 170,
      render: (_, r) => {
        if (!r.wantedDate) return <Text style={{ fontSize: 11, color: C.light }}>—</Text>
        const changed = r.currentDate !== r.wantedDate
        return (
          <span style={{ fontSize: 11 }}>
            <Text delete={changed} style={{ fontSize: 11, color: C.light }}>
              {r.currentDate || 'none'}
            </Text>
            {changed && <> → <Text strong style={{ fontSize: 11, color: C.primary }}>{r.wantedDate}</Text></>}
          </span>
        )
      } },
  ]

  const problems = results.filter(r => !STATUS[r.status]?.good)

  return (
    <div style={{ padding: 20, background: C.bg, minHeight: '100vh' }}>
      <Title level={3} style={{ marginBottom: 2 }}>Closing Date Import</Title>
      <Text type="secondary">
        Set the closing date on already-closed members from the client's Excel sheet.
      </Text>

      <Card size="small" style={{ marginTop: 14, borderRadius: 12, borderColor: C.border }}>
        <Dragger
          accept=".xlsx,.xls,.csv"
          beforeUpload={readFile}
          maxCount={1}
          showUploadList={false}
          disabled={busy}
          style={{ padding: 10, background: '#fff' }}
        >
          <p style={{ margin: 0 }}><InboxOutlined style={{ fontSize: 34, color: C.primary }} /></p>
          <p style={{ margin: '6px 0 0', fontSize: 13 }}>
            {fileName ? <><FileExcelOutlined /> {fileName} — {rawRows.length} rows</> : 'Click or drag the .xlsx here'}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: C.muted }}>
            Expected columns: Application No, New Registration Number, Name, Mobile, Closing Date.
            The file is read in your browser — nothing is uploaded.
          </p>
        </Dragger>

        {headers.length > 0 && (
          <>
            <Row gutter={[10, 10]} style={{ marginTop: 14 }}>
              {[
                ['registrationNumber', 'New Registration No'],
                ['applicationNo',      'Application No (old)'],
                ['name',               'Name'],
                ['phone',              'Mobile'],
                ['closingDate',        'Closing Date *'],
              ].map(([field, label]) => (
                <Col xs={12} md={8} lg={4} key={field}>
                  <Text style={{ fontSize: 11, display: 'block', marginBottom: 3 }}>{label}</Text>
                  <Select
                    size="small" style={{ width: '100%' }} allowClear
                    placeholder="— none —"
                    value={mapping[field]}
                    onChange={v => setMapping(m => ({ ...m, [field]: v }))}
                    options={headers.map((h, i) => ({ label: h || `Column ${i + 1}`, value: i }))}
                  />
                </Col>
              ))}
            </Row>

            <Space wrap size={14} style={{ marginTop: 14 }} align="end">
              <div>
                <Text style={{ fontSize: 11, display: 'block' }}>
                  Update even if phone differs{' '}
                  <Tooltip title="The sheet's mobile is used to confirm the match. Turning this on applies rows where it disagrees with the member on file.">
                    <WarningOutlined style={{ color: C.warning }} />
                  </Tooltip>
                </Text>
                <Switch size="small" checked={allowPhoneMismatch} onChange={setAllowPhoneMismatch} disabled={busy} />
              </div>
              <div>
                <Text style={{ fontSize: 11, display: 'block' }}>
                  Include members not marked closed{' '}
                  <Tooltip title="Also sets member_closed = true on them.">
                    <WarningOutlined style={{ color: C.warning }} />
                  </Tooltip>
                </Text>
                <Switch size="small" checked={allowNotClosed} onChange={setAllowNotClosed} disabled={busy} />
              </div>

              <Button
                type="primary" icon={<PlayCircleOutlined />}
                loading={busy} onClick={() => run({ dryRun: true })}
                style={{ background: `linear-gradient(135deg, ${C.primary}, var(--secondary))`, border: 'none' }}
              >
                Preview
              </Button>
              <Button
                danger icon={<ThunderboltOutlined />}
                disabled={busy || !counts || !(counts.willUpdate > 0)}
                onClick={confirmApply}
              >
                Apply {counts?.willUpdate ? `(${counts.willUpdate})` : ''}
              </Button>
              <Button icon={<DownloadOutlined />} disabled={!results.length} onClick={downloadCsv}>
                CSV
              </Button>
            </Space>
          </>
        )}

        {busy && <Progress percent={progress} status="active" strokeColor={C.primary} style={{ marginTop: 12 }} />}
      </Card>

      {counts && (
        <Row gutter={[10, 10]} style={{ marginTop: 14 }}>
          {[
            { t: applied ? 'Updated' : 'Will update', v: applied ? counts.updated || 0 : counts.willUpdate || 0, c: C.success },
            { t: 'Already correct', v: counts.unchanged     || 0, c: C.muted },
            { t: 'Not found',       v: counts.notFound      || 0, c: C.error },
            { t: 'Duplicate no.',   v: counts.ambiguous     || 0, c: C.warning },
            { t: 'Phone differs',   v: counts.phoneMismatch || 0, c: C.warning },
            { t: 'Not closed',      v: counts.notClosed     || 0, c: '#722ed1' },
            { t: 'No date',         v: counts.noDate        || 0, c: C.light },
          ].map(s => (
            <Col xs={12} md={6} lg={3} key={s.t}>
              <Card size="small" style={{ borderRadius: 10, borderColor: C.border }} bodyStyle={{ padding: '8px 12px' }}>
                <Statistic title={<span style={{ fontSize: 10 }}>{s.t}</span>} value={s.v}
                  valueStyle={{ fontSize: 18, color: s.c, fontWeight: 700 }} />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {/* Why didn't these match? — show what the database actually holds */}
      {diagnostics && !diagnostics.error && (counts?.notFound > 0) && (
        <Card
          size="small"
          title={<span style={{ fontSize: 13 }}>Why didn't these rows match?</span>}
          style={{ marginTop: 12, borderRadius: 12, borderColor: C.warning }}
        >
          <Text style={{ fontSize: 11, color: C.muted }}>{diagnostics.note}</Text>

          <div style={{ marginTop: 10 }}>
            <Text strong style={{ fontSize: 12 }}>Identifier fields actually in use</Text>
            <div style={{ marginTop: 4 }}>
              {Object.keys(diagnostics.fieldsInUse || {}).length === 0
                ? <Tag color="red" style={{ fontSize: 10 }}>none of the known identifier fields are populated</Tag>
                : Object.entries(diagnostics.fieldsInUse).map(([f, n]) => (
                    <Tag key={f} color="blue" style={{ fontSize: 10 }}>{f} ({n}/5)</Tag>
                  ))}
            </div>
          </div>

          <Row gutter={12} style={{ marginTop: 12 }}>
            <Col xs={24} md={12}>
              <Text strong style={{ fontSize: 12 }}>Your sheet has</Text>
              {(diagnostics.sheetExamples || []).map((s, i) => (
                <div key={i} style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                  reg <b>{String(s.registrationNumber || '—')}</b> · old <b>{String(s.applicationNo || '—')}</b> · ph {String(s.phone || '—')}
                </div>
              ))}
            </Col>
            <Col xs={24} md={12}>
              <Text strong style={{ fontSize: 12 }}>The database has</Text>
              {(diagnostics.samples || []).map((s, i) => (
                <div key={i} style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                  {s.name || '—'} · ph {s.phone || '—'}
                  {Object.entries(s.identifiers).map(([f, v]) => (
                    <span key={f}> · {f}=<b>{v}</b></span>
                  ))}
                  {Object.keys(s.identifiers).length === 0 && <span style={{ color: C.error }}> · no identifier fields</span>}
                </div>
              ))}
            </Col>
          </Row>

          <Alert
            type="info" showIcon style={{ marginTop: 10, borderRadius: 8 }}
            message={<span style={{ fontSize: 11 }}>
              Compare the two columns above. If the sheet's numbers don't appear in any database field,
              these members were never imported under those numbers — match on <b>Mobile</b> instead by
              clearing the registration/application column mapping, or ask the client for a sheet
              carrying the numbers this system uses.
            </span>}
          />
        </Card>
      )}

      {applied && (
        <Alert
          type="warning" showIcon style={{ marginTop: 12, borderRadius: 10 }}
          message="Dates updated — now check the knock-on effects"
          description="A member's closing date decides which closings they should have been charged for. Run Settings → Closing System Check (with 'remove bad event charges' on) to find members now holding charges dated after their closing."
        />
      )}

      {results.length > 0 && (
        <Card
          size="small"
          title={<span>Rows ({results.length}){problems.length > 0 && <Text style={{ fontSize: 11, color: C.error }}> · {problems.length} need attention</Text>}</span>}
          style={{ marginTop: 12, borderRadius: 12, borderColor: C.border }}
          bodyStyle={{ padding: 0 }}
        >
          <Table
            columns={columns}
            dataSource={results}
            rowKey={r => `${r.rowNo}-${r.memberId || r.registrationNumber || Math.random()}`}
            size="small"
            scroll={{ x: 800 }}
            pagination={{ pageSize: 25, size: 'small', showSizeChanger: true, pageSizeOptions: ['25', '50', '100'] }}
            rowClassName={r => STATUS[r.status]?.good ? '' : 'cdi-problem'}
          />
        </Card>
      )}

      <style jsx global>{`.cdi-problem td { background: #fffbeb !important; }`}</style>
    </div>
  )
}

export default ClosingDateImportPage
