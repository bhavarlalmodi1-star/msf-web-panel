"use client"
import { App, Button, Drawer, Form, Spin } from 'antd'
import React, { useState, useEffect, useCallback } from 'react'
import { LoadingOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import isBetween from 'dayjs/plugin/isBetween'
import { useSelector } from 'react-redux'
import {
  collection, getDocs, query, where, doc, getDoc,
  updateDoc, serverTimestamp, addDoc
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../../../lib/firbase-client'
import { notifyAgent } from '@/app/utils/notifyAgent'

// Import form section components
import BasicInfoForm    from './components/BasicInfoForm'
import AddressForm      from './components/AddressForm'
import GuardianForm     from './components/GuardianForm'
import ProgramSelection from './components/ProgramSelection'
import AddedByForm      from './components/AddedByForm'
import PhotoUploads     from './components/PhotoUploads'
import DocumentUploads  from './components/DocumentUploads'

dayjs.extend(isBetween)

// ─── File upload helper ───────────────────────────────────────────────────────
const uploadFile = async (file, folder, fileName) => {
  if (!file) return null
  const storageRef = ref(storage, `${folder}/${Date.now()}_${fileName}`)
  const snapshot   = await uploadBytes(storageRef, file)
  return await getDownloadURL(snapshot.ref)
}

// ─── Main component ───────────────────────────────────────────────────────────
const EditMember = ({ open, setOpen, programs, agents, currentUser, memberId, onSuccess }) => {
  const [form]    = Form.useForm()
  const { message } = App.useApp()

  const [loading,     setLoading]     = useState(false)
  const [fetching,    setFetching]    = useState(false)
  const [memberData,  setMemberData]  = useState(null)
  const [dataLoaded,  setDataLoaded]  = useState(false)

  // Single program state
  const [selectedProgram, setSelectedProgram] = useState('')    // single ID string
  const [programDetail,   setProgramDetail]   = useState(null)  // single object
  const [selectedMemberGroup, setSelectedMemberGroup] = useState(null)

  // Dates & age
  const [joinDate, setJoinDate] = useState(dayjs())
  const [dobDate,  setDobDate]  = useState(null)
  const [age,      setAge]      = useState(null)

  // Payment
  const [joinFeesDone,        setJoinFeesDone]        = useState(false)
  const [paymentMode,         setPaymentMode]         = useState('cash')
  const [paidAmount,          setPaidAmount]          = useState(0)
  const [initialPaidAmount,   setInitialPaidAmount]   = useState(0)

  // Added by
  const [addedByRole,    setAddedByRole]    = useState('admin')
  const [selectedAgent,  setSelectedAgent]  = useState(null)

  // Files (new uploads)
  const [memberPhoto,    setMemberPhoto]    = useState(null)
  const [guardianPhoto,  setGuardianPhoto]  = useState(null)
  const [memberDocFront, setMemberDocFront] = useState(null)
  const [memberDocBack,  setMemberDocBack]  = useState(null)
  const [guardianDoc,    setGuardianDoc]    = useState(null)

  // Location dropdowns
  const [states,    setStates]    = useState([])
  const [districts, setDistricts] = useState([])
  const [cities,    setCities]    = useState([])
  const [castes,    setCastes]    = useState([])
  const [relations, setRelations] = useState([])

  // ── Load static data once ───────────────────────────────────────────────────
  useEffect(() => { fetchStaticData() }, [])

  // ── Load member data whenever drawer opens ──────────────────────────────────
  useEffect(() => {
    if (open && memberId) { resetForm(); fetchMemberData() }
  }, [open, memberId])

  // ── Recalculate program detail whenever relevant state changes ──────────────
  useEffect(() => {
    if (dataLoaded && dobDate && selectedProgram && programs.length > 0) {
      calculateProgramDetail()
    }
  }, [dataLoaded, dobDate, joinDate, selectedProgram, programs])

  // ── Static data ─────────────────────────────────────────────────────────────
  const fetchStaticData = async () => {
    try {
      const [stSnap, caSnap, relSnap] = await Promise.all([
        getDocs(collection(db, 'states')),
        getDocs(collection(db, 'castes')),
        getDocs(collection(db, 'relations')),
      ])
      const active = (snap) => snap.docs.filter(d => d.data().status === 'active').map(d => ({ id: d.id, ...d.data() }))
      setStates(active(stSnap))
      setCastes(active(caSnap))
      setRelations(active(relSnap))
    } catch (e) {
      console.error(e); message.error('Failed to load form data')
    }
  }

  // ── Fetch member doc ─────────────────────────────────────────────────────────
  const fetchMemberData = async () => {
    if (!memberId) return
    setFetching(true); setDataLoaded(false)
    try {
      const snap = await getDoc(doc(db, 'members', memberId))
      if (!snap.exists()) { message.error('Member not found'); setOpen(false); return }

      const data = snap.data()
      setMemberData({ id: snap.id, ...data })

      const dob  = data.dobDate  ? dayjs(data.dobDate,  'DD-MM-YYYY') : null
      const join = data.dateJoin ? dayjs(data.dateJoin, 'DD-MM-YYYY') : dayjs()

      setDobDate(dob)
      setJoinDate(join)
      setAge(dob ? dayjs().diff(dob, 'year') : null)

      // ── Single program ──────────────────────────────────────────────────────
      setSelectedProgram(data.programId || '')

      // Payment
      setJoinFeesDone(data.joinFeesDone || false)
      setPaymentMode(data.paymentMode || 'cash')
      setPaidAmount(data.paidAmount || 0)
      setInitialPaidAmount(data.paidAmount || 0)

      // Added by
      setAddedByRole(data.addedBy || 'admin')
      setSelectedAgent(data.agentId || null)

      // Populate form
      form.setFieldsValue({
        name:             data.displayName,
        fatherName:       data.fatherName,
        surname:          data.surname,
        gender:           data.gender || '',
        caste:            data.casteId,
        phone:            data.phone,
        phoneAlt:         data.phoneAlt || '',
        bobDate:          dob,
        currentAddress:   data.currentAddress,
        state:            data.stateId,
        district:         data.districtId,
        city:             data.cityId,
        pinCode:          data.pinCode,
        village:          data.village,
        aadhaarNo:        data.aadhaarNo,
        guardian:         data.guardian,
        guardianRelation: data.guardianRelationId,
        joinDate:         join,
        program:          data.programId || '',   // single field
        addedBy:          data.addedBy || 'admin',
        selectedAgent:    data.agentId,
        password:         '',
        joinFeesDone:     data.joinFeesDone || false,
        paymentMode:      data.paymentMode || 'cash',
        paidAmount:       data.paidAmount || 0,
        joinFeesTxtId:    data.joinFeesTxtId || '',
        transactionDate:  data.transactionDate ? dayjs(data.transactionDate, 'DD-MM-YYYY') : null,
      })

      // Load location dropdowns
      if (data.stateId) await fetchDistricts(data.stateId, data.districtId)

      setDataLoaded(true)
    } catch (e) {
      console.error(e); message.error('Failed to load member data')
    } finally { setFetching(false) }
  }

  // ── Location loaders ─────────────────────────────────────────────────────────
  const fetchDistricts = async (stateId, selectDistrictId = null) => {
    try {
      const snap = await getDocs(query(collection(db, 'districts'), where('stateId', '==', stateId)))
      setDistricts(snap.docs.filter(d => d.data().status === 'active').map(d => ({ id: d.id, ...d.data() })))
      if (selectDistrictId) await fetchCities(selectDistrictId)
    } catch (e) { console.error(e) }
  }

  const fetchCities = async (districtId) => {
    try {
      const snap = await getDocs(query(collection(db, 'cities'), where('districtId', '==', districtId)))
      setCities(snap.docs.filter(d => d.data().status === 'active').map(d => ({ id: d.id, ...d.data() })))
    } catch (e) { console.error(e) }
  }

  const handleStateChange = async (value) => {
    if (value) { await fetchDistricts(value) } else { setDistricts([]); setCities([]) }
    form.setFieldsValue({ district: undefined, city: undefined })
  }

  const handleDistrictChange = async (value) => {
    if (value) { await fetchCities(value) } else { setCities([]) }
    form.setFieldsValue({ city: undefined })
  }

  // ── Single-program detail calculation ────────────────────────────────────────
  const calculateProgramDetail = useCallback((groupOverride) => {
    if (!dobDate || !selectedProgram || !programs.length) {
      setProgramDetail(null); return
    }

    const calcAge         = joinDate.diff(dobDate, 'year')
    const joinDateStr     = joinDate.format('DD-MM-YYYY')
    const program         = programs.find(p => p.id === selectedProgram)

    if (!program?.ageGroups?.length) {
      setProgramDetail({ programId: selectedProgram, programName: program?.name, error: 'No age groups configured' }); return
    }

    const ageGroup = program.ageGroups.find(ag => calcAge >= ag.startAge && calcAge <= ag.endAge)
    if (!ageGroup) {
      setProgramDetail({ programId: selectedProgram, programName: program.name, error: `No age group for age ${calcAge}` }); return
    }

    const period = ageGroup.periods?.find(p => {
      try {
        return dayjs(joinDateStr, 'DD-MM-YYYY').isBetween(dayjs(p.startDate, 'DD-MM-YYYY'), dayjs(p.endDate, 'DD-MM-YYYY'), null, '[]')
      } catch { return false }
    })

    if (!period) {
      setProgramDetail({ programId: selectedProgram, programName: program.name, ageGroupName: ageGroup.ageGroupName, error: `No active period for ${joinDateStr}` }); return
    }

    const groups = program?.memberGroups || []
    const group  = groupOverride || selectedMemberGroup || groups[0] || {}
    const detail = {
      programId:       selectedProgram,
      programName:     program.name,
      ageGroupId:      ageGroup.id,
      ageGroupName:    ageGroup.ageGroupName,
      joinFees:        period.joinFees   || 0,
      payAmount:       period.payAmount  || 0,
      fixedJoinFees:   period.fixedJoinFees || 0,
      periodStartDate: period.startDate,
      periodEndDate:   period.endDate,
      memberGroupId:   group.id        || '',
      memberGroupName: group.groupName || '',
      memberGroupCode: group.code      || '',
      memberGroups:    groups,
      hasPeriod:       true,
    }
    setProgramDetail(detail)

    // Auto-fill paid amount only if join fees payment is enabled
    if (!paidAmount && joinFeesDone && detail.joinFees > 0) {
      setPaidAmount(detail.joinFees)
      form.setFieldsValue({ paidAmount: detail.joinFees })
    }
  }, [dobDate, selectedProgram, joinDate, programs, form, paidAmount, selectedMemberGroup])

  // ── Event handlers ───────────────────────────────────────────────────────────
  const handleDobChange = (date) => {
    setDobDate(date)
    setAge(date ? dayjs().diff(date, 'year') : null)
    if (!date) setProgramDetail(null)
  }

  const handleProgramChange = (programId) => {
    setSelectedProgram(programId)
    setSelectedMemberGroup(null)
    if (!programId) setProgramDetail(null)
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
    if (isDone && !paidAmount) {
      const fees = programDetail?.joinFees || 0
      setPaidAmount(fees)
      form.setFieldsValue({ paidAmount: fees })
    }
  }

  // ── File upload helper ───────────────────────────────────────────────────────
  const uploadFiles = async (values) => {
    const results = { photoURL: null, guardianPhotoURL: null, documentFrontURL: null, documentBackURL: null, guardianDocumentURL: null }
    const tasks = []
    if (memberPhoto)    tasks.push(uploadFile(memberPhoto,    'members/photos',              `${values.name}_photo`).then(u => { results.photoURL            = u }))
    if (guardianPhoto)  tasks.push(uploadFile(guardianPhoto,  'members/guardian_photos',     `${values.guardian}_photo`).then(u => { results.guardianPhotoURL    = u }))
    if (memberDocFront) tasks.push(uploadFile(memberDocFront, 'members/documents',           `${values.name}_doc_front`).then(u => { results.documentFrontURL    = u }))
    if (memberDocBack)  tasks.push(uploadFile(memberDocBack,  'members/documents',           `${values.name}_doc_back`).then(u => { results.documentBackURL     = u }))
    if (guardianDoc)    tasks.push(uploadFile(guardianDoc,    'members/guardian_documents',  `${values.guardian}_doc`).then(u => { results.guardianDocumentURL  = u }))
    await Promise.allSettled(tasks)
    return results
  }

  // ── Record payment transaction ───────────────────────────────────────────────
  const recordPaymentTransaction = async (changeAmount, newPaid, newPending, values) => {
    try {
      const displayName = memberData?.displayName || '';
      const regNo = memberData?.registrationNumber || '';
      const fatherName = memberData?.fatherName || '';
      const phone = memberData?.phone || '';
      const aadhaarNo = memberData?.aadhaarNo || '';
      const keyword = [displayName, regNo, fatherName, phone, aadhaarNo]
        .filter(Boolean).join(' ').toLowerCase();

      await addDoc(collection(db, 'memberJoinFees'), {
        memberId:           memberId,
        memberName:         displayName,
        memberFatherName:   fatherName,
        registrationNumber: regNo,
        memberPhone:        phone,
        memberAadhaar:      aadhaarNo,
        programId:          selectedProgram   || '',
        programName:        programDetail?.programName || '',
        transactionType:    changeAmount > 0 ? 'additional_payment' : 'refund_adjustment',
        amount:             Math.abs(changeAmount),
        newTotalPaid:       newPaid,
        newPendingAmount:   newPending,
        paymentMode:        paymentMode,
        transactionId:      values.joinFeesTxtId || '',
        transactionDate:    values.transactionDate ? dayjs(values.transactionDate).format('DD-MM-YYYY') : dayjs().format('DD-MM-YYYY'),
        status:             'completed',
        verified:           true,
        notes:              'Payment updated via member edit',
        createdBy:          currentUser?.uid,
        agentId:            memberData?.agentId || '',
        createdAt:          serverTimestamp(),
        updated_at:         serverTimestamp(),
        search_keyword:     keyword,
      })
    } catch (e) {
      console.error('Transaction record failed:', e)
      message.warning('Member updated but transaction record failed')
    }
  }

  // ── Submit handler ───────────────────────────────────────────────────────────
  const handleUpdateMember = async (values) => {
    setLoading(true)
    try {
      // Validate
      if (programDetail?.error) {
        message.error('Please fix program selection errors before submitting')
        setLoading(false); return false
      }

      const joinFees        = programDetail?.joinFees || 0
      const currentPaid     = parseFloat(paidAmount || 0)
      const pendingAmount   = Math.max(0, joinFees - currentPaid)
      const paymentPct      = joinFees > 0 ? Math.round((currentPaid / joinFees) * 100) : 0
      const paymentStatus   = paymentPct === 100 ? 'paid' : paymentPct > 0 ? 'partial' : 'pending'
      const paymentDiff     = currentPaid - initialPaidAmount

      // Upload files
      const fileUrls = await uploadFiles(values)

      // Lookup display names
      const selectedStateName    = states.find(s => s.id === values.state)?.name    || memberData?.state    || ''
      const selectedDistrictName = districts.find(d => d.id === values.district)?.name || memberData?.district || ''
      const selectedCityName     = cities.find(c => c.id === values.city)?.name     || memberData?.city     || ''
      const selectedCasteName    = castes.find(c => c.id === values.caste)?.name    || memberData?.caste    || ''
      const selectedRelationName = relations.find(r => r.id === values.guardianRelation)?.name || memberData?.guardianRelation || ''

      // Only a superadmin may rename a member. A disabled input alone isn't
      // enough — keep the stored name unless the role actually permits it.
      const canEditName = currentUser?.role === 'superadmin'
      const finalName   = canEditName
        ? values.name
        : (memberData?.displayName || values.name)

      // ── Build update payload ────────────────────────────────────────────────
      const updateData = {
        // Personal
        displayName:  finalName,
        fatherName:   values.fatherName,
        surname:      values.surname,
        gender:       values.gender || '',
        caste:        selectedCasteName,
        casteId:      values.caste,
        phone:        values.phone,
        phoneAlt:     values.phoneAlt || '',
        dateJoin:     joinDate.format('DD-MM-YYYY'),
        // Everything derived from the join date must change WITH it:
        programJoinDate: joinDate.format('DD-MM-YYYY'),
        joinYear:      joinDate.year(),
        joinMonth:     joinDate.month() + 1,
        joinYearMonth: joinDate.format('YYYY-MM'),
        // Sortable copy — this is what the date-range filter queries, so it
        // must be rewritten whenever the join date is edited
        joinDateTs:    joinDate.startOf('day').toDate(),
        dobDate:      dobDate?.format('DD-MM-YYYY') || '',
        age,

        // Location
        currentAddress: values.currentAddress,
        state:          selectedStateName,    stateId:    values.state,
        district:       selectedDistrictName, districtId: values.district,
        city:           selectedCityName,     cityId:     values.city,
        pinCode:        values.pinCode,
        village:        values.village,
        aadhaarNo:      values.aadhaarNo,

        // Guardian
        guardian:           values.guardian,
        guardianRelation:   selectedRelationName,
        guardianRelationId: values.guardianRelation,

        // Agent
        addedBy: addedByRole,
        agentId: addedByRole === 'agent' ? selectedAgent : null,

        // ── Single program (all flat) ─────────────────────────────────────────
        programId:       programDetail?.programId       || selectedProgram || '',
        programName:     programDetail?.programName     || '',
        ageGroupId:      programDetail?.ageGroupId      || '',
        ageGroupName:    programDetail?.ageGroupName    || '',
        periodStartDate: programDetail?.periodStartDate || '',
        periodEndDate:   programDetail?.periodEndDate   || '',
        memberGroupId:   programDetail?.memberGroupId   || '',
        memberGroupName: programDetail?.memberGroupName || '',
        memberGroupCode: programDetail?.memberGroupCode || '',

        // ── Financial ─────────────────────────────────────────────────────────
        joinFees,
        payAmount:         programDetail?.payAmount || 0,
        fixedJoinFees:     programDetail?.fixedJoinFees || 0,
        joinFeesDone,
        paymentMode:       joinFeesDone ? paymentMode : null,
        paidAmount:        currentPaid,
        pendingAmount,
        paymentPercentage: paymentPct,
        paymentStatus,
        joinFeesTxtId:     values.joinFeesTxtId || '',
        transactionDate:   values.transactionDate ? dayjs(values.transactionDate).format('DD-MM-YYYY') : null,
        hasPendingPayments: pendingAmount > 0,

        // Search fields
        // finalName, not values.name — otherwise a non-superadmin's edit would
        // leave the search index pointing at a name the member doc never took
        search_name:               finalName?.toLowerCase()           || '',
        search_fatherName:         values.fatherName?.toLowerCase()   || '',
        search_surname:            values.surname?.toLowerCase()       || '',
        search_fullName:           `${finalName} ${values.fatherName} ${values.surname}`.toLowerCase().trim(),
        search_phone:              values.phone                        || '',
        search_phoneLast4:         values.phone?.slice(-4)             || '',
        search_aadhaar:            values.aadhaarNo                   || '',
        search_aadhaarLast4:       values.aadhaarNo?.slice(-4)         || '',
        search_village:            values.village?.toLowerCase()       || '',
        search_city:               selectedCityName?.toLowerCase()     || '',
        search_district:           selectedDistrictName?.toLowerCase() || '',
        search_state:              selectedStateName?.toLowerCase()    || '',
        search_caste:              selectedCasteName?.toLowerCase()    || '',
        search_guardian:           values.guardian?.toLowerCase()      || '',
        search_programName:        programDetail?.programName?.toLowerCase() || '',

        updated_at: serverTimestamp(),
      }

      // Files — only overwrite if new uploads
      if (fileUrls.photoURL)           updateData.photoURL            = fileUrls.photoURL
      if (fileUrls.guardianPhotoURL)   updateData.guardianPhotoURL    = fileUrls.guardianPhotoURL
      if (fileUrls.documentFrontURL)   updateData.documentFrontURL    = fileUrls.documentFrontURL
      if (fileUrls.documentBackURL)    updateData.documentBackURL     = fileUrls.documentBackURL
      if (fileUrls.guardianDocumentURL) updateData.guardianDocumentURL = fileUrls.guardianDocumentURL

      // Password
      if (values.password?.trim()) updateData.password = values.password

      // ── Save ─────────────────────────────────────────────────────────────────
      await updateDoc(doc(db, 'members', memberId), updateData)

      // Record transaction if payment amount changed
      if (paymentDiff !== 0 && joinFeesDone) {
        await recordPaymentTransaction(paymentDiff, currentPaid, pendingAmount, values)
        // Sync aggregated counters
        const agentIdVal = addedByRole === 'agent' ? selectedAgent : memberData?.agentId;
        const programIdVal = programDetail?.programId || memberData?.programId;
        try {
          const token = await auth.currentUser?.getIdToken();
          await fetch('/api/members/adjust-stats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              agentId: agentIdVal,
              programId: programIdVal,
              paidDelta: paymentDiff,
              type: 'joinFees',
            }),
          });
        } catch (e) {
          console.warn('Failed to sync counters:', e);
        }

        // Credit agent commission for extra payment added via edit
        // (keeps commission consistent with payments made via payment screens)
        if (paymentDiff > 0 && agentIdVal) {
          try {
            const token = await auth.currentUser?.getIdToken();
            await fetch('/api/commission', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({
                action: 'credit',
                agentId: agentIdVal,
                amount: paymentDiff,
                source: 'joinFees',
                sourceId: memberId,
                memberName: memberData?.displayName || values.name || '',
                memberFatherName: memberData?.fatherName || '',
                memberRegNo: memberData?.registrationNumber || '',
                programId: programIdVal || '',
                programName: programDetail?.programName || memberData?.programName || '',
                description: 'Join Fee Commission - Payment via Member Edit',
              }),
            });
          } catch (e) {
            console.warn('Failed to credit commission for edit payment:', e);
          }
        }
      }

      message.success('Member updated successfully!')
      // Notify new agent if agent assignment changed
      const newAgentId = addedByRole === 'agent' ? selectedAgent : null
      if (newAgentId && newAgentId !== memberData?.agentId) {
        notifyAgent(
          newAgentId,
          "New Member Assigned",
          `${memberData?.displayName || values.name} has been assigned to you.`,
          { click_action: "/members" }
        )
      }
      if (onSuccess) onSuccess()
      setOpen(false)
      return true

    } catch (e) {
      console.error(e); message.error('Failed to update member: ' + e.message)
      return false
    } finally { setLoading(false) }
  }

  // ── Reset ────────────────────────────────────────────────────────────────────
  const resetForm = () => {
    form.resetFields()
    setSelectedProgram('')
    setProgramDetail(null)
    setMemberPhoto(null); setGuardianPhoto(null)
    setMemberDocFront(null); setMemberDocBack(null); setGuardianDoc(null)
    setCities([]); setDistricts([])
    setDobDate(null); setAge(null); setJoinDate(dayjs())
    setJoinFeesDone(false); setPaymentMode('cash')
    setPaidAmount(0); setInitialPaidAmount(0)
    setAddedByRole('admin'); setSelectedAgent(null)
    setMemberData(null); setDataLoaded(false)
  }

  return (
    <Drawer
      title="Edit Member"
      open={open}
      onClose={() => { if (!loading && !fetching) { resetForm(); setOpen(false) } }}
      width={900}
      footer={null}
      maskClosable={!loading && !fetching}
      closable={!loading && !fetching}
    >
      <Spin spinning={loading || fetching} indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />}>
        <Form form={form} layout="vertical" onFinish={handleUpdateMember} disabled={loading || fetching}>
          <div className="flex flex-col gap-2">

            <BasicInfoForm
              handleDobChange={handleDobChange}
              age={age}
              castes={castes}
              form={form}
              isEditMode={true}
              currentUserRole={currentUser?.role}
            />

            <AddressForm
              states={states} districts={districts} cities={cities}
              selectedState={memberData?.stateId} selectedDistrict={memberData?.districtId}
              handleStateChange={handleStateChange}
              handleDistrictChange={handleDistrictChange}
              form={form}
            />

            <GuardianForm relations={relations} />

            {/* ProgramSelection receives single-select props */}
            <ProgramSelection
              joinDate={joinDate}
              handleJoinDateChange={handleJoinDateChange}
              programs={programs}
              selectedProgram={selectedProgram}
              handleProgramChange={handleProgramChange}
              dobDate={dobDate}
              programDetail={programDetail}
              isEditMode={true}
              selectedMemberGroup={selectedMemberGroup}
              handleMemberGroupChange={handleMemberGroupChange}
              currentUserRole={currentUser?.role}
            />

            <AddedByForm
              addedByRole={addedByRole}
              setAddedByRole={setAddedByRole}
              agents={agents}
              selectedAgent={selectedAgent}
              setSelectedAgent={setSelectedAgent}
            />

            <PhotoUploads
              memberPhoto={memberPhoto}       setMemberPhoto={setMemberPhoto}
              guardianPhoto={guardianPhoto}   setGuardianPhoto={setGuardianPhoto}
              existingMemberPhoto={memberData?.photoURL}
              existingGuardianPhoto={memberData?.guardianPhotoURL}
              isEditMode={true}
            />

            <DocumentUploads
              memberDocFront={memberDocFront} setMemberDocFront={setMemberDocFront}
              memberDocBack={memberDocBack}   setMemberDocBack={setMemberDocBack}
              guardianDoc={guardianDoc}       setGuardianDoc={setGuardianDoc}
              existingMemberDocFront={memberData?.documentFrontURL}
              existingMemberDocBack={memberData?.documentBackURL}
              existingGuardianDoc={memberData?.guardianDocumentURL}
              isEditMode={true}
            />

          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button onClick={() => { resetForm(); setOpen(false) }} disabled={loading || fetching}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={loading}>Update Member</Button>
          </div>
        </Form>
      </Spin>
    </Drawer>
  )
}

export default EditMember