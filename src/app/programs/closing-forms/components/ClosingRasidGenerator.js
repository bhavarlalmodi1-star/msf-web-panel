"use client"
import { trustHtml } from '@/utils/trust/trustStore';
import React, { useState, useEffect, useCallback } from 'react'
import { Modal, Button, Alert, Space, Spin, message } from 'antd'
import { FileTextOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons'
import { collection, query, where, documentId, getDocs } from 'firebase/firestore'
import { db } from '../../../../../lib/firbase-client'
import dayjs from 'dayjs'

// ─── helpers ─────────────────────────────────────────────────────────────────
const chunkArr = (arr, n) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) =>
    arr.slice(i * n, i * n + n)
  )

const fmtDate = (d) => {
  if (!d) return '—'
  if (typeof d === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(d)) return d
  const t = d?.toDate ? d.toDate() : new Date(d)
  if (isNaN(t)) return '—'
  return dayjs(t).format('DD-MM-YYYY')
}

const HINDI_MONTHS = ['जनवरी','फरवरी','मार्च','अप्रैल','मई','जून',
                      'जुलाई','अगस्त','सितंबर','अक्टूबर','नवंबर','दिसंबर']

// Secure print window that cannot be blocked by strict popup policies
function openPrintWindow(html) {
  const win = window.open('', '_blank')
  if (!win) { message.error('Popup blocked! Please allow popups.'); return }
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
}

// A function (not a constant) so the watermark always uses the current trust logo
const getRasidCss = () => `
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Noto Sans Devanagari',sans-serif;background:#b0b0b0;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .print-bar{position:sticky;top:0;z-index:100;padding:12px 24px;background:${trustHtml().pdfColorPrimary};display:flex;gap:12px;align-items:center}
  .btn-print{background:${trustHtml().pdfColorAccent};color:#fff;border:none;padding:10px 28px;border-radius:6px;cursor:pointer;font-weight:700;font-size:14px;font-family:inherit}
  .btn-close{background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);padding:10px 20px;border-radius:6px;cursor:pointer;font-size:14px;font-family:inherit}
  /* Declare the paper. Without an @page rule the printer applies its own
     default margin (~10mm a side), so a .page that is exactly 210x297mm no
     longer fits the printable area — it spilled onto a second sheet and left
     the first half empty. @page now owns the paper and the margin, and in
     print the sheet simply fills that box (see the @media print block). */
  @page{size:A4 portrait;margin:8mm}
  .page{width:210mm;min-height:297mm;background:#fff;margin:18px auto;padding:5mm 8mm;box-shadow:0 6px 28px rgba(0,0,0,.25);position:relative}
  .page::before{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:60%;height:60%;background:url('${trustHtml().logoSrc}') center/contain no-repeat;opacity:.04;pointer-events:none;z-index:0}
  .page>*{position:relative;z-index:1}
  .bless{display:flex;justify-content:space-between;font-size:10px;color:#8a6d3b;margin-bottom:6px;font-weight:600}
  .hdr{display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:2.5px solid ${trustHtml().pdfColorAccent};padding-bottom:8px;margin-bottom:4px}
  .logo-box{width:70px;display:flex;flex-direction:column;align-items:center}
  .logo{width:62px;height:62px;object-fit:contain}
  .logo-fb{font-size:9px;font-weight:700;color:${trustHtml().pdfColorPrimary};text-align:center;line-height:1.1}
  .center-block{text-align:center;flex:1}
  .org-title{font-size:17px;font-weight:800;color:${trustHtml().pdfColorPrimary}}
  .org-sub{font-size:12px;font-weight:600;color:#333}
  .org-addr{font-size:10px;color:#444;margin-top:2px;line-height:1.4}
  .org-contact{font-size:10px;color:#444}
  .blue{color:#0066cc;font-weight:600}
  .since-bar{display:flex;justify-content:center;gap:24px;font-size:10px;font-weight:600;color:${trustHtml().pdfColorPrimary};margin:6px 0}
  .badge-wrap{display:flex;justify-content:center;margin:8px 0}
  .badge{background:${trustHtml().pdfColorAccent};color:#fff;padding:6px 26px;border-radius:6px;font-size:14px;font-weight:800;letter-spacing:.5px}
  .info-row{display:flex;gap:8px;flex-wrap:wrap;font-size:12px;margin-bottom:6px}
  .info-item{display:flex;align-items:baseline;min-width:250px;flex:1}
  .lbl{font-weight:600;color:${trustHtml().pdfColorPrimary}}
  .sep{color:#666}
  .val{font-weight:600;color:#111}
  .val-amt{color:${trustHtml().pdfColorAccent};font-weight:800}
  table{width:100%;border-collapse:collapse;border:1.5px solid #999;margin-top:6px}
  th{padding:6px 4px;font-size:11px;font-weight:700;color:${trustHtml().pdfColorPrimary};text-align:center;border:1px solid #999;background:#f0f0f0}
  td{padding:5px 4px;font-size:11px;color:#111;border:.8px solid #c0c8d4}
  td.c{text-align:center} td.l{text-align:left;padding-left:6px}
  tr:nth-child(even){background:#fafafa}
  .total-row td{font-weight:700;background:#fff3f0;font-size:12px}
  .footer{text-align:center;margin-top:12px;padding-top:6px;border-top:1.5px solid ${trustHtml().pdfColorAccent};font-size:10px;color:#666}
  @media print{
    html,body{background:#fff;margin:0;padding:0}
    .print-bar{display:none!important}
    /* Fill the @page box rather than carrying an mm size of our own. */
    .page{width:auto;min-height:0;height:auto;margin:0;padding:0;box-shadow:none;
          page-break-after:always;break-after:page}
    .page:last-child{page-break-after:auto;break-after:auto}
    .page::before{display:none}          /* absolute watermark can spawn a blank sheet */
    thead{display:table-header-group}    /* repeat column headings across pages */
    tr{page-break-inside:avoid;break-inside:avoid}
    .total-row{page-break-inside:avoid}
  }
`

// Org header block shared by all pages
const orgHeader = () => `
  <div class="bless">
    ${trustHtml().blessingsHtml}
  </div>
  <div class="hdr">
    <div class="logo-box">
      <img src="${trustHtml().logoSrc}" class="logo" onerror="this.style.display='none';this.nextSibling.style.display='flex'" alt="">
      <div class="logo-fb">${trustHtml().logoFallbackHtml}</div>
    </div>
    <div class="center-block">
      <div class="org-title">${trustHtml().name}</div>
      <div class="org-sub">${trustHtml().cityLine}</div>
      <div class="org-addr">
        <b>हेड ऑफिस :</b> ${trustHtml().addressWithOffice}
      </div>
      <div class="org-contact"><b>संपर्क सूत्र :</b><span class="blue"> ${trustHtml().presidentName}</span></div>
      <div class="org-contact"><span class="blue">${trustHtml().presidentPhone}</span>&nbsp;&nbsp;<b>ऑफिस :</b><span class="blue"> ${trustHtml().officePhone}</span></div>
    </div>
    <div class="logo-box">
      <img src="${trustHtml().rightImageSrc}" class="logo" onerror="this.style.display='none';this.nextSibling.style.display='flex'" alt="">
      <div class="logo-fb logo-fb2">शनि<br>देव</div>
    </div>
  </div>
  <div class="since-bar"><span>${trustHtml().sinceText}</span><span>${trustHtml().regText}</span></div>
`

const ClosingRasidGenerator = ({ open, onClose, group, programList }) => {
  const [members, setMembers]     = useState([])
  const [loading, setLoading]     = useState(false)

  const yojanaName = (() => {
    const p = (programList || []).find(x => x.id === group?.programId)
    return p?.hindiName || p?.name || ''
  })()

  // ── Fetch member snapshots for the group's closedMemberIds ────────────────
  const fetchGroupMembers = useCallback(async () => {
    const ids = group?.closedMemberIds || []
    if (!ids.length) { setMembers([]); return }
    setLoading(true)
    try {
      const all = []
      const snaps = await Promise.all(
        chunkArr(ids, 10).map(chunk =>
          getDocs(query(collection(db, 'members'), where(documentId(), 'in', chunk)))
        )
      )
      snaps.forEach(snap => snap.forEach(d => {
        if (d.exists) all.push({ id: d.id, ...d.data() })
      }))
      setMembers(all)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [group])

  // ── Per-closed-member collection amount ───────────────────────────────────
  // group.totalAmount is the sum of what every PAYING member owes for the whole
  // group. Dividing it by the number of CLOSED members (as this screen used to)
  // produces one average that is identical for everyone — which is why three
  // members closed on three different dates all printed the same figure.
  //
  // The real per-person amount has to be attributed event by event: each payer's
  // closing_payment doc lists, in closingDetails, exactly which closings it is
  // paying for. Summing that payer's payAmount against each closed member gives
  // what is collected on account of that person. Members closed on a later date
  // have a different (usually larger) set of eligible payers, so their totals
  // legitimately differ.
  const [amountByClosedMember, setAmountByClosedMember] = useState({})

  const fetchPerMemberAmounts = useCallback(async () => {
    if (!group?.id) { setAmountByClosedMember({}); return }
    try {
      const snap = await getDocs(
        query(collection(db, 'closing_payment'), where('closingGroupId', '==', group.id))
      )
      const tally = {}
      snap.forEach(d => {
        const cp = d.data()
        if (cp.isReversed === true) return
        const pay = Number(cp.payAmount || 0)
        if (pay <= 0) return
        const seen = new Set()
        ;(cp.closingDetails || []).forEach(ev => {
          const cid = ev?.closed_memberId
          if (!cid) return
          // One payer can only pay once per closing — guards against the
          // duplicate closingDetails entries arrayUnion can leave behind.
          if (seen.has(cid)) return
          seen.add(cid)
          if (!tally[cid]) tally[cid] = { amount: 0, payers: 0 }
          tally[cid].amount += pay
          tally[cid].payers += 1
        })
      })
      setAmountByClosedMember(tally)
    } catch (e) {
      console.error('per-member closing amounts failed:', e)
      setAmountByClosedMember({})
    }
  }, [group])

  useEffect(() => {
    if (open) { fetchGroupMembers(); fetchPerMemberAmounts() }
  }, [open, fetchGroupMembers, fetchPerMemberAmounts])

  // ── Resolve each member's closed_date from their closedStatus for THIS group
  const memberRows = members.map(m => {
    const entry = (m.closedStatus || []).find(
      cs => cs.closingGroupId === group?.id && cs.programId === group?.programId
    )
    const tally = amountByClosedMember[m.id]
    return {
      ...m,
      closedDate: fmtDate(entry?.closed_date || m.closed_date || m.marriageDate),
      dueDate:    fmtDate(entry?.closed_date || m.closed_date || m.marriageDate), // due date = closed date
      // Collected on account of THIS person. Falls back to 0 rather than an
      // average, so a missing figure is visibly missing instead of quietly
      // looking plausible.
      ownAmount:  Number(tally?.amount || 0),
      payerCount: Number(tally?.payers || 0),
    }
  })

  const memberCount = group?.memberCount || group?.closedMemberIds?.length || memberRows.length || 1
  const totalAmount = Number(group?.totalAmount || 0)
  // Sum of the attributed per-person figures. Should equal group.totalAmount;
  // when it doesn't, the group's rollup has drifted (Settings → Closing System
  // Check reports exactly that), and the attributed sum is the trustworthy one.
  const attributedTotal = memberRows.reduce((s, m) => s + m.ownAmount, 0)
  const groupName = group?.groupName || `Group ${group?.id?.slice?.(0, 8) || ''}`
  const dateStr = dayjs().format('DD/MM/YYYY')

  const noteLine = `${HINDI_MONTHS[dayjs().month()]}-${dayjs().format('YYYY')} सहयोग राशि ( "यह सहयोग राशि स्वैच्छिक है एवं गैर-वापसीयोग्य है।" )`

  // ── Build full-group rasid HTML ─────────────────────────────────────────────
  const buildGroupHtml = () => {
    const rows = (memberRows.length ? memberRows : []).filter(Boolean).map((m, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td class="c">${m.registrationNumber || '—'}</td>
        <td class="l">[${m.displayName || ''}${m.fatherName ? ' / ' + m.fatherName : ''}]</td>
        <td class="c">${m.caste || m.casteName || '—'}</td>
        <td class="l">${m.village || '—'}</td>
        <td class="c">${m.phone || '—'}</td>
        <td class="c">${m.closedDate}</td>
        <td class="c">${m.dueDate}</td>
        <td class="c">₹${m.ownAmount.toLocaleString()}<div style="font-size:8px;color:#888">${m.payerCount} सदस्य</div></td>
      </tr>`).join('') || '<tr><td colspan="9" class="c">No members</td></tr>'

    return `<!DOCTYPE html><html lang="hi"><head>
      <meta charset="utf-8"><title>क्लोजिंग ग्रुप रसीद</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>${getRasidCss()}</style>
    </head><body>
      <div class="print-bar">
        <button class="btn-print" onclick="window.print()">🖨 Print / Save PDF</button>
        <button class="btn-close" onclick="window.close()">✕ Close</button>
        <span class="print-info">📄 ${memberRows.length} members | Total: ₹${attributedTotal.toLocaleString()}</span>
      </div>
      <div class="page">
        ${orgHeader()}
        <div class="badge-wrap"><div class="badge">क्लोजिंग ग्रुप रसीद</div></div>
        <div class="info-row">
          <div class="info-item"><span class="lbl">ग्रुप</span><span class="sep"> : </span><span class="val">${groupName}</span></div>
          <div class="info-item right"><span class="lbl">दिनांक</span><span class="sep"> : </span><span class="val">${dateStr}</span></div>
        </div>
        <div class="info-row">
          <div class="info-item"><span class="lbl">योजना</span><span class="sep"> : </span><span class="val">${yojanaName || '—'}</span></div>
          <div class="info-item right"><span class="lbl">कुल सदस्य</span><span class="sep"> : </span><span class="val">${memberCount}</span></div>
          <div class="info-item right"><span class="lbl">कुल राशि</span><span class="sep"> : </span><span class="val val-amt">₹${attributedTotal.toLocaleString()}</span></div>
        </div>
        <table>
          <thead><tr>
            <th style="width:30px">#</th>
            <th style="width:80px">रजि. नं.</th>
            <th>नाम / पिता</th>
            <th style="width:70px">जाति</th>
            <th style="width:90px">गाँव</th>
            <th style="width:90px">फोन</th>
            <th style="width:80px">क्लोजिंग डेट</th>
            <th style="width:80px">ड्यू डेट</th>
            <th style="width:80px">सहयोग राशि</th>
          </tr></thead>
          <tbody>${rows}
            <tr class="total-row">
              <td colspan="5" class="l">कुल योग (${memberCount} सदस्य)</td>
              <td class="c">—</td><td class="c">—</td><td class="c">—</td>
              <td class="c">₹${attributedTotal.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
        <div class="info-row" style="margin-top:8px"><span class="lbl">नोट</span><span class="sep"> : </span><span class="val">${noteLine}</span></div>
        <div class="footer">Generated on ${dayjs().format('DD MMM YYYY hh:mm A')} — ${trustHtml().shortName}</div>
      </div>
    </body></html>`
  }

  // ── Build member-wise rasid HTML (one page per member) ─────────────────────
  const buildMemberHtml = () => {
    if (!memberRows.length) return ''
    const ROWS = 20
    const pages = memberRows.map((m, idx) => {
      // Plain running number, matching the group table's # column on the
      // first page — a member is row 3 there and क्र. सं. 3 on their slip.
      const serial = idx + 1
      return `
        <div class="page">
          ${orgHeader()}
          <div class="badge-wrap"><div class="badge">सहयोग राशि रसीद</div></div>
          <div class="info-row">
            <div class="info-item"><span class="lbl">क्र. सं.</span><span class="sep"> : </span><span class="val">${serial}</span></div>
            <div class="info-item right"><span class="lbl">दिनांक</span><span class="sep"> : </span><span class="val">${dateStr}</span></div>
          </div>
          <div class="info-row">
            <div class="info-item"><span class="lbl">नाम</span><span class="sep"> : </span><span class="val">${m.displayName || ''}</span></div>
            <div class="info-item right"><span class="lbl">फोन नं.</span><span class="sep"> : </span><span class="val">${m.phone || '—'}</span></div>
          </div>
          <div class="info-row">
            <div class="info-item"><span class="lbl">पिता का नाम</span><span class="sep"> : </span><span class="val">${m.fatherName || '—'}</span></div>
            <div class="info-item right"><span class="lbl">रजि. नं.</span><span class="sep"> : </span><span class="val">${m.registrationNumber || '—'}</span></div>
          </div>
          <div class="info-row">
            <div class="info-item"><span class="lbl">जाति</span><span class="sep"> : </span><span class="val">${m.caste || m.casteName || '—'}</span></div>
            <div class="info-item right"><span class="lbl">गाँव</span><span class="sep"> : </span><span class="val">${m.village || '—'}</span></div>
          </div>
          <div class="info-row">
            <div class="info-item"><span class="lbl">योजना</span><span class="sep"> : </span><span class="val">${yojanaName || '—'}</span>&nbsp;&nbsp;<span class="lbl">ग्रुप</span><span class="sep"> : </span><span class="val">${groupName}</span></div>
            <div class="info-item right"><span class="lbl">क्लोजिंग डेट</span><span class="sep"> : </span><span class="val">${m.closedDate}</span></div>
          </div>
          <div class="info-row">
            <div class="info-item"><span class="lbl">ड्यू डेट</span><span class="sep"> : </span><span class="val">${m.dueDate}</span></div>
            <div class="info-item right"><span class="lbl">सहयोग राशि</span><span class="sep"> : </span><span class="val val-amt">₹${m.ownAmount.toLocaleString()}</span></div>
          </div>
          <div class="info-row"><span class="lbl">नोट</span><span class="sep"> : </span><span class="val">${noteLine}</span></div>
          <div class="footer">
            पूर्ण क्लोजिंग सदस्य सूची : नाम, फोन, पिता, जाति, गाँव, रजि. नं.<br>
            Generated on ${dayjs().format('DD MMM YYYY hh:mm A')} — ${trustHtml().shortName}
          </div>
        </div>`
    }).join('')

    return `<!DOCTYPE html><html lang="hi"><head>
      <meta charset="utf-8"><title>सहयोग राशि रसीद</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>${getRasidCss()}</style>
    </head><body>
      <div class="print-bar">
        <button class="btn-print" onclick="window.print()">🖨 Print / Save PDF</button>
        <button class="btn-close" onclick="window.close()">✕ Close</button>
        <span class="print-info">📄 ${memberRows.length} member rasids</span>
      </div>
      ${pages}
    </body></html>`
  }

  const handleGroupRasid = () => {
    if (!memberRows.length) return message.warning('No closed members in this group')
    openPrintWindow(buildGroupHtml())
  }

  const handleMemberRasid = () => {
    if (!memberRows.length) return message.warning('No closed members in this group')
    openPrintWindow(buildMemberHtml())
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={<Space><FileTextOutlined style={{ color: '#D3292F' }} />Closing Rasid — {groupName}</Space>}
      footer={null}
      width={520}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 30 }}><Spin /></div>
      ) : (
        <>
          <Alert
            type="info" showIcon style={{ marginBottom: 16 }}
            message={`${memberCount} members closed · Total ₹${totalAmount.toLocaleString()}`}
            description={
              attributedTotal !== totalAmount && totalAmount > 0
                ? `Amounts are attributed per closed member from the actual payer records (₹${attributedTotal.toLocaleString()}). The group's stored total says ₹${totalAmount.toLocaleString()} — run Settings → Closing System Check. Due date = closing date.`
                : `Each member's amount is what is collected on account of their own closing, so members closed on different dates differ. Due date = closing date.`
            }
          />
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Button block size="large" icon={<TeamOutlined />} style={{ height: 48 }}
              onClick={handleGroupRasid} disabled={!memberRows.length}>
              Print Full Group Rasid ({memberRows.length} members)
            </Button>
            <Button block size="large" icon={<UserOutlined />} style={{ height: 48 }}
              onClick={handleMemberRasid} disabled={!memberRows.length}>
              Print Member-wise Rasid ({memberRows.length} rasids)
            </Button>
          </Space>
        </>
      )}
    </Modal>
  )
}

export default ClosingRasidGenerator