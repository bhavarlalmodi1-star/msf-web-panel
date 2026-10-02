"use client"
import { panelTheme } from '@/utils/trust/trustStore';
import React, { useState, useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import {
  Button, Card, Table, Space, Input, Tag, Avatar,
  message, Select, Row, Col, Statistic, Tabs, Modal,
  Tooltip, Badge, Descriptions, List, Typography, Spin,
  DatePicker
} from 'antd'
import {
  SearchOutlined, EyeOutlined, UserOutlined,
  PlusOutlined, ArrowLeftOutlined, CloseCircleOutlined,
  TeamOutlined, CalendarOutlined, FileTextOutlined,
  RollbackOutlined, ExclamationCircleOutlined,
  HeartFilled, ClockCircleOutlined, CheckCircleOutlined,
  InfoCircleOutlined, WarningOutlined, EditOutlined,
  DownloadOutlined, SyncOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { BlobProvider } from '@react-pdf/renderer'
import ClosedMembersPdf from './components/ClosedMembersPdf'
import {
  collection, query, orderBy, limit, getDocs
} from 'firebase/firestore'
import { db, auth } from '../../../../lib/firbase-client'
import { useAuth } from '@/components/Base/AuthProvider'
import MemberDetailDrawer from '@/app/members/components/MemberDetailsView'
import MarriageClosingDrawer from './components/MarriageClosingDrawer'
import ClosingRasidGenerator from './components/ClosingRasidGenerator'
import ClosingFormDrawer from './components/ClosingFormDrawer'
import {
  fetchClosedPage, getClosedStats, fetchAllClosedForExport
} from './components/closingFirestore'
import { paymentApi } from '@/utils/api'

dayjs.extend(relativeTime)

const { Option }  = Select
const { confirm } = Modal

// ── Proxy invitation card through API so Storage rules can't block it ──────
const viewInvitationCard = async (firebaseUrl) => {
  if (!firebaseUrl) return
  try {
    const token = await auth.currentUser?.getIdToken()
    const res = await fetch(
      `/api/closing-card/view?fileUrl=${encodeURIComponent(firebaseUrl)}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    )
    if (!res.ok) throw new Error(`${res.status}`)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    window.open(blobUrl, '_blank')
    setTimeout(() => URL.revokeObjectURL(blobUrl), 120_000)
  } catch {
    // Fallback: open Firebase URL directly
    window.open(firebaseUrl, '_blank')
  }
}
const { Text }    = Typography

const colors = {
  get primary() { return panelTheme().primary; }, get secondary() { return panelTheme().secondary; },
  success:    '#16a34a', error: '#dc2626',
  info:       '#2563eb', warning: '#f59e0b',
  get background() { return panelTheme().background; }, surface: '#ffffff',
  get border() { return panelTheme().pink100; }, muted: '#9ca3af', fg: '#111827',
}
const gradPrimary = `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`

// ── Helper: auto-download PDF when blob is ready ─────────────────────────────
const PdfAutoDownloader = ({ pdfMeta, onDone }) => {
  const [generating, setGenerating] = useState(false)
  const firedRef = useRef(false)
  useEffect(() => {
    if (pdfMeta && !generating) setGenerating(true)
  }, [pdfMeta, generating])
  useEffect(() => {
    if (pdfMeta) firedRef.current = false
  }, [pdfMeta])

  if (!pdfMeta) return null
  return (
    <>
      {generating && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000, background: colors.primary, color: '#fff', padding: '10px 20px', borderRadius: 8, fontWeight: 'bold', fontSize: 14, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          Generating PDF...
        </div>
      )}
      <BlobProvider document={<ClosedMembersPdf members={pdfMeta.data} filters={pdfMeta.filters} programList={pdfMeta.programList} agentList={pdfMeta.agentList} closingGroups={pdfMeta.closingGroups} />}>
        {({ blob, url, loading, error }) => {
          if (error) {
            if (!firedRef.current) { firedRef.current = true; setTimeout(() => { message.error('PDF error: ' + (error.message || error)); onDone() }, 0) }
            return null
          }
          if (!loading && blob && generating && !firedRef.current) {
            firedRef.current = true
            setTimeout(() => {
              const a = document.createElement('a')
              a.href = url
              a.download = `closed_members_${dayjs().format('YYYY-MM-DD')}.pdf`
              document.body.appendChild(a)
              a.click()
              setTimeout(() => {
                document.body.removeChild(a)
                URL.revokeObjectURL(url)
              }, 2000)
              message.success(`Downloaded ${pdfMeta.data.length} members`)
              onDone()
            }, 0)
          }
          return null
        }}
      </BlobProvider>
    </>
  )
}

// ── Closing Group Detail Modal ─────────────────────────────────────────────────
const ClosingGroupModal = ({ group, visible, onClose, programList }) => {
  if (!group) return null
  const program = programList.find(p => p.id === group.programId)
  const [groupMembers, setGroupMembers] = useState([])
  const [loadingMembers, setLoadingMembers] = useState(false)

  useEffect(() => {
    if (!visible || !group) return
    const fetchMembers = async () => {
      setLoadingMembers(true)
      try {
        const ids = group.closedMemberIds || group.paymentMemberIds || []
        if (!ids.length) { setGroupMembers([]); return }
        const batchSize = 10
        const results = []
        for (let i = 0; i < ids.length; i += batchSize) {
          const batch = ids.slice(i, i + batchSize)
          const snap = await getDocs(query(
            collection(db, 'members'),
            where('__name__', 'in', batch)
          ))
          snap.forEach(d => {
            if (d.exists) {
              const data = d.data()
              const breakdown = group.paymentBreakdown?.[d.id] || {}
              results.push({
                id: d.id,
                memberName: data.displayName || data.name || 'Unknown',
                registrationNumber: data.registrationNumber || '',
                phone: data.phone || '',
                photoURL: data.photoURL || '',
                marriageDate: data.closed_date || '',
                closed_invitation_url: data.closed_invitation_url || '',
                amount: breakdown.amount || 0,
                count: breakdown.count || 0,
                note: data.closed_note || '',
              })
            }
          })
        }
        setGroupMembers(results)
      } catch (e) {
        console.error('Error fetching group members:', e)
        setGroupMembers([])
      } finally {
        setLoadingMembers(false)
      }
    }
    fetchMembers()
  }, [visible, group])

  return (
    <Modal open={visible} onCancel={onClose} footer={null} width={720}
      title={<Space><HeartFilled style={{ color: colors.primary }} /><span style={{ fontWeight: 700 }}>Closing Group Detail</span><Tag color={group.status === 'reversed' ? 'red' : 'green'}>{group.status === 'reversed' ? 'Reversed' : 'Active'}</Tag></Space>}>
      <Descriptions size="small" bordered column={2} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Group ID"><Text copyable style={{ fontSize: 11 }}>{group.id}</Text></Descriptions.Item>
        <Descriptions.Item label="Program">{program?.name || group.programId}</Descriptions.Item>
        <Descriptions.Item label="Closed By">{group.closedByName || '—'}</Descriptions.Item>
        <Descriptions.Item label="Closed At">{group.closedDate ? dayjs(group.closedDate).format('DD/MM/YYYY HH:mm') : '—'}</Descriptions.Item>
        <Descriptions.Item label="Member Count"><Tag color="blue">{group.memberCount}</Tag></Descriptions.Item>
        <Descriptions.Item label="Total Amount"><span style={{ fontWeight: 700, color: colors.success }}>₹{group.totalAmount?.toLocaleString()}</span></Descriptions.Item>
        {group.status === 'reversed' && (
          <>
            <Descriptions.Item label="Reversed By">{group.reversedByName || '—'}</Descriptions.Item>
            <Descriptions.Item label="Reversal Reason">{group.reversalReason || '—'}</Descriptions.Item>
          </>
        )}
      </Descriptions>
      <div style={{ fontWeight: 700, marginBottom: 8, color: colors.fg }}>Members ({groupMembers.length})</div>
      <div style={{ maxHeight: 360, overflowY: 'auto' }}>
        {loadingMembers ? (
          <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
        ) : (
          <List size="small" dataSource={groupMembers}
            renderItem={m => (
              <List.Item extra={<Space>{m.closed_invitation_url ? <Button size="small" type="link" onClick={() => viewInvitationCard(m.closed_invitation_url)}>View Card</Button> : null}<Tag color="blue">₹{m.amount}</Tag></Space>}>
                <List.Item.Meta
                  avatar={<Avatar src={m.photoURL} icon={<UserOutlined />} size={30} style={{ background: colors.primary + '30', color: colors.primary }} />}
                  title={<Space size={4}><span style={{ fontWeight: 600, fontSize: 13 }}>{m.memberName}</span><Tag style={{ fontSize: 10 }}>{m.registrationNumber}</Tag></Space>}
                  description={<Space size={4} style={{ fontSize: 11, color: colors.muted }}>{m.phone && <span>{m.phone}</span>}{m.marriageDate && <span>• {dayjs(m.marriageDate).format('DD/MM/YYYY')}</span>}{m.note && <span>• {m.note}</span>}</Space>}
                />
              </List.Item>
            )} />
        )}
      </div>
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
const ClosingMembersPage = () => {
  const [selectedMember,       setSelectedMember]       = useState(null)
  const [detailDrawerVisible,  setDetailDrawerVisible]  = useState(false)
  const [closingFormVisible,   setClosingFormVisible]   = useState(false)
  const [activeTab,            setActiveTab]            = useState('closed')
  const [closingGroups,        setClosingGroups]        = useState([])
  const [groupsLoading,        setGroupsLoading]        = useState(false)
  const [reversingId,          setReversingId]          = useState(null)
  const [selectedGroup,        setSelectedGroup]        = useState(null)
  const [groupModalVisible,    setGroupModalVisible]    = useState(false)
  const [rasidGroup,           setRasidGroup]           = useState(null)
  const [rasidModalVisible,    setRasidModalVisible]    = useState(false)
  const [searchText,           setSearchText]           = useState('')
  const [programFilter,        setProgramFilter]        = useState('all')
  const [groupProgramFilter,   setGroupProgramFilter]   = useState('all')
  const [resetting,            setResetting]            = useState(false)
  const [editDateMember,       setEditDateMember]       = useState(null)
  const [editDateValue,        setEditDateValue]        = useState(null)
  const [editingDate,          setEditingDate]          = useState(false)
  const [markingActiveId,      setMarkingActiveId]      = useState(null)
  const [agentFilter,          setAgentFilter]          = useState('all')
  const [groupFilter,          setGroupFilter]          = useState('all')
  const [dateRange,            setDateRange]            = useState(null)
  const [pdfMeta,              setPdfMeta]              = useState(null)

  // ── Closed-members table (server-side pagination, 100 / page) ─────────────
  const PAGE = 100
  const [closedRows,      setClosedRows]      = useState([])
  const [closedTotal,     setClosedTotal]     = useState(0)
  const [closedCurrent,   setClosedCurrent]   = useState(1)
  const [closedLoading,   setClosedLoading]   = useState(false)
  const cursorsRef        = useRef({})       // page index -> last doc snapshot
  const filtersKeyRef     = useRef('')
  const [exportRows,      setExportRows]     = useState(null)
  const [exportLoading,   setExportLoading]  = useState(false)
  const [stats,           setStats]           = useState({ totalActive: 0, activeCount: 0, closedCount: 0, inviteCount: null })

  const { user: authUser } = useAuth()
  const isSuperAdmin = authUser?.role === 'superadmin'
  const programList = useSelector((s) => s.data.programList || [])
  const agentList   = useSelector((s) => s.data.agentList   || [])
  const currentUser = auth.currentUser

  const activeFilters = {
    programId:      programFilter,
    agentId:        agentFilter,
    closingGroupId: groupFilter,
    fromDate:       dateRange?.[0] || null,
    toDate:         dateRange?.[1] || null,
    search:         searchText,
  }

  const filtersKey = JSON.stringify({
    p: programFilter, a: agentFilter, g: groupFilter,
    f: dateRange?.[0]?.format('YYYY-MM-DD') || '',
    t: dateRange?.[1]?.format('YYYY-MM-DD') || '',
    s: searchText.trim().toLowerCase(),
  })

  const loadClosedStats = async () => {
    try { setStats(await getClosedStats()) } catch (e) { console.error(e) }
  }

  // ── Backfill closed_date from closedStatus (and vice versa) ────────────────
  // Members carrying their date only in closedStatus are invisible to the date
  // range filter, because a Firestore range filter excludes documents that lack
  // the field entirely. This copies the date across so they become queryable.
  const [syncingDates, setSyncingDates] = useState(false)

  // सदस्यता समापन पत्र — settlement form for one closed member
  const [formMember, setFormMember] = useState(null)

  const handleSyncDates = async () => {
    setSyncingDates(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      let cursor = null, top = 0, status = 0, noDate = 0, scanned = 0, guard = 0
      do {
        const res = await fetch('/api/closing/sync-dates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ cursor, dryRun: false, batchSize: 300 }),
        })
        const data = await res.json()
        if (!data.success) throw new Error(data.message)
        scanned += data.scanned; top += data.filledTopLevel
        status += data.filledStatus; noDate += data.noDate
        cursor = data.nextCursor
        guard++
      } while (cursor && guard < 200)

      if (top || status) {
        message.success(`Synced ${top} date(s) onto the member record, ${status} into closing history (${scanned} checked)`)
      } else {
        message.info(`All ${scanned} closed members already have their date in both places`)
      }
      if (noDate) {
        message.warning(`${noDate} closed member(s) have no date anywhere — set those by hand`)
      }
      await Promise.all([loadClosedStats(), loadClosedPage(closedCurrent)])
    } catch (e) {
      message.error('Sync failed: ' + e.message)
    } finally {
      setSyncingDates(false)
    }
  }

  const fetchClosedPageN = async (n, withTotal = true) => {
    const lastDoc = cursorsRef.current[n] || null
    const res = await fetchClosedPage(activeFilters, lastDoc, PAGE, withTotal)
    cursorsRef.current[n + 1] = res.lastDoc
    return res
  }

  const loadClosedPage = async (targetPage) => {
    if (filtersKey !== filtersKeyRef.current) { filtersKeyRef.current = filtersKey; cursorsRef.current = {} }
    setClosedLoading(true)
    try {
      let cachedPage = 1
      while (cachedPage < targetPage) {
        if (!cursorsRef.current[cachedPage + 1]) {
          const res = await fetchClosedPageN(cachedPage, false)
          if (!res.hasNextPage) {
            setClosedRows(res.rows); setClosedTotal(res.total ?? closedTotal); setClosedCurrent(cachedPage)
            return
          }
        }
        cachedPage += 1
      }
      if (!cursorsRef.current[targetPage + 1]) {
        const res = await fetchClosedPageN(targetPage)
        setClosedRows(res.rows); setClosedTotal(res.total ?? closedTotal); setClosedCurrent(targetPage)
      } else {
        const res = await fetchClosedPage(activeFilters, cursorsRef.current[targetPage] || null, PAGE)
        setClosedRows(res.rows); setClosedTotal(res.total ?? closedTotal); setClosedCurrent(targetPage)
      }
    } catch (e) {
      console.error(e); message.error('Failed to load closed members')
    } finally {
      setClosedLoading(false)
    }
  }

  // ── Fetch closing group batches (history / group filter) ───────────────────
  const fetchClosingGroups = async () => {
    setGroupsLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'groupClosings'), orderBy('closedAt', 'desc'), limit(100)))
      setClosingGroups(snap.docs.map(d => ({
        id: d.id, key: d.id, ...d.data(),
        closedDate: d.data().closedDate || (d.data().closedAt?.toDate?.()?.toISOString()) || null,
      })))
    } catch (e) { console.error(e); message.error('Failed to load closing history') }
    finally { setGroupsLoading(false) }
  }

  // Initial load
  useEffect(() => { loadClosedStats(); loadClosedPage(1); fetchClosingGroups() }, [])
  // Refresh when filters change (debounced so typing search doesn't fire per key)
  const filterFirstRun = useRef(true)
  useEffect(() => {
    if (filterFirstRun.current) { filterFirstRun.current = false; return }
    const t = setTimeout(() => {
      setClosedCurrent(1)
      setExportRows(null)
      loadClosedPage(1)
      loadClosedStats()
    }, 450)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programFilter, agentFilter, groupFilter, dateRange, searchText])
  useEffect(() => { if (activeTab === 'history') fetchClosingGroups() }, [activeTab])

  // ── Derived lists ──────────────────────────────────────────────────────────
  const filteredGroups = closingGroups.filter(g => groupProgramFilter === 'all' || g.programId === groupProgramFilter)

  // ── Reverse ────────────────────────────────────────────────────────────────
  const handleReverseGroup = (group) => {
    let reason = ''
    confirm({
      title: 'Reverse Closing Group?',
      icon: <ExclamationCircleOutlined style={{ color: colors.error }} />,
      content: (
        <div>
          <p style={{ marginBottom: 12 }}>Un-close <strong>{group.memberCount} member(s)</strong> and reverse all counters for group:</p>
          <Tag style={{ marginBottom: 12, fontFamily: 'monospace', fontSize: 11 }}>{group.id}</Tag>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Reason:</div>
          <Input.TextArea rows={2} placeholder="Enter reason…" onChange={e => { reason = e.target.value }} style={{ borderColor: colors.primary }} />
        </div>
      ),
      okText: 'Yes, Reverse', okType: 'danger', cancelText: 'Cancel',
      onOk: async () => {
        setReversingId(group.id)
        try {
          const res = await paymentApi.reverseClosing({
            closingGroupId: group.id, programId: group.programId,
            reason: reason || 'No reason provided',
            reversedBy: currentUser?.uid, reversedByName: currentUser?.displayName || 'Unknown',
          })
          if (res?.success) {
            message.success(`Reversed! ${res.summary?.membersRestored} members restored.`)
            await Promise.all([loadClosedStats(), loadClosedPage(closedCurrent), fetchClosingGroups()])
          } else { message.error(res?.message || 'Reversal failed') }
        } catch (e) { console.error(e); message.error('Reversal request failed') }
        finally { setReversingId(null) }
      }
    })
  }

  const handleViewMember       = (m) => { setSelectedMember(m); setDetailDrawerVisible(true) }
  const handleClosingComplete  = async () => {
    await Promise.all([loadClosedStats(), loadClosedPage(closedCurrent), fetchClosingGroups()])
  }

  const handleResetClosing = () => {
    confirm({
      title: 'Reset All Closing Data?',
      icon: <ExclamationCircleOutlined style={{ color: colors.error }} />,
      content: (
        <div>
          <p style={{ color: colors.error, fontWeight: 700, marginBottom: 8 }}>
            ⚠️ This will permanently delete ALL closing data:
          </p>
          <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>All <strong>closing_payment</strong> documents</li>
            <li>All <strong>groupClosings</strong> (batches)</li>
            <li>All members' <strong>closing fields</strong> (amounts, counts, status)</li>
            <li>All agents' <strong>closing stats</strong></li>
            <li>Program &amp; organization <strong>closing counters</strong></li>
          </ul>
          <p style={{ color: colors.warning, marginTop: 8 }}>This action cannot be undone!</p>
        </div>
      ),
      okText: 'Yes, Reset Everything',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        setResetting(true)
        try {
          const data = await paymentApi.resetClosing()
          if (data.success) {
            message.success(`Reset complete! ${data.summary?.closingPayments || 0} payments, ${data.summary?.groupClosings || 0} groups deleted, ${data.summary?.members || 0} members reset.`)
            await handleClosingComplete()
          } else {
            message.error(data.message || 'Reset failed')
          }
        } catch (e) {
          console.error(e)
          message.error('Reset request failed')
        } finally {
          setResetting(false)
        }
      },
    })
  }

  // ── Edit closing date (no payment) ─────────────────────────────────────────
  const openEditDate = (member) => {
    setEditDateValue(member.closed_date ? dayjs(member.closed_date) : dayjs())
    setEditDateMember(member)
  }

  const handleSaveEditDate = async () => {
    if (!editDateMember || !editDateValue) return
    setEditingDate(true)
    try {
      const res = await paymentApi.updateClosingDate({
        memberId: editDateMember.id,
        closed_date: editDateValue.toISOString(),
      })
      if (res?.success) {
        message.success('Closing date updated')
        setEditDateMember(null)
        await handleClosingComplete()
      } else {
        message.error(res?.message || 'Failed to update closing date')
      }
    } catch (e) {
      console.error(e)
      message.error('Update failed')
    } finally {
      setEditingDate(false)
    }
  }

  // ── Mark already-closed member active again (status only, no payment) ──────
  const handleMarkActive = (member) => {
    confirm({
      title: 'Mark member active?',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>Un-close <strong>{member.displayName}</strong> ({member.registrationNumber || '—'})?</p>
          <p style={{ color: colors.warning, fontSize: 12, marginTop: 8 }}>
            Only the status changes — closing payment records and totals are left untouched.
          </p>
        </div>
      ),
      okText: 'Yes, Mark Active', okType: 'primary', cancelText: 'Cancel',
      onOk: async () => {
        setMarkingActiveId(member.id)
        try {
          const res = await paymentApi.markClosingMemberActive({ memberId: member.id })
          if (res?.success) {
            message.success('Member marked active')
            await handleClosingComplete()
          } else {
            message.error(res?.message || 'Failed to mark active')
          }
        } catch (e) {
          console.error(e)
          message.error('Request failed')
        } finally {
          setMarkingActiveId(null)
        }
      },
    })
  }

  // ── Export helpers: CSV + PDF ──────────────────────────────────────────────
  const programName = (id) => programList?.find(p => p.id === id)?.name || id || '—'
  const agentName = (id) => agentList?.find(a => a.id === id)?.name || '—'
  const groupName = (id) => {
    if (!id) return '—'
    const g = closingGroups.find(x => x.id === id)
    return g?.groupName || g?.id?.slice(-6) || id.slice(-6)
  }

  const csvValue = (v) => {
    const s = String(v ?? '')
    const n = s.replace(/"/g, '""')
    return /[",\n]/.test(n) ? `"${n}"` : n
  }

  const fmtClosedDate = (raw) => {
    if (!raw) return ''
    const d = raw?.toDate ? dayjs(raw.toDate()) : dayjs(raw)
    return d.isValid() ? d.format('DD-MM-YYYY') : String(raw)
  }

  // A member's closing date, checked everywhere it can live — the same order
  // api/closed_payment_entry uses.
  //
  // The table used to read only the top-level `closed_date`, so any member whose
  // date sits in closedStatus[] (closed before the top-level field was written,
  // or closed through a path that only filled the array) showed "N/A". It also
  // passed Firestore Timestamps straight to dayjs(), which yields Invalid Date
  // rather than the real day — that is the "wrong date" half of the problem.
  const resolveClosedDate = (m) => {
    if (!m) return null
    const prog = m.member_closed_program || m.programId || null
    for (const cs of (m.closedStatus || [])) {
      if (prog && cs?.programId !== prog) continue
      if (cs?.closed_date) {
        const d = cs.closed_date?.toDate ? dayjs(cs.closed_date.toDate()) : dayjs(cs.closed_date)
        if (d.isValid()) return d
      }
    }
    // Any programme's entry, then the top-level fields.
    for (const cs of (m.closedStatus || [])) {
      if (!cs?.closed_date) continue
      const d = cs.closed_date?.toDate ? dayjs(cs.closed_date.toDate()) : dayjs(cs.closed_date)
      if (d.isValid()) return d
    }
    for (const raw of [m.closed_date, m.marriageDate, m.member_closed_at]) {
      if (!raw) continue
      const d = raw?.toDate ? dayjs(raw.toDate()) : dayjs(raw)
      if (d.isValid()) return d
    }
    return null
  }

  const closedDateText = (m) => {
    const d = resolveClosedDate(m)
    return d ? d.format('DD-MM-YYYY') : ''
  }

  // Fetch the COMPLETE filtered set from the backend (ignores table pagination).
  // Result is cached in exportRows so repeat CSV/PDF clicks don't re-query.
  const prepareExportRows = async () => {
    if (exportRows) return exportRows
    if (exportLoading) return null
    setExportLoading(true)
    try {
      const rows = await fetchAllClosedForExport(activeFilters)
      rows.forEach((r, i) => { r.srNo = i + 1 })
      setExportRows(rows)
      return rows
    } catch (e) {
      console.error(e)
      message.error('Failed to fetch all members for export')
      return null
    } finally {
      setExportLoading(false)
    }
  }

  const exportClosingsToCSV = async () => {
    if (exportLoading) return
    const rows = await prepareExportRows()
    if (!rows || !rows.length) { message.warning('No members to export'); return }
    const headers = ['Sr. No', 'Registration Number', 'Name', 'Father Name', 'Phone', 'Yojana', 'Group', 'Closing Date', 'Agent', 'Invitation Card']
    const csvRows = rows.map((m, i) => [
      m.srNo ?? i + 1,
      m.registrationNumber || '',
      m.displayName || '',
      m.fatherName || '',
      m.phone || '',
      programName(m.member_closed_program || m.programId),
      groupName(m.closingGroupId),
      // Same resolution as the table, so the CSV never says "blank" for a member
      // whose date is only in their closing history.
      closedDateText(m),
      m.agentId ? `${agentName(m.agentId)}${m.agent_code ? ` (${m.agent_code})` : ''}` : '',
      m.closed_invitation_url ? 'Yes' : 'No',
    ])
    const all = [headers, ...csvRows]
    const csv = '\uFEFF' + all.map(r => r.map(csvValue).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `closed_members_${dayjs().format('YYYY-MM-DD')}.csv`
    a.click()
    setTimeout(() => { URL.revokeObjectURL(url); message.success(`Downloaded ${rows.length} members`) }, 2000)
  }

  const handleExportPdf = async () => {
    if (exportLoading) return
    const rows = await prepareExportRows()
    if (!rows || !rows.length) { message.warning('No members to export'); return }
    setPdfMeta({
      data: rows,
      programList,
      agentList,
      closingGroups,
      filters: {
        programName: programFilter === 'all' ? undefined : programName(programFilter),
        agentName: agentFilter === 'all' ? undefined : agentName(agentFilter),
        groupName: groupFilter === 'all' ? undefined : groupName(groupFilter),
        fromDate: dateRange?.[0]?.format('DD-MM-YYYY'),
        toDate: dateRange?.[1]?.format('DD-MM-YYYY'),
      },
    })
  }

  // ── Columns: Closed Members ────────────────────────────────────────────────
  const memberColumns = [
    { title: 'Reg. No.', dataIndex: 'registrationNumber', key: 'regNo', width: 120, render: t => <Tag color="blue">{t}</Tag> },
    {
      title: 'Member', key: 'name', width: 220,
      render: (_, r) => <Space><Avatar src={r.photoURL} icon={<UserOutlined />} size={36} /><div><div style={{ fontWeight: 600 }}>{r.displayName}</div><div style={{ fontSize: 11, color: '#666' }}>{r.fatherName}</div></div></Space>
    },
    { title: 'Phone', dataIndex: 'phone', key: 'phone', width: 130 },
    {
      // Single program — member_closed_program is a flat string
      title: 'Program', key: 'programName', width: 160,
      render: (_, r) => <Tag color="blue">{programName(r.member_closed_program || r.programId)}</Tag>
    },
    {
      title: 'Closed Date', key: 'closed_date', width: 140,
      render: (_, r) => {
        const txt = closedDateText(r)
        if (txt) {
          // Flag a member whose date exists only in closedStatus — the top-level
          // field is what the date-range filter and several reports query, so a
          // missing one is worth seeing rather than silently papering over.
          const topLevelMissing = !r.closed_date
          return (
            <span>
              {txt}
              {topLevelMissing && (
                <Tooltip title="Date found in the member's closing history but not on the top-level field. Re-save it here to sync both.">
                  <Tag color="orange" style={{ fontSize: 8, marginLeft: 4 }}>sync</Tag>
                </Tooltip>
              )}
            </span>
          )
        }
        return <Tag color="red" style={{ fontSize: 10 }}>not set</Tag>
      },
    },
    {
      title: 'Group', key: 'closingGroupId', width: 140,
      render: (_, r) => {
        const group = closingGroups.find(g => g.id === r.closingGroupId);
        const groupName = group?.groupName;
        return r.closingGroupId ? (
          <Tag icon={<TeamOutlined />} color="purple" style={{ cursor: 'pointer', fontSize: groupName ? 10 : 9 }}
            onClick={() => { if (group) { setSelectedGroup(group); setGroupModalVisible(true) } }}>
            {groupName || r.closingGroupId.slice(-6)}
          </Tag>
        ) : <Tag>—</Tag>
      }
    },
    {
      title: 'Invitation', key: 'invitation', width: 110,
      render: (_, r) => r.closed_invitation_url ? <Button type="link" size="small" onClick={() => viewInvitationCard(r.closed_invitation_url)}>View Card</Button> : <Tag color="warning">No Card</Tag>
    },
    { title: 'Note', key: 'note', width: 200, render: (_, r) => <span style={{ fontSize: 12, color: '#555' }}>{r.closed_note || '—'}</span> },
    {
      // Settlement status — green once the money has actually been handed over,
      // so an unpaid form is never mistaken for a completed one.
      title: 'समापन पत्र', key: 'closingForm', width: 150,
      render: (_, r) => {
        const f = r.closingFormData
        if (!f) return <Tag color="default" style={{ fontSize: 10 }}>नहीं बना</Tag>
        return f.paymentDone ? (
          <div>
            <Tag color="success" icon={<CheckCircleOutlined />} style={{ fontSize: 10 }}>
              भुगतान हो गया
            </Tag>
            <div style={{ fontSize: 10, color: colors.success }}>
              ₹{Number(f.netAmount || 0).toLocaleString('en-IN')}
              {f.paymentDate ? ` · ${dayjs(f.paymentDate).format('DD-MM-YYYY')}` : ''}
            </div>
          </div>
        ) : (
          <div>
            <Tag color="warning" icon={<ClockCircleOutlined />} style={{ fontSize: 10 }}>
              भुगतान बाकी
            </Tag>
            <div style={{ fontSize: 10, color: colors.muted }}>
              ₹{Number(f.netAmount || 0).toLocaleString('en-IN')}
            </div>
          </div>
        )
      },
    },
    {
      title: 'Action', key: 'action', width: 150,
      render: (_, r) => (
        <Space size={0}>
          <Tooltip title="View"><Button type="text" icon={<EyeOutlined />} onClick={() => handleViewMember(r)} /></Tooltip>
          <Tooltip title={r.closingFormData ? 'समापन पत्र — सहेजा हुआ' : 'समापन पत्र बनाएं'}>
            <Button
              type="text"
              icon={<FileTextOutlined style={{ color: r.closingFormData ? colors.success : colors.primary }} />}
              onClick={() => setFormMember(r)}
            />
          </Tooltip>
          <Tooltip title="Edit Closing Date"><Button type="text" icon={<EditOutlined />} onClick={() => openEditDate(r)} /></Tooltip>
          <Tooltip title="Mark Active"><Button type="text" danger icon={<RollbackOutlined />} loading={markingActiveId === r.id} onClick={() => handleMarkActive(r)} /></Tooltip>
        </Space>
      )
    },
  ]

  // ── Columns: History ───────────────────────────────────────────────────────
  const historyColumns = [
    {
      title: 'Closed At', key: 'closedDate', width: 170,
      sorter: (a, b) => new Date(b.closedDate) - new Date(a.closedDate), defaultSortOrder: 'ascend',
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{r.closedDate ? dayjs(r.closedDate).format('DD MMM YYYY') : '—'}</div>
          <div style={{ fontSize: 11, color: colors.muted }}>{r.closedDate ? dayjs(r.closedDate).format('hh:mm A') : ''}</div>
          <div style={{ fontSize: 10, color: colors.muted }}>{r.closedDate ? dayjs(r.closedDate).fromNow() : ''}</div>
        </div>
      )
    },
    {
      title: 'Group', key: 'id', width: 200,
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: colors.fg }}>{r.groupName || <span style={{ color: colors.muted, fontStyle: 'italic' }}>Unnamed</span>}</div>
          <Tooltip title={r.id}>
            <Tag style={{ fontFamily: 'monospace', fontSize: 10, cursor: 'pointer', marginTop: 2 }}
              onClick={() => { setSelectedGroup(r); setGroupModalVisible(true) }}>
              {r.id.slice(-8)}
            </Tag>
          </Tooltip>
        </div>
      )
    },
    {
      title: 'Program', key: 'program', width: 160,
      render: (_, r) => { const p = programList.find(p => p.id === r.programId); return p ? <Tag color="blue">{p.name}</Tag> : <Tag>{r.programId?.slice(-6)}</Tag> }
    },
    {
      title: 'Members', key: 'memberCount', width: 100,
      render: (_, r) => <div style={{ textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 800, color: colors.primary, lineHeight: '24px' }}>{r.memberCount}</div><div style={{ fontSize: 10, color: colors.muted }}>members</div></div>
    },
    { title: 'Total Amount', key: 'totalAmount', width: 130, render: (_, r) => <span style={{ fontWeight: 700, color: colors.success, fontSize: 15 }}>₹{(r.totalAmount || 0).toLocaleString()}</span> },
    { title: 'Closed By', key: 'closedByName', width: 150, render: (_, r) => <div style={{ fontWeight: 600, fontSize: 12 }}>{r.closedByName || '—'}</div> },
    {
      title: 'Status', key: 'status', width: 120,
      render: (_, r) => r.status === 'reversed'
        ? <div><Tag icon={<RollbackOutlined />} color="red">Reversed</Tag>{r.reversedByName && <div style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>by {r.reversedByName}</div>}</div>
        : <Tag icon={<CheckCircleOutlined />} color="green">Active</Tag>
    },
    {
      title: 'Actions', key: 'actions', width: 190,
      render: (_, r) => (
        <Space>
          <Tooltip title={r.status === 'reversed' ? 'Reversed group' : 'Rasid'}><Button type="text" size="small" icon={<FileTextOutlined />} disabled={r.status === 'reversed'} onClick={() => { setRasidGroup(r); setRasidModalVisible(true) }} /></Tooltip>
          <Tooltip title="View detail"><Button type="text" size="small" icon={<InfoCircleOutlined />} onClick={() => { setSelectedGroup(r); setGroupModalVisible(true) }} /></Tooltip>
          {r.status !== 'reversed' && <Tooltip title="Reverse"><Button type="text" size="small" danger icon={<RollbackOutlined />} loading={reversingId === r.id} onClick={() => handleReverseGroup(r)} /></Tooltip>}
        </Space>
      )
    },
  ]

  const tabItems = [
    {
      key: 'closed',
      label: <Space><CloseCircleOutlined />Closed Members<Badge count={closedTotal} style={{ backgroundColor: colors.error }} /></Space>,
      children: (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <Input placeholder="Search by name, reg. no, phone..." prefix={<SearchOutlined />} style={{ width: 260 }}
              onChange={e => setSearchText(e.target.value)} allowClear />
            <Select style={{ width: 200 }} value={programFilter} onChange={setProgramFilter}>
              <Option value="all">All Programs</Option>
              {programList.map(p => <Option key={p.id} value={p.id}>{p.name}</Option>)}
            </Select>
            <Select style={{ width: 200 }} value={agentFilter} onChange={setAgentFilter} placeholder="All Agents"
              showSearch optionFilterProp="children">
              <Option value="all">All Agents</Option>
              {agentList.map(a => <Option key={a.id} value={a.id}>{a.name}</Option>)}
            </Select>
            <Select style={{ width: 220 }} value={groupFilter} onChange={setGroupFilter} placeholder="All Groups"
              showSearch optionFilterProp="children">
              <Option value="all">All Groups</Option>
              {closingGroups.map(g => (
                <Option key={g.id} value={g.id}>
                  {groupName(g.id)}{g.programId ? ` • ${programName(g.programId)}` : ''} ({g.memberCount || 0})
                </Option>
              ))}
            </Select>
            <DatePicker.RangePicker value={dateRange} onChange={setDateRange}
              style={{ width: 270 }} placeholder={['Closing from', 'Closing to']} allowClear />
            {(programFilter !== 'all' || agentFilter !== 'all' || groupFilter !== 'all' || dateRange || searchText) && (
              <Button size="small" icon={<CloseCircleOutlined />} onClick={() => { setProgramFilter('all'); setAgentFilter('all'); setGroupFilter('all'); setDateRange(null); setSearchText('') }}>Clear</Button>
            )}
            {isSuperAdmin && (
              <Tooltip title="Copy each closed member's date onto the top-level field. Members missing it are skipped by the date filter entirely, and show 'not set' in the table.">
                <Button size="small" icon={<SyncOutlined spin={syncingDates} />} loading={syncingDates}
                  onClick={handleSyncDates}>
                  Sync dates
                </Button>
              </Tooltip>
            )}
            <div style={{ marginLeft: 'auto' }}>
              <Button icon={<DownloadOutlined />} loading={exportLoading} onClick={() => exportClosingsToCSV()}>Export CSV</Button>
              <Button type="primary" danger style={{ marginLeft: 8 }} loading={exportLoading} icon={<FileTextOutlined />}
                onClick={() => handleExportPdf()}>
                PDF
              </Button>
            </div>
          </div>
          <Table columns={memberColumns} dataSource={closedRows} rowKey="id" loading={closedLoading}
            rowClassName={r => r.closingFormData?.paymentDone ? 'closing-paid-row' : ''}
            pagination={{
              current: closedCurrent, pageSize: PAGE, total: closedTotal,
              showSizeChanger: false, showTotal: t => `${t} closed members`,
              onChange: p => loadClosedPage(p),
            }} size="small" />
        </>
      )
    },
    {
      key: 'history',
      label: <Space><ClockCircleOutlined />Closing History<Badge count={closingGroups.filter(g => g.status === 'active').length} style={{ backgroundColor: colors.primary }} /></Space>,
      children: (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
            <Select style={{ width: 220 }} value={groupProgramFilter} onChange={setGroupProgramFilter} placeholder="Filter by program">
              <Option value="all">All Programs</Option>
              {programList.map(p => <Option key={p.id} value={p.id}>{p.name}</Option>)}
            </Select>
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              <Tag color="green" icon={<CheckCircleOutlined />}>Active: {closingGroups.filter(g => g.status === 'active').length}</Tag>
              <Tag color="red"   icon={<RollbackOutlined />}>Reversed: {closingGroups.filter(g => g.status === 'reversed').length}</Tag>
              <Tag color="blue"  icon={<TeamOutlined />}>Total closed: {closingGroups.filter(g => g.status === 'active').reduce((s, g) => s + (g.memberCount || 0), 0)}</Tag>
            </div>
          </div>
          <Table columns={historyColumns} dataSource={filteredGroups} rowKey="id" loading={groupsLoading} pagination={{ pageSize: 20 }} size="small" rowClassName={r => r.status === 'reversed' ? 'row-reversed' : ''} />
        </>
      )
    }
  ]

  return (
    <div style={{ padding: 20, background: colors.background, minHeight: '100vh' }}>
      <style>{`
        .row-reversed td { opacity: 0.55; }
        /* Settled members read green across the whole row, so a full page of
           closed members can be scanned without reading each status tag. */
        .closing-paid-row > td { background: #f0fdf4 !important; }
        .closing-paid-row:hover > td { background: #dcfce7 !important; }
      `}</style>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0 }}><HeartFilled style={{ color: colors.primary, marginRight: 8 }} /> Closing Management</h2>
            <p style={{ color: '#666', marginTop: 4 }}>Manage member closings & track batch history</p>
          </div>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => window.history.back()}>Back</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setClosingFormVisible(true)}
              style={{ background: gradPrimary, border: 'none', fontWeight: 700 }}>
              New Closing
            </Button>
          </Space>
        </div>
        <Row gutter={16}>
          {[
            { title: 'Total Members',   value: stats.totalActive,                                            prefix: <TeamOutlined />,         color: colors.info    },
            { title: 'Closed Members',  value: stats.closedCount,                                            prefix: <CloseCircleOutlined />,  color: colors.error   },
            { title: 'Active Members',  value: stats.activeCount,                                            prefix: <UserOutlined />,         color: colors.success },
            { title: 'Closing Batches', value: closingGroups.filter(g => g.status === 'active').length,      prefix: <CalendarOutlined />,     color: colors.primary },
            { title: 'With Invitation', value: stats.inviteCount ?? null,                                    prefix: <FileTextOutlined />,     color: colors.warning },
          ].map(s => <Col span={4} key={s.title}><Card size="small"><Statistic title={s.title} value={s.value ?? '—'} prefix={s.prefix} valueStyle={{ color: s.color }} /></Card></Col>)}
        </Row>
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <Button danger icon={<WarningOutlined />} onClick={handleResetClosing} loading={resetting}
            style={{ fontSize: 12 }}>
            Reset All Closing Data
          </Button>
        </div>
      </Card>

      <Card><Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} /></Card>

      <ClosingGroupModal
        group={selectedGroup} visible={groupModalVisible}
        onClose={() => { setGroupModalVisible(false); setSelectedGroup(null) }}
        programList={programList}
      />

      <Modal
        open={!!editDateMember}
        title={<Space><CalendarOutlined />Edit Closing Date</Space>}
        onCancel={() => setEditDateMember(null)}
        onOk={handleSaveEditDate}
        okText="Save Date"
        confirmLoading={editingDate}
        width={420}
      >
        {editDateMember && (
          <div>
            <Descriptions size="small" column={1} style={{ marginBottom: 12 }}>
              <Descriptions.Item label="Member">{editDateMember.displayName}</Descriptions.Item>
              {editDateMember.registrationNumber && <Descriptions.Item label="Reg. No.">{editDateMember.registrationNumber}</Descriptions.Item>}
            </Descriptions>
            <div style={{ marginBottom: 8, fontWeight: 600 }}>Closing Date <Tag style={{ marginLeft: 4 }} color="orange">no payment — date only</Tag></div>
            <DatePicker style={{ width: '100%' }} value={editDateValue} onChange={setEditDateValue} picker="date" />
          </div>
        )}
      </Modal>

      <MarriageClosingDrawer
        visible={closingFormVisible} onClose={() => setClosingFormVisible(false)}
        programList={programList} currentUser={currentUser}
        closingGroups={closingGroups}
        onSuccess={async () => { setClosingFormVisible(false); await handleClosingComplete() }}
      />

      <ClosingRasidGenerator
        open={rasidModalVisible}
        group={rasidGroup}
        programList={programList}
        onClose={() => { setRasidModalVisible(false); setRasidGroup(null) }}
      />

      {/* सदस्यता समापन पत्र for one closed member */}
      <ClosingFormDrawer
        open={!!formMember}
        member={formMember}
        programList={programList}
        onClose={() => setFormMember(null)}
        onSaved={(memberId, data) => {
          // Keep the row in step so the icon turns green without a refetch.
          setClosedRows(rows => rows.map(r =>
            r.id === memberId ? { ...r, closingFormData: data } : r
          ))
          setFormMember(m => (m && m.id === memberId ? { ...m, closingFormData: data } : m))
        }}
      />

      {selectedMember && (
        <MemberDetailDrawer member={selectedMember} visible={detailDrawerVisible}
          onClose={() => { setDetailDrawerVisible(false); setSelectedMember(null) }}
          programList={programList} agentList={agentList} />
      )}

      <PdfAutoDownloader pdfMeta={pdfMeta} onDone={() => setPdfMeta(null)} />
    </div>
  )
}

export default ClosingMembersPage