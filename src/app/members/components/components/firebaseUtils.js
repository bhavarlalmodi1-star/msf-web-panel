import {
  collection, addDoc, serverTimestamp, query, where, getDocs,
  getDoc, doc, updateDoc, deleteDoc, limit,
  setDoc, runTransaction
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import dayjs from 'dayjs'
import { auth, db, storage } from '../../../../../lib/firbase-client'
import { message } from 'antd'
import { notifyAgent } from '@/app/utils/notifyAgent'

// Auto-generate a cash reference ID so cash payments are searchable in history
const generateCashId = () => {
  const d   = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `CSH-${date}-${time}-${rand}`;
};

// Atomically increment global member Sr. No. counter and return the new value.
// Stored at organizationStats/current.totalMembersAdded
export const getNextMemberSrNo = async () => {
  const statsRef = doc(db, 'organizationStats', 'current')
  return await runTransaction(db, async (txn) => {
    const snap = await txn.get(statsRef)
    const current = snap.exists() ? (snap.data().totalMembersAdded || 0) : 0
    const next = current + 1
    txn.set(statsRef, { totalMembersAdded: next }, { merge: true })
    return next
  })
}

// File upload utility
export const uploadFile = async (file, folder, fileName) => {
  if (!file) return ''
  
  if (typeof file === 'string' && file.startsWith('http')) {
    return file
  }
  
  if (!(file instanceof File)) {
    console.warn('uploadFile called with non-File object:', file)
    return ''
  }

  try {
    const timestamp = Date.now()
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
    const storageRef = ref(storage, `${folder}/${timestamp}_${sanitizedFileName}`)
    const snapshot = await uploadBytes(storageRef, file)
    const downloadURL = await getDownloadURL(snapshot.ref)
    return downloadURL
  } catch (error) {
    console.error('Error uploading file:', error)
    throw error
  }
}

// Upload multiple files


// Results are keyed, NOT positional. The previous version pushed a promise only
// for files that were present but then read results[0..4] by fixed index — so
// uploading a guardian photo without a member photo put the guardian's image
// into photoURL. Any missing file shifted every URL after it onto the wrong
// field.
//
// A value that's already an https URL is passed straight through by uploadFile,
// which is how "copy from existing member" reuses images without re-uploading.
export const uploadAllFiles = async (files) => {
  const jobs = []

  const add = (key, file, folder, name) => {
    if (!file) return
    jobs.push(
      uploadFile(file, folder, name)
        .then(url => ({ key, url }))
        .catch(err => {
          console.error(`Upload failed for ${key}:`, err)
          return { key, url: '' }
        })
    )
  }

  const memberName   = files.memberName   || 'member'
  const guardianName = files.guardianName || 'guardian'

  add('photoURL',            files.memberPhoto,   'members/photos',              `${memberName}_photo`)
  add('guardianPhotoURL',    files.guardianPhoto, 'members/guardian_photos',     `${guardianName}_photo`)
  add('documentFrontURL',    files.memberDocFront,'members/documents',           `${memberName}_doc_front`)
  add('documentBackURL',     files.memberDocBack, 'members/documents',           `${memberName}_doc_back`)
  add('guardianDocumentURL', files.guardianDoc,   'members/guardian_documents',  `${guardianName}_doc`)

  const settled = await Promise.all(jobs)

  const out = {
    photoURL: '', guardianPhotoURL: '',
    documentFrontURL: '', documentBackURL: '', guardianDocumentURL: '',
  }
  settled.forEach(({ key, url }) => { out[key] = url })
  return out
}

// Generate registration number — {prefix}{6 random digits}, e.g. MEM548217
//
// Random rather than sequential. Uniqueness is guaranteed by ATOMICALLY
// RESERVING each number: the candidate is claimed by creating
// registrationNumbers/{regNo} inside a transaction. Simply querying "does any
// member have this number?" and then using it is not safe — two registrations
// running at the same instant would both see it free and both take it. Creating
// the reservation doc can only succeed once, so the loser retries.
//
// Members registered before this collection existed aren't reserved, so each
// candidate is also checked against the members collection to avoid reusing a
// legacy number.
const REG_NO_MIN      = 100000;
const REG_NO_RANGE    = 900000;   // 100000–999999 → 900,000 values
const REG_NO_ATTEMPTS = 15;

// Is this registration number free? Checks both existing members and the
// reservation collection, so a number claimed by an in-flight registration
// isn't handed out again.
export const isRegistrationNumberAvailable = async (regNo) => {
  const candidate = String(regNo || '').trim().toUpperCase()
  if (!candidate) return { available: false, reason: 'Registration number is required' }

  try {
    const taken = await getDocs(query(
      collection(db, 'members'),
      where('registrationNumber', '==', candidate),
      limit(1)
    ))
    if (!taken.empty) {
      const m = taken.docs[0].data()
      return {
        available: false,
        reason: `Already used by ${m.displayName || 'another member'}`,
      }
    }

    const reserved = await getDoc(doc(db, 'registrationNumbers', candidate))
    if (reserved.exists()) {
      return { available: false, reason: 'This number is already reserved' }
    }

    return { available: true }
  } catch (err) {
    console.error('isRegistrationNumberAvailable failed:', err)
    // Don't block registration on a failed check — the reserve step is authoritative
    return { available: true, unchecked: true }
  }
}

// Reserve a manually-entered registration number. Returns false if someone
// else claimed it first, so the caller can prompt for a different one.
export const reserveRegistrationNumber = async (regNo, programId) => {
  const candidate = String(regNo || '').trim().toUpperCase()
  if (!candidate) return false
  try {
    return await runTransaction(db, async (txn) => {
      const ref  = doc(db, 'registrationNumbers', candidate)
      const snap = await txn.get(ref)
      if (snap.exists()) return false
      txn.set(ref, {
        registrationNumber: candidate,
        programId: programId || null,
        manual: true,
        createdAt: serverTimestamp(),
      })
      return true
    })
  } catch (err) {
    // Reservations collection may not be writable (rules) — fall back to
    // allowing it; the members-collection check above already ran.
    console.warn('reserveRegistrationNumber failed (continuing):', err)
    return true
  }
}

export const generateRegistrationNumber = async (programId) => {
  try {
    // ── Resolve the prefix from the program (falls back to 'MEM') ───────────
    let prefix = 'MEM';
    if (programId) {
      try {
        const progSnap = await getDoc(doc(db, 'programs', programId));
        if (progSnap.exists()) {
          const raw = (progSnap.data().regNoPrefix || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (raw) prefix = raw;
        }
      } catch (_) { /* use default */ }
    }

    // ── Try random numbers until one can be reserved ────────────────────────
    // If the reservation collection isn't writable (e.g. Firestore rules don't
    // cover it yet) we degrade to the members-query check alone rather than
    // failing — still correct in normal use, just not race-proof.
    let reservationsUnavailable = false;

    for (let attempt = 1; attempt <= REG_NO_ATTEMPTS; attempt++) {
      const n         = Math.floor(REG_NO_MIN + Math.random() * REG_NO_RANGE);
      const candidate = `${prefix}${n}`;

      // Legacy guard: members created before reservations existed
      const legacy = await getDocs(query(
        collection(db, 'members'),
        where('registrationNumber', '==', candidate),
        limit(1)
      ));
      if (!legacy.empty) {
        console.warn(`[RegNo] ${candidate} already held by an existing member — retrying (${attempt}/${REG_NO_ATTEMPTS})`);
        continue;
      }

      if (reservationsUnavailable) return candidate;

      // Atomic claim — only one caller can create this doc
      try {
        const reserved = await runTransaction(db, async (txn) => {
          const ref  = doc(db, 'registrationNumbers', candidate);
          const snap = await txn.get(ref);
          if (snap.exists()) return false;          // someone else holds it
          txn.set(ref, {
            registrationNumber: candidate,
            prefix,
            programId: programId || null,
            createdAt: serverTimestamp(),
          });
          return true;
        });

        if (reserved) return candidate;
        console.warn(`[RegNo] ${candidate} reserved by a concurrent registration — retrying (${attempt}/${REG_NO_ATTEMPTS})`);
      } catch (resErr) {
        // Almost always missing Firestore rules for `registrationNumbers`
        reservationsUnavailable = true;
        console.error(
          `[RegNo] Could not reserve numbers (${resErr?.code || resErr?.message}). ` +
          `Falling back to duplicate-checking against members only — add Firestore ` +
          `rules for the "registrationNumbers" collection to restore race safety.`
        );
        return candidate;
      }
    }

    // ── Exhausted the retries ───────────────────────────────────────────────
    // With 900,000 values this is effectively unreachable. Still return a plain
    // 6-digit number so the format never varies.
    const fallback = `${prefix}${Math.floor(REG_NO_MIN + Math.random() * REG_NO_RANGE)}`;
    console.error(
      `[RegNo] No free number for prefix "${prefix}" after ${REG_NO_ATTEMPTS} attempts — ` +
      `issued ${fallback} without a uniqueness guarantee.`
    );
    return fallback;

  } catch (error) {
    console.error('Error generating registration number:', error);
    // Keep the 6-digit shape even on unexpected failure
    return `MEM${Math.floor(REG_NO_MIN + Math.random() * REG_NO_RANGE)}`;
  }
};

// Create search index
export function createSearchIndex(data) {
  const indexSet = new Set();

  const addPrefixes = (text) => {
    const str = String(text).toLowerCase().trim();
    if (!str) return;

    indexSet.add(str);
    
    str.split(/\s+/).forEach(word => {
      if (word.length > 1) {
        indexSet.add(word);
        let prefix = "";
        for (const ch of word) {
          prefix += ch;
          if (prefix.length > 1) {
            indexSet.add(prefix);
          }
        }
      }
    });
  };

  const traverse = (value) => {
    if (value === null || value === undefined) return;
    if (typeof value === "object") {
      if (Array.isArray(value)) {
        value.forEach(v => traverse(v));
      } else {
        Object.values(value).forEach(v => traverse(v));
      }
    } else {
      addPrefixes(value);
    }
  };

  traverse(data);
  return Array.from(indexSet).filter(item => item.length > 0);
}

// Record join fee transaction
// Also creates a paymentGroups document so this payment appears in
// Payment History (which queries paymentGroups → memberJoinFees by groupId).
export const recordJoinFeeTransaction = async (memberData, paymentData) => {
  try {
    const displayName = memberData.displayName || '';
    const regNo       = memberData.registrationNumber || '';
    const fatherName  = memberData.fatherName || '';
    const phone       = memberData.phone || '';
    const aadhaarNo   = memberData.aadhaarNo || '';
    const agentId     = memberData.agentId || '';
    const amount      = parseFloat(paymentData.paidAmount || 0);
    const keyword     = [displayName, regNo, fatherName, phone, aadhaarNo]
      .filter(Boolean).join(' ').toLowerCase();

    // ── 1. Create paymentGroups doc so this shows in Payment History ───────────
    // (join-fees-add route does the same; we mirror the same structure here)
    const paymentDate = paymentData.transactionDate
      ? new Date(paymentData.transactionDate)
      : new Date();

    // Auto-generate a CSH-... ID for cash payments so they are searchable
    const finalTxId = paymentData.transactionId && paymentData.transactionId.trim()
      ? paymentData.transactionId.trim()
      : (paymentData.paymentMode || 'cash') === 'cash' ? generateCashId() : '';

    const groupRef = await addDoc(collection(db, 'paymentGroups'), {
      agentId,
      totalAmount:   amount,
      paymentMethod: paymentData.paymentMode || 'cash',
      transactionId: finalTxId,
      paymentDate,
      paymentNote:   paymentData.notes || '',
      fileUrl:       '',
      paymentType:   'joinFees',
      source:        paymentData.transactionType === 'additional_payment'
                       ? 'additional_payment'
                       : 'member_approval',
      createdBy:     memberData.createdBy || '',
      createdAt:     serverTimestamp(),
    });

    // ── 2. Create the memberJoinFees transaction doc, linked to the group ──────
    const transactionRef = await addDoc(collection(db, 'memberJoinFees'), {
      memberId:         memberData.memberId,
      memberName:       displayName,
      memberFatherName: fatherName,
      memberRegNo:      regNo,
      memberPhone:      phone,
      memberAadhaar:    aadhaarNo,
      registrationNumber: regNo,

      transactionType: paymentData.transactionType || 'join_fee',
      amount,
      previousBalance:  paymentData.previousBalance || 0,
      newBalance:       parseFloat(paymentData.totalPendingAmount || 0),

      paymentMode:     paymentData.paymentMode || 'cash',
      transactionId:   finalTxId,
      transactionDate: paymentData.transactionDate
        ? dayjs(paymentData.transactionDate).format('DD-MM-YYYY')
        : dayjs().format('DD-MM-YYYY'),

      programId:   paymentData.programId   || '',
      programName: paymentData.programName || '',

      status:   'completed',
      verified: true,
      notes:    paymentData.notes || 'Initial join fee payment',

      agentId,
      groupId:   groupRef.id,   // ← links to paymentGroups for history
      createdBy: memberData.createdBy || '',
      createdAt: serverTimestamp(),
      updated_at: serverTimestamp(),

      search_keyword: keyword,
    });

    // Return both ids — groupId lets callers tag commissions with the payment
    // group so a future revert can reverse the exact commission.
    return { txId: transactionRef.id, groupId: groupRef.id, id: transactionRef.id };
  } catch (error) {
    console.error('Error recording transaction:', error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate the membership certificate, save its URL on the member doc, and
// send the Gupshup WhatsApp join template (with the certificate attached).
//
// Deliberately non-throwing — a WhatsApp/PDF failure must never roll back or
// block member creation / request approval.  Returns the API result or null.
// ─────────────────────────────────────────────────────────────────────────────
export const sendJoinCertificate = async (memberId, { sendToMember = false, sendToAgent = false } = {}) => {
  if (!memberId) return null
  try {
    const currentUser = auth.currentUser
    if (!currentUser) { console.warn('sendJoinCertificate: no authenticated user'); return null }
    const token = await currentUser.getIdToken()

    // With no recipient selected we still want the certificate generated and
    // saved on the member record — skipWhatsApp does exactly that.
    const skipWhatsApp = !sendToMember && !sendToAgent

    const res  = await fetch('/api/members/join-certificate', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'authorization': `Bearer ${token}` },
      body:    JSON.stringify({ memberId, sendToMember, sendToAgent, skipWhatsApp }),
    })
    const data = await res.json()

    if (data?.whatsapp?.sent) {
      console.log(`✅ Join certificate sent on WhatsApp to member ${data.whatsapp.destination}`)
    } else {
      console.warn('⚠️ Member WhatsApp not sent:', data?.whatsapp?.error || data?.message)
    }
    if (sendToAgent) {
      if (data?.agentWhatsapp?.sent) {
        console.log(`✅ Copy sent to agent ${data.agentWhatsapp.destination}`)
      } else {
        console.warn('⚠️ Agent WhatsApp not sent:', data?.agentWhatsapp?.error)
      }
    }
    if (data?.certificate?.generated) {
      console.log(`📄 Certificate saved: ${data.certificate.url}`)
    }
    return data
  } catch (err) {
    // Non-critical — log and move on
    console.warn('sendJoinCertificate failed (non-critical):', err)
    return null
  }
}

export const memberAccoiuntCreate = async (memberData, commissionData = null) => {
  const currentUser = auth.currentUser
  if (!currentUser) throw new Error('No authenticated user')
  try {
    const token = await currentUser.getIdToken()
    const res = await fetch('/api/members', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        isOnlyAccountCreate: false,
        memberData: memberData,
        memberId: memberData.id,
        agentId: memberData.agentId,
        operation: "add",
        commissionData
      })
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.message || 'API error')
    return data
  } catch (error) {
    console.error('memberAccoiuntCreate error:', error)
    throw error
  }
}
export const createClosingPayment = async (memberData) => {
  const currentUser = auth.currentUser
  if (!currentUser) throw new Error('No authenticated user')
  try {
    const token = await currentUser.getIdToken()
    const res = await fetch('/api/create-closing-payment-single', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
         memberId: memberData.id,
      })
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.message || 'API error')
    return data
  } catch (error) {
    console.error('createClosingPayment error:', error)
    throw error
  }
}
// ✅ MAIN HANDLER - Program details stored in member document directly
export const handleSubmit = async (values, context, message) => {
  const {
    selectedPrograms,
    programDetails,
    programs,
    states,
    districts,
    cities,
    castes,
    relations,
    addedByRole,
    selectedAgent,
    addedByName,
    joinDate,
    dobDate,
    age,
    joinFeesDone,
    paymentMode,
    paidAmount,
    memberPhoto,
    guardianPhoto,
    memberDocFront,
    memberDocBack,
    guardianDoc,
    currentUser,
    form,
    setOpen,
    setLoading,
    sendWhatsApp,
    sendAgentWhatsApp,
    sendNotification,
    autoGeneratedRegNo,
  } = context

  setLoading(true)
  
  try {
    // ✅ Since one member = one program, get the single program
    // selectedPrograms[0] is the single selected program ID
    const selectedProgramId = selectedPrograms?.[0] || null
    const selectedProgramDetail = programDetails?.[0] || null
    const selectedProgram = programs?.find(p => p.id === selectedProgramId) || null

    if (!selectedProgramId || !selectedProgramDetail) {
      message.error('Please select a program before submitting')
      setLoading(false)
      return false
    }

    // ── Same person, same yojna — not allowed ───────────────────────────────
    // A member may belong to several yojnas, but joining the same one twice is
    // always a mistake. Matched on Aadhaar, so it catches a copied member AND
    // someone re-entered by hand. Single-field query then filtered in JS — a
    // composite query here would need an index for no real benefit, since one
    // Aadhaar only ever matches a handful of documents.
    const aadhaarToCheck = String(values.aadhaarNo || '').trim()
    if (aadhaarToCheck && selectedProgramId) {
      try {
        const dupSnap = await getDocs(query(
          collection(db, 'members'),
          where('aadhaarNo', '==', aadhaarToCheck)
        ))
        const clash = dupSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .find(m => m.programId === selectedProgramId && m.delete_flag !== true)

        if (clash) {
          message.error(
            `${clash.displayName || 'This person'} is already registered in ${clash.programName || 'this yojna'} ` +
            `(${clash.registrationNumber || 'no reg. no'}). Choose a different yojna.`
          )
          setLoading(false)
          return false
        }
      } catch (dupErr) {
        // Never block a legitimate registration because the check itself failed
        console.warn('Duplicate-in-yojna check skipped:', dupErr)
      }
    }

    // Registration number: use the one shown/typed in the form if present,
    // otherwise generate. A manually entered number still has to be reserved so
    // two admins can't submit the same one.
    let registrationNumber
    const typedRegNo = String(values.registrationNumber || '').trim().toUpperCase()
    const autoRegNo  = String(autoGeneratedRegNo || '').trim().toUpperCase()

    if (typedRegNo && typedRegNo === autoRegNo) {
      // Generated by this form — generateRegistrationNumber already reserved it.
      // Re-checking would find that reservation and reject the number for
      // colliding with itself.
      registrationNumber = typedRegNo
    } else if (typedRegNo) {
      const check = await isRegistrationNumberAvailable(typedRegNo)
      if (!check.available) {
        message.error(`Registration number ${typedRegNo} can't be used — ${check.reason}`)
        setLoading(false)
        return false
      }
      const reserved = await reserveRegistrationNumber(typedRegNo, selectedProgramId)
      if (!reserved) {
        message.error(`Registration number ${typedRegNo} was just taken by another entry. Please generate a new one.`)
        setLoading(false)
        return false
      }
      registrationNumber = typedRegNo
    } else {
      registrationNumber = await generateRegistrationNumber(selectedProgramId)
    }

    // Sr. No. and file uploads don't depend on each other — running them
    // concurrently removes a full round-trip (uploads are the slower of the two,
    // so the counter effectively becomes free).
    const [srNo, fileUrls] = await Promise.all([
      getNextMemberSrNo(),
      uploadAllFiles({
        memberPhoto,
        guardianPhoto,
        memberDocFront,
        memberDocBack,
        guardianDoc,
        memberName: values.name,
        guardianName: values.guardian
      }),
    ])
    
    // ✅ Single program fees
    const totalJoinFees = selectedProgramDetail.joinFees || 0
    // Clamp paid amount to [0, totalJoinFees] so pendingAmount is always in range
    const actualPaidAmount = Math.min(Math.max(0, parseFloat(paidAmount || 0)), totalJoinFees)

    if (parseFloat(paidAmount || 0) > totalJoinFees) {
      message.error(`Paid amount (₹${parseFloat(paidAmount || 0)}) cannot exceed total join fees (₹${totalJoinFees})`)
      setLoading(false)
      return false
    }

    // ✅ Calculate payment for single program (always non-negative, never > joinFees)
    const pendingAmount = Math.max(0, totalJoinFees - actualPaidAmount)
    const paymentPercentage = totalJoinFees > 0
      ? Math.round((actualPaidAmount / totalJoinFees) * 100)
      : 0
    const paymentStatus =
      paymentPercentage === 100 ? 'paid' :
      paymentPercentage > 0    ? 'partial' : 'pending'

    // Get selected names
    const selectedStateName    = states.find(s => s.id === values.state)?.name || ''
    const selectedDistrictName = districts.find(d => d.id === values.district)?.name || ''
    const selectedCityName     = cities.find(c => c.id === values.city)?.name || ''
    const selectedCasteName    = castes.find(c => c.id === values.caste)?.name || ''
    const selectedRelationName = relations.find(r => r.id === values.guardianRelation)?.name || ''

    // Create search index
    const searchIndex = createSearchIndex({
      name: values.name,
      fatherName: values.fatherName,
      surname: values.surname,
      phone: values.phone,
      aadhaarNo: values.aadhaarNo,
      registrationNumber,
      village: values.village,
      city: selectedCityName,
      district: selectedDistrictName,
      state: selectedStateName,
      caste: selectedCasteName,
      guardian: values.guardian,
      // ✅ Program info also searchable
      programName: selectedProgramDetail.programName,
      ageGroupName: selectedProgramDetail.ageGroupName
    })

    // ✅ Full member document with program details embedded directly
    const memberData = {
      uid: '',
      displayName: values.name,
      fatherName: values.fatherName,
      surname: values.surname,
      gender: values.gender || '',
      caste: selectedCasteName,
      casteId: values.caste,
      phone: values.phone,
      phoneAlt: values.phoneAlt || '',
      dateJoin: joinDate.format('DD-MM-YYYY'),
      dobDate: dobDate.format('DD-MM-YYYY'),
      age: age,
      currentAddress: values.currentAddress,
      state: selectedStateName,
      stateId: values.state,
      district: selectedDistrictName,
      districtId: values.district,
      city: selectedCityName,
      cityId: values.city,
      pinCode: values.pinCode,
      village: values.village,
      aadhaarNo: values.aadhaarNo,
      registrationNumber,
      guardian: values.guardian,
      guardianRelation: selectedRelationName,
      guardianRelationId: values.guardianRelation,
      
      addedBy: addedByRole,
      agentId: addedByRole === 'agent' ? selectedAgent : null,
      adminId: addedByRole === 'admin' ? currentUser?.uid : null,
      addedByName: addedByName,
      photoURL: fileUrls.photoURL,
      guardianPhotoURL: fileUrls.guardianPhotoURL,
      documentFrontURL: fileUrls.documentFrontURL,
      documentBackURL: fileUrls.documentBackURL,
      guardianDocumentURL: fileUrls.guardianDocumentURL,
      
      delete_flag: false,
      active_flag: true,
      isBlocked: false,
      marriage_flag: false,
      payment_flag: false,
      role: 'member',
      status: 'active',

      // ✅ Program details stored directly on the member document
      programId: selectedProgramId,
      programName: selectedProgramDetail.programName || '',
      ageGroupId: selectedProgramDetail.ageGroupId || '',
      ageGroupName: selectedProgramDetail.ageGroupName || '',
      periodStartDate: selectedProgramDetail.periodStartDate || '',
      periodEndDate: selectedProgramDetail.periodEndDate || '',
      memberGroupId: selectedProgramDetail.memberGroupId || '',
      memberGroupName: selectedProgramDetail.memberGroupName || '',
      memberGroupCode: selectedProgramDetail.memberGroupCode || '',
      programJoinDate: joinDate.format('DD-MM-YYYY'),
      programStatus: 'active',

      // ✅ Financial fields
      payAmount: selectedProgramDetail.payAmount || 0,
      joinFees: totalJoinFees,
      joinFeesDone: joinFeesDone,
      paymentMode: joinFeesDone ? paymentMode : null,
      paidAmount: actualPaidAmount,
      pendingAmount: pendingAmount,
      paymentPercentage: paymentPercentage,
      paymentStatus: paymentStatus,
      joinFeesTxtId: values.joinFeesTxtId || '',
      transactionDate: values.transactionDate
        ? values.transactionDate.format('DD-MM-YYYY')
        : null,
      
      password: values.password,

      // ✅ Search & filter fields
      search_keywords: searchIndex,
      search_programName: selectedProgramDetail.programName?.toLowerCase() || '',
      search_ageGroupName: selectedProgramDetail.ageGroupName?.toLowerCase() || '',
      search_paymentStatus: paymentStatus,

      joinYear: joinDate.year(),
      joinMonth: joinDate.month() + 1,
      joinYearMonth: joinDate.format('YYYY-MM'),
      // Sortable copy of the join date. dateJoin/programJoinDate are DD-MM-YYYY
      // strings, which don't sort chronologically, so range filters need this.
      joinDateTs: joinDate.startOf('day').toDate(),
      ageGroup: age < 18 ? 'minor' : age < 60 ? 'adult' : 'senior',
      hasPendingPayments: pendingAmount > 0,
      hasDocuments: !!(fileUrls.photoURL && fileUrls.documentFrontURL),
      isActive: true,
      
      srNo,

      createdAt: serverTimestamp(),
      createdBy: currentUser?.uid,
      updated_at: serverTimestamp()
    }

    // ✅ Add member to Firestore (no subcollection needed)
    const memberRef = await addDoc(collection(db, 'members'), memberData)
    const memberId = memberRef.id
    
    // ✅ Record join fee transaction with single program info
    let joinFeePaymentGroupId = ''
    if (joinFeesDone && actualPaidAmount > 0) {
      const txResult = await recordJoinFeeTransaction({
        memberId: memberId,
        displayName: values.name,
        registrationNumber,
        fatherName: values.fatherName,
        aadhaarNo: values.aadhaarNo,
        phone: values.phone,
        agentId: addedByRole === 'agent' ? selectedAgent : null,
        createdBy: currentUser?.uid
      }, {
        paidAmount: actualPaidAmount,
        totalPendingAmount: pendingAmount,
        paymentMode,
        transactionId: values.joinFeesTxtId,
        transactionDate: values.transactionDate,
        programId: selectedProgramId,
        programName: selectedProgramDetail.programName,
        previousBalance: 0,
        newBalance: pendingAmount,
        notes: 'Initial join fee payment'
      })
      joinFeePaymentGroupId = txResult?.groupId || ''
    }
    
    // ✅ Create account + credit commission (server-side)
    const commissionPayload = (addedByRole === 'agent' && selectedAgent && actualPaidAmount > 0)
      ? {
          agentId: selectedAgent,
          amount: actualPaidAmount,
          memberName: values.name,
          memberFatherName: values.fatherName || '',
          memberRegNo: registrationNumber || '',
          programId: selectedProgramId,
          programName: selectedProgramDetail.programName,
          description: 'Join Fee Commission (25%) - New Member',
          paymentGroupId: joinFeePaymentGroupId
        }
      : null
    // Auth account, stats and commission — the member isn't usable without
    // these, so this one stays blocking.
    await memberAccoiuntCreate({ ...memberData, id: memberId }, commissionPayload)

    message.success('Member added successfully!')

    // ── Everything below runs in the BACKGROUND ──────────────────────────────
    // The member record is already saved and complete. Certificate rendering
    // alone takes several seconds (server-side PDF generation + storage upload
    // + WhatsApp), and previously the drawer sat spinning through all of it.
    // None of this changes the member document's core data, so a failure here
    // is logged rather than surfaced — the member still exists either way.
    Promise.allSettled([
      createClosingPayment({ ...memberData, id: memberId }),
      sendJoinCertificate(memberId, {
        sendToMember: sendWhatsApp === true,
        sendToAgent:  sendAgentWhatsApp === true,
      }),
    ]).then(results => {
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          console.error(`Post-registration step ${i === 0 ? 'closing payment' : 'certificate'} failed:`, r.reason)
        }
      })
    })

    // ── Notify agent (in-app push) — only if the checkbox was left checked ────
    const agentIdToNotify = addedByRole === 'agent' ? selectedAgent : memberData.agentId
    if (sendNotification !== false && agentIdToNotify) {
      notifyAgent(
        agentIdToNotify,
        "New Member Assigned",
        `${memberData.displayName} has been added under you. Registration: ${registrationNumber}`,
        { click_action: "/members" }
      )
    }
    setOpen(false)
    return true
    
  } catch (error) {
    console.error('Error adding member:', error)
    message.error('Failed to add member: ' + error.message)
    return false
  } finally {
    setLoading(false)
  }
}

// ✅ Additional payment - update directly on member document
export const addAdditionalPayment = async (memberId, paymentData, currentUser) => {
  try {
    const memberRef = doc(db, 'members', memberId)
    const memberSnap = await getDoc(memberRef)
    
    if (!memberSnap.exists()) {
      throw new Error('Member not found')
    }
    
    const memberData = memberSnap.data()

    // Guard: no payments for soft-deleted (trashed) members — their amounts
    // are excluded from aggregates, paying now would mismatch on restore.
    if (memberData.delete_flag === true) {
      throw new Error('This member is deleted (in trash). Restore the member before adding payments.')
    }

    const currentPaidAmount   = memberData.paidAmount || 0
    const currentPendingAmount = memberData.pendingAmount || 0
    const additionalAmount    = parseFloat(paymentData.amount || 0)
    
    const newPaidAmount        = currentPaidAmount + additionalAmount
    const newPendingAmount     = Math.max(0, currentPendingAmount - additionalAmount)
    const newPaymentPercentage = memberData.joinFees > 0
      ? Math.round((newPaidAmount / memberData.joinFees) * 100)
      : 0
    const newPaymentStatus =
      newPaymentPercentage === 100 ? 'paid' :
      newPaymentPercentage > 0    ? 'partial' : 'pending'

    // ✅ Record transaction with single program info
    const txResult = await recordJoinFeeTransaction({
      memberId: memberId,
      displayName: memberData.displayName,
      registrationNumber: memberData.registrationNumber,
      fatherName: memberData.fatherName,
      aadhaarNo: memberData.aadhaarNo,
      phone: memberData.phone,
      agentId: memberData.agentId || '',
      createdBy: currentUser?.uid
    }, {
      transactionType: 'additional_payment',
      paidAmount: additionalAmount,
      previousBalance: currentPendingAmount,
      totalPendingAmount: newPendingAmount,
      paymentMode: paymentData.paymentMode,
      transactionId: paymentData.transactionId,
      transactionDate: paymentData.transactionDate,
      programId: memberData.programId || '',
      programName: memberData.programName || '',
      notes: paymentData.notes || 'Additional payment via edit'
    })
    
    // ✅ Update member document directly (no subcollection update needed)
    await updateDoc(memberRef, {
      paidAmount: newPaidAmount,
      pendingAmount: newPendingAmount,
      paymentPercentage: newPaymentPercentage,
      paymentStatus: newPaymentStatus,
      hasPendingPayments: newPendingAmount > 0,
      updated_at: serverTimestamp()
    })
    
    // Sync aggregated counters
    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch('/api/members/adjust-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          agentId: memberData.agentId || (currentUser?.uid && currentUser?.role === 'agent' ? currentUser.uid : null),
          programId: memberData.programId || '',
          paidDelta: additionalAmount,
          type: 'joinFees',
        }),
      });
    } catch (e) {
      console.warn('Failed to sync counters:', e);
    }

    // Credit agent commission for this additional join-fee payment
    // (same as payments made via the join-fees payment screen)
    if (memberData.agentId && additionalAmount > 0) {
      try {
        const token = await auth.currentUser?.getIdToken();
        await fetch('/api/commission', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            action: 'credit',
            agentId: memberData.agentId,
            amount: additionalAmount,
            source: 'joinFees',
            sourceId: memberId,
            memberName: memberData.displayName || '',
            memberFatherName: memberData.fatherName || '',
            memberRegNo: memberData.registrationNumber || '',
            programId: memberData.programId || '',
            programName: memberData.programName || '',
            paymentGroupId: txResult?.groupId || '',
          }),
        });
      } catch (e) {
        console.warn('Failed to credit commission for additional payment:', e);
      }
    }

    return {
      success: true,
      transactionId: txResult?.txId || txResult,
      newBalance: newPendingAmount,
      paymentPercentage: newPaymentPercentage
    }
    
  } catch (error) {
    console.error('Error adding additional payment:', error)
    throw error
  }
}

// Fetch member transaction history
export const fetchMemberTransactions = async (memberId) => {
  try {
    const q = query(
      collection(db, 'memberJoinFees'),
      where('memberId', '==', memberId)
    )
    
    const snapshot = await getDocs(q)
    const transactions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      date: doc.data().createdAt?.toDate?.() || new Date()
    }))
    
    return transactions.sort((a, b) => b.date - a.date)
  } catch (error) {
    console.error('Error fetching transactions:', error)
    return []
  }
}

// Calculate payment statistics
export const calculatePaymentStats = (memberData) => {
  const totalJoinFees     = memberData.joinFees || 0
  const paidAmount        = memberData.paidAmount || 0
  const pendingAmount     = memberData.pendingAmount || 0
  const paymentPercentage = memberData.paymentPercentage || 0
  
  return {
    totalJoinFees,
    paidAmount,
    pendingAmount,
    paymentPercentage,
    isFullyPaid:      paymentPercentage === 100,
    isPartiallyPaid:  paymentPercentage > 0 && paymentPercentage < 100,
    isUnpaid:         paymentPercentage === 0
  }
}

// Export member data with transactions
export const exportMemberData = async (memberId) => {
  try {
    const memberRef  = doc(db, 'members', memberId)
    const memberSnap = await getDoc(memberRef)
    
    if (!memberSnap.exists()) {
      throw new Error('Member not found')
    }
    
    const memberData    = memberSnap.data()
    const transactions  = await fetchMemberTransactions(memberId)
    
    return {
      member: memberData,
      transactions,
      // ✅ Program info comes from member document directly
      program: {
        programId:       memberData.programId,
        programName:     memberData.programName,
        ageGroupId:      memberData.ageGroupId,
        ageGroupName:    memberData.ageGroupName,
        periodStartDate: memberData.periodStartDate,
        periodEndDate:   memberData.periodEndDate,
        memberGroupId:   memberData.memberGroupId,
        memberGroupName: memberData.memberGroupName,
        paymentStatus:   memberData.paymentStatus,
        paidAmount:      memberData.paidAmount,
        pendingAmount:   memberData.pendingAmount,
        joinFees:        memberData.joinFees
      },
      summary: calculatePaymentStats(memberData)
    }
    
  } catch (error) {
    console.error('Error exporting member data:', error)
    throw error
  }
}

// Check Aadhaar duplicate
export const checkAadhaarDuplicate = async (aadhaarNumber) => {
  try {
    if (!aadhaarNumber || aadhaarNumber.length !== 12) {
      return null
    }

    const q = query(
      collection(db, 'members'),
      where('aadhaarNo', '==', aadhaarNumber),
      where('delete_flag', '!=', true)
    )
    
    const snapshot = await getDocs(q)
    
    if (snapshot.empty) {
      return null
    }
    
    const memberDoc  = snapshot.docs[0]
    const memberData = memberDoc.data()
    
    // ✅ Program info comes from member document directly (no subcollection fetch)
    return {
      memberId: memberDoc.id,
      ...memberData,
      // Expose program as a flat object for convenience
      program: {
        programId:    memberData.programId,
        programName:  memberData.programName,
        ageGroupId:   memberData.ageGroupId,
        ageGroupName: memberData.ageGroupName,
        paymentStatus: memberData.paymentStatus
      }
    }
    
  } catch (error) {
    console.error('Error checking Aadhaar duplicate:', error)
    throw error
  }
}