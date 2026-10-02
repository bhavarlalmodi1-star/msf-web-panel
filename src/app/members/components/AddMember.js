"use client"
import { App, Button, Drawer, Form, Spin, Checkbox, Space, Input, Row, Col, Tooltip, Modal, Alert, Tag } from 'antd'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { LoadingOutlined, ReloadOutlined, CopyOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import isBetween from 'dayjs/plugin/isBetween'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../../../../lib/firbase-client'

// Form section components
import BasicInfoForm    from './components/BasicInfoForm'
import AddressForm      from './components/AddressForm'
import GuardianForm     from './components/GuardianForm'
import ProgramSelection from './components/ProgramSelection'
import AddedByForm      from './components/AddedByForm'
import FeesForm         from './components/FeesForm'
import PhotoUploads     from './components/PhotoUploads'
import DocumentUploads  from './components/DocumentUploads'
import { checkAadhaarDuplicate, handleSubmit, generateRegistrationNumber, isRegistrationNumberAvailable } from './components/firebaseUtils'

dayjs.extend(isBetween)

// ─── Password generator ───────────────────────────────────────────────────────
const generatePassword = (name, dob) => {
  if (!name || !dob) return ''
  const first = name.trim().split(' ')[0].substring(0, 5)
  const part  = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
  return `${part}${dayjs(dob).format('YYYY')}`
}

// ─── Main component ───────────────────────────────────────────────────────────
const AddMember = ({ open, setOpen, programs, agents, currentUser, onSuccess }) => {
  const [form]      = Form.useForm()
  const { message } = App.useApp()
  const [loading,  setLoading]  = useState(false)

  // ── Single program (flat) ──────────────────────────────────────────────────
  const [selectedProgram, setSelectedProgram] = useState('')   // single ID string
  const [programDetail,   setProgramDetail]   = useState(null) // single object
  const [selectedMemberGroup, setSelectedMemberGroup] = useState(null) // member group object

  // ── Dates & age ────────────────────────────────────────────────────────────
  const [joinDate, setJoinDate] = useState(dayjs())
  const [dobDate,  setDobDate]  = useState(null)
  const [age,      setAge]      = useState(null)

  // ── Payment ────────────────────────────────────────────────────────────────
  const [joinFeesDone, setJoinFeesDone] = useState(false)
  const [paymentMode,  setPaymentMode]  = useState('cash')
  const [paidAmount,   setPaidAmount]   = useState(0)

  // ── Added by ───────────────────────────────────────────────────────────────
  const [addedByRole,   setAddedByRole]   = useState('admin')
  const [selectedAgent, setSelectedAgent] = useState(null)

  // ── Files ──────────────────────────────────────────────────────────────────
  const [memberPhoto,    setMemberPhoto]    = useState(null)
  const [guardianPhoto,  setGuardianPhoto]  = useState(null)
  const [memberDocFront, setMemberDocFront] = useState(null)
  const [memberDocBack,  setMemberDocBack]  = useState(null)
  const [guardianDoc,    setGuardianDoc]    = useState(null)

  // ── Aadhaar duplicate check ────────────────────────────────────────────────
  const [existingMember, setExistingMember] = useState(null)

  // ── Copy from an existing member ───────────────────────────────────────────
  // Registering the same person into a second yojna shouldn't mean retyping
  // every personal field. Copies identity/address/guardian details only —
  // the yojna, registration number and payment are always entered fresh.
  const [copyOpen,     setCopyOpen]     = useState(false)
  const [copySearch,   setCopySearch]   = useState('')
  const [copyResults,  setCopyResults]  = useState([])
  const [copySearching, setCopySearching] = useState(false)
  const [copiedFrom,   setCopiedFrom]   = useState(null)   // the source member

  const searchMembersToCopy = async (term) => {
    const t = String(term || '').trim()
    if (t.length < 2) { setCopyResults([]); return }
    setCopySearching(true)
    try {
      const normalized = t.toLowerCase().replace(/[^a-z0-9]/g, '')
      const snap = await getDocs(query(
        collection(db, 'members'),
        where('search_keywords', 'array-contains', normalized),
        where('delete_flag', '==', false),
      ))
      setCopyResults(snap.docs.map(d => ({ id: d.id, ...d.data() })).slice(0, 25))
    } catch (e) {
      console.error('Member search failed:', e)
      message.error('Search failed — try a registration number or phone')
    } finally {
      setCopySearching(false)
    }
  }

  const applyCopiedMember = async (m) => {
    // Location dropdowns cascade, so districts/cities must be loaded before
    // their values can be set — otherwise the Select shows a blank.
    if (m.stateId) {
      setSelectedState(m.stateId)
      try {
        const dSnap = await getDocs(query(collection(db, 'districts'), where('stateId', '==', m.stateId)))
        setDistricts(dSnap.docs.filter(d => d.data().status === 'active').map(d => ({ id: d.id, ...d.data() })))
      } catch (e) { console.error(e) }
    }
    if (m.districtId) {
      setSelectedDistrict(m.districtId)
      try {
        const cSnap = await getDocs(query(collection(db, 'cities'), where('districtId', '==', m.districtId)))
        setCities(cSnap.docs.filter(c => c.data().status === 'active').map(c => ({ id: c.id, ...c.data() })))
      } catch (e) { console.error(e) }
    }

    const dob = m.dobDate ? dayjs(m.dobDate, 'DD-MM-YYYY') : null
    if (dob?.isValid()) {
      setDobDate(dob)
      setAge(dayjs().diff(dob, 'year'))
    }

    form.setFieldsValue({
      name:              m.displayName || '',
      fatherName:        m.fatherName || '',
      surname:           m.surname || '',
      gender:            m.gender || undefined,
      caste:             m.casteId || undefined,
      phone:             m.phone || '',
      phoneAlt:          m.phoneAlt || '',
      aadhaarNo:         m.aadhaarNo || '',
      currentAddress:    m.currentAddress || '',
      village:           m.village || '',
      pinCode:           m.pinCode || '',
      state:             m.stateId || undefined,
      district:          m.districtId || undefined,
      city:              m.cityId || undefined,
      guardian:          m.guardian || '',
      guardianRelation:  m.guardianRelationId || undefined,
      // The form field is spelled `bobDate` (typo in BasicInfoForm) while the
      // member doc stores `dobDate` — setting the wrong key left the date, and
      // the age derived from it, blank.
      bobDate:           dob?.isValid() ? dob : undefined,
      // Deliberately NOT copied: registrationNumber (a new one is generated),
      // programId, join fees and payment — those define the new membership.
      password:          generatePassword(m.displayName, m.dobDate),
    })

    // Photos & documents — set the upload state to the existing https URL.
    // uploadFile() returns such a value unchanged, so the new member reuses the
    // same images instead of re-uploading them, and the previews render via the
    // components' existing* props.
    if (m.photoURL)            setMemberPhoto(m.photoURL)
    if (m.guardianPhotoURL)    setGuardianPhoto(m.guardianPhotoURL)
    if (m.documentFrontURL)    setMemberDocFront(m.documentFrontURL)
    if (m.documentBackURL)     setMemberDocBack(m.documentBackURL)
    if (m.guardianDocumentURL) setGuardianDoc(m.guardianDocumentURL)

    setCopiedFrom({
      id: m.id,
      displayName: m.displayName || '',
      registrationNumber: m.registrationNumber || '',
      programName: m.programName || '',
      programId: m.programId || '',
      aadhaarNo: m.aadhaarNo || '',
      docs: {
        photoURL:            m.photoURL || '',
        guardianPhotoURL:    m.guardianPhotoURL || '',
        documentFrontURL:    m.documentFrontURL || '',
        documentBackURL:     m.documentBackURL || '',
        guardianDocumentURL: m.guardianDocumentURL || '',
      },
    })
    setCopyOpen(false)
    setCopySearch('')
    setCopyResults([])
    message.success(`Details copied from ${m.displayName || 'member'} — now choose the new yojna`)
  }

  // ── Location ───────────────────────────────────────────────────────────────
  const [states,           setStates]           = useState([])
  const [districts,        setDistricts]        = useState([])
  const [cities,           setCities]           = useState([])
  const [castes,           setCastes]           = useState([])
  const [relations,        setRelations]        = useState([])
  const [selectedState,    setSelectedState]    = useState(null)
  const [selectedDistrict, setSelectedDistrict] = useState(null)

  // ── Notification options ───────────────────────────────────────────────────
  // WhatsApp sends are opt-in — messages cost money and go to real people, so
  // they should be a deliberate choice rather than something that fires by default
  // ── Registration number ────────────────────────────────────────────────────
  // Auto-filled when a yojna is picked (the prefix comes from the program), but
  // editable so an admin can enter a specific number.
  const [regNoLoading, setRegNoLoading]   = useState(false)
  const [regNoStatus,  setRegNoStatus]    = useState(null)  // { ok, message }

  // generateRegistrationNumber() RESERVES the number it hands back. That
  // reservation is ours, so the availability check must not treat it as a
  // clash — otherwise the auto-filled number rejects itself on save with
  // "already reserved". Remember what we generated so it can be recognised.
  const autoRegNoRef = useRef(null)

  const generateRegNo = useCallback(async (programId) => {
    if (!programId) return
    setRegNoLoading(true)
    setRegNoStatus(null)
    try {
      const regNo = await generateRegistrationNumber(programId)
      autoRegNoRef.current = regNo
      form.setFieldValue('registrationNumber', regNo)
      setRegNoStatus({ ok: true, message: 'Auto-generated & reserved' })
    } catch (e) {
      console.error('Failed to generate registration number:', e)
      autoRegNoRef.current = null
      setRegNoStatus({ ok: false, message: 'Could not generate — enter one manually' })
    } finally {
      setRegNoLoading(false)
    }
  }, [form])

  // Verify a manually typed number is still free
  const checkRegNo = useCallback(async (value) => {
    const v = String(value || '').trim().toUpperCase()
    if (!v) { setRegNoStatus(null); return }

    // Our own auto-generated number is already reserved by us — nothing to check
    if (v === autoRegNoRef.current) {
      setRegNoStatus({ ok: true, message: 'Auto-generated & reserved' })
      return
    }

    setRegNoLoading(true)
    try {
      const res = await isRegistrationNumberAvailable(v)
      setRegNoStatus(res.available
        ? { ok: true,  message: res.unchecked ? 'Could not verify — will be checked on save' : 'Available' }
        : { ok: false, message: res.reason })
    } finally {
      setRegNoLoading(false)
    }
  }, [])

  const [sendWhatsApp, setSendWhatsApp] = useState(false)
  const [sendAgentWhatsApp, setSendAgentWhatsApp] = useState(false)
  const [sendNotification, setSendNotification] = useState(true)

  // ── Load static data once ──────────────────────────────────────────────────
  useEffect(() => { fetchStaticData() }, [])

  // ── Recalculate program detail when dob / program / joinDate changes ───────
  useEffect(() => {
    if (dobDate && selectedProgram) calculateProgramDetail()
    else if (!dobDate || !selectedProgram) setProgramDetail(null)
  }, [dobDate, joinDate, selectedProgram])

  // ── Static data ────────────────────────────────────────────────────────────
  const fetchStaticData = async () => {
    try {
      const [stSnap, caSnap, relSnap] = await Promise.all([
        getDocs(collection(db, 'states')),
        getDocs(collection(db, 'castes')),
        getDocs(collection(db, 'relations')),
      ])
      const active = (snap) => snap.docs.filter(d => d.data().status === 'active').map(d => ({ id: d.id, ...d.data() }))
      setStates(active(stSnap)); setCastes(active(caSnap)); setRelations(active(relSnap))
    } catch (e) { console.error(e); message.error('Failed to load form data') }
  }

  const fetchDistricts = async (stateId) => {
    try {
      const snap = await getDocs(query(collection(db, 'districts'), where('stateId', '==', stateId)))
      setDistricts(snap.docs.filter(d => d.data().status === 'active').map(d => ({ id: d.id, ...d.data() })))
      setCities([]); form.setFieldsValue({ district: undefined, city: undefined })
    } catch (e) { console.error(e) }
  }

  const fetchCities = async (districtId) => {
    try {
      const snap = await getDocs(query(collection(db, 'cities'), where('districtId', '==', districtId)))
      setCities(snap.docs.filter(d => d.data().status === 'active').map(d => ({ id: d.id, ...d.data() })))
      form.setFieldsValue({ city: undefined })
    } catch (e) { console.error(e) }
  }

  // ── Single-program detail calculation ─────────────────────────────────────
  const calculateProgramDetail = useCallback((groupOverride) => {
    if (!dobDate || !selectedProgram || !programs?.length) {
      setProgramDetail(null); return
    }

    const calcAge     = joinDate.diff(dobDate, 'year')
    const joinDateStr = joinDate.format('DD-MM-YYYY')
    const program     = programs.find(p => p.id === selectedProgram)

    if (!program?.ageGroups?.length) {
      setProgramDetail({ programId: selectedProgram, programName: program?.name, error: 'No age groups configured' }); return
    }

    const ageGroup = program.ageGroups.find(ag => calcAge >= ag.startAge && calcAge <= ag.endAge)
    if (!ageGroup) {
      setProgramDetail({
        programId: selectedProgram, programName: program.name,
        error: `No age group for age ${calcAge}. Available: ${program.ageGroups.map(ag => `${ag.startAge}-${ag.endAge}`).join(', ')}`
      }); return
    }

    const period = ageGroup.periods?.find(p => {
      try {
        return dayjs(joinDateStr, 'DD-MM-YYYY').isBetween(dayjs(p.startDate, 'DD-MM-YYYY'), dayjs(p.endDate, 'DD-MM-YYYY'), null, '[]')
      } catch { return false }
    })

    if (!period) {
      setProgramDetail({
        programId: selectedProgram, programName: program.name, ageGroupName: ageGroup.ageGroupName,
        ageRange: `${ageGroup.startAge}-${ageGroup.endAge} years`,
        error: `No active period for ${joinDateStr}. Available: ${ageGroup.periods?.map(p => `${p.startDate} to ${p.endDate}`).join(', ')}`
      }); return
    }

    const groups = program?.memberGroups || []
    const group  = groupOverride || selectedMemberGroup || groups[0] || {}
    const detail = {
      programId:       selectedProgram,
      programName:     program.name,
      ageGroupId:      ageGroup.id,
      ageGroupName:    ageGroup.ageGroupName,
      ageRange:        `${ageGroup.startAge}-${ageGroup.endAge} years`,
      joinFees:        period.joinFees        || 0,
      fixedJoinFees:   period.fixedJoinFees   || 0,
      payAmount:       period.payAmount       || 0,
      periodStartDate: period.startDate,
      periodEndDate:   period.endDate,
      memberGroupId:   group.id        || '',
      memberGroupName: group.groupName || '',
      memberGroupCode: group.code      || '',
      memberGroups:    groups,
      hasPeriod:       true,
    }
    setProgramDetail(detail)

    // Auto-fill paid amount when joinFeesDone is already true
    if (joinFeesDone && detail.joinFees > 0) {
      setPaidAmount(detail.joinFees)
      form.setFieldsValue({ paidAmount: detail.joinFees })
    }
  }, [dobDate, selectedProgram, joinDate, programs, joinFeesDone, form, selectedMemberGroup])

  // ── Event handlers ─────────────────────────────────────────────────────────
  const handleDobChange = (date) => {
    if (!date) { setDobDate(null); setAge(null); setProgramDetail(null); form.setFieldsValue({ password: '' }); return }
    const calcAge = dayjs().diff(date, 'year')
    setDobDate(date); setAge(calcAge)
    form.setFieldsValue({ password: generatePassword(form.getFieldValue('name'), date) })
  }

  const handleProgramChange = (programId) => {
    // A member can join several yojnas, but not the same one twice. Block the
    // source yojna outright when copying — otherwise you'd create a duplicate
    // membership rather than a new one.
    if (programId && copiedFrom?.programId && programId === copiedFrom.programId) {
      message.error(
        `${copiedFrom.displayName} is already registered in this yojna (${copiedFrom.registrationNumber}). Choose a different one.`
      )
      setSelectedProgram('')
      setProgramDetail(null)
      form.setFieldValue('programId', undefined)
      form.setFieldValue('registrationNumber', '')
      setRegNoStatus(null)
      return
    }

    setSelectedProgram(programId || '')
    setSelectedMemberGroup(null)
    if (!programId) {
      setProgramDetail(null)
      form.setFieldValue('registrationNumber', '')
      setRegNoStatus(null)
      return
    }
    // The prefix comes from the yojna, so the number is generated once one is
    // chosen — and regenerated if the yojna changes.
    generateRegNo(programId)
  }

  const handleMemberGroupChange = (groupId) => {
    const program = programs.find(p => p.id === selectedProgram)
    const group   = program?.memberGroups?.find(g => g.id === groupId) || null
    setSelectedMemberGroup(group)
    if (dobDate) calculateProgramDetail(group)
  }

  const handleJoinDateChange = (date) => { setJoinDate(date) }

  const handleJoinFeesDoneChange = (e) => {
    const isDone = e.target.value
    setJoinFeesDone(isDone)
    if (isDone) {
      const fees = programDetail?.joinFees || 0
      setPaidAmount(fees); form.setFieldsValue({ paidAmount: fees })
    } else {
      setPaidAmount(0); form.setFieldsValue({ paidAmount: 0 })
    }
  }

  const handleStateChange = (v) => {
    setSelectedState(v || null)
    setSelectedDistrict(null)
    if (v) fetchDistricts(v)
    else { setDistricts([]); setCities([]) }
    form.setFieldsValue({ district: undefined, city: undefined })
  }

  const handleDistrictChange = (v) => {
    setSelectedDistrict(v || null)
    if (v) fetchCities(v)
    else setCities([])
    form.setFieldsValue({ city: undefined })
  }

  // ── Inline quick-add callbacks ─────────────────────────────────────────────
  const handleDistrictAdded = (newDistrict) => {
    setDistricts(prev => [...prev, newDistrict])
    setSelectedDistrict(newDistrict.id)
    form.setFieldsValue({ district: newDistrict.id, city: undefined })
    setCities([])
  }

  const handleCityAdded = (newCity) => {
    setCities(prev => [...prev, newCity])
    form.setFieldsValue({ city: newCity.id })
  }

  const handleRelationAdded = (newRelation) => {
    setRelations(prev => [...prev, newRelation])
  }
  const handleAadhaarCheck   = async (aadhaar) => { try { return await checkAadhaarDuplicate(aadhaar) } catch { return null } }

  // ── Submit ─────────────────────────────────────────────────────────────────
  const onFormSubmit = async (values) => {
    const addedByName = addedByRole === 'admin'
      ? currentUser?.name || currentUser?.displayName || currentUser?.email || 'Admin'
      : agents.find(a => a.uid === selectedAgent)?.name || 'Unknown'

    const success = await handleSubmit(
      values,
      {
        // Single program — pass as the shape handleSubmit expects
        selectedPrograms:  [selectedProgram],    // firebaseUtils still reads [0]
        programDetails:    programDetail ? [programDetail] : [],
        programs,
        states, districts, cities, castes, relations,
        addedByRole, selectedAgent, addedByName,
        joinDate, dobDate, age,
        joinFeesDone, paymentMode, paidAmount,
        memberPhoto, guardianPhoto, memberDocFront, memberDocBack, guardianDoc,
        currentUser, form, setOpen, setLoading,
        // Already reserved by generateRegistrationNumber — must not be
        // re-validated against the reservation it created itself
        autoGeneratedRegNo: autoRegNoRef.current,
        // Pass notification options
        sendWhatsApp,
        sendAgentWhatsApp,
        sendNotification
      },
      message
    )

    if (success) {
      onSuccess?.()
      resetLocalState()
    }
  }

  const resetLocalState = () => {
    setSelectedProgram(''); setProgramDetail(null)
    setMemberPhoto(null); setGuardianPhoto(null)
    setMemberDocFront(null); setMemberDocBack(null); setGuardianDoc(null)
    setCities([]); setDistricts([])
    setSelectedState(null); setSelectedDistrict(null)
    setDobDate(null); setAge(null); setJoinDate(dayjs())
    setJoinFeesDone(false); setPaymentMode('cash'); setPaidAmount(0)
    setAddedByRole('admin'); setSelectedAgent(null)
    setExistingMember(null)
    setSendWhatsApp(false)
    setSendNotification(true)
    setRegNoStatus(null); setRegNoLoading(false)
    autoRegNoRef.current = null
    setCopiedFrom(null); setCopyOpen(false); setCopySearch(''); setCopyResults([])
    form.resetFields()
  }

  // Start clean every time the drawer opens.
  // `destroyOnHidden` unmounts the Form, but this component keeps its own state
  // — photos, documents, copied member, selected program — so cancelling and
  // reopening previously showed the last entry's data still filled in.
  // resetLocalState only ran after a successful save.
  useEffect(() => {
    if (open) resetLocalState()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Drawer
      title="Add New Member"
      open={open}
      onClose={() => !loading && setOpen(false)}
      width={1000}
      footer={null}
      maskClosable={false}
      destroyOnHidden
      closable={!loading}
      extra={
        <Button
          icon={<CopyOutlined />}
          onClick={() => setCopyOpen(true)}
          disabled={loading}
        >
          Copy from existing member
        </Button>
      }
    >
      <Spin spinning={loading} indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />}>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFormSubmit}
          initialValues={{ joinFeesDone: false, addedBy: 'admin', joinDate: dayjs() }}
          disabled={loading}
        >
          <div className="flex flex-col gap-2">

            {/* Banner shown once details have been copied in */}
            {copiedFrom && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 4 }}
                message={
                  <span style={{ fontSize: 13 }}>
                    Details copied from <strong>{copiedFrom.displayName}</strong>
                    {copiedFrom.registrationNumber && <> ({copiedFrom.registrationNumber})</>}
                    {copiedFrom.programName && <> · {copiedFrom.programName}</>}
                  </span>
                }
                description={
                  <span style={{ fontSize: 12 }}>
                    Personal details, address, guardian and uploaded photos/documents
                    have been carried over. Choose the new yojna below — a fresh
                    registration number is generated and the original member is not changed.
                  </span>
                }
                action={
                  <Button size="small" onClick={() => setCopiedFrom(null)}>Dismiss</Button>
                }
              />
            )}

            <BasicInfoForm
              handleDobChange={handleDobChange}
              age={age}
              castes={castes}
              form={form}
              existingMember={existingMember}
              setExistingMember={setExistingMember}
              onAadhaarCheck={handleAadhaarCheck}
            />

            <AddressForm
              states={states} districts={districts} cities={cities}
              selectedState={selectedState}
              selectedDistrict={selectedDistrict}
              handleStateChange={handleStateChange}
              handleDistrictChange={handleDistrictChange}
              form={form}
              onDistrictAdded={handleDistrictAdded}
              onCityAdded={handleCityAdded}
            />

            <GuardianForm relations={relations} onRelationAdded={handleRelationAdded} />

            {/* ProgramSelection — single select props */}
            <ProgramSelection
              joinDate={joinDate}
              handleJoinDateChange={handleJoinDateChange}
              programs={programs}
              selectedProgram={selectedProgram}
              handleProgramChange={handleProgramChange}
              dobDate={dobDate}
              programDetail={programDetail}
              existingMember={existingMember}
              selectedMemberGroup={selectedMemberGroup}
              handleMemberGroupChange={handleMemberGroupChange}
              blockedProgramId={copiedFrom?.programId}
            />

            {/* ── Registration number ─────────────────────────────────────── */}
            <div className="border rounded-lg p-4">
              <div className="mb-3">
                <h4 className="text-sm font-semibold text-gray-700 mb-1">Registration Number</h4>
                <p className="text-xs text-gray-500">
                  Generated automatically from the yojna prefix — edit it if you need a specific number.
                </p>
              </div>

              <Row gutter={12}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="registrationNumber"
                    rules={[
                      { required: true, message: 'Registration number is required' },
                      {
                        validator: (_, value) => {
                          const v = String(value || '').trim()
                          if (!v) return Promise.resolve()
                          if (!/^[A-Z0-9-]{3,}$/i.test(v)) {
                            return Promise.reject(new Error('Use letters, digits or hyphens (min 3 characters)'))
                          }
                          return Promise.resolve()
                        },
                      },
                    ]}
                    validateStatus={regNoStatus && !regNoStatus.ok ? 'error' : undefined}
                    help={regNoStatus && !regNoStatus.ok ? regNoStatus.message : undefined}
                    style={{ marginBottom: 4 }}
                  >
                    <Input
                      placeholder={selectedProgram ? 'e.g. MEM548217' : 'Select a yojna first'}
                      disabled={!selectedProgram || loading}
                      className="font-mono uppercase"
                      onChange={(e) => {
                        // Keep stored numbers consistently upper-case
                        form.setFieldValue('registrationNumber', e.target.value.toUpperCase())
                        setRegNoStatus(null)
                      }}
                      onBlur={(e) => checkRegNo(e.target.value)}
                      suffix={regNoLoading ? <LoadingOutlined /> : null}
                      addonAfter={
                        <Tooltip title="Generate a new number">
                          <ReloadOutlined
                            style={{ cursor: selectedProgram && !loading ? 'pointer' : 'not-allowed' }}
                            onClick={() => selectedProgram && !loading && generateRegNo(selectedProgram)}
                          />
                        </Tooltip>
                      }
                    />
                  </Form.Item>

                  {regNoStatus?.ok && (
                    <span className="text-xs text-green-600">✓ {regNoStatus.message}</span>
                  )}
                </Col>
              </Row>
            </div>

            <AddedByForm
              addedByRole={addedByRole}
              setAddedByRole={setAddedByRole}
              agents={agents}
              selectedAgent={selectedAgent}
              setSelectedAgent={setSelectedAgent}
            />

            {/* FeesForm — pass single-program values */}
            <FeesForm
              joinFeesDone={joinFeesDone}
              handleJoinFeesDoneChange={handleJoinFeesDoneChange}
              paymentMode={paymentMode}
              setPaymentMode={setPaymentMode}
              paidAmount={paidAmount}
              setPaidAmount={setPaidAmount}
              // single program total
              calculateTotalJoinFees={() => programDetail?.joinFees || 0}
              // pass as single-item array so FeesForm still renders correctly
              programDetails={programDetail ? [programDetail] : []}
              calculateProgramPayments={(details, paid) => {
                if (!details?.length) return []
                const fees    = details[0].joinFees || 0
                const actual  = Math.min(paid, fees)
                const pending = Math.max(0, fees - actual)
                const pct     = fees > 0 ? Math.round((actual / fees) * 100) : 0
                return [{ ...details[0], paidAmount: actual, pendingAmount: pending, paymentPercentage: pct }]
              }}
            />

            {/* existing* props render previews for images carried over by
                "Copy from existing member" */}
            <PhotoUploads
              memberPhoto={memberPhoto}     setMemberPhoto={setMemberPhoto}
              guardianPhoto={guardianPhoto} setGuardianPhoto={setGuardianPhoto}
              existingMemberPhoto={copiedFrom?.docs?.photoURL || ''}
              existingGuardianPhoto={copiedFrom?.docs?.guardianPhotoURL || ''}
            />

            <DocumentUploads
              memberDocFront={memberDocFront} setMemberDocFront={setMemberDocFront}
              memberDocBack={memberDocBack}   setMemberDocBack={setMemberDocBack}
              guardianDoc={guardianDoc}       setGuardianDoc={setGuardianDoc}
              existingMemberDocFront={copiedFrom?.docs?.documentFrontURL || ''}
              existingMemberDocBack={copiedFrom?.docs?.documentBackURL || ''}
              existingGuardianDoc={copiedFrom?.docs?.guardianDocumentURL || ''}
            />

            {/* Notification Options Section */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <div className="mb-3">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Notification Options</h4>
                <p className="text-xs text-gray-500 mb-3">Choose how to notify the member after registration</p>
              </div>
              <Space direction="vertical" size="middle" className="w-full">
                <Checkbox
                  checked={sendWhatsApp}
                  onChange={(e) => setSendWhatsApp(e.target.checked)}
                  disabled={loading}
                >
                  <span className="text-sm">
                    Send WhatsApp Message to Member
                    {sendWhatsApp && <span className="text-xs text-green-600 ml-2">(with membership certificate)</span>}
                  </span>
                </Checkbox>

                <Checkbox
                  checked={sendAgentWhatsApp}
                  onChange={(e) => setSendAgentWhatsApp(e.target.checked)}
                  disabled={loading}
                >
                  <span className="text-sm">
                    Send WhatsApp Message to Agent
                    {sendAgentWhatsApp && (
                      <span className="text-xs text-green-600 ml-2">
                        (same details + certificate to the agent&apos;s number)
                      </span>
                    )}
                  </span>
                </Checkbox>

                {sendAgentWhatsApp && addedByRole !== 'agent' && (
                  <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded ml-6">
                    ⚠️ This member is being added by an admin, not an agent — with no agent
                    assigned there is no number to send the copy to.
                  </div>
                )}

                <Checkbox
                  checked={sendNotification}
                  onChange={(e) => setSendNotification(e.target.checked)}
                  disabled={loading}
                >
                  <span className="text-sm">
                    Send In-App Notification
                    {sendNotification && <span className="text-xs text-blue-600 ml-2">(Agent will receive notification in dashboard)</span>}
                  </span>
                </Checkbox>
              </Space>

              {/* Optional: Show summary if all are unchecked */}
              {!sendWhatsApp && !sendAgentWhatsApp && !sendNotification && (
                <div className="mt-3 text-xs text-amber-600 bg-amber-50 p-2 rounded">
                  ⚠️ No notification method selected. Neither the member nor the agent will be informed.
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button onClick={() => setOpen(false)} disabled={loading}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={loading}>Add Member</Button>
          </div>
        </Form>
      </Spin>

      {/* ── Copy-from-member search ─────────────────────────────────────── */}
      <Modal
        title={<Space><CopyOutlined />Copy details from an existing member</Space>}
        open={copyOpen}
        onCancel={() => { setCopyOpen(false); setCopySearch(''); setCopyResults([]) }}
        footer={null}
        width={640}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12, fontSize: 12 }}
          message="Copies name, father, DOB, phone, Aadhaar, address and guardian"
          description="Yojna, registration number and payment are entered fresh. The original member stays exactly as it is."
        />

        <Input.Search
          autoFocus
          placeholder="Search by name, registration no, phone or Aadhaar"
          value={copySearch}
          onChange={e => {
            setCopySearch(e.target.value)
            if (e.target.value.trim().length >= 2) searchMembersToCopy(e.target.value)
            else setCopyResults([])
          }}
          onSearch={searchMembersToCopy}
          loading={copySearching}
          allowClear
        />

        <div style={{ maxHeight: 380, overflowY: 'auto', marginTop: 12 }}>
          {copySearching ? (
            <div style={{ textAlign: 'center', padding: 30 }}><Spin /></div>
          ) : copyResults.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 }}>
              {copySearch.trim().length >= 2
                ? 'No members found'
                : 'Type at least 2 characters to search'}
            </div>
          ) : copyResults.map(m => (
            <div
              key={m.id}
              onClick={() => applyCopiedMember(m)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderBottom: '1px solid #f0f0f0',
                cursor: 'pointer', borderRadius: 6,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  {m.displayName || '—'}
                  {m.fatherName && <span style={{ fontWeight: 400, color: '#6b7280' }}> · s/o {m.fatherName}</span>}
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                  <span style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>
                    {m.registrationNumber || '—'}
                  </span>
                  {m.phone && <> · {m.phone}</>}
                  {m.village && <> · {m.village}</>}
                </div>
              </div>
              {m.programName && (
                <Tag color="geekblue" style={{ fontSize: 10, margin: 0 }}>{m.programName}</Tag>
              )}
              <Button size="small" type="link">Use</Button>
            </div>
          ))}
        </div>
      </Modal>
    </Drawer>
  )
}

export default AddMember