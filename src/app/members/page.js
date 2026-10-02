"use client"
import { trustHtml } from '@/utils/trust/trustStore';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSelector } from 'react-redux'
import AddMember from './components/AddMember'
import { 
  Button, Card, Table, Space, Input, Tag, Avatar,
  Badge, Tooltip, message, Dropdown, Modal, Drawer,
  Select, Form, DatePicker, Checkbox, Progress, Alert, Typography
} from 'antd'
import { WhatsAppOutlined } from '@ant-design/icons'
import { 
  PlusOutlined, SearchOutlined, EyeOutlined, 
  EditOutlined, DeleteOutlined, MoreOutlined,
  UserOutlined, PhoneOutlined, IdcardOutlined,
  CheckCircleOutlined, ClockCircleOutlined, StopOutlined,
  FileTextOutlined, FilterOutlined, DownloadOutlined,
  ReloadOutlined, UserSwitchOutlined, PrinterOutlined,
  TableOutlined, DollarOutlined, MoneyCollectOutlined, WalletOutlined
} from '@ant-design/icons'
import { useAuth } from '@/components/Base/AuthProvider'
import dayjs from 'dayjs'
import MemberDetailDrawer from './components/MemberDetailsView'
import EditMember from './components/EditMember'
import CertificateViewer from './components/MemberPdf/CertificateViewer'
import { 
  fetchMembersPaginated, 
  getTotalMembersCount,
  fetchAllMembersForSearch,
  fetchAllFilteredMembers
} from './components/firebase-helpers'
import { auth, db } from '../../../lib/firbase-client'
import { doc, updateDoc, query, orderBy, collection, getDoc, getCountFromServer } from 'firebase/firestore'
import { BlobProvider, PDFDownloadLink } from '@react-pdf/renderer'
import CertificateCom from './components/MemberPdf/CertificateCom'
import MemberListPdf, { getOldRegNo, getClosedDate } from './components/MemberPdf/MemberListPdf'
import RasidDrawer from './components/RasidCom/RasidDrawer'
import PaymentDetailsDrawer from './components/PaymentDetailsDrawer'

// ── Helper: auto-download PDF when blob is ready ──
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
        <div style={{ position:'fixed', bottom:24, right:24, zIndex:1000, background:'#D3292F', color:'#fff', padding:'10px 20px', borderRadius:8, fontWeight:'bold', fontSize:14, boxShadow:'0 4px 12px rgba(0,0,0,0.15)' }}>
          Generating PDF...
        </div>
      )}
      <BlobProvider document={<MemberListPdf members={pdfMeta.data} filters={pdfMeta.filters} programList={pdfMeta.programList} agentList={pdfMeta.agentList} />}>
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
              a.download = `member_list_${dayjs().format('YYYY-MM-DD')}.pdf`
              document.body.appendChild(a)
              a.click()
              // Don't revoke immediately — browser needs the blob URL to start the download
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

const { Search } = Input
const { Option } = Select

const Page = () => {
  const [openAddMember,  setOpenAddMember]  = useState(false)
  const [openEditMember, setOpenEditMember] = useState(false)
  const [editMemberId,   setEditMemberId]   = useState(null)
  const [members,        setMembers]        = useState([])
  const [loading,        setLoading]        = useState(false)
  const [selectedMember, setSelectedMember] = useState(null)
  const [openCertificate,      setOpenCertificate]      = useState(false)
  const [detailDrawerVisible,  setDetailDrawerVisible]  = useState(false)
  const [filterModalVisible,   setFilterModalVisible]   = useState(false)
  const [rasidDrawerOpen,         setRasidDrawerOpen]         = useState(false)
  const [allMembersForExport,     setAllMembersForExport]     = useState(null)
  const [allMembersExportLoading, setAllMembersExportLoading] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const [isCertDownloading, setIsCertDownloading] = useState(false)

  // ── Send certificate on WhatsApp (existing members) ────────────────────────
  const [waOpen,      setWaOpen]      = useState(false)
  const [waTargets,   setWaTargets]   = useState([])     // member objects
  const [waToMember,  setWaToMember]  = useState(true)
  const [waToAgent,   setWaToAgent]   = useState(true)
  const [waSending,   setWaSending]   = useState(false)
  const [waProgress,  setWaProgress]  = useState({ current: 0, total: 0 })
  const [waResults,   setWaResults]   = useState(null)   // array of per-member outcomes
  // Agent transfer
  const [transferOpen,    setTransferOpen]    = useState(false)
  const [transferAgentId, setTransferAgentId] = useState(null)
  const [transferLoading, setTransferLoading] = useState(false)
  const [transferResult,  setTransferResult]  = useState(null)  // null = not done yet
  const [pdfMeta, setPdfMeta] = useState(null) // { data, filters, programList }
  const currentUser = auth.currentUser

  const [searchMode,    setSearchMode]    = useState('paginated')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)

  const [pagination, setPagination] = useState({
    current: 1, pageSize: 100, total: 0, lastDoc: null, lastDocs: {}
  })

  const [filters, setFilters] = useState({
    search: '', programIds: [], ageGroupIds: [], agentId: 'all',
    status: 'all', paymentStatus: 'all',
    closingPaymentStatus: 'all', gender: 'all',
    fromDate: null, toDate: null,
    sortField: 'createdAt', sortOrder: 'desc'
  })

  const [stats, setStats] = useState({
    total: 0, active: 0, pendingPayments: 0, todayAdded: 0, totalRevenue: 0
  })

  const programList = useSelector((state) => state.data.programList)
  const agentList   = useSelector((state) => state.data.agentList)
  const { user }    = useAuth()
  console.log('User permissions:', user)
const isSuperAdmin = (user) => user?.role === 'superadmin';
  const usersPermissions = user?.permissions || {};
  const [filterForm]    = Form.useForm()
  const searchTimerRef  = useRef(null)

  const getAgentName = useCallback((agentId) => {
    if (!agentId) return 'Admin/System';
    const agent = agentList?.find(a => a.id === agentId || a.uid === agentId);
    return agent ? agent.name : 'Unknown Agent';
  }, [agentList])

  const displayedMembers = useMemo(() =>
    searchMode === 'search' ? searchResults : members
  , [searchMode, searchResults, members])

  useEffect(() => {
    if (displayedMembers.length > 0) {
      const today = dayjs().format('DD-MM-YYYY')
      setStats({
        total:           searchMode === 'search' ? searchResults.length : pagination.total,
        active:          displayedMembers.filter(m => m.active_flag).length,
        pendingPayments: displayedMembers.filter(m => m.paymentPercentage < 100).length,
        todayAdded:      displayedMembers.filter(m => m.dateJoin === today).length,
        totalRevenue:    displayedMembers.reduce((sum, m) => sum + (m.paidAmount || 0), 0)
      })
    }
  }, [displayedMembers, pagination.total, searchMode, searchResults.length])

  // `filtersOverride` lets a caller fetch with values it just set, without
  // waiting for the state update to land. Without it, a caller that changes
  // filters and fetches in the same tick (Reset does exactly that) would query
  // using the stale `filters` captured in this callback's closure.
  const fetchMembers = useCallback(async (page = 1, resetPagination = false, filtersOverride = null) => {
    setLoading(true)
    setSearchMode('paginated')
    const effectiveFilters = filtersOverride || filters
    try {
      const lastDoc = resetPagination ? null : pagination.lastDocs[page - 1] || null
      const result  = await fetchMembersPaginated({ ...effectiveFilters, search: '', pageSize: pagination.pageSize, lastDoc })
      setMembers(result.members)

      const newLastDocs = { ...pagination.lastDocs }
      if (result.lastDoc) newLastDocs[page] = result.lastDoc

      setPagination(prev => ({ ...prev, lastDocs: newLastDocs, hasNextPage: result.hasNextPage, current: page }))

      if (resetPagination) {
        const totalCount = await getTotalMembersCount(effectiveFilters)
        setPagination(prev => ({ ...prev, total: totalCount }))
      }
    } catch (error) {
      console.error('Error fetching members:', error)
      message.error('Failed to load members data')
    } finally {
      setLoading(false)
    }
  }, [filters, pagination.pageSize, pagination.lastDocs])

  const searchMembers = useCallback(async (searchTerm) => {
    if (!searchTerm || searchTerm.trim().length < 2) {
      setSearchMode('paginated'); setSearchResults([])
      fetchMembers(1, false); return
    }
    setSearchLoading(true); setSearchMode('search')
    try {
      const results = await fetchAllMembersForSearch(searchTerm, filters.agentId)
      setSearchResults(results)
      if (results.length === 0) message.info('No members found matching your search')
    } catch (error) {
      message.error('Failed to search members')
    } finally {
      setSearchLoading(false)
    }
  }, [fetchMembers, filters.agentId])

  const handleSearch = useCallback((value) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => searchMembers(value), 500)
  }, [searchMembers])

  const handleSearchChange = (e) => {
    const value = e.target.value
    setFilters(prev => ({ ...prev, search: value }))
    handleSearch(value)
  }

  useEffect(() => { fetchMembers(1, true) }, [])

  // Clear export cache whenever filters change so downloads always use fresh data
  useEffect(() => { setAllMembersForExport(null) }, [filters])

  const handleFilterChange = (changedValues) => {
    setFilters(prev => {
      const next = { ...prev, ...changedValues }
      // Age group ids are scoped to a program. When the program selection
      // changes, drop any group that no longer belongs to a selected yojna —
      // keeping them would filter on ids that can never match, returning zero
      // rows with no obvious reason why.
      if ('programIds' in changedValues) {
        const stillValid = new Set(
          (changedValues.programIds || [])
            .flatMap(pid => (programList?.find(p => p.id === pid)?.ageGroups || []).map(g => g.id))
        )
        const kept = (next.ageGroupIds || []).filter(id => stillValid.has(id))
        next.ageGroupIds = kept
        filterForm.setFieldValue('ageGroupIds', kept)
      }
      return next
    })
  }

  // Age groups across every selected yojna, grouped so identically-named groups
  // from different programs stay distinguishable
  const ageGroupOptions = useMemo(() => {
    const ids = filters.programIds || []
    if (!ids.length) return []
    return ids
      .map(pid => programList?.find(p => p.id === pid))
      .filter(Boolean)
      .map(prog => ({
        label: prog.name,
        options: (prog.ageGroups || []).map(g => ({
          value: g.id,
          label: `${g.ageGroupName || `${g.startAge}-${g.endAge}`}${
            g.startAge != null && g.endAge != null ? ` (${g.startAge}–${g.endAge} yrs)` : ''
          }`,
        })),
      }))
      .filter(grp => grp.options.length > 0)
  }, [filters.programIds, programList])

  // Flat list — used for chip labels and the select-all helper
  const availableAgeGroups = useMemo(() => {
    const ids = filters.programIds || []
    return ids
      .map(pid => programList?.find(p => p.id === pid))
      .filter(Boolean)
      .flatMap(prog => (prog.ageGroups || []).map(g => ({ ...g, programName: prog.name })))
  }, [filters.programIds, programList])

  const applyFilters = () => {
    setFilterModalVisible(false)
    setPagination(prev => ({ ...prev, current: 1, lastDoc: null, lastDocs: {} }))
    setAllMembersForExport(null)
    setTimeout(() => fetchMembers(1, true), 0)
  }

  const resetFilters = () => {
    const reset = {
      search: '', programIds: [], ageGroupIds: [], agentId: 'all',
      status: 'all', paymentStatus: 'all', closingPaymentStatus: 'all', gender: 'all',
      fromDate: null, toDate: null, sortField: 'createdAt', sortOrder: 'desc'
    }

    setFilters(reset)

    // setFieldsValue, not resetFields(): resetFields() restores the Form's
    // `initialValues`, which were captured when the form first mounted — so it
    // would put the *old* filters back into the inputs instead of clearing them.
    filterForm.setFieldsValue(reset)

    setSearchMode('paginated')
    setSearchResults([])
    setAllMembersForExport(null)
    setPagination(prev => ({ ...prev, current: 1, lastDoc: null, lastDocs: {} }))
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)

    // Pass the new values explicitly — fetchMembers' closure still holds the
    // pre-reset filters at this point, which is why clearing appeared to do
    // nothing before.
    setTimeout(() => fetchMembers(1, true, reset), 0)
  }

  // ── One-time migration: populate joinDateTs on older members ──────────────
  // The join-date range filter queries joinDateTs. Firestore range queries skip
  // documents that don't have the field at all, so members created before it
  // existed vanish from date-filtered results until this is run.
  const [backfillLoading, setBackfillLoading] = useState(false)
  const [backfillProgress, setBackfillProgress] = useState(null)
  const backfillCheckedRef = useRef(false)

  const runJoinDateBackfill = async ({ silent = false } = {}) => {
    setBackfillLoading(true)
    setBackfillProgress({ scanned: 0, updated: 0 })

    // The server processes a chunk per request and hands back a cursor. Looping
    // here means the migration completes regardless of collection size instead
    // of dying on a single long-running request.
    const totals = { scanned: 0, updated: 0, skipped: 0, unparseable: 0 }
    let cursor = null
    let guard = 0   // hard stop so a server bug can't spin forever

    try {
      const token = await auth.currentUser?.getIdToken()

      while (guard++ < 500) {
        const res = await fetch('/api/members/backfill-join-date', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ cursor, batchSize: 400 }),
        })
        const data = await res.json()

        if (!data.success) {
          // Silent runs stay quiet — the user didn't ask for this, and a failure
          // just means the date filter keeps behaving as it did before.
          if (!silent) message.error(data.message || 'Backfill failed')
          else console.warn('[JoinDate auto-repair] stopped:', data.message)
          return
        }

        totals.scanned     += data.scanned || 0
        totals.updated     += data.updated || 0
        totals.skipped     += data.skipped || 0
        totals.unparseable += data.unparseable || 0
        setBackfillProgress({ scanned: totals.scanned, updated: totals.updated })

        if (!data.hasMore) break
        cursor = data.nextCursor
      }

      if (silent) {
        console.log(`[JoinDate auto-repair] ${totals.updated} member(s) prepared for date filtering`)
        // Refresh only if a date filter is currently applied, so the user sees
        // the now-complete result set without an unexpected reload otherwise.
        if (filters.fromDate || filters.toDate) fetchMembers(1, true)
      } else {
        Modal.success({
          title: 'Join dates updated',
          content: (
            <div style={{ fontSize: 13 }}>
              <p style={{ marginBottom: 8 }}>
                All members can now be filtered by join date.
              </p>
              <div style={{ color: '#6b7280', fontSize: 12 }}>
                Scanned {totals.scanned} · Updated {totals.updated} · Already set {totals.skipped}
                {totals.unparseable > 0 && ` · ${totals.unparseable} had no usable join date (fell back to created date)`}
              </div>
            </div>
          ),
          onOk: () => fetchMembers(1, true),
        })
      }
    } catch (e) {
      console.error(e)
      if (!silent) message.error('Backfill failed: ' + e.message)
    } finally {
      setBackfillLoading(false)
      setBackfillProgress(null)
    }
  }

  // ── Auto-repair on load ───────────────────────────────────────────────────
  // Compares the member count against the count of members that actually have
  // joinDateTs. Firestore's orderBy() excludes documents missing the field, so
  // a gap between the two means some members would be invisible to the date
  // filter. Two count queries are cheap (server-side aggregation, not reads of
  // every document), and this runs once per page load.
  useEffect(() => {
    if (!user || backfillCheckedRef.current) return
    if (!(isSuperAdmin(user) || user.role === 'admin')) return
    backfillCheckedRef.current = true

    ;(async () => {
      try {
        const membersRef = collection(db, 'members')
        const [totalSnap, withTsSnap] = await Promise.all([
          getCountFromServer(membersRef),
          getCountFromServer(query(membersRef, orderBy('joinDateTs'))),
        ])
        const missing = totalSnap.data().count - withTsSnap.data().count
        if (missing > 0) {
          console.log(`[JoinDate auto-repair] ${missing} member(s) missing joinDateTs — repairing`)
          await runJoinDateBackfill({ silent: true })
        }
      } catch (e) {
        // Never let this break the page — the filter simply behaves as before
        console.warn('[JoinDate auto-repair] check skipped:', e?.message)
      }
    })()
  }, [user])

  // Clear one filter (used by the chip close buttons). Same stale-closure trap
  // as resetFilters — the new values must be handed to fetchMembers directly.
  const clearFilter = (patch) => {
    const next = { ...filters, ...patch }
    setFilters(next)
    filterForm.setFieldsValue(patch)
    setAllMembersForExport(null)
    setPagination(prev => ({ ...prev, current: 1, lastDoc: null, lastDocs: {} }))
    setTimeout(() => fetchMembers(1, true, next), 0)
  }

  const getActiveFilterCount = () => {
    let c = 0
    if (filters.programIds?.length)             c++
    if (filters.ageGroupIds?.length)            c++
    if (filters.agentId              !== 'all') c++
    if (filters.status               !== 'all') c++
    if (filters.paymentStatus        !== 'all') c++
    if (filters.closingPaymentStatus !== 'all') c++
    if (filters.gender               !== 'all') c++
    if (filters.fromDate) c++
    if (filters.toDate)   c++
    return c
  }

  const formatDate = (d) => d ? dayjs(d).format('DD-MM-YYYY') : null

  const handleTableChange = (paginationInfo, _, sorter) => {
    if (searchMode === 'search') {
      setPagination(prev => ({ ...prev, current: paginationInfo.current, pageSize: paginationInfo.pageSize }))
      return
    }
    if (paginationInfo.pageSize !== pagination.pageSize) {
      setPagination(prev => ({ ...prev, current: 1, pageSize: paginationInfo.pageSize, lastDocs: {} }))
      setTimeout(() => fetchMembers(1, true), 0); return
    }
    if (sorter.field && sorter.order) {
      setFilters(prev => ({ ...prev, sortField: sorter.field, sortOrder: sorter.order === 'ascend' ? 'asc' : 'desc' }))
      setPagination(prev => ({ ...prev, current: 1, lastDocs: {} }))
      setTimeout(() => fetchMembers(1, true), 0); return
    }
    if (paginationInfo.current !== pagination.current) fetchMembers(paginationInfo.current, false)
  }

  const handleViewMember    = (member) => { setSelectedMember(member); setDetailDrawerVisible(true) }
  const [paymentDetailsMember, setPaymentDetailsMember] = useState(null)
  const [paymentDetailsVisible, setPaymentDetailsVisible] = useState(false)
  const handlePaymentDetails = (member) => { setPaymentDetailsMember(member); setPaymentDetailsVisible(true) }

  // Re-fetch member from Firestore after a payment is reverted — updates drawer + table row
  const handlePaymentDeleteSuccess = async () => {
    if (!paymentDetailsMember?.id) return
    try {
      const snap = await getDoc(doc(db, 'members', paymentDetailsMember.id))
      if (snap.exists()) {
        const fresh = { id: snap.id, ...snap.data() }
        // Update the drawer props so summary cards reflect Firestore truth
        setPaymentDetailsMember(fresh)
        // Patch the matching row in the members table so the list updates instantly
        setMembers(prev => prev.map(m => m.id === fresh.id ? fresh : m))
      }
    } catch (e) { console.error('Failed to refresh member after revert', e) }
  }

  const handleCertificateMember = (member) => {
    const agentData   = agentList?.find(a => a.id === member.agentId) || {}
    const programData = programList?.find(p => p.id === member.programId) || {}
    setSelectedMember({
      ...member,
      agentName:   agentData.displayName || agentData.name || 'Admin/System',
      agentPhone:  agentData.phone1 || '',
      programName: programData.hindiName || member.programName || ''
    })
    setOpenCertificate(true)
  }

  const downloadMultipleCertificates = async (membersArray) => {
    if (!membersArray || membersArray.length === 0) {
      message.warning('No members selected for certificate download');
      return;
    }
    setIsCertDownloading(true);
    const loadingMessage = message.loading('Generating certificates, please wait...', 0);
    const membersData = membersArray.map(member => {
      const agentData   = agentList?.find(a => a.id === member.agentId) || {}
      const programData = programList?.find(p => p.id === member.programId) || {}
      return {
        ...member,
        ageGroupName:  member.ageGroupName || member.memberGroupName || member.ageGroup || '',
        agentName:     agentData.displayName || agentData.name || 'Admin/System',
        agentPhone:    agentData.phone1 || '',
        programName:   programData.hindiName || member.programName || '',
        // Carry each member's OWN program on the record. A batch can span
        // several yojnas, so a single shared program object would stamp the
        // same scheme name (and certificate rules) onto every page.
        memberProgram: programData,
      }
    });
    // Fallback only — used for members whose program couldn't be resolved
    const memberProgram = programList?.find(p => p.id === membersArray[0]?.programId) || {}
    try {
      const response = await fetch('/api/certificate-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberData: membersData, memberProgram }),
      });
      const data = await response.json();
      const binaryString = atob(data.base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 100);
      message.success('Certificate generated successfully!');
    } catch (error) {
      console.error('Error:', error);
      message.error('Failed to generate certificates. Please try again.');
    } finally {
      loadingMessage();
      setIsCertDownloading(false);
    }
  }

  // ── WhatsApp certificate send — existing members ────────────────────────────
  // Sends the exact same template + certificate that goes out when a member is
  // first added or a request is approved.
  const openWhatsAppSend = (members) => {
    const list = (Array.isArray(members) ? members : [members]).filter(Boolean)
    if (!list.length) { message.warning('No members selected'); return }
    setWaTargets(list)
    setWaResults(null)
    setWaProgress({ current: 0, total: list.length })
    setWaToMember(true)
    setWaToAgent(true)
    setWaOpen(true)
  }

  const openWhatsAppSendSelected = () => {
    const selected = selectedRowKeys
      .map(id => displayedMembers.find(m => m.id === id))
      .filter(Boolean)
    if (!selected.length) { message.warning('Select members first'); return }
    openWhatsAppSend(selected)
  }

  const runWhatsAppSend = async () => {
    if (!waToMember && !waToAgent) {
      message.warning('Choose at least one recipient')
      return
    }
    setWaSending(true)
    setWaResults(null)
    setWaProgress({ current: 0, total: waTargets.length })

    const results = []
    try {
      const token = await auth.currentUser?.getIdToken()

      // Sequential rather than Promise.all — each request renders a PDF and
      // hits Gupshup, so firing 50 at once would risk rate limits and timeouts.
      for (let i = 0; i < waTargets.length; i++) {
        const m = waTargets[i]
        try {
          const res = await fetch('/api/members/join-certificate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              memberId:     m.id,
              sendToMember: waToMember,
              sendToAgent:  waToAgent,
              skipWhatsApp: !waToMember && !waToAgent,
            }),
          })
          const data = await res.json()
          results.push({
            id:        m.id,
            name:      m.displayName || '',
            regNo:     m.registrationNumber || '',
            memberSent: !!data?.whatsapp?.sent,
            agentSent:  !!data?.agentWhatsapp?.sent,
            certOk:     !!data?.certificate?.generated,
            error:      data?.whatsapp?.error || data?.certificate?.error || data?.message || null,
            agentError: data?.agentWhatsapp?.error || null,
          })
        } catch (err) {
          results.push({
            id: m.id, name: m.displayName || '', regNo: m.registrationNumber || '',
            memberSent: false, agentSent: false, certOk: false, error: err.message,
          })
        }
        setWaProgress({ current: i + 1, total: waTargets.length })
      }

      setWaResults(results)
      const ok = results.filter(r => r.memberSent || r.agentSent).length
      if (ok === results.length) message.success(`Sent to ${ok} member(s)`)
      else if (ok > 0)           message.warning(`Sent ${ok} of ${results.length} — see details`)
      else                       message.error('No messages could be sent — see details')
    } catch (e) {
      console.error(e)
      message.error('Send failed: ' + e.message)
    } finally {
      setWaSending(false)
    }
  }

  const handleBatchCertSelected = () => {
    const selected = selectedRowKeys
      .map(id => displayedMembers.find(m => m.id === id))
      .filter(Boolean)
      .filter(m => m.active_flag === true)
    if (selected.length === 0) {
      message.warning('No accepted members in selection. Only accepted members can get certificates.')
      return
    }
    downloadMultipleCertificates(selected)
  }

  const handleBatchCertAll = async () => {
    const data = allMembersForExport || await fetchAllMembersForExport()
    if (!data || data.length === 0) { message.warning('No members found'); return }
    const accepted = data.filter(m => m.active_flag === true)
    if (accepted.length === 0) {
      message.warning('No accepted members found. Only accepted members can get certificates.')
      return
    }
    if (accepted.length < data.length) {
      message.info(`Downloading certificates for ${accepted.length} accepted members (${data.length - accepted.length} pending skipped)`)
    }
    downloadMultipleCertificates(accepted)
  }

  const handleEditMember = (member) => { setEditMemberId(member.id); setOpenEditMember(true) }

  // ── Transfer selected members to another agent ──────────────────────────────
  const handleTransferAgents = async () => {
    if (!transferAgentId) { message.warning('Please select the target agent'); return }
    if (!selectedRowKeys.length) { message.warning('Please select members to transfer'); return }
    setTransferLoading(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch('/api/members/transfer-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ memberIds: selectedRowKeys, toAgentId: transferAgentId }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message || 'Transfer failed')
      setTransferResult(data)   // show result panel inside the drawer
      setSelectedRowKeys([])
      searchMode === 'search' && filters.search ? searchMembers(filters.search) : fetchMembers(pagination.current, false)
    } catch (e) {
      message.error('Transfer failed: ' + e.message)
    } finally {
      setTransferLoading(false)
    }
  }

  const closeTransferDrawer = () => {
    if (transferLoading) return
    setTransferOpen(false)
    setTransferAgentId(null)
    setTransferResult(null)
  }
const callDeleteMemberApi = async (memberId, currentUserId, token) => {
  const res = await fetch('/api/members/delete-restore', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ memberId, deletedBy: currentUserId }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Delete API failed');
  return data;
};
const handleDeleteMember = (member) => {
  Modal.confirm({
    title: 'Confirm Delete',
    content: `Are you sure you want to delete ${member.displayName}?`,
    okText: 'Yes, Delete', okType: 'danger', cancelText: 'Cancel',
    onOk: async () => {
      try {
        // Call API — it soft-deletes + decrements all counters atomically
        const token = await currentUser?.getIdToken();
        await callDeleteMemberApi(member.id, currentUser?.uid, token);
        message.success('Member deleted successfully');
        searchMode === 'search' && filters.search
          ? searchMembers(filters.search)
          : fetchMembers(pagination.current, false);
      } catch (e) {
        console.error(e);
        message.error('Failed to delete member: ' + e.message);
      }
    }
  });
};

  const handleToggleStatus = async (member) => {
    try {
      await updateDoc(doc(db, 'members', member.id), { active_flag: !member.active_flag, updated_at: new Date() })
      message.success(`Member ${!member.active_flag ? 'activated' : 'deactivated'} successfully`)
      searchMode === 'search' && filters.search ? searchMembers(filters.search) : fetchMembers(pagination.current, false)
    } catch { message.error('Failed to update member status') }
  }

  // ── Close a member without raising any instalment ──────────────────────────
  //
  // The normal close also charges every other eligible member of the yojna,
  // which is right for a closing happening now and wrong for one that already
  // happened in the old system — that money was collected outside this app.
  // This sets the status and the date and nothing else.
  //
  // The date is required: api/closed_payment_entry treats a closed member it
  // cannot date as still open, so a dateless close would keep charging them.
  const [closeNoPayMember, setCloseNoPayMember] = useState(null)
  const [closeNoPayDate, setCloseNoPayDate]     = useState(null)
  const [closeNoPaySaving, setCloseNoPaySaving] = useState(false)

  const openCloseNoPay = (member) => {
    setCloseNoPayMember(member)
    setCloseNoPayDate(null)
  }

  const submitCloseNoPay = async () => {
    if (!closeNoPayDate) { message.error('समापन दिनांक चुनें'); return }
    setCloseNoPaySaving(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch('/api/members/migrate-close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          memberId: closeNoPayMember.id,
          closedDate: closeNoPayDate.format('YYYY-MM-DD'),
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message)
      message.success(data.message)
      setCloseNoPayMember(null)
      searchMode === 'search' && filters.search
        ? searchMembers(filters.search)
        : fetchMembers(pagination.current, false)
    } catch (e) {
      message.error('बंद नहीं हो सका: ' + e.message)
    } finally {
      setCloseNoPaySaving(false)
    }
  }

  const columns = [
    {
      title: 'Sr.',
      dataIndex: 'srNo',
      key: 'srNo',
      width: 60, fixed: 'left',
      sorter: searchMode === 'paginated',
      render: (v) => <span className="text-sm font-semibold text-gray-600">{v ?? '—'}</span>,
    },
    {
      title: 'Reg. No.',
      dataIndex: 'registrationNumber',
      key: 'registrationNumber',
      width: 130, fixed: 'left',
      sorter: searchMode === 'paginated',
      render: (text) => <Tag color="blue" style={{ fontWeight: 'bold', fontSize: '12px' }}>{text}</Tag>,
    },
    {
      title: 'Member', key: 'member', width: 180,
      render: (_, r) => (
        <div className="flex items-center gap-2">
          <Avatar src={r.photoURL} icon={<UserOutlined />} size="small" />
          <div>
            <div className="font-medium text-sm">{r.displayName}</div>
            <div className="text-xs text-gray-500">{r.fatherName} • {r.surname}</div>
          </div>
        </div>
      ),
    },
    {
      title: 'Contact', key: 'contact', width: 140,
      render: (_, r) => (
        <div>
          <div className="flex items-center gap-1 text-sm"><PhoneOutlined style={{ fontSize: '11px' }} /><span>{r.phone}</span></div>
          {r.phoneAlt && <div className="text-xs text-gray-500">Alt: {r.phoneAlt}</div>}
        </div>
      ),
    },
    {
      title: 'Aadhaar', dataIndex: 'aadhaarNo', key: 'aadhaarNo', width: 130,
      render: (text) => <span className="text-sm">{text}</span>,
    },
    {
      title: 'Added By', key: 'agent', width: 130,
      render: (_, r) => {
        // If added by agent — show agent name; if added by admin — show admin name from addedByName
        const isAdmin = !r.agentId || r.addedBy === 'admin'
        const name = isAdmin
          ? (r.addedByName || 'Admin')
          : getAgentName(r.agentId)
        return (
          <div className="text-xs">
            <div className="flex items-center gap-1">
              {isAdmin
                ? <UserOutlined style={{ fontSize: '11px', color: '#722ed1' }} />
                : <UserSwitchOutlined style={{ fontSize: '11px', color: '#1890ff' }} />}
              <span className="font-medium truncate" title={name}>{name}</span>
            </div>
            <div className="text-gray-400" style={{ fontSize: 9 }}>
              {isAdmin ? 'Admin' : 'Agent'}
            </div>
          </div>
        )
      },
    },
    {
      // ── Single program — read flat programName from member doc ──────────────
      title: 'Yojna', key: 'program', width: 160,
      render: (_, r) => {
        if (!r.programId) return <span className="text-gray-400 text-xs">No Program</span>
        const prog = programList?.find(p => p.id === r.programId)
        const name = prog?.name || r.programName || r.programId
        return <Tag color="pink" style={{ fontWeight: 'bold', fontSize: '10px' }}>{name}</Tag>
      },
    },
    {
      title: 'Age Group', key: 'ageGroup', width: 90,
      render: (_, r) => {
        const age = r.ageGroupName || r.memberGroupName || r.ageGroup || '-'
        return <Tag color="cyan" style={{ fontSize: '10px' }}>{age}</Tag>
      },
    },
    {
      title: 'Join Fees', key: 'payment', width: 165,
      sorter: searchMode === 'paginated',
      render: (_, r) => {
        const pct     = r.paymentPercentage || 0
        const total   = r.joinFees       || 0
        const paid    = r.paidAmount     || 0
        const pending = r.pendingAmount  || 0
        const fixed   = r.fixedJoinFees  || 0
        const color = pct === 100 ? 'green' : pct > 0 ? 'orange' : 'red'
        const icon  = pct === 100 ? <CheckCircleOutlined /> : <ClockCircleOutlined />
        return (
          <div>
            <div className="flex items-center gap-1 text-sm">
              {icon}<span style={{ color, fontWeight: 'bold' }}>{pct}%</span>
              <span className="text-[10px] text-gray-500">of ₹{total.toLocaleString()}</span>
            </div>
            <div className="text-[10px]">
              <span title="Paid" style={{ color: '#52c41a', fontWeight: 600 }}>Paid ₹{paid.toLocaleString()}</span>
              <span className="text-gray-300 mx-0.5">•</span>
              <span title="Pending" style={{ color: pending > 0 ? '#ff4d4f' : '#52c41a', fontWeight: 600 }}>Pend ₹{pending.toLocaleString()}</span>
            </div>
            {fixed > 0 && (
              <div className="text-[9px] text-gray-500">Fixed Fees: ₹{fixed.toLocaleString()}</div>
            )}
          </div>
        )
      },
    },
    {
      title: 'Closing', key: 'closing', width: 130,
      render: (_, r) => {
        const total = r.closing_totalAmount || 0
        const paid = r.closing_paidAmount || 0
        const pending = r.closing_pendingAmount || 0
        if (!total) return <span className="text-gray-300 text-xs">—</span>
        return (
          <div>
            <div className="flex items-center gap-1 text-xs">
              <MoneyCollectOutlined style={{ color: '#722ed1', fontSize: 10 }} />
              <span style={{ color: '#722ed1', fontWeight: 600 }}>₹{total.toLocaleString()}</span>
            </div>
            <div className="text-[10px]">
              <span style={{ color: '#52c41a' }}>₹{paid.toLocaleString()}</span>
              <span className="text-gray-300 mx-0.5">/</span>
              <span style={{ color: pending > 0 ? '#ff4d4f' : '#52c41a' }}>₹{pending.toLocaleString()}</span>
            </div>
            <div className="text-[9px] text-gray-400">{r.paidClosingCount || 0}/{r.totalClosingCount || 0} ev</div>
          </div>
        )
      },
    },
    {
      title: 'Join Date', dataIndex: 'dateJoin', key: 'dateJoin', width: 110,
      sorter: searchMode === 'paginated',
      render: (text) => (
        <div className="text-sm">
          <div>{text}</div>
          {text && dayjs(text, 'DD-MM-YYYY').isSame(dayjs(), 'day') && (
            <Tag color="green" className="text-xs">Today</Tag>
          )}
        </div>
      ),
    },
    {
      title: 'Status', key: 'status', width: 100,
      render: (_, r) => {
        if (r.member_closed) return <Tag color="purple" icon={<StopOutlined />} size="small" className="text-xs">Closed</Tag>
        return (
          <Tag color={r.active_flag ? 'green' : 'red'}
            icon={r.active_flag ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
            size="small" className="text-xs">
            {r.active_flag ? 'Active' : 'Inactive'}
          </Tag>
        )
      },
    },
    {
      title: 'Actions', key: 'actions', width: 90, fixed: 'right',
      render: (_, record) => {
        const can = (perm) => isSuperAdmin(user) || usersPermissions?.actions?.[perm];
    const items = [
  can('view') && {
    key: 'view',
    label: 'View Details',
    icon: <EyeOutlined />,
    onClick: () => handleViewMember(record)
  },

          {
            key: 'payment',
            label: 'Payment Details',
            icon: <WalletOutlined />,
            onClick: () => handlePaymentDetails(record)
          },
          can('download') && {
            key: 'cert',
            label: 'Certificate',
            icon: <FileTextOutlined />,
            onClick: () => handleCertificateMember(record)
          },
          {
            key: 'wa_cert',
            label: 'Send Certificate on WhatsApp',
            icon: <WhatsAppOutlined style={{ color: '#25D366' }} />,
            onClick: () => openWhatsAppSend(record)
          },
          can('edit') && {
    key: 'edit',
    label: 'Edit',
    icon: <EditOutlined />,
    onClick: () => handleEditMember(record)
  },

  can('approve') && {
    key: 'toggle',
    label: record.active_flag ? 'Deactivate' : 'Activate',
    onClick: () => handleToggleStatus(record)
  },

  // Only for a member who isn't closed yet — closing an already-closed
  // member again would add a second closedStatus entry.
  can('edit') && !record.member_closed && {
    key: 'close_no_pay',
    label: 'बंद करें (बिना किस्त)',
    icon: <StopOutlined />,
    onClick: () => openCloseNoPay(record)
  },

  can('delete') && { type: 'divider' },

  can('delete') && {
    key: 'delete',
    label: 'Delete',
    icon: <DeleteOutlined style={{ color: 'red' }} />,
    onClick: () => handleDeleteMember(record)
  }
].filter(Boolean);
        return (
          <Space>
            {
              (isSuperAdmin(user) || usersPermissions?.actions?.view) && <Tooltip title="View Details">
              <Button type="text" icon={<EyeOutlined />} onClick={() => handleViewMember(record)} size="small" />
            </Tooltip>
            }
         
            <Dropdown menu={{ items }} trigger={['click']}>
              <Tooltip title="More Options">
                <Button type="text" icon={<MoreOutlined />} size="small" />
              </Tooltip>
            </Dropdown>
          </Space>
        )
      },
    },
  ]

  const exportToCSV = (data) => {
    const list = data || displayedMembers

    // Quote every text field: names and villages routinely contain commas, which
    // would otherwise split one value across several columns.
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    // Long digit strings (phone, Aadhaar) become 9.87E+09 if Excel treats them as
    // numbers. The ="…" form pins them as text.
    const num = (v) => (v ? `="${String(v).replace(/["=]/g, '')}"` : '""')

    const headers = ['Sr. No','Registration No','Old Registration No','Name','Father Name','Phone','Aadhaar','Village','City','Program','Age Group','Pay Amount','Join Date','Status','Closed Date','Join Fees','Payment %','Paid Amount','Pending Amount','Agent Name']

    const rows = list.map(m => [
      m.srNo ?? '',
      q(m.registrationNumber),
      // Legacy number from the previous system — blank for members registered here
      q(getOldRegNo(m)),
      q(m.displayName),
      q(m.fatherName),
      num(m.phone),
      num(m.aadhaarNo),
      q(m.village),
      q(m.city),
      q(m.programName || (programList?.find(p => p.id === m.programId)?.name || '')),
      q(m.ageGroupName || m.memberGroupName || m.ageGroup || ''),
      // Per-closing instalment amount, set by the member's age group. Plain
      // number (no ₹, no quotes) so Excel can total and sort the column.
      m.payAmount || 0,
      q(m.dateJoin),
      q(m.member_closed ? 'Closed' : m.active_flag ? 'Active' : 'Inactive'),
      // Marriage/closing date — blank for members who aren't closed
      q(m.member_closed ? getClosedDate(m) : ''),
      m.joinFees || 0,
      m.paymentPercentage || 0,
      m.paidAmount || 0,
      Math.max(0, (m.joinFees || 0) - (m.paidAmount || 0)),
      q(getAgentName(m.agentId)),
    ])

    const csv = [headers.map(q).join(','), ...rows.map(r => r.join(','))].join('\r\n')

    // Hindi text needs a real UTF-8 BOM. Writing the string '﻿' into a Blob
    // is unreliable — encode explicitly and prepend the BOM bytes so Excel can't
    // fall back to Latin-1 (which is what turns मोहनलाल into à¤®à¥‹à¤¹à¤¨...).
    const bom     = new Uint8Array([0xEF, 0xBB, 0xBF])
    const encoded = new TextEncoder().encode(csv)
    const blob    = new Blob([bom, encoded], { type: 'text/csv;charset=utf-8;' })

    const url = window.URL.createObjectURL(blob)
    const a   = document.createElement('a')
    a.href = url
    a.download = `members_${dayjs().format('YYYY-MM-DD')}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const fetchAllMembersForExport = async () => {
    setAllMembersExportLoading(true)
    try {
      // Same query + client-side filters the table uses (no pagination), so
      // the export contains exactly the filtered set shown on screen.
      const data = await fetchAllFilteredMembers({ ...filters })
      setAllMembersForExport(data)
      return data
    } catch (err) {
      console.error('Error fetching all members for export:', err)
      message.error('Failed to fetch all members for export')
      return null
    } finally {
      setAllMembersExportLoading(false)
    }
  }

  const exportAllToCSV = async () => {
    const data = allMembersForExport || await fetchAllMembersForExport()
    if (data && data.length > 0) {
      exportToCSV(data)
      message.success(`Exported ${data.length} members to CSV`)
    } else {
      message.warning('No members found to export')
    }
  }

  const printMembers = async () => {
    const data = allMembersForExport || await fetchAllMembersForExport()
    if (!data || data.length === 0) {
      message.warning('No members found to print')
      return
    }

    const filterParts = []
    if (filters.programIds?.length) filterParts.push(`Yojna: ${filters.programIds.map(id => programList?.find(p => p.id === id)?.name || id).join(', ')}`)
    if (filters.agentId !== 'all') filterParts.push(`Agent: ${getAgentName(filters.agentId)}`)
    if (filters.status !== 'all') filterParts.push(`Status: ${filters.status}`)
    if (filters.paymentStatus !== 'all') filterParts.push(`Payment: ${filters.paymentStatus}`)
    if (filters.fromDate) filterParts.push(`From: ${formatDate(filters.fromDate)}`)
    if (filters.toDate) filterParts.push(`To: ${formatDate(filters.toDate)}`)
    if (filters.search) filterParts.push(`Search: ${filters.search}`)
    const filterHtml = filterParts.length > 0
      ? `<div class="filters">Filters: ${filterParts.map(f => `<span class="filter-tag">${f}</span>`).join('')}</div>`
      : ''

    const rowsHtml = data.map((m, i) => {
      const progName = m.programName || (programList?.find(p => p.id === m.programId)?.name || '-')
      const ageGroup = m.ageGroupName || m.memberGroupName || m.ageGroup || '-'
      return `
      <tr>
        <td class="c">${m.srNo ?? i + 1}</td>
        <td class="reg">${m.registrationNumber || ''}
          ${getOldRegNo(m) ? `<div class="sub">Old: ${getOldRegNo(m)}</div>` : ''}
        </td>
        <td class="l"><b>${m.displayName || ''}</b><div class="sub">${m.fatherName || ''}</div></td>
        <td class="c">${m.phone || '-'}</td>
        <td class="c mono">${m.aadhaarNo || '-'}</td>
        <td class="c">${progName}</td>
        <td class="c">${ageGroup}</td>
        <td class="c">${m.village || '-'}
          ${m.member_closed && getClosedDate(m) ? `<div class="sub" style="color:${trustHtml().pdfColorAccent}">Closed: ${getClosedDate(m)}</div>` : ''}
        </td>
        <td class="amt">₹${(m.payAmount || 0).toLocaleString()}</td>
      </tr>`
    }).join('')

    const printWindow = window.open('', '_blank')
    printWindow.document.write(`<!DOCTYPE html><html lang="hi"><head>
<meta charset="utf-8">
<title>Member List — ${trustHtml().shortName}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&family=Noto+Serif+Devanagari:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4 landscape; margin: 5mm 4mm 16mm 4mm; @bottom-center { content: "Page " counter(page); font-size: 8px; color: #9ca3af; font-family: 'Noto Sans Devanagari', sans-serif; } }
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Noto Sans Devanagari',sans-serif;background:#fff;color:#1f2937;-webkit-print-color-adjust:exact;print-color-adjust:exact}

  .bless{display:flex;justify-content:space-between;padding:0 6px;margin-bottom:6px}
  .bless span{font-size:10px;color:${trustHtml().pdfColorAccent};font-weight:700;font-family:'Noto Serif Devanagari',serif;letter-spacing:.5px}

  .hdr{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:4px}
  .logo-box{width:70px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .logo-fb{width:55px;height:50px;border-radius:4px;background:linear-gradient(135deg,#E8EFF7,#d0dcec);border:2px solid #b5c5d8;display:flex;align-items:center;justify-content:center;font-size:9px;color:${trustHtml().pdfColorPrimary};font-weight:700;text-align:center;line-height:1.3;font-family:'Noto Serif Devanagari',serif}
  .logo-fb2{background:linear-gradient(135deg,#f5ece0,#ede0cc)!important;border-color:#c9a87a!important;color:#7a4a1e!important}
  .logo{width:55px;height:50px;border-radius:4px;object-fit:contain}
  .center-block{flex:1;text-align:center;padding:0 6px}
  .org-title{font-size:20px;font-weight:700;color:${trustHtml().pdfColorPrimary};font-family:'Noto Serif Devanagari',serif;letter-spacing:.5px;line-height:1.3}
  .org-sub{font-size:15px;font-weight:700;color:${trustHtml().pdfColorPrimary};margin-bottom:2px}
  .org-addr{font-size:10px;color:#000;line-height:1.5;margin-bottom:2px}
  .org-contact{font-size:10px;color:#000;line-height:1.5}
  .org-contact .blue{color:${trustHtml().pdfColorPrimary};font-weight:700}

  .since-bar{display:flex;justify-content:space-between;border-bottom:1.5px solid ${trustHtml().pdfColorPrimary};padding:4px 6px 6px;margin-bottom:5px}
  .since-bar span{font-size:10px;font-weight:700;color:${trustHtml().pdfColorPrimary};letter-spacing:.6px}

  .title-area{text-align:center;margin:8px 0}
  .title-area .title{display:inline-block;border:2px solid ${trustHtml().pdfColorAccent};border-radius:6px;padding:5px 30px;font-size:14px;font-weight:700;color:${trustHtml().pdfColorAccent};font-family:'Noto Serif Devanagari',serif;letter-spacing:.6px}

  .filters{margin:5px 0 6px;font-size:10px;color:#6b7280;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
  .filter-tag{background:#fef2f2;color:${trustHtml().pdfColorAccent};padding:2px 8px;border-radius:3px;border:1px solid #fecaca;font-size:9px}

  .summary{display:flex;gap:12px;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:10px}
  .summary .count{background:${trustHtml().pdfColorPrimary};color:#fff;padding:4px 16px;border-radius:4px;font-weight:700;font-size:11px}
  .summary .date{color:#9ca3af;font-size:9px}

  table{width:100%;border-collapse:collapse;font-size:9px;border:1.5px solid #bbb}
  thead th{background:${trustHtml().pdfColorPrimary};color:#fff;padding:6px 4px;border:1px solid #2a4a6a;text-align:center;font-size:9px;font-weight:700;letter-spacing:.4px;font-family:'Noto Serif Devanagari',serif;white-space:nowrap}
  tbody td{padding:5px 4px;border:0.8px solid #d1d5db;vertical-align:middle}
  tbody tr:nth-child(even){background:#f8fafc}
  td.c{text-align:center}
  td.l{text-align:left;padding-left:8px;word-break:break-word}
  td.reg{font-weight:700;color:#1e3a8a;text-align:center;font-size:10px}
  td.amt{text-align:right;font-weight:700;font-size:10px;padding-right:6px}
  td.mono{font-family:monospace;font-size:9px}
  .sub{font-size:8px;color:#6b7280}

  .footer{text-align:center;margin-top:8px;padding-top:6px;border-top:1px solid ${trustHtml().pdfColorAccent};font-size:8px;color:#9ca3af}

  @media print{body{background:#fff}.no-print{display:none!important}}
</style></head><body>

<div class="bless">
  ${trustHtml().blessingsHtml}
</div>

<div class="hdr">
  <div class="logo-box"><img src="${trustHtml().logoSrc}" class="logo" onerror="this.style.display='none';this.nextSibling.style.display='flex'" alt=""></div>
  <div class="center-block">
    <div class="org-title">${trustHtml().name}</div>
    <div class="org-sub">${trustHtml().cityLine}</div>
    <div class="org-addr"><b>हेड ऑफिस :</b> ${trustHtml().addressWithOffice}</div>
    <div class="org-contact"><b>संपर्क सूत्र :</b> <span class="blue">${trustHtml().presidentName}</span></div>
    <div class="org-contact"><span class="blue">${trustHtml().presidentPhone}</span> &nbsp;&nbsp; <b>ऑफिस :</b> <span class="blue"> ${trustHtml().officePhone}</span></div>
  </div>
   <div class="logo-box"><img src="${trustHtml().rightImageSrc}" class="logo" onerror="this.style.display='none';this.nextSibling.style.display='flex'" alt=""></div>
</div>

<div class="since-bar">
  <span>${trustHtml().sinceText}</span>
  <span>${trustHtml().regText}</span>
</div>

<div class="title-area">
  <div class="title">सदस्य सूची</div>
</div>

${filterHtml}

<div class="summary">
  <span class="count">कुल सदस्य: ${data.length}</span>
  <span class="date">${new Date().toLocaleDateString('en-IN', { year:'numeric', month:'long', day:'numeric' })}</span>
</div>

<table>
  <thead><tr>
    <th style="width:18px">#</th>
    <th style="width:54px">Reg No</th>
    <th style="width:160px">नाम / पिता</th>
    <th style="width:64px">फोन</th>
    <th style="width:78px">आधार</th>
    <th style="width:90px">योजना</th>
    <th style="width:54px">आयु वर्ग</th>
    <th style="width:64px">गाँव</th>
    <th style="width:54px">राशि</th>
  </tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>

<div style="text-align:center;margin-top:6px;font-size:7px;color:#9ca3af">
  Generated by ${trustHtml().shortName} • ${new Date().toLocaleString('en-IN')}
</div>

<script>
  (function(){var p=document.querySelectorAll('.logo');p.forEach(function(i){if(i.naturalWidth===0){i.style.display='none';var fb=i.nextElementSibling;if(fb)fb.style.display='flex'}});
  setTimeout(function(){window.print()},400)})();
</script>
</body></html>`)
    printWindow.document.close()
  }

  const fileName = selectedMember
    ? `${selectedMember.displayName?.replace(/\s+/g,'_')}_${selectedMember.registrationNumber}_certificate`
    : 'certificate.pdf'

  return (
    <div>
      <Card className="mb-4">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold">Members Management</h1>
            <p className="text-gray-500">Manage all member registrations and information</p>
          </div>
          {
            isSuperAdmin(user) || usersPermissions?.actions?.add_member ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpenAddMember(true)} size="large">
                Add New Member
              </Button>
            ) : null
          }
        </div>

        {/* ── Search + Actions bar ──────────────────────────────────────────
            Filter chips live on their own row below. Keeping them inline here
            meant a growing chip list squeezed the action buttons until they
            overlapped. */}
        <div className="flex flex-wrap justify-between items-center gap-3 mb-3">
          <div className="flex gap-2 items-center flex-1" style={{ minWidth: 240 }}>
            <Search
              placeholder="Search by name, reg no, phone, aadhaar, village..."
              prefix={<SearchOutlined />}
              style={{ flex: 1, maxWidth: 450, minWidth: 200 }}
              onChange={handleSearchChange}
              value={filters.search}
              allowClear loading={searchLoading}
            />
            {searchMode === 'search' && (
              <Tag color="blue" className="text-xs whitespace-nowrap">
                Search Mode — {searchResults.length} results
              </Tag>
            )}
          </div>

          {/* shrink-0 keeps the buttons at their natural size instead of
              collapsing when the search field grows */}
          <div className="flex gap-2 flex-wrap shrink-0">
            <Button icon={<FilterOutlined />} onClick={() => setFilterModalVisible(true)}>
              Filters {getActiveFilterCount() > 0 && `(${getActiveFilterCount()})`}
            </Button>
            {
              (isSuperAdmin(user) || usersPermissions?.actions?.download) && (
              <Dropdown
                menu={{
                  items: [
                    { key: 'csv_current', icon: <TableOutlined />, label: 'CSV (Current View)', onClick: () => exportToCSV() },
                    { key: 'csv_all', icon: <TableOutlined />, label: 'CSV (All Members)', onClick: exportAllToCSV, disabled: allMembersExportLoading },
                    { type: 'divider' },
                    { key: 'pdf_current', icon: <FileTextOutlined />, label: 'PDF (Current View)', onClick: () => {
                      if (!displayedMembers.length) { message.warning('No members in current view'); return }
                      setPdfMeta({ data: displayedMembers, filters, programList, agentList })
                    } },
                    { key: 'pdf', icon: <FileTextOutlined />, label: 'PDF (All Members)', onClick: async () => {
                      setAllMembersExportLoading(true)
                      try {
                        // Use cached data if available, otherwise fetch
                        const data = allMembersForExport || await fetchAllMembersForExport()
                        if (!data || data.length === 0) {
                          message.warning('No members found')
                          return
                        }
                        setPdfMeta({ data, filters, programList, agentList })
                      } catch (err) {
                        console.error('PDF error:', err)
                        message.error('Failed: ' + (err.message || 'unknown'))
                      } finally {
                        setAllMembersExportLoading(false)
                      }
                    } },
                    { type: 'divider' },
                    { key: 'print', icon: <PrinterOutlined />, label: 'Print List (A4)', onClick: printMembers },
                    { type: 'divider' },
                    { key: 'cert_selected', icon: <FileTextOutlined />, label: `Certificate (${selectedRowKeys.length} selected)`, onClick: handleBatchCertSelected, disabled: selectedRowKeys.length === 0 || isCertDownloading },
                    { key: 'cert_all', icon: <FileTextOutlined />, label: 'Certificate (All Filtered)', onClick: handleBatchCertAll, disabled: isCertDownloading },
                  ]
                }}
                trigger={['click']}
              >
                <Button icon={<DownloadOutlined />} loading={allMembersExportLoading}>
                  Download
                </Button>
              </Dropdown>
            )
            }
           
            <Tooltip title={selectedRowKeys.length ? `Send the join certificate to ${selectedRowKeys.length} selected member(s)` : 'Select members first'}>
              <Button
                icon={<WhatsAppOutlined />}
                disabled={selectedRowKeys.length === 0}
                onClick={openWhatsAppSendSelected}
                style={selectedRowKeys.length ? { borderColor: '#25D366', color: '#075E54' } : undefined}
              >
                Send WhatsApp{selectedRowKeys.length ? ` (${selectedRowKeys.length})` : ''}
              </Button>
            </Tooltip>

            <Tooltip title={selectedRowKeys.length ? `Transfer ${selectedRowKeys.length} selected member(s) to another agent` : 'Select members first'}>
              <Button
                icon={<UserSwitchOutlined />}
                disabled={selectedRowKeys.length === 0}
                onClick={() => { setTransferResult(null); setTransferOpen(true) }}
              >
                Transfer Agent{selectedRowKeys.length ? ` (${selectedRowKeys.length})` : ''}
              </Button>
            </Tooltip>

            <Tooltip title="Refresh">
              <Button icon={<ReloadOutlined />} loading={loading || searchLoading}
                onClick={() => searchMode === 'search' && filters.search ? searchMembers(filters.search) : fetchMembers(pagination.current, false)}>
                Refresh
              </Button>
            </Tooltip>
          </div>
        </div>

        {/* ── Active filter chips ───────────────────────────────────────────
            Own row so the list can grow without disturbing the toolbar */}
        {getActiveFilterCount() > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-3 px-3 py-2 rounded-lg"
               style={{ background: 'var(--pink-50)', border: '1px solid var(--pink-100)' }}>
            <span className="text-xs font-semibold shrink-0" style={{ color: '#9d174d' }}>
              <FilterOutlined className="mr-1" />
              {getActiveFilterCount()} active:
            </span>

            {/* One chip per selected yojna. Removing one also drops any age
                group belonging to it, since those ids can't match anything else */}
            {filters.programIds?.map(pid => (
              <Tag key={pid} color="magenta" closable style={{ margin: 0 }}
                onClose={() => {
                  const nextPrograms = filters.programIds.filter(x => x !== pid)
                  const stillValid = new Set(
                    nextPrograms.flatMap(id =>
                      (programList?.find(p => p.id === id)?.ageGroups || []).map(g => g.id))
                  )
                  clearFilter({
                    programIds:  nextPrograms,
                    ageGroupIds: (filters.ageGroupIds || []).filter(id => stillValid.has(id)),
                  })
                }}>
                Yojna: {programList?.find(p => p.id === pid)?.name || pid}
              </Tag>
            ))}
            {/* One chip per selected group, each removable on its own */}
            {filters.ageGroupIds?.map(id => (
              <Tag key={id} color="purple" closable style={{ margin: 0 }}
                onClose={() => clearFilter({ ageGroupIds: filters.ageGroupIds.filter(x => x !== id) })}>
                Age: {availableAgeGroups.find(g => g.id === id)?.ageGroupName || id}
              </Tag>
            ))}
            {filters.agentId !== 'all' && (
              <Tag color="blue" closable style={{ margin: 0 }}
                onClose={() => clearFilter({ agentId: 'all' })}>
                Agent: {getAgentName(filters.agentId)}
              </Tag>
            )}
            {filters.status !== 'all' && (
              <Tag color={filters.status === 'closed' ? 'purple' : 'green'} closable style={{ margin: 0 }}
                onClose={() => clearFilter({ status: 'all' })}>
                Status: {filters.status === 'closed' ? 'Closed' : filters.status}
              </Tag>
            )}
            {filters.gender !== 'all' && (
              <Tag closable style={{ margin: 0 }}
                onClose={() => clearFilter({ gender: 'all' })}>
                Gender: {filters.gender}
              </Tag>
            )}
            {filters.paymentStatus !== 'all' && (
              <Tag color="orange" closable style={{ margin: 0 }}
                onClose={() => clearFilter({ paymentStatus: 'all' })}>
                Join Fees: {filters.paymentStatus}
              </Tag>
            )}
            {filters.closingPaymentStatus !== 'all' && (
              <Tag color="volcano" closable style={{ margin: 0 }}
                onClose={() => clearFilter({ closingPaymentStatus: 'all' })}>
                Closing: {filters.closingPaymentStatus.replace('closed', '')}
              </Tag>
            )}
            {filters.fromDate && (
              <Tag color="cyan" closable style={{ margin: 0 }}
                onClose={() => clearFilter({ fromDate: null })}>
                From: {formatDate(filters.fromDate)}
              </Tag>
            )}
            {filters.toDate && (
              <Tag color="cyan" closable style={{ margin: 0 }}
                onClose={() => clearFilter({ toDate: null })}>
                To: {formatDate(filters.toDate)}
              </Tag>
            )}

            <Button type="link" size="small" onClick={resetFilters}
              className="ml-auto shrink-0" style={{ fontSize: 12, height: 22, padding: '0 4px' }}>
              Clear all
            </Button>
          </div>
        )}

        <Table
          columns={columns}
          dataSource={displayedMembers}
          rowKey="id"
          loading={loading || searchLoading}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
            preserveSelectedRowKeys: true,
          }}
          pagination={{
            current:  pagination.current,
            pageSize: pagination.pageSize,
            total:    searchMode === 'search' ? searchResults.length : pagination.total,
            showSizeChanger: true, showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} members`,
            pageSizeOptions: ['10','20','50','100'],
          }}
          onChange={handleTableChange}
          scroll={{ x: 1300, y: '50vh' }}
          sticky size="small" rowClassName="text-xs"
        />
      </Card>

      {/* ── Send Certificate on WhatsApp Drawer ───────────────────────────── */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <WhatsAppOutlined style={{ color: '#25D366', fontSize: 20 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Send Certificate on WhatsApp</div>
              <div style={{ fontSize: 11, color: '#888', fontWeight: 400 }}>
                Same message that goes out when a member is added or approved
              </div>
            </div>
          </div>
        }
        placement="right"
        width={520}
        open={waOpen}
        onClose={() => { if (!waSending) setWaOpen(false) }}
        maskClosable={!waSending}
        extra={
          !waResults ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={() => setWaOpen(false)} disabled={waSending}>Cancel</Button>
              <Button
                type="primary"
                icon={<WhatsAppOutlined />}
                loading={waSending}
                disabled={!waToMember && !waToAgent}
                onClick={runWhatsAppSend}
                style={{ background: '#25D366', borderColor: '#25D366' }}
              >
                Send{waTargets.length > 1 ? ` (${waTargets.length})` : ''}
              </Button>
            </div>
          ) : (
            <Button onClick={() => setWaOpen(false)}>Close</Button>
          )
        }
      >
        {/* Recipients */}
        {!waResults && (
          <>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 14, fontSize: 12 }}
              message="A fresh certificate is generated for each member"
              description="The PDF is regenerated from current member data, saved to their record, and attached to the message."
            />

            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13 }}>Send to</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Checkbox checked={waToMember} onChange={e => setWaToMember(e.target.checked)} disabled={waSending}>
                  <span style={{ fontSize: 13 }}>
                    Member&apos;s own number
                    {waToMember && <span style={{ fontSize: 11, color: '#16a34a', marginLeft: 6 }}>(with certificate)</span>}
                  </span>
                </Checkbox>
                <Checkbox checked={waToAgent} onChange={e => setWaToAgent(e.target.checked)} disabled={waSending}>
                  <span style={{ fontSize: 13 }}>
                    Their agent&apos;s number
                    {waToAgent && <span style={{ fontSize: 11, color: '#16a34a', marginLeft: 6 }}>(same details + certificate)</span>}
                  </span>
                </Checkbox>
              </div>
              {!waToMember && !waToAgent && (
                <div style={{ marginTop: 10, fontSize: 11, color: '#d97706', background: '#fffbeb', padding: 8, borderRadius: 4 }}>
                  ⚠️ Choose at least one recipient.
                </div>
              )}
            </div>

            {/* Target list */}
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
              {waTargets.length} member{waTargets.length === 1 ? '' : 's'}
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 8 }}>
              {waTargets.map(m => (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px', borderBottom: '1px solid #f5f5f5',
                }}>
                  <Avatar src={m.photoURL || undefined} size={30}>{(m.displayName || '?')[0]}</Avatar>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{m.displayName || '—'}</div>
                    <div style={{ fontSize: 10.5, color: '#888', fontFamily: 'monospace' }}>
                      {m.registrationNumber || '—'}
                    </div>
                  </div>
                  {m.phone
                    ? <Tag style={{ fontSize: 10, margin: 0 }}>{m.phone}</Tag>
                    : <Tag color="error" style={{ fontSize: 10, margin: 0 }}>No phone</Tag>}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Progress */}
        {waSending && (
          <div style={{ marginTop: 16 }}>
            <Progress
              percent={waProgress.total ? Math.round((waProgress.current / waProgress.total) * 100) : 0}
              status="active"
              strokeColor="#25D366"
            />
            <div style={{ fontSize: 12, color: '#888', textAlign: 'center' }}>
              Sending {waProgress.current} of {waProgress.total}…
            </div>
          </div>
        )}

        {/* Results */}
        {waResults && (
          <>
            <Alert
              type={waResults.every(r => r.memberSent || r.agentSent) ? 'success' : 'warning'}
              showIcon
              style={{ marginBottom: 12 }}
              message={`${waResults.filter(r => r.memberSent || r.agentSent).length} of ${waResults.length} sent`}
            />
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              {waResults.map(r => (
                <div key={r.id} style={{
                  padding: '8px 10px', borderBottom: '1px solid #f5f5f5', fontSize: 12,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 600 }}>{r.name}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 10.5, color: 'var(--primary)' }}>{r.regNo}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    {waToMember && (
                      <Tag color={r.memberSent ? 'success' : 'error'} style={{ fontSize: 10, margin: 0 }}>
                        Member {r.memberSent ? 'sent' : 'failed'}
                      </Tag>
                    )}
                    {waToAgent && (
                      <Tag color={r.agentSent ? 'success' : 'default'} style={{ fontSize: 10, margin: 0 }}>
                        Agent {r.agentSent ? 'sent' : 'skipped'}
                      </Tag>
                    )}
                    {r.certOk && <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>Certificate ✓</Tag>}
                  </div>
                  {(r.error || r.agentError) && (
                    <div style={{ fontSize: 10.5, color: '#dc2626', marginTop: 3 }}>
                      {r.error || r.agentError}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </Drawer>

      {/* ── Agent Transfer Drawer ─────────────────────────────────────────── */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <UserSwitchOutlined style={{ color: 'var(--primary)', fontSize: 20 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Transfer Members</div>
              <div style={{ fontSize: 11, color: '#888', fontWeight: 400 }}>Move selected members to a different agent</div>
            </div>
          </div>
        }
        placement="right"
        width={560}
        open={transferOpen}
        onClose={closeTransferDrawer}
        extra={
          !transferResult ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={closeTransferDrawer} disabled={transferLoading}>Cancel</Button>
              <Button
                type="primary"
                icon={<UserSwitchOutlined />}
                loading={transferLoading}
                disabled={!transferAgentId}
                onClick={handleTransferAgents}
                style={{ background: 'var(--primary)', borderColor: 'var(--primary)' }}
              >
                Transfer {selectedRowKeys.length} Member{selectedRowKeys.length !== 1 ? 's' : ''}
              </Button>
            </div>
          ) : (
            <Button type="primary" onClick={closeTransferDrawer} style={{ background: 'var(--primary)', borderColor: 'var(--primary)' }}>Done</Button>
          )
        }
        destroyOnClose
      >
        {transferResult ? (
          /* ── Result panel ── */
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Transferred', value: transferResult.summary?.transferred,  color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
                { label: 'Skipped',     value: (transferResult.results||[]).filter(r=>r.status==='skipped').length, color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
                { label: 'Errors',      value: (transferResult.results||[]).filter(r=>r.status==='error').length,   color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
              ].map(s => (
                <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value ?? 0}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Result per member</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(transferResult.results || []).map((r, i) => {
                const isOk   = r.status === 'transferred'
                const isSkip = r.status === 'skipped'
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: isOk ? '#f0fdf4' : isSkip ? '#fffbeb' : '#fef2f2',
                    border: `1px solid ${isOk ? '#bbf7d0' : isSkip ? '#fde68a' : '#fecaca'}`,
                    borderRadius: 8, padding: '8px 12px',
                  }}>
                    <Avatar size={32} icon={<UserOutlined />} style={{ background: isOk ? '#16a34a' : isSkip ? '#d97706' : '#dc2626', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.name || r.memberId}
                      </div>
                      {r.regNo   && <div style={{ fontSize: 11, color: '#888' }}>{r.regNo}</div>}
                      {isOk      && <div style={{ fontSize: 11, color: '#16a34a' }}>✓ {r.from} → {r.to}</div>}
                      {isSkip    && <div style={{ fontSize: 11, color: '#d97706' }}>⊘ {r.reason}</div>}
                      {r.status === 'error' && <div style={{ fontSize: 11, color: '#dc2626' }}>✗ {r.error}</div>}
                    </div>
                    <Tag color={isOk ? 'success' : isSkip ? 'warning' : 'error'} style={{ margin: 0, flexShrink: 0 }}>
                      {isOk ? 'Done' : isSkip ? 'Skipped' : 'Error'}
                    </Tag>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          /* ── Selection panel ── */
          <div>
            {/* Target agent selector */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Select target agent</div>
              <Select
                style={{ width: '100%' }}
                placeholder="Search agent by name or phone..."
                showSearch
                allowClear
                optionFilterProp="label"
                value={transferAgentId}
                onChange={setTransferAgentId}
                disabled={transferLoading}
                size="large"
                options={agentList
                  ?.filter(a => a.delete_flag !== true)
                  .map(a => ({
                    value: a.id,
                    label: `${a.name} — ${a.phone1 || 'No phone'}${a.village ? ' · ' + a.village : ''}`,
                  }))}
              />
              {transferAgentId && (() => {
                const ag = agentList?.find(a => a.id === transferAgentId)
                if (!ag) return null
                return (
                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--pink-100)', border: '1px solid var(--pink-300)', borderRadius: 10, padding: '10px 14px' }}>
                    <Avatar src={ag.photoUrl} icon={<UserOutlined />} size={42} style={{ background: 'var(--primary)', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{ag.name}</div>
                      <div style={{ fontSize: 12, color: '#888' }}>{ag.phone1}{ag.village ? ' · ' + ag.village : ''}</div>
                      {ag.memberCount != null && (
                        <div style={{ fontSize: 11, color: 'var(--primary)', marginTop: 2 }}>
                          Currently {ag.memberCount?.toLocaleString()} member{ag.memberCount !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Info note */}
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#1e40af', marginBottom: 18 }}>
              <b>What gets transferred:</b> member counts, join fees totals, closing amounts &amp; counts,
              and payment records are re-tagged to the new agent.
              <div style={{ color: '#6b7280', marginTop: 4 }}>
                Commission already earned stays with the original agent.
              </div>
            </div>

            {/* Members preview */}
            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
              {selectedRowKeys.length} member{selectedRowKeys.length !== 1 ? 's' : ''} selected
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflowY: 'auto', paddingRight: 4 }}>
              {selectedRowKeys.map(id => {
                const allKnown = [...(members || []), ...(searchResults || [])]
                const m = allKnown.find(x => x.id === id)
                const curAgent = m?.agentId ? (agentList?.find(a => a.id === m.agentId || a.uid === m.agentId)) : null
                const toAgent  = transferAgentId ? agentList?.find(a => a.id === transferAgentId) : null
                return (
                  <div key={id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: '#fafafa', border: '1px solid #e5e7eb',
                    borderRadius: 8, padding: '8px 12px',
                  }}>
                    <Avatar src={m?.photoURL} icon={<UserOutlined />} size={32}
                      style={{ background: 'var(--primary)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m?.displayName || id}
                      </div>
                      <div style={{ fontSize: 11, color: '#888' }}>
                        {m?.registrationNumber || ''}
                        {m?.programName ? ' · ' + m.programName : ''}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>{curAgent?.name || m?.addedByName || 'No agent'}</div>
                      {toAgent && (
                        <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>→ {toAgent.name}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </Drawer>

      {/* ── Advanced Filters Drawer ───────────────────────────────────────── */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FilterOutlined style={{ color: 'var(--primary)', fontSize: 18 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Advanced Filters</div>
              <div style={{ fontSize: 11, color: '#888', fontWeight: 400 }}>
                {getActiveFilterCount() > 0
                  ? `${getActiveFilterCount()} filter${getActiveFilterCount() === 1 ? '' : 's'} active`
                  : 'No filters applied'}
              </div>
            </div>
          </div>
        }
        placement="right"
        width={460}
        open={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        styles={{
          header: { borderBottom: '1px solid #e5e7eb', padding: '16px 20px' },
          body:   { padding: '16px 20px', background: '#fafafa' },
          footer: { padding: '12px 20px', borderTop: '1px solid #e5e7eb' },
        }}
        // Apply pinned to the footer so it's reachable without scrolling
        footer={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={resetFilters} disabled={getActiveFilterCount() === 0} style={{ flex: 1 }}>
              Reset
            </Button>
            <Button type="primary" onClick={applyFilters} style={{ flex: 2 }}>
              Apply Filters
              {getActiveFilterCount() > 0 ? ` (${getActiveFilterCount()})` : ''}
            </Button>
          </div>
        }
      >
        <Form form={filterForm} layout="vertical" onValuesChange={handleFilterChange} initialValues={filters}>

          {/* ── Yojna & Age Group ──────────────────────────────────────────── */}
          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10 }}>
              YOJNA
            </div>

            <Form.Item
              label={
                <div className="flex items-center justify-between w-full" style={{ minWidth: 220 }}>
                  <span>Yojna</span>
                  <span className="flex gap-2">
                    <a
                      style={{ fontSize: 11 }}
                      onClick={() => {
                        const all = (programList || []).map(p => p.id)
                        filterForm.setFieldValue('programIds', all)
                        handleFilterChange({ programIds: all })
                      }}
                    >
                      Select all
                    </a>
                    {filters.programIds?.length > 0 && (
                      <a
                        style={{ fontSize: 11, color: '#9ca3af' }}
                        onClick={() => {
                          filterForm.setFieldsValue({ programIds: [], ageGroupIds: [] })
                          handleFilterChange({ programIds: [] })
                        }}
                      >
                        Clear
                      </a>
                    )}
                  </span>
                </div>
              }
              name="programIds"
              style={{ marginBottom: 12 }}
            >
              <Select
                mode="multiple"
                allowClear
                placeholder="All Yojna"
                showSearch
                optionFilterProp="label"
                maxTagCount="responsive"
                options={(programList || []).map(p => ({ value: p.id, label: p.name }))}
              />
            </Form.Item>

            {/* Age groups are defined per yojna, so this stays locked until one is chosen */}
            <Form.Item
              label={
                <div className="flex items-center justify-between w-full" style={{ minWidth: 220 }}>
                  <span>Age Group</span>
                  {availableAgeGroups.length > 0 && (
                    <span className="flex gap-2">
                      <a
                        style={{ fontSize: 11 }}
                        onClick={() => {
                          const all = availableAgeGroups.map(g => g.id)
                          filterForm.setFieldValue('ageGroupIds', all)
                          setFilters(p => ({ ...p, ageGroupIds: all }))
                        }}
                      >
                        Select all
                      </a>
                      {filters.ageGroupIds?.length > 0 && (
                        <a
                          style={{ fontSize: 11, color: '#9ca3af' }}
                          onClick={() => {
                            filterForm.setFieldValue('ageGroupIds', [])
                            setFilters(p => ({ ...p, ageGroupIds: [] }))
                          }}
                        >
                          Clear
                        </a>
                      )}
                    </span>
                  )}
                </div>
              }
              name="ageGroupIds"
              style={{ marginBottom: 0 }}
            >
              <Select
                mode="multiple"
                allowClear
                placeholder={!filters.programIds?.length ? 'Select a Yojna first' : 'All Age Groups'}
                disabled={!filters.programIds?.length}
                showSearch
                optionFilterProp="label"
                maxTagCount="responsive"
                // Grouped by yojna — several programs use the same group names
                // (M3, M4…), so a flat list would be ambiguous
                options={ageGroupOptions}
              />
            </Form.Item>

            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
              {!filters.programIds?.length
                ? 'Age groups are defined per yojna — pick one or more to filter by group.'
                : filters.ageGroupIds?.length
                  ? `Showing ${filters.ageGroupIds.length} of ${availableAgeGroups.length} groups across ${filters.programIds.length} yojna`
                  : 'Leave empty to include every age group.'}
            </div>
          </div>

          {/* ── People ─────────────────────────────────────────────────────── */}
          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10 }}>
              PEOPLE
            </div>

            <Form.Item label="Agent" name="agentId" style={{ marginBottom: 12 }}>
              <Select placeholder="All Agents" showSearch optionFilterProp="children">
                <Option value="all">All Agents</Option>
                {agentList?.map(a => <Option key={a.id} value={a.id}>{a.name} ({a.phone1 || 'No phone'})</Option>)}
              </Select>
            </Form.Item>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Form.Item label="Status" name="status" style={{ marginBottom: 0 }}>
                <Select placeholder="All">
                  <Option value="all">All Status</Option>
                  <Option value="active">Active</Option>
                  <Option value="inactive">Inactive</Option>
                  <Option value="closed">Closed (Marriage)</Option>
                </Select>
              </Form.Item>

              <Form.Item label="Gender" name="gender" style={{ marginBottom: 0 }}>
                <Select placeholder="All">
                  <Option value="all">All</Option>
                  <Option value="male">♂ Male</Option>
                  <Option value="female">♀ Female</Option>
                  <Option value="other">Other</Option>
                </Select>
              </Form.Item>
            </div>
          </div>

          {/* ── Payments ───────────────────────────────────────────────────── */}
          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10 }}>
              PAYMENTS
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Form.Item label="Join Fees" name="paymentStatus" style={{ marginBottom: 0 }}>
                <Select placeholder="All">
                  <Option value="all">All</Option>
                  <Option value="paid">Paid</Option>
                  <Option value="partial">Partial</Option>
                  <Option value="pending">Pending</Option>
                </Select>
              </Form.Item>

              <Form.Item label="Closing Payment" name="closingPaymentStatus" style={{ marginBottom: 0 }}>
                <Select placeholder="All">
                  <Option value="all">All</Option>
                  <Option value="closedPaid">Paid</Option>
                  <Option value="closedPending">Pending</Option>
                  <Option value="closedPartial">Partial</Option>
                </Select>
              </Form.Item>
            </div>
          </div>

          {/* ── Join Date ──────────────────────────────────────────────────── */}
          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10 }}>
              JOIN DATE
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Form.Item label="From" name="fromDate" style={{ marginBottom: 0 }}>
                <DatePicker format="DD-MM-YYYY" style={{ width: '100%' }} placeholder="Any" />
              </Form.Item>
              <Form.Item label="To" name="toDate" style={{ marginBottom: 0 }}>
                <DatePicker format="DD-MM-YYYY" style={{ width: '100%' }} placeholder="Any" />
              </Form.Item>
            </div>

            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>
              Filters on the member&apos;s join date — editing a join date moves the
              member into the matching range.
            </div>

            {/* Shown only while the one-off auto-repair is running */}
            {backfillLoading && (
              <div style={{ fontSize: 11, color: '#92400e', marginTop: 6 }}>
                Preparing older members for date filtering
                {backfillProgress ? ` — ${backfillProgress.scanned} processed…` : '…'}
              </div>
            )}
          </div>

          {/* ── Active filter chips ────────────────────────────────────────── */}
          {getActiveFilterCount() > 0 && (
            <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10 }}>
                ACTIVE FILTERS
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {filters.programIds?.map(pid => (
                  <Tag key={pid} color="magenta" style={{ margin: 0 }}>
                    {programList?.find(p => p.id === pid)?.name || pid}
                  </Tag>
                ))}
                {filters.ageGroupIds?.map(id => (
                  <Tag key={id} color="purple" style={{ margin: 0 }}>
                    {availableAgeGroups.find(g => g.id === id)?.ageGroupName || 'Age group'}
                  </Tag>
                ))}
                {filters.agentId !== 'all' && (
                  <Tag color="blue" style={{ margin: 0 }}>{getAgentName(filters.agentId)}</Tag>
                )}
                {filters.status !== 'all'               && <Tag style={{ margin: 0 }}>{filters.status}</Tag>}
                {filters.gender !== 'all'               && <Tag style={{ margin: 0 }}>{filters.gender}</Tag>}
                {filters.paymentStatus !== 'all'        && <Tag color="green" style={{ margin: 0 }}>Join: {filters.paymentStatus}</Tag>}
                {filters.closingPaymentStatus !== 'all' && <Tag color="orange" style={{ margin: 0 }}>Closing: {filters.closingPaymentStatus}</Tag>}
                {(filters.fromDate || filters.toDate) && (
                  <Tag color="cyan" style={{ margin: 0 }}>
                    {filters.fromDate ? formatDate(filters.fromDate) : 'Any'} → {filters.toDate ? formatDate(filters.toDate) : 'Any'}
                  </Tag>
                )}
              </div>
            </div>
          )}
        </Form>
      </Drawer>

      {/* Drawers & Modals */}
      <AddMember programs={programList||[]} agents={agentList||[]} open={openAddMember} setOpen={setOpenAddMember} currentUser={user}
        onSuccess={() => searchMode==='search'&&filters.search ? searchMembers(filters.search) : fetchMembers(pagination.current,false)} />

      <EditMember programs={programList||[]} agents={agentList||[]} open={openEditMember} setOpen={setOpenEditMember}
        currentUser={user} memberId={editMemberId}
        onSuccess={() => searchMode==='search'&&filters.search ? searchMembers(filters.search) : fetchMembers(pagination.current,false)} />

      {selectedMember && (
        <MemberDetailDrawer member={selectedMember} visible={detailDrawerVisible}
          onClose={() => { setDetailDrawerVisible(false); setSelectedMember(null) }}
          programList={programList} agentList={agentList}
          onPaymentSuccess={async (memberId) => {
            try {
              const snap = await getDoc(doc(db, 'members', memberId))
              if (snap.exists()) {
                const fresh = { id: snap.id, ...snap.data() }
                setSelectedMember(fresh)
                setMembers(prev => prev.map(m => m.id === fresh.id ? fresh : m))
              }
            } catch (e) { console.error('Failed to refresh member after payment', e) }
          }}
        />
      )}

      {openCertificate && (
        <Drawer open={openCertificate} onClose={() => setOpenCertificate(false)} title={fileName} size={800} destroyOnClose
          footer={
            <div className="flex justify-end gap-3">
              <Button onClick={() => setOpenCertificate(false)}>Close</Button>
              <PDFDownloadLink document={<CertificateCom data={selectedMember} memberProgram={programList?.find(p => p.id === selectedMember?.programId) || {}} />} fileName={fileName}>
                {({ loading: pdfLoading }) => (
                  <Button type="primary" loading={pdfLoading} disabled={pdfLoading}
                    onClick={() => setTimeout(() => setOpenCertificate(false), 500)}>
                    {pdfLoading ? 'Preparing PDF...' : 'Download PDF'}
                  </Button>
                )}
              </PDFDownloadLink>
            </div>
          }>
          <CertificateViewer memberData={selectedMember}  />
        </Drawer>
      )}

      {rasidDrawerOpen && <RasidDrawer open={rasidDrawerOpen} setOpen={setRasidDrawerOpen} member={selectedMember} />}

      {paymentDetailsMember && (
        <PaymentDetailsDrawer
          member={paymentDetailsMember}
          visible={paymentDetailsVisible}
          onClose={() => { setPaymentDetailsVisible(false); setPaymentDetailsMember(null) }}
          onDeleteSuccess={handlePaymentDeleteSuccess}
        />
      )}

      {/* Close without raising any instalment — for closings already handled
          in the old system. */}
      <Modal
        open={!!closeNoPayMember}
        title="सदस्य बंद करें — बिना किस्त"
        onCancel={() => setCloseNoPayMember(null)}
        onOk={submitCloseNoPay}
        okText="बंद करें"
        cancelText="रुकें"
        okButtonProps={{ danger: true, loading: closeNoPaySaving, disabled: !closeNoPayDate }}
        destroyOnClose
        width={460}
      >
        <div className="mb-3">
          <div className="font-semibold">{closeNoPayMember?.displayName}</div>
          <div className="text-xs text-gray-500">
            {closeNoPayMember?.registrationNumber} · {closeNoPayMember?.phone || '—'}
          </div>
        </div>

        <div className="mb-2 text-xs text-gray-500">समापन दिनांक *</div>
        <DatePicker
          style={{ width: '100%' }}
          format="DD-MM-YYYY"
          value={closeNoPayDate}
          onChange={setCloseNoPayDate}
          disabledDate={(d) => d && d > dayjs().endOf('day')}
          placeholder="दिनांक चुनें"
        />

        <Alert
          type="info"
          showIcon
          className="mt-3"
          message="कोई किस्त नहीं जुड़ेगी"
          description={
            <span className="text-xs">
              सिर्फ़ स्थिति <b>बंद</b> और समापन दिनांक दर्ज होगी। न कोई रसीद बनेगी,
              न किसी सदस्य या एजेंट का बकाया बदलेगा।
            </span>
          }
        />
      </Modal>

      <PdfAutoDownloader pdfMeta={pdfMeta} onDone={() => setPdfMeta(null)} />
    </div>
  )
}

export default Page