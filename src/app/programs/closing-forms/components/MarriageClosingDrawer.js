"use client"
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  Drawer, Button, Checkbox, Avatar, Empty, DatePicker,
  Upload, message, Modal, Space, Row, Col, Input,
  Collapse, Alert, Progress, Spin, Badge, Tag
} from 'antd'
import {
  CloseOutlined, UserOutlined, DeleteOutlined, UploadOutlined,
  CheckCircleOutlined, CalendarOutlined, FileTextOutlined,
  TeamOutlined, FlagOutlined, ArrowRightOutlined, ArrowLeftOutlined,
  SaveOutlined, EyeOutlined, WarningOutlined, HeartFilled,
  ApartmentOutlined, SearchOutlined, ReloadOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'
import { auth } from '../../../../../lib/firbase-client'
import { paymentApi } from '@/utils/api'
import { Colors } from '@/constent/antdTheme'
import {
  fetchAllMembersForSearch,
  fetchMembersPaginated,
} from '@/app/members/components/firebase-helpers'
import { storage } from '../../../../../lib/firbase-client'

const { confirm } = Modal
const { Panel }   = Collapse
const C    = Colors
const grad = `linear-gradient(135deg,${C.primary} 0%,${C.secondary} 100%)`
const gradG = `linear-gradient(135deg,${C.success} 0%,${C.accent} 100%)`

// ─── tiny helpers ─────────────────────────────────────────────────────────────
const Pill = ({ children, color = C.primary }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', padding: '1px 7px',
    borderRadius: 999, fontSize: 10, fontWeight: 600,
    background: color + '18', color, lineHeight: '18px',
  }}>{children}</span>
)
const Label = ({ children, required }) => (
  <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, marginBottom: 4 }}>
    {children}{required && <span style={{ color: C.error }}> *</span>}
  </div>
)

// ─── open invitation card through authenticated proxy (avoids 404 from Storage rules) ─
const openInvitationCard = async (firebaseUrl) => {
  if (!firebaseUrl) return
  try {
    const token = await auth.currentUser?.getIdToken()
    const proxyUrl = `/api/closing-card/view?fileUrl=${encodeURIComponent(firebaseUrl)}`
    const res = await fetch(proxyUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new Error(`Server returned ${res.status}`)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const win = window.open(blobUrl, '_blank')
    // Revoke after 2 min so memory is freed
    setTimeout(() => URL.revokeObjectURL(blobUrl), 120_000)
    if (!win) {
      // Popup blocked — fall back to direct URL
      window.open(firebaseUrl, '_blank')
    }
  } catch (e) {
    console.error('openInvitationCard error:', e)
    // Fall back to direct Firebase Storage URL
    window.open(firebaseUrl, '_blank')
  }
}

// ─── step bar ─────────────────────────────────────────────────────────────────
const StepBar = ({ step }) => {
  const steps = ['Program', 'Groups', 'Members', 'Details']
  return (
    <div style={{
      display: 'flex', alignItems: 'center', background: C.surfaceSec,
      borderRadius: 10, padding: '10px 18px', marginBottom: 20, border: `1px solid ${C.border}`
    }}>
      {steps.map((label, i) => {
        const active = i === step, done = i < step
        return (
          <React.Fragment key={i}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, flexShrink: 0,
                background: done ? gradG : active ? grad : C.border, color: done || active ? '#fff' : C.muted
              }}>
                {done ? '✓' : i + 1}
              </div>
              <span style={{
                fontSize: 12, fontWeight: active ? 700 : 500, whiteSpace: 'nowrap',
                color: active ? C.primary : done ? C.accent : C.muted
              }}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{
                flex: 1, height: 2, margin: '0 8px', minWidth: 16,
                background: done ? C.accent : C.border, borderRadius: 2
              }} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

const SectionHeader = ({ icon, title, subtitle, action }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 36, height: 36, borderRadius: 9, background: grad, display: 'flex',
        alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16, flexShrink: 0
      }}>{icon}</div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15, color: C.fg }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: C.muted }}>{subtitle}</div>}
      </div>
    </div>
    {action}
  </div>
)

// ─── member select card ───────────────────────────────────────────────────────
const MemberSelectCard = ({ member, checked, onChange, programId, existingGroupId }) => {
  // FIX: in add-mode, "already closed" means closed in a DIFFERENT group.
  // Members closed in the current group can still be selected if needed for other reasons,
  // but we flag those already in the SAME group as the existing one.
  const alreadyClosedInThisGroup = existingGroupId
    ? (member.closedStatus || []).some(
        cs => cs.programId === programId && cs.closingGroupId === existingGroupId
      )
    : (member.closedStatus || []).some(
        cs => cs.programId === programId && cs.closingGroupId
      )

  return (
    <div
      onClick={() => !alreadyClosedInThisGroup && onChange(!checked)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 12px', borderRadius: 8,
        cursor: alreadyClosedInThisGroup ? 'not-allowed' : 'pointer',
        border: `1.5px solid ${alreadyClosedInThisGroup ? C.warning : checked ? C.primary : C.border}`,
        background: alreadyClosedInThisGroup ? C.warning + '08' : checked ? C.primary + '08' : C.surface,
        transition: 'all .15s', marginBottom: 6,
      }}
    >
      <Checkbox
        checked={checked} disabled={alreadyClosedInThisGroup}
        onChange={e => { e.stopPropagation(); !alreadyClosedInThisGroup && onChange(e.target.checked) }}
        onClick={e => e.stopPropagation()}
      />
      <Avatar src={member.photoURL} icon={<UserOutlined />} size={34}
        style={{ border: `2px solid ${alreadyClosedInThisGroup ? C.warning : checked ? C.primary : C.border}`, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: C.fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {member.displayName || member.name}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
          <Pill color={C.info}>{member.registrationNumber}</Pill>
          {member.phone   && <Pill color={C.accent}>{member.phone}</Pill>}
          {member.village && <Pill color={C.muted}>{member.village}</Pill>}
          {member.programName && <Pill color={C.primary}>{member.programName}</Pill>}
          {alreadyClosedInThisGroup && <Pill color={C.warning}>Already Closed</Pill>}
        </div>
      </div>
      {checked && !alreadyClosedInThisGroup && <CheckCircleOutlined style={{ color: C.primary, fontSize: 16, flexShrink: 0 }} />}
    </div>
  )
}

// ─── member detail row (step 3) ───────────────────────────────────────────────
const MemberDetailRow = ({ member, details, progress, onUpdate, onRemove, onUpload, onRemoveFile, onViewCard }) => {
  const pct       = progress
  const uploading = typeof pct === 'number' && pct > 0 && pct < 100
  const uploaded  = pct === 'done' || !!details?.invitationUrl
  const errored   = pct === 'error'
  return (
    <div style={{ background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', background: C.surfaceSec, borderBottom: `1px solid ${C.border}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar src={member?.photoURL} icon={<UserOutlined />} size={38}
            style={{ border: `2px solid ${C.primaryL}`, flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: C.fg }}>{member?.displayName || member?.name}</div>
            <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
              <Pill color={C.info}>{member?.registrationNumber}</Pill>
              {member?.phone && <Pill color={C.accent}>{member.phone}</Pill>}
            </div>
          </div>
        </div>
        <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={onRemove} style={{ color: C.error }}>Remove</Button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 1fr', gap: 14, padding: '12px 14px', alignItems: 'start' }}>
        <div>
          <Label required>Marriage Date</Label>
          <DatePicker style={{ width: '100%' }} value={details?.marriageDate}
            onChange={d => onUpdate('marriageDate', d)}
            format="DD/MM/YYYY" placeholder="Pick date" size="small" allowClear={false} />
        </div>
        <div>
          <Label>Invitation Card</Label>
          {uploaded && !uploading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.success + '10', border: `1px solid ${C.success}35`, borderRadius: 7, padding: '5px 10px' }}>
              <CheckCircleOutlined style={{ color: C.success, fontSize: 13 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.success, flex: 1 }}>Uploaded</span>
              <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => onViewCard(details.invitationUrl)} style={{ padding: '0 3px', fontSize: 11, color: C.info }} />
              <Button type="link" size="small" onClick={onRemoveFile} style={{ padding: '0 3px', fontSize: 11, color: C.error }}>✕</Button>
            </div>
          ) : uploading ? (
            <div style={{ background: C.surfaceSec, border: `1px solid ${C.border}`, borderRadius: 7, padding: '5px 10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 10, color: C.muted }}>Uploading…</span>
                <span style={{ fontSize: 10, color: C.primary, fontWeight: 700 }}>{pct}%</span>
              </div>
              <Progress percent={pct} strokeColor={C.primary} size="small" showInfo={false} />
            </div>
          ) : (
            <Upload accept="image/*,.pdf" showUploadList={false} customRequest={onUpload}>
              <Button size="small" icon={errored ? <WarningOutlined /> : <UploadOutlined />}
                style={{ width: '100%', borderColor: errored ? C.error : C.primaryL, color: errored ? C.error : C.primary, background: errored ? C.error + '08' : C.primary + '06' }}>
                {errored ? 'Retry' : 'Upload Card'}
              </Button>
            </Upload>
          )}
        </div>
        <div>
          <Label>Note (optional)</Label>
          <Input size="small" placeholder="Any notes…" value={details?.note || ''}
            onChange={e => onUpdate('note', e.target.value)} style={{ borderColor: C.border }} />
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
const MarriageClosingDrawer = ({ visible, onClose, members: allMembers = [], programList = [], currentUser, closingGroups = [], onSuccess }) => {
  const [step,           setStep]           = useState(0)
  const [selectedProg,   setSelectedProg]   = useState(null)
  const [ageGroups,      setAgeGroups]      = useState([])
  const [memberGroups,   setMemberGroups]   = useState([])
  const [selectedIds,    setSelectedIds]    = useState([])
  const [selectedMap,    setSelectedMap]    = useState({})
  const [details,        setDetails]        = useState({})
  const [uploadProgress, setUploadProgress] = useState({})
  const [processing,     setProcessing]     = useState(false)

  const [displayed,    setDisplayed]    = useState([])
  const [search,       setSearch]       = useState('')
  const [listLoading,  setListLoading]  = useState(false)
  const [searchMode,   setSearchMode]   = useState(false)
  const [hasMore,      setHasMore]      = useState(false)
  const [lastDoc,      setLastDoc]      = useState(null)
  const [loadingMore,  setLoadingMore]  = useState(false)
  const [mode,           setMode]           = useState('new')
  const [groupName,      setGroupName]      = useState('')
  const [existingGroupId, setExistingGroupId] = useState(null)
  const [includeInactive, setIncludeInactive] = useState(false)

  // Ref to always read the latest details in handleSubmit (avoids stale closure)
  const detailsRef = useRef(details)
  useEffect(() => { detailsRef.current = details }, [details])

  const PAGE    = 20
  const listRef = useRef(null)
  const program = programList.find(p => p.id === selectedProg)
  const programActiveGroups = useMemo(() =>
    closingGroups.filter(g => g.programId === selectedProg && g.status === 'active')
      .sort((a, b) => (b.closedAt?.toMillis?.() || 0) - (a.closedAt?.toMillis?.() || 0))
  , [closingGroups, selectedProg])

  // ── load first page ────────────────────────────────────────────────────────
  const loadPage = useCallback(async (programId) => {
    if (!programId) return
    setListLoading(true); setSearchMode(false); setSearch('')
    try {
      // NOTE: the helper reads `programIds` (an ARRAY). Passing `programId`
      // singular was silently dropped during destructuring, so no programme
      // condition was ever added to the query and the list showed members from
      // EVERY yojna. The search path below filtered by programme in JS, which
      // is why search looked correct while the scrolling list did not.
      const r = await fetchMembersPaginated({
        programIds: [programId], status: 'active', pageSize: PAGE, lastDoc: null, search: '',
      })
      setDisplayed(r.members || [])
      setLastDoc(r.lastDoc || null)
      setHasMore(r.hasNextPage || false)
    } catch (e) { console.error(e); message.error('Failed to load members') }
    finally { setListLoading(false) }
  }, [])

  // ── load more ──────────────────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (!selectedProg || !hasMore || loadingMore || searchMode) return
    setLoadingMore(true)
    try {
      const r = await fetchMembersPaginated({
        programIds: [selectedProg], status: 'active', pageSize: PAGE, lastDoc, search: '',
      })
      setDisplayed(p => [...p, ...(r.members || [])])
      setLastDoc(r.lastDoc || null)
      setHasMore(r.hasNextPage || false)
    } catch (e) { console.error(e) }
    finally { setLoadingMore(false) }
  }, [selectedProg, hasMore, loadingMore, searchMode, lastDoc])

  const handleScroll = useCallback(e => {
    const el = e.target
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) loadMore()
  }, [loadMore])

  const handleSearch = useCallback(async (val) => {
    setSearch(val)
    if (!val) { loadPage(selectedProg); return }
    setListLoading(true)
    try {
      const r = await fetchAllMembersForSearch(val, 'all')
      setDisplayed(r.filter(m => m.programId === selectedProg))
      setSearchMode(true); setHasMore(false)
    } catch (e) { console.error(e) }
    finally { setListLoading(false) }
  }, [selectedProg, loadPage])

  useEffect(() => {
    if (step === 2 && selectedProg) loadPage(selectedProg)
  }, [step, selectedProg])

  // ── storage helpers ────────────────────────────────────────────────────────
  const delFile = async (url) => {
    if (!url) return
    try { await deleteObject(ref(storage, url)) } catch (e) { console.error('delFile error:', e) }
  }

  const removeMember = async (id) => {
    await delFile(details[id]?.invitationUrl).catch(console.error)
    setSelectedIds(p => p.filter(x => x !== id))
    setSelectedMap(p => { const n = { ...p }; delete n[id]; return n })
    setDetails(p => { const n = { ...p }; delete n[id]; return n })
    setUploadProgress(p => { const n = { ...p }; delete n[id]; return n })
  }

  const resetAll = async () => {
    await Promise.all(selectedIds.map(id => delFile(details[id]?.invitationUrl).catch(console.error)))
    setStep(0); setSelectedProg(null); setAgeGroups([]); setMemberGroups([])
    setSelectedIds([]); setSelectedMap({}); setDetails({}); setUploadProgress({})
    setDisplayed([]); setSearch(''); setSearchMode(false); setHasMore(false); setLastDoc(null)
    setMode('new'); setGroupName(''); setExistingGroupId(null)
  }

  const handleClose = () => {
    if (selectedIds.length) {
      confirm({
        title: 'Close without saving?', icon: <WarningOutlined />,
        content: 'All selections and uploads will be lost.',
        okText: 'Yes, Close', okType: 'danger', cancelText: 'Cancel',
        onOk: async () => { await resetAll(); onClose() },
      })
    } else { resetAll(); onClose() }
  }

  const defaultDetail   = () => ({ marriageDate: dayjs(), note: '', invitationUrl: '' })
  const updateDetail    = (id, field, val) => setDetails(p => ({ ...p, [id]: { ...p[id], [field]: val } }))

  // FIX: in add-mode, only block members already closed in THIS specific group.
  // In new-mode, block members closed in ANY group for this program.
  const isAlreadyClosed = (member) => {
    if (mode === 'add' && existingGroupId) {
      return (member.closedStatus || []).some(
        cs => cs.programId === selectedProg && cs.closingGroupId === existingGroupId
      )
    }
    return (member.closedStatus || []).some(
      cs => cs.programId === selectedProg && cs.closingGroupId
    )
  }

  const handleToggle = async (member, checked) => {
    if (isAlreadyClosed(member)) {
      message.warning(`${member.displayName || member.name} is already closed in this group`)
      return
    }
    if (checked) {
      setSelectedIds(p => [...p, member.id])
      setSelectedMap(p => ({ ...p, [member.id]: member }))
      setDetails(p => ({ ...p, [member.id]: defaultDetail() }))
    } else { await removeMember(member.id) }
  }

  const handleSelectPage = (checked) => {
    if (checked) {
      const eligible = displayed.filter(m => !isAlreadyClosed(m))
      setSelectedIds(p => [...new Set([...p, ...eligible.map(m => m.id)])])
      const map = {}; eligible.forEach(m => { map[m.id] = m })
      setSelectedMap(p => ({ ...p, ...map }))
      const d = { ...details }; eligible.forEach(m => { if (!d[m.id]) d[m.id] = defaultDetail() }); setDetails(d)
    } else {
      const pageIds = new Set(displayed.map(m => m.id))
      setSelectedIds(p => p.filter(id => !pageIds.has(id)))
      const m = { ...selectedMap }; pageIds.forEach(id => delete m[id]); setSelectedMap(m)
    }
  }

  const eligibleOnPage     = displayed.filter(m => !isAlreadyClosed(m))
  const allPageSelected    = eligibleOnPage.length > 0 && eligibleOnPage.every(m => selectedIds.includes(m.id))
  const alreadyClosedCount = displayed.filter(m => isAlreadyClosed(m)).length

  // ── uploader — stores URL directly into detailsRef so submit always gets it ─
  const makeUploader = (memberId) => ({ file, onSuccess: ok, onError: err, onProgress }) => {
    const ext  = file.name.split('.').pop()
    const path = `closing-invitations/${memberId}/${Date.now()}.${ext}`
    const task = uploadBytesResumable(ref(storage, path), file)
    setUploadProgress(p => ({ ...p, [memberId]: 0 }))

    task.on(
      'state_changed',
      snap => {
        const pct = Math.round(snap.bytesTransferred / snap.totalBytes * 100)
        setUploadProgress(p => ({ ...p, [memberId]: pct }))
        onProgress({ percent: pct })
      },
      e => {
        console.error('Upload error:', e)
        setUploadProgress(p => ({ ...p, [memberId]: 'error' }))
        message.error('Upload failed — please retry')
        err(e)
      },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref)
          setDetails(prev => {
            const updated = {
              ...prev,
              [memberId]: { ...(prev[memberId] || {}), invitationUrl: url },
            }
            detailsRef.current = updated
            return updated
          })
          setUploadProgress(p => ({ ...p, [memberId]: 'done' }))
          message.success('Invitation uploaded!')
          ok({ url })
        } catch (e) {
          console.error('getDownloadURL error:', e)
          setUploadProgress(p => ({ ...p, [memberId]: 'error' }))
          message.error('Could not get file URL')
          err(e)
        }
      }
    )
  }

  const handleRemoveFile = async (id) => {
    await delFile(details[id]?.invitationUrl)
    updateDetail(id, 'invitationUrl', '')
    setUploadProgress(p => ({ ...p, [id]: 0 }))
  }

  // ── build the memberClosingList payload ────────────────────────────────────
  // FIX: this now correctly includes ALL selected members with full details,
  // including invitation URLs that were just uploaded.
  const buildMemberClosingList = (freshDetails) => {
    return selectedIds.map(memberId => {
      const d   = freshDetails[memberId] || {}
      const mem = selectedMap[memberId]  || {}
      return {
        id:                          `${memberId}_${Date.now()}`,
        closed_memberId:             memberId,
        member_closed_program:       selectedProg,
        closed_date:                 d.marriageDate
                                       ? d.marriageDate.toISOString()
                                       : new Date().toISOString(),
        closed_note:                 d.note              || '',
        closed_invitation_url:       d.invitationUrl     || '',
        closing_Name:                mem.displayName     || '',
        closing_fatherName:          mem.fatherName      || '',
        closing_village:             mem.village         || '',
        closingPhone:                mem.phone           || '',
        closing_registrationNumber:  mem.registrationNumber || '',
        closed_photoURL:             mem.photoURL        || '',
        // Also include marriageDate for date-filtering on server
        marriageDate:                d.marriageDate
                                       ? d.marriageDate.toISOString()
                                       : new Date().toISOString(),
      }
    })
  }

  // ── submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const latestDetails = detailsRef.current

    const noDate = selectedIds.filter(id => !latestDetails[id]?.marriageDate)
    if (noDate.length) {
      message.warning('Please set marriage date for all members')
      return
    }

    const stillUploading = selectedIds.some(id => {
      const p = uploadProgress[id]
      return typeof p === 'number' && p > 0 && p < 100
    })
    if (stillUploading) {
      message.warning('Please wait — some files are still uploading')
      return
    }

    confirm({
      title: 'Confirm Marriage Closing',
      icon: <HeartFilled style={{ color: C.primary }} />,
      content: (
        <p>
          Close marriage for <strong>{selectedIds.length}</strong> member(s)
          {mode === 'add' ? ` and add to existing group` : ''}?
        </p>
      ),
      okText: 'Confirm', okType: 'primary', cancelText: 'Cancel',
      onOk: async () => {
        setProcessing(true)
        try {
          // Always read from ref inside onOk — state is stale here
          const freshDetails = detailsRef.current
          const memberClosingList = buildMemberClosingList(freshDetails)

          console.log('[submit] mode:', mode)
          console.log('[submit] memberClosingList:', memberClosingList)

          // FIX: for add-mode, pass closingGroupId so server knows to merge;
          // for new-mode, generate a new groupId.
          const newGroupId = `${selectedProg}_${Date.now()}`

          const payload = {
            count:            selectedIds.length,
            memberIds:        selectedIds,
            closedBy:         currentUser?.uid,
            closedByName:     currentUser?.displayName || 'Unknown',
            programId:        selectedProg,
            ageGroups,
            memberGroups,
            memberClosingList,
            groupName:        groupName || undefined,
            includeInactive,
            // For new mode, send groupId; for add-mode, send closingGroupId
            ...(mode === 'add'
              ? { closingGroupId: existingGroupId }
              : { groupId: newGroupId }
            ),
          }

          console.log('[submit] payload:', payload)

          const result = await paymentApi.closedPaymentEntry(payload)

          if (!result?.success) throw new Error(result?.message || 'API returned failure')

          const processed = result.summary?.closedCount       ?? selectedIds.length
          const skipped   = result.summary?.skipped           ?? []

          if (skipped.length) {
            message.warning(`Closed ${processed} member(s). ${skipped.length} skipped (already closed).`)
          } else {
            message.success(`Marriage closed for ${processed} member(s)`)
          }

          // Members who were closed but could NOT be charged — almost always a
          // payAmount of 0 from an age-group mismatch. This used to be a silent
          // skip inside the API, so the member ended up closed with no pending
          // raised for their own closing and nobody knew why.
          const noPay  = result.summary?.noPayAmountClosedNow  ?? []
          const noJoin = result.summary?.noJoinDateClosedNow   ?? []
          const noDate = result.summary?.closedWithoutDate     ?? []

          if (noPay.length || noJoin.length) {
            Modal.warning({
              title: 'Some members were closed but not charged',
              width: 560,
              content: (
                <div style={{ fontSize: 13 }}>
                  {noPay.length > 0 && (
                    <>
                      <p style={{ marginBottom: 4 }}>
                        <b>{noPay.length} member(s) have no pay amount</b> — no closing pending was
                        raised for them, not even for their own closing:
                      </p>
                      <ul style={{ paddingLeft: 18, marginBottom: 10 }}>
                        {noPay.slice(0, 10).map(x => (
                          <li key={x.memberId} style={{ fontSize: 12 }}>
                            {x.name} ({x.registrationNumber || '—'})
                            {x.ageGroupName ? ` — age group: ${x.ageGroupName}` : ' — no age group'}
                          </li>
                        ))}
                        {noPay.length > 10 && <li style={{ fontSize: 12 }}>…and {noPay.length - 10} more</li>}
                      </ul>
                      <p style={{ fontSize: 12, color: '#6b7280' }}>
                        Fix with <b>Settings → Fix Age Group &amp; Fees</b>, then close them again
                        or re-run the group.
                      </p>
                    </>
                  )}
                  {noJoin.length > 0 && (
                    <p style={{ fontSize: 12, marginTop: 8 }}>
                      <b>{noJoin.length} member(s) have no readable join date</b> and were skipped.
                    </p>
                  )}
                  {noDate.length > 0 && (
                    <p style={{ fontSize: 12, marginTop: 8 }}>
                      <b>{noDate.length} already-closed member(s) have no closing date</b>, so they
                      were left out of this round. Set their date on the Closed list.
                    </p>
                  )}
                </div>
              ),
            })
          }

          await resetAll()
          onSuccess?.()
        } catch (e) {
          console.error('[submit] Error:', e)
          message.error(e?.message || 'Failed to process. Please try again.')
        } finally {
          setProcessing(false)
        }
      },
    })
  }

  const completedCount = selectedIds.filter(id => details[id]?.marriageDate && details[id]?.invitationUrl).length

  return (
    <Drawer
      open={visible} onClose={handleClose} placement="right" width={900} closable={false}
      styles={{
        body:   { padding: 0, background: C.bg },
        header: { background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '12px 20px' },
      }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: grad, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 3px 10px ${C.primary}40` }}>
              <HeartFilled style={{ color: '#fff', fontSize: 20 }} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: C.fg }}> Closing Member</div>
              <div style={{ fontSize: 11, color: C.muted }}>
                {mode === 'add' ? 'Adding to existing group' : 'Register member Closing details'}
              </div>
            </div>
            {selectedIds.length > 0 && (
              <Badge count={selectedIds.length} style={{ backgroundColor: C.primary }}>
                <span style={{ background: C.primary + '18', color: C.primary, borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>selected</span>
              </Badge>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={handleClose} icon={<CloseOutlined />} style={{ borderColor: C.border, color: C.fgSec }}>Cancel</Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSubmit} loading={processing}
              disabled={!selectedIds.length}
              style={{ background: selectedIds.length ? grad : undefined, border: 'none', fontWeight: 700 }}>
              Save {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
            </Button>
          </div>
        </div>
      }
      footer={null}
    >
      <div style={{ padding: '20px 24px', minHeight: '100%' }}>
        <StepBar step={step} />

        {/* stats strip */}
        {selectedProg && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 18 }}>
            {[
              { label: 'Loaded',   value: displayed.length + (hasMore ? '+' : ''), color: C.info,    icon: <TeamOutlined /> },
              { label: 'Closed',   value: alreadyClosedCount,                      color: C.warning,  icon: <CheckCircleOutlined /> },
              { label: 'Selected', value: selectedIds.length,                      color: C.primary,  icon: <CheckCircleOutlined /> },
              { label: 'Complete', value: `${completedCount}/${selectedIds.length}`, color: C.success, icon: <HeartFilled /> },
            ].map(s => (
              <div key={s.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 7, background: s.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color, fontSize: 15 }}>{s.icon}</div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: s.color, lineHeight: '22px' }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── step 0: mode + program + group ── */}
        {step === 0 && (
          <div>
            {/* Mode Toggle */}
            <SectionHeader icon={<FlagOutlined />} title="Closing Mode" subtitle="Create a new group or add members to an existing one" />
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              <div onClick={() => { setMode('new'); setExistingGroupId(null) }} style={{
                flex: 1, background: C.surface, border: `2px solid ${mode === 'new' ? C.primary : C.border}`,
                borderRadius: 12, padding: '14px 18px', cursor: 'pointer', textAlign: 'center',
                boxShadow: mode === 'new' ? `0 3px 12px ${C.primary}20` : '0 1px 3px rgba(0,0,0,.04)',
                fontWeight: 700, fontSize: 14, color: C.fg, transition: 'all .2s',
              }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>➕</div>
                New Group
              </div>
              <div onClick={() => setMode('add')} style={{
                flex: 1, background: C.surface, border: `2px solid ${mode === 'add' ? C.primary : C.border}`,
                borderRadius: 12, padding: '14px 18px', cursor: 'pointer', textAlign: 'center',
                boxShadow: mode === 'add' ? `0 3px 12px ${C.primary}20` : '0 1px 3px rgba(0,0,0,.04)',
                fontWeight: 700, fontSize: 14, color: C.fg, transition: 'all .2s',
              }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>📂</div>
                Add to Existing
              </div>
            </div>

            {/* Group Name (new mode) */}
            {mode === 'new' && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: C.muted, marginBottom: 6 }}>Group Name (optional)</div>
                <Input placeholder="e.g. Summer 2026 Batch" value={groupName} onChange={e => setGroupName(e.target.value)}
                  style={{ borderRadius: 8, height: 40 }} />
              </div>
            )}

            {/* Existing Group Selector (add mode) */}
            {mode === 'add' && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: C.muted, marginBottom: 6 }}>Select Existing Group</div>
                {!selectedProg ? (
                  <Alert type="info" message="Please select a program below first, then choose the group." showIcon />
                ) : programActiveGroups.length === 0 ? (
                  <Alert type="warning" message="No active groups found for this program. Switch to New Group mode." showIcon />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {programActiveGroups.map(g => {
                      const active = existingGroupId === g.id
                      const groupCount = g.closedMemberIds?.length || 0
                      return (
                        <div key={g.id} onClick={() => setExistingGroupId(g.id)} style={{
                          background: C.surface, border: `2px solid ${active ? C.primary : C.border}`,
                          borderRadius: 12, padding: '12px 16px', cursor: 'pointer',
                          boxShadow: active ? `0 3px 12px ${C.primary}20` : '0 1px 3px rgba(0,0,0,.04)',
                          display: 'flex', alignItems: 'center', gap: 12, transition: 'all .2s',
                        }}>
                          <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, border: `2px solid ${active ? C.primary : C.border}`, background: active ? C.primary : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {active && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: C.fg }}>{g.groupName || `Group ${g.id?.slice?.(0, 8) || ''}`}</div>
                            <div style={{ fontSize: 12, color: C.muted }}>{groupCount} member{groupCount !== 1 ? 's' : ''} · {g.totalClosingCount || 0} closing{((g.totalClosingCount || 0) !== 1) ? 's' : ''} · ₹{g.totalAmount?.toLocaleString?.() || 0}</div>
                          </div>
                          {active && <CheckCircleOutlined style={{ color: C.primary, fontSize: 18 }} />}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Program selector */}
            <SectionHeader icon={<FlagOutlined />} title="Select Program" subtitle="Choose the marriage program" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {programList.map(prog => {
                const active = selectedProg === prog.id
                return (
                  <div key={prog.id} onClick={() => {
                    setSelectedProg(prog.id)
                    // Reset existing group selection when program changes
                    setExistingGroupId(null)
                  }} style={{
                    background: C.surface, border: `2px solid ${active ? C.primary : C.border}`,
                    borderRadius: 12, padding: '14px 18px', cursor: 'pointer',
                    boxShadow: active ? `0 3px 12px ${C.primary}20` : '0 1px 3px rgba(0,0,0,.04)',
                    display: 'flex', alignItems: 'center', gap: 12, transition: 'all .2s',
                  }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, border: `2px solid ${active ? C.primary : C.border}`, background: active ? C.primary : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {active && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: C.fg }}>{prog.name}</div>
                    </div>
                    {active && <CheckCircleOutlined style={{ color: C.primary, fontSize: 18, marginLeft: 'auto' }} />}
                  </div>
                )
              })}
            </div>

            {/* Pending-distribution scope toggle */}
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Checkbox checked={includeInactive} onChange={e => setIncludeInactive(e.target.checked)}>
                Include inactive members in pending distribution
              </Checkbox>
            </div>
            <Alert type="info" showIcon style={{ marginTop: 8 }}
              message={includeInactive
                ? 'Closing pending amount will ALSO be added to inactive members who joined before the closing date.'
                : 'Closing pending amount is added to active members only.'}
            />

            {/* Next button — requires program selected and (in add-mode) a group selected */}
            {selectedProg && (mode === 'new' || (mode === 'add' && existingGroupId)) && (
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="primary" size="large" icon={<ArrowRightOutlined />} onClick={() => setStep(1)}
                  style={{ background: grad, border: 'none', fontWeight: 700, height: 42, paddingInline: 24 }}>
                  Next: Groups
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── step 1: groups ── */}
        {step === 1 && program && (
          <div>
            <SectionHeader icon={<ApartmentOutlined />} title="Filter by Groups" subtitle="Optional — skip to select all members"
              action={<Button size="small" onClick={() => setStep(0)} icon={<ArrowLeftOutlined />}>Back</Button>} />
            <Collapse defaultActiveKey={['1', '2']} style={{ marginBottom: 16 }}>
              <Panel header={<Space><CalendarOutlined style={{ color: C.primary }} /><strong>Age Groups</strong>{ageGroups.length > 0 && <Tag color="blue">{ageGroups.length} selected</Tag>}</Space>} key="1">
                <Checkbox.Group value={ageGroups} onChange={setAgeGroups} style={{ width: '100%' }}>
                  <Row gutter={[12, 8]}>
                    {program.ageGroups?.map(ag => (
                      <Col span={8} key={ag.id}>
                        <Checkbox value={ag.id}><span style={{ fontWeight: 600 }}>{ag.ageGroupName}</span><span style={{ fontSize: 11, color: C.muted }}> ({ag.startAge}-{ag.endAge}y)</span></Checkbox>
                      </Col>
                    ))}
                  </Row>
                </Checkbox.Group>
              </Panel>
              <Panel header={<Space><TeamOutlined style={{ color: C.secondary }} /><strong>Member Groups</strong>{memberGroups.length > 0 && <Tag color="orange">{memberGroups.length} selected</Tag>}</Space>} key="2">
                <Checkbox.Group value={memberGroups} onChange={setMemberGroups} style={{ width: '100%' }}>
                  <Row gutter={[12, 8]}>
                    {program.memberGroups?.map(g => (
                      <Col span={8} key={g.id}><Checkbox value={g.id}>{g.groupName} <Tag color="purple" style={{ fontSize: 10 }}>{g.code}</Tag></Checkbox></Col>
                    ))}
                  </Row>
                </Checkbox.Group>
              </Panel>
            </Collapse>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Tag color="green">All eligible members shown</Tag>
              <Space>
                <Button onClick={() => { setAgeGroups([]); setMemberGroups([]) }}>Clear</Button>
                <Button type="primary" icon={<ArrowRightOutlined />} onClick={() => setStep(2)} style={{ background: grad, border: 'none' }}>Next: Select Members</Button>
              </Space>
            </div>
          </div>
        )}

        {/* ── step 2: member selection ── */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 280px)' }}>
            <SectionHeader icon={<TeamOutlined />} title="Select Members"
              subtitle={
                mode === 'add'
                  ? `Adding to existing group · ${searchMode ? 'Search results' : 'Scroll to load more'}`
                  : searchMode ? 'Search results' : 'Scroll to load more'
              }
              action={<Button size="small" onClick={() => setStep(1)} icon={<ArrowLeftOutlined />}>Back</Button>} />

            {/* Add-mode info banner */}
            {mode === 'add' && (
              <Alert
                type="info" showIcon style={{ marginBottom: 12 }}
                message={
                  <span>
                    <strong>Add-to-existing mode:</strong> Newly selected members will be closed and their payments calculated against all closings in this group.
                    Members already closed in this group are shown as <Tag color="warning" style={{ fontSize: 10 }}>Already Closed</Tag>.
                  </span>
                }
              />
            )}

            <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center' }}>
              <Input prefix={<SearchOutlined style={{ color: C.muted }} />}
                placeholder="Search name, reg. no, phone, village…"
                value={search} onChange={e => handleSearch(e.target.value)} allowClear
                style={{ flex: 1, borderRadius: 8 }}
                suffix={listLoading && <Spin size="small" />} />
              <Button icon={<ReloadOutlined />} onClick={() => loadPage(selectedProg)} title="Reload" />
              <Button size="small" type={allPageSelected ? 'primary' : 'default'}
                onClick={() => handleSelectPage(!allPageSelected)} style={{ whiteSpace: 'nowrap', minWidth: 120 }}>
                {allPageSelected ? 'Deselect Page' : 'Select Eligible'}
              </Button>
            </div>
            {selectedIds.length > 0 && (
              <div style={{ background: C.primary + '08', border: `1px solid ${C.primary}30`, borderRadius: 8, padding: '8px 12px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.primary }}>{selectedIds.length} member(s) selected</span>
                <Button size="small" type="link" danger onClick={async () => {
                  await Promise.all(selectedIds.map(id => delFile(details[id]?.invitationUrl).catch(console.error)))
                  setSelectedIds([]); setSelectedMap({}); setDetails({}); setUploadProgress({})
                }}>Clear All</Button>
              </div>
            )}
            <div ref={listRef} onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
              {listLoading ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}><Spin tip="Loading members…" /></div>
              ) : displayed.length === 0 ? (
                <Empty description={searchMode ? 'No matches' : 'No members in this program'} style={{ padding: '40px 0' }} />
              ) : (
                <>
                  {displayed.map(member => (
                    <MemberSelectCard
                      key={member.id}
                      member={member}
                      checked={selectedIds.includes(member.id)}
                      onChange={checked => handleToggle(member, checked)}
                      programId={selectedProg}
                      existingGroupId={mode === 'add' ? existingGroupId : null}
                    />
                  ))}
                  {loadingMore && <div style={{ textAlign: 'center', padding: '12px 0' }}><Spin size="small" /><span style={{ fontSize: 12, color: C.muted, marginLeft: 8 }}>Loading more…</span></div>}
                  {!hasMore && !searchMode && displayed.length > 0 && (
                    <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 11, color: C.muted }}>— All {displayed.length} members loaded —</div>
                  )}
                  {searchMode && <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 11, color: C.muted }}>{displayed.length} result(s)</div>}
                </>
              )}
            </div>
            {selectedIds.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="primary" size="large" icon={<ArrowRightOutlined />} onClick={() => setStep(3)}
                  style={{ background: grad, border: 'none', fontWeight: 700, height: 42, paddingInline: 24 }}>
                  Add Details ({selectedIds.length})
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── step 3: details ── */}
        {step === 3 && (
          <div>
            <SectionHeader icon={<FileTextOutlined />} title="Marriage Details"
              subtitle={`Fill details for ${selectedIds.length} member(s)`}
              action={<Button size="small" onClick={() => setStep(2)} icon={<ArrowLeftOutlined />}>Back</Button>} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.surfaceSec, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
              <CalendarOutlined style={{ color: C.primary }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.fg }}>Set same date for all:</span>
              <DatePicker size="small" format="DD/MM/YYYY" placeholder="Common date" allowClear={false}
                onChange={date => {
                  if (!date) return
                  const updated = {}
                  selectedIds.forEach(id => { updated[id] = { ...(details[id] || {}), marriageDate: date } })
                  setDetails(p => ({ ...p, ...updated }))
                }}
                style={{ width: 150 }} />
              <span style={{ fontSize: 11, color: C.muted }}>— or set individually below</span>
            </div>
            <div style={{ maxHeight: 'calc(100vh - 380px)', overflowY: 'auto', paddingRight: 4 }}>
              {selectedIds.map(id => {
                const member = selectedMap[id] || allMembers.find(m => m.id === id)
                return (
                  <MemberDetailRow key={id} member={member} details={details[id]} progress={uploadProgress[id]}
                    onUpdate={(f, v) => updateDetail(id, f, v)} onRemove={() => removeMember(id)}
                    onUpload={makeUploader(id)} onRemoveFile={() => handleRemoveFile(id)}
                    onViewCard={openInvitationCard} />
                )
              })}
            </div>
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <Button type="primary" size="large" icon={<CheckCircleOutlined />}
                onClick={handleSubmit} loading={processing}
                style={{ background: grad, border: 'none', height: 46, paddingInline: 40, fontWeight: 700 }}>
                {mode === 'add'
                  ? `Add ${selectedIds.length} Member(s) to Group`
                  : `Complete Closing for ${selectedIds.length} Members`
                }
              </Button>
              {!selectedIds.every(id => details[id]?.invitationUrl) && (
                <Alert message="Some members don't have invitation cards — you can still proceed" type="warning" showIcon style={{ width: '100%' }} />
              )}
            </div>
          </div>
        )}
      </div>
    </Drawer>
  )
}

export default MarriageClosingDrawer