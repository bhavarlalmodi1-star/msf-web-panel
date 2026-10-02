"use client";
import { panelTheme } from '@/utils/trust/trustStore';
import { trustHtml, getTrust } from '@/utils/trust/trustStore';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Drawer, Spin, Empty, Typography, Input, Checkbox, Button,
  Tag, Avatar, Badge, DatePicker, message, Space, Divider, Alert,
  Select, Segmented
} from 'antd';
import {
  SearchOutlined, UserOutlined, CalendarOutlined, TeamOutlined,
  FilePdfOutlined, FileTextOutlined, ReloadOutlined, InfoCircleOutlined,
  CheckCircleOutlined, RightOutlined, LeftOutlined,
  ArrowRightOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import { collection, query, orderBy, getDocs, where, documentId } from 'firebase/firestore';
import { db } from '../../../../../../lib/firbase-client';
import { fetchMembersByAgent } from '@/app/members/components/firebase-helpers';
// Old system's application number. The field name varies across the migrated
// data, so use the shared resolver instead of guessing one key here.
import { getOldRegNo } from '@/app/members/components/MemberPdf/MemberListPdf';
import dayjs from 'dayjs';

const { Text, Title } = Typography;

const C = {
  // receipt colours — Settings → Trust Details → Colours
  get red()  { return getTrust().pdfColorAccent; },
  get blue() { return getTrust().pdfColorPrimary; },
  get pink() { return panelTheme().primary; },
  orange: '#ea580c',
  green:  '#16a34a',
  amber:  '#f59e0b',
  get bg() { return panelTheme().background; },
  get border() { return panelTheme().border; },
  surf:   '#ffffff',
  fg:     '#3e1f1a',
  muted:  '#9ca3af',
};

// ─── Hindi number words ───────────────────────────────────────────────────────
const W1 = ['','एक','दो','तीन','चार','पाँच','छः','सात','आठ','नौ','दस','ग्यारह',
  'बारह','तेरह','चौदह','पंद्रह','सोलह','सत्रह','अठारह','उन्नीस'];
const W10 = ['','','बीस','तीस','चालीस','पचास','साठ','सत्तर','अस्सी','नब्बे'];
function toWords(n) {
  if (!n || n <= 0) return 'शून्य रुपये मात्र';
  let s = '';
  if (n >= 100000) { s += toWords(Math.floor(n/100000)).replace(' रुपये मात्र','') + ' लाख '; n %= 100000; }
  if (n >= 1000)   { s += toWords(Math.floor(n/1000)).replace(' रुपये मात्र','') + ' हजार '; n %= 1000; }
  if (n >= 100)    { s += toWords(Math.floor(n/100)).replace(' रुपये मात्र','') + ' सौ '; n %= 100; }
  if (n > 0) s += n < 20 ? W1[n] : W10[Math.floor(n/10)] + (n%10 ? ' '+W1[n%10] : '');
  return s.trim() + ' रुपये मात्र';
}

// ─── Closing date formatting ──────────────────────────────────────────────────
// Mirrors ClosingRasidPdf.fmtDate — a closing date may be a Firestore Timestamp,
// an ISO string ("…T18:30:00Z", written from a local midnight) or an already
// formatted "DD-MM-YYYY" string. The DD branch is rebuilt by hand because
// dayjs(s, 'DD-MM-YYYY') swaps day/month without the customParseFormat plugin.
const fmtDate = (d) => {
  if (!d) return '';

  if (d?.toDate) {
    const t = dayjs(d.toDate());
    return t.isValid() ? t.format('DD-MM-YYYY') : '';
  }

  if (typeof d === 'string') {
    const s = d.trim();
    if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) {
      const [da, mo, y] = s.split('-').map(Number);
      if (da >= 1 && da <= 31 && mo >= 1 && mo <= 12 && y > 0) {
        return (
          String(da).padStart(2, '0') +
          '-' + String(mo).padStart(2, '0') +
          '-' + y
        );
      }
      return s;
    }
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})T/);
    if (iso) {
      const [, y, mo, da] = iso;
      const local = dayjs(`${y}-${mo}-${da}`);
      const hour = Number(s.slice(11, 13));
      return hour >= 18
        ? local.add(1, 'day').format('DD-MM-YYYY')
        : local.format('DD-MM-YYYY');
    }
  }

  const parsed = dayjs(d);
  return parsed.isValid() ? parsed.format('DD-MM-YYYY') : String(d);
};

// ─── Raw HTML print window ────────────────────────────────────────────────────
function openHtmlWindow(html) {
  const win = window.open('', '_blank');
  if (!win) { message.error('Popup blocked! Please allow popups.'); return; }
  win.document.write(html);
  win.document.close();
}

// ─── PDF print window ─────────────────────────────────────────────────────────
function openPrintWindow(rasidList) {
  const win = window.open('', '_blank');
  if (!win) { message.error('Popup blocked! Please allow popups.'); return; }
  // Padded row count. Rows are a fixed 30px (see .main-table td), so
  // 20 rows + header ≈ 640px, which fills the space left on an A4 page below
  // the header block without overflowing it — the same 20 rows as the printed
  // receipt. Raising the row height or font means lowering this.
  const ROWS = 20;

  // Split each receipt's members across as many pages as needed. Without this a
  // closing with more than ROWS members produced one over-long table whose extra
  // rows were simply clipped and lost.
  const pageData = rasidList.flatMap(d => {
    const list = d.entries || [];
    const chunkCount = Math.max(1, Math.ceil(list.length / ROWS));
    return Array.from({ length: chunkCount }, (_, i) => ({
      d,
      chunk: list.slice(i * ROWS, (i + 1) * ROWS),
      startIndex: i * ROWS,
      pageNo: i + 1,
      pageTotal: chunkCount,
    }));
  });

  const pages = pageData.map(({ d, chunk, startIndex, pageNo, pageTotal }) => {
    const filled = [...chunk, ...Array(Math.max(0, ROWS - chunk.length)).fill(null)];
    // No गाँव column — the village is appended to the name, matching the
    // printed receipt where a row reads "नाम / पिता  गाँव - तहसील".
    const rows = filled.map((e, i) => `
      <tr>
        <td class="c">${e ? startIndex + i + 1 : ''}</td>
        <td class="c">${e ? e.code : ''}${e && e.oldCode ? `<div class="oldreg">${e.oldCode}</div>` : ''}</td>
        <td class="l">${e ? [e.name, e.village].filter(Boolean).join('&nbsp;&nbsp;') : ''}</td>
        <td class="c">${e ? e.date : ''}</td>
        <td class="c">${e ? e.mobile : ''}</td>
      </tr>`).join('');

    return `
    <div class="page">

      <!-- blessings -->
      <div class="bless">
        ${trustHtml().blessingsHtml}
      </div>

      <!-- org header -->
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
          <div class="org-contact">
            <b>संपर्क सूत्र :</b>
            <span class="blue">${trustHtml().presidentName}</span>
          </div>
          <div class="org-contact">
            <span class="blue">${trustHtml().presidentPhone}</span>
            &nbsp;&nbsp;
            <b>ऑफिस :</b>
            <span class="blue"> ${trustHtml().officePhone}</span>
          </div>
        </div>
        <div class="logo-box">
          <img src="${trustHtml().rightImageSrc}" class="logo" onerror="this.style.display='none';this.nextSibling.style.display='flex'" alt="">
          <div class="logo-fb logo-fb2">शनि<br>देव</div>
        </div>
      </div>

      <!-- since / reg bar -->
      <div class="since-bar">
        <span>${trustHtml().sinceText}</span>
        <span>${trustHtml().regText}</span>
      </div>

      <!-- badge -->
      <div class="badge-wrap">
        <div class="badge">सहयोग राशि रसीद</div>
      </div>

      <!-- info rows -->
      <div class="info-row">
        <div class="info-item">
          <span class="lbl">क्र. सं.</span>
          <span class="sep"> : </span>
          <span class="val">${d.serialNo}</span>
        </div>
        <div class="info-item right">
          <span class="lbl">दिनांक</span>
          <span class="sep"> : </span>
          <span class="val">${d.date}</span>
        </div>
      </div>

      <div class="info-row">
        <div class="info-item">
          <span class="lbl">नाम</span>
          <span class="sep"> : </span>
          <span class="val">${d.name}</span>
        </div>
        <div class="info-item right">
          <span class="lbl">फोन नं.</span>
          <span class="sep"> : </span>
          <span class="val">${d.phone}</span>
        </div>
      </div>

      <div class="info-row">
        <div class="info-item">
          <span class="lbl">रजि. नं.</span>
          <span class="sep"> : </span>
          <span class="val">${d.regNo || '—'}</span>
          ${d.oldRegNo ? `&nbsp;&nbsp;<span class="lbl">पुराना नं.</span><span class="sep"> : </span><span class="val">${d.oldRegNo}</span>` : ''}
        </div>
      </div>

      <div class="info-row">
        <div class="info-item" style="flex:1">
          <span class="lbl">पता</span>
          <span class="sep"> : </span>
          <span class="val">${d.address || '—'}</span>
        </div>
      </div>

      <div class="info-row">
        <div class="info-item">
          <span class="lbl">योजना</span>
          <span class="sep"> : </span>
          <span class="val">${d.yojana}</span>
          &nbsp;&nbsp;
          <span class="lbl">Group</span>
          <span class="sep"> : </span>
          <span class="val">${d.ageGroup || '—'}</span>
        </div>
        <div class="info-item right">
          <span class="lbl">सहयोग राशि</span>
          <span class="sep"> : </span>
          <span class="val val-amt">${d.sahyogRashi.toLocaleString()}</span>
        </div>
      </div>

      <!-- table -->
      <div class="table-wrap">
        <table class="main-table">
          <thead>
            <tr>
              <th style="width:34px">#</th>
              <th style="width:118px">कोड</th>
              <th style="min-width:180px">नाम / पिता</th>
              <th style="width:96px">दिनांक</th>
              <th style="width:92px">मोबाइल न.</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <!-- total -->
      <div class="total-row">
        <span class="total-lbl">कुल राशि रु.:</span>
        <span class="total-amt">${d.totalAmount.toLocaleString()}</span>
        <span class="total-words-lbl">शब्दों में रूपये :</span>
        <span class="total-words">${d.totalInWords}</span>
      </div>

      <!-- worker + signature -->
      <div class="worker-row">
        <div class="worker">
          <span class="lbl">कार्यकर्ता</span>
          <span class="sep"> : </span>
          <span class="worker-val">${d.worker || '—'}</span>
        </div>
        <div class="sign-lbl">संस्थापक हस्ताक्षर</div>
      </div>

      <!-- note -->
      <div class="note">Note : ${d.note}</div>

      <!-- footer -->
      <div class="footer">
        <div class="footer-spacer"></div>
        <div class="footer-center">
          <div class="footer-contacts">
            संपर्क सूत्र : ${trustHtml().contactNumbers}
          </div>
          <div class="footer-sub">${trustHtml().jurisdiction}</div>
        </div>
        <div class="footer-eoe">E. &amp; O.E.</div>
      </div>

    </div>`;
  }).join('');

win.document.write(`<!DOCTYPE html><html lang="hi"><head>
  <meta charset="utf-8">
  <title>सहयोग राशि रसीद — ${dayjs().format('DD MMM YYYY')}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&family=Noto+Serif+Devanagari:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Noto Sans Devanagari',sans-serif;background:#b0b0b0;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}

    /* ── print bar ── */
    .print-bar{position:sticky;top:0;z-index:100;padding:12px 24px;background:${trustHtml().pdfColorPrimary};display:flex;gap:12px;align-items:center}
    .btn-print{background:${trustHtml().pdfColorAccent};color:#fff;border:none;padding:10px 28px;border-radius:6px;cursor:pointer;font-weight:700;font-size:14px;font-family:inherit;letter-spacing:.5px}
    .btn-close{background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);padding:10px 20px;border-radius:6px;cursor:pointer;font-size:14px;font-family:inherit}
    .print-info{font-size:13px;color:rgba(255,255,255,.8);margin-left:10px}

    /* ── A4 page ── */
    /* @page declares the paper and its margin. Without it the printer supplies
       its own (~10mm a side), and a .page fixed at 210x297mm then exceeds the
       printable area — each receipt spilled onto a second sheet with the first
       left half empty. */
    @page{size:A4 portrait;margin:6mm}
    .page{
      width:210mm;height:297mm;
      background:#fff;
      margin:18px auto;
      padding:1mm 5mm;
      display:flex;flex-direction:column;
      box-shadow:0 6px 28px rgba(0,0,0,.25);
      position:relative;overflow:hidden;
      page-break-after:always;page-break-inside:avoid;
    }

    /* watermark */
    .page::before{
      content:'';position:absolute;top:50%;left:20%;
      transform:translateY(-50%);
      width:60%;height:60%;
      background:url('${trustHtml().logoSrc}') center/contain no-repeat;
      opacity:.06;pointer-events:none;z-index:0
    }
    .page>*{position:relative;z-index:1}

    /* ── blessings ── */
    .bless{
      display:flex;justify-content:space-between;align-items:center;
      margin-bottom:2px;padding:2px 8px;
    }
    .bless span{font-size:10.5px;color:${trustHtml().pdfColorAccent};font-weight:700;font-family:'Noto Serif Devanagari',serif;letter-spacing:.3px}

    /* ── header ── */
    .hdr{
      display:flex;align-items:center;justify-content:space-between;
      gap:12px;
    }
    .logo-box{width:78px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
    .logo{width:74px;height:74px;border-radius:6px;object-fit:contain;}
    .logo-fb{
      width:70px;height:65px;border-radius:6px;
      background:linear-gradient(135deg,#E8EFF7,#d0dcec);
      border:2px solid #b5c5d8;
      display:none;align-items:center;justify-content:center;
      font-size:11px;color:${trustHtml().pdfColorPrimary};font-weight:700;text-align:center;line-height:1.4;
      font-family:'Noto Serif Devanagari',serif;
    }
    .logo-fb2{background:linear-gradient(135deg,#f5ece0,#ede0cc)!important;border-color:#c9a87a!important;color:#7a4a1e!important}
    .center-block{flex:1;text-align:center;padding:0 8px;display:flex;flex-direction:column;align-items:center;justify-content:center}
    .org-title{font-size:23px;font-weight:700;color:${trustHtml().pdfColorPrimary};font-family:'Noto Serif Devanagari',serif;letter-spacing:.3px;margin-bottom:0;line-height:1.25}
    .org-sub{font-size:15px;font-weight:700;color:${trustHtml().pdfColorPrimary};margin-bottom:2px;text-align:center}
    .org-addr{font-size:10px;color:#000;line-height:1.45;margin-bottom:1px;text-align:center}
    .org-contact{font-size:10px;color:#000;line-height:1.45;text-align:center}
    .org-contact .blue{color:${trustHtml().pdfColorPrimary};font-weight:700}
    .org-contact b{color:#000;font-weight:700}

    /* ── since bar ── */
    .since-bar{
      display:flex;justify-content:space-between;align-items:center;
      border-bottom:1.5px solid ${trustHtml().pdfColorPrimary};
      padding:3px 2px;margin-bottom:2px;
    }
    .since-bar span{font-size:11px;font-weight:700;color:${trustHtml().pdfColorPrimary};letter-spacing:.6px}

    /* ── badge ── */
    .badge-wrap{text-align:center;margin:6px 0 8px}
    .badge{
      display:inline-block;border:1.5px solid ${trustHtml().pdfColorAccent};border-radius:5px;
      padding:3px 22px;
      font-size:13px;font-weight:700;color:${trustHtml().pdfColorAccent};
      font-family:'Noto Serif Devanagari',serif;letter-spacing:.5px;
    }

    /* ── info rows ── */
    .info-row{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px}
    .info-row:last-of-type{margin-bottom:0}
    .info-item{display:flex;align-items:baseline;gap:4px;flex:1}
    .info-item.right{justify-content:flex-end;text-align:right}
    .lbl{font-size:14px;font-weight:700;color:${trustHtml().pdfColorAccent};white-space:nowrap}
    .sep{font-size:14px;color:${trustHtml().pdfColorAccent};font-weight:700}
    .val{font-size:14px;color:#111;font-weight:500}
    .val-amt{font-size:14px;color:#111;font-weight:700}

    /* ── table ── */
    /* overflow:hidden is a safety net — if the table ever exceeds the space
       left on the page it gets clipped rather than painting over the total,
       कार्यकर्ता and note rows below it. */
    .table-wrap{flex:1;display:flex;flex-direction:column;min-height:0;margin-top:8px;overflow:hidden}
    /* No height:100% — that stretched the rows to fill the page, so a receipt
       with only 2 members produced enormous rows. Rows are a fixed compact
       height instead, exactly like the printed receipt. */
    .main-table{
      width:100%;border-collapse:collapse;
      border:1.5px solid #999;
      table-layout:fixed;
    }
    .main-table thead tr{background:#ffffff26}
    .main-table th{
      padding:5px 4px;font-size:14px;font-weight:700;color:${trustHtml().pdfColorPrimary};
      text-align:center;border:1px solid #999;letter-spacing:.3px;
      font-family:'Noto Serif Devanagari',serif;
    }
    .main-table td{
      height:29px;padding:2px 4px;font-size:13px;color:#111;
      border:0.8px solid #c0c8d4;vertical-align:middle;
      overflow:hidden;white-space:nowrap;
    }
    /* Codes must never be cut — the receipt is a legal record of who paid */
    .main-table td.c:nth-child(2){font-size:12.5px;letter-spacing:-.2px}
    .main-table tbody tr:nth-child(odd){background:#ffffff26}
    .main-table tbody tr:nth-child(even){background:#fff8f533}
    td.c{text-align:center}
    td.l{text-align:left;padding-left:8px}

    /* ── total ── */
    /* Total sits directly under the table on one line, no tinted band —
       matches the printed receipt. */
    .total-row{
      display:flex;align-items:baseline;flex-wrap:wrap;
      margin:5px 0 1px;padding:0 2px;
    }
    .total-lbl{font-size:15px;font-weight:700;color:#111;margin-right:12px}
    .total-amt{font-size:15px;font-weight:700;color:#111;margin-right:30px}
    .total-words-lbl{font-size:14px;font-weight:700;color:#111}
    .total-words{font-size:14px;color:#111;font-weight:400;margin-left:8px}

    /* ── worker + signature ── */
    .worker-row{
      display:flex;justify-content:space-between;align-items:baseline;
      margin:1px 0;padding:0 2px;
    }
    .worker .lbl{font-size:14px}
    .worker .sep{font-size:14px}
    .worker-val{font-size:14px;color:${trustHtml().pdfColorPrimary};font-weight:500}
    .sign-lbl{font-size:13px;font-weight:700;color:#111}

    /* ── old application number, printed under the current reg. no. ── */
    .oldreg{font-size:9px;color:#666;line-height:1.15;margin-top:1px}

    /* ── note ── */
    .note{font-size:13px;color:#111;line-height:1.5;padding:0 2px;margin-bottom:2px}

    /* ── footer ── */
    .footer{
      border-top:1.5px solid ${trustHtml().pdfColorAccent};padding-top:4px;margin-top:4px;
      display:flex;justify-content:space-between;align-items:center;gap:10px;
    }
    .footer-spacer{width:60px}
    .footer-center{flex:1;text-align:center}
    .footer-contacts{font-size:12px;font-weight:700;color:${trustHtml().pdfColorAccent};margin-bottom:1px;letter-spacing:.3px}
    .footer-sub{font-size:12px;font-weight:700;color:${trustHtml().pdfColorPrimary};letter-spacing:.2px}
    .footer-eoe{font-size:12px;font-weight:700;color:#111;width:60px;text-align:right;white-space:nowrap}

    @media print{
      html,body{background:#fff;margin:0;padding:0}
      .print-bar{display:none!important}

      /* ── One receipt = exactly one sheet, by construction ──────────────────
         height:auto let the receipt be as tall as its content, so a full
         20-row list ran past the bottom of the paper and the footer was
         carried onto a second, otherwise-empty sheet. Telling the browser not
         to break it only moved the whole footer instead of splitting it — the
         receipt was still too tall.

         So the sheet is now a FIXED-HEIGHT flex column: 283mm, i.e. A4's 297mm
         less the 6mm @page margins (with 2mm spare for rounding). The table is
         the one flexible item, so any leftover — or shortfall — is absorbed
         there, and the footer is pushed to the bottom of the sheet by
         margin-top:auto. Nothing can spill past the page, because the page
         cannot grow. */
      .page{
        width:auto;
        height:283mm;max-height:283mm;
        margin:0;padding:0;box-shadow:none;
        display:flex;flex-direction:column;   /* margin-top:auto needs flex */
        overflow:hidden;
        page-break-after:always;break-after:page;
        page-break-inside:avoid;break-inside:avoid;
      }
      .page:last-child{page-break-after:auto;break-after:auto}
      .page::before{display:none}

      /* The only item allowed to give. min-height:0 is required or a flex item
         refuses to shrink below its content. */
      .table-wrap{flex:1;min-height:0;overflow:hidden;margin-top:6px}

      /* Slightly tighter rows in print so all 20 fit the fixed sheet with room
         to spare — the table must never have to shrink below its rows, because
         a table row clips rather than compresses. 20 x 26px = 520px, against
         roughly 650px of space left once everything else is placed. */
      .main-table td{height:26px;font-size:12.5px}
      .main-table th{padding:4px 3px;font-size:13px}

      tr{page-break-inside:avoid;break-inside:avoid}

      /* Pinned to the bottom of the fixed sheet, and never torn in half. */
      .footer{margin-top:auto;page-break-inside:avoid;break-inside:avoid}
    }
  </style>
</head><body>

  <div class="print-bar">
    <button class="btn-print" onclick="window.print()">🖨️&nbsp; Print / Save as PDF</button>
    <button class="btn-close" onclick="window.close()">✕ Close</button>
    <span class="print-info">📄 ${rasidList.length} रसीद &nbsp;|&nbsp; कुल राशि: ₹${rasidList.reduce((s,r)=>s+r.totalAmount,0).toLocaleString()}</span>
  </div>

  ${pages}

</body></html>`);
  win.document.close();
}

// ─── Main Component ────────────────────────────────────────────────────────────
const RasidGroupClosingDrawer = ({ open, setOpen, agentId, preselectedGroupId, agent, programList }) => {

  // ── State ──────────────────────────────────────────────────────────────────
  const [step, setStep]                   = useState(1);
  const [groupLoading, setGroupLoading]   = useState(false);
  const [agentLoading, setAgentLoading]   = useState(false);
  const [groupClosings, setGroupClosings] = useState([]);
  const [agentMembers, setAgentMembers]   = useState([]);

  const [expandedGroups, setExpandedGroups]         = useState([]);
  const [selectedGroupId, setSelectedGroupId]       = useState(null);
  const [selClosingMembers, setSelClosingMembers]   = useState(new Set());
  const [selAgentMembers, setSelAgentMembers]       = useState(new Set());

  const [searchGroup, setSearchGroup]     = useState('');
  const [searchClosing, setSearchClosing] = useState('');
  const [searchAgent, setSearchAgent]     = useState('');

  // Agent-member list filters (yojna + active/inactive)
  const [agentProgramFilter, setAgentProgramFilter] = useState('all');
  const [agentStatusFilter, setAgentStatusFilter]   = useState('all');

  const [rasidDate, setRasidDate] = useState(dayjs());
  const [rasidNote, setRasidNote] = useState('');
  const [previewList, setPreviewList] = useState([]);

  // ── Outstanding per member, derived from their closing_payment docs ────────
  //
  // The member doc's cached closing_pendingAmount is what the summary used to
  // print, and it shows ₹0 whenever that cache is stale or was zeroed — which
  // is exactly the field this project has been repairing all along. The
  // closing_payment docs are the source of truth, so the receipt derives the
  // figure rather than trusting the cache, and reports when it cannot.
  const [outstandingByMember, setOutstandingByMember] = useState({});
  const [outstandingLoaded, setOutstandingLoaded]     = useState(false);

  const loadOutstanding = useCallback(async (memberIds) => {
    const ids = [...new Set(memberIds)].filter(Boolean);
    if (!ids.length) { setOutstandingByMember({}); setOutstandingLoaded(true); return {}; }
    try {
      const chunks = [];
      for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
      const snaps = await Promise.all(chunks.map(c =>
        getDocs(query(collection(db, 'closing_payment'), where('memberId', 'in', c)))
      ));
      const map = {};
      ids.forEach(id => { map[id] = { total: 0, paid: 0, pending: 0, docs: 0, thisGroup: null }; });
      snaps.forEach(s => s.forEach(d => {
        const cp = d.data();
        if (cp.isReversed === true) return;
        const e = map[cp.memberId];
        if (!e) return;
        e.total += Number(cp.totalAmount || 0);
        e.paid  += Number(cp.paidAmount  || 0);
        e.docs  += 1;
        // Keep THIS group's doc: it records which closings this member was
        // actually charged for, which is not the same as the closings selected
        // on screen — see the note in buildRasid.
        if (cp.closingGroupId === selectedGroupId) {
          e.thisGroup = {
            totalAmount:  Number(cp.totalAmount  || 0),
            paidAmount:   Number(cp.paidAmount   || 0),
            closingCount: Number(cp.closingCount || 0),
            chargedIds:   new Set((cp.closingDetails || [])
                            .map(x => x?.closed_memberId).filter(Boolean)),
          };
        }
      }));
      Object.values(map).forEach(e => { e.pending = Math.max(0, e.total - e.paid); });
      setOutstandingByMember(map);
      setOutstandingLoaded(true);
      return map;
    } catch (e) {
      console.error('outstanding fetch failed:', e);
      setOutstandingByMember({});
      setOutstandingLoaded(false);
      message.warning('Could not read closing records — outstanding column may be incomplete');
      return {};
    }
  }, [selectedGroupId]);

  const [initialSelectDone, setInitialSelectDone] = useState(false);

  // ── Reset + fetch on open ──────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setStep(1); setSelectedGroupId(preselectedGroupId || null);
      setSelClosingMembers(new Set()); setSelAgentMembers(new Set());
      setExpandedGroups(preselectedGroupId ? [preselectedGroupId] : []);
      setPreviewList([]);
      setSearchGroup(''); setSearchClosing(''); setSearchAgent('');
      setAgentProgramFilter('all'); setAgentStatusFilter('all');
      setOutstandingByMember({}); setOutstandingLoaded(false);
      setInitialSelectDone(false);
      fetchGroupClosings();
      if (agentId) fetchAgentMembers();
    }
  }, [open, agentId, preselectedGroupId]);

  // Auto-select all closing members when group is preselected
  useEffect(() => {
    if (preselectedGroupId && selectedGroupId && !initialSelectDone && groupClosings.length > 0) {
      const group = groupClosings.find(g => g.id === preselectedGroupId);
      if (group && group.members) {
        setSelClosingMembers(new Set(group.members.map(m => m.id)));
        setInitialSelectDone(true);
      }
    }
  }, [preselectedGroupId, selectedGroupId, groupClosings, initialSelectDone]);

  const fetchGroupClosings = async () => {
    setGroupLoading(true);
    try {
      const snap = await getDocs(query(collection(db,'groupClosings'), orderBy('closedAt','desc')));
      if (snap.empty) { setGroupClosings([]); return; }
      const closings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const progIds = [...new Set(closings.map(g => g.programId).filter(Boolean))];
      const progMap = {};
      for (let i = 0; i < progIds.length; i += 30) {
        const s = await getDocs(query(collection(db,'programs'), where(documentId(),'in', progIds.slice(i,i+30))));
        s.forEach(d => { progMap[d.id] = { id: d.id, ...d.data() }; });
      }
      const allIds = [...new Set(closings.flatMap(g => g.closedMemberIds || []))];
      const map = {};
      for (let i = 0; i < allIds.length; i += 30) {
        const s = await getDocs(query(collection(db,'members'), where(documentId(),'in', allIds.slice(i,i+30))));
        s.forEach(d => { map[d.id] = { id: d.id, ...d.data() }; });
      }
      setGroupClosings(closings.map(g => ({
        ...g,
        // Hindi yojana name straight from the programs doc, so the receipt
        // doesn't depend on a possibly-stale redux programList.
        yojanaName: progMap[g.programId]?.hindiName || progMap[g.programId]?.name || g.yojanaName || '',
        members: (g.closedMemberIds||[]).map(id => map[id]||{ id, displayName:'Unknown' }),
      })));
    } catch(e) { console.error(e); message.error('Group closings fetch failed'); }
    finally { setGroupLoading(false); }
  };

  const fetchAgentMembers = async () => {
    setAgentLoading(true);
    try {
      const data = await fetchMembersByAgent(agentId);
      setAgentMembers(data);
    } catch(e) { message.error('Agent members fetch failed'); }
    finally { setAgentLoading(false); }
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const selectedGroup = useMemo(
    () => groupClosings.find(g => g.id === selectedGroupId) || null,
    [groupClosings, selectedGroupId]
  );

  const filteredGroups = useMemo(() => {
    if (!searchGroup.trim()) return groupClosings;
    const s = searchGroup.toLowerCase();
    return groupClosings.filter(g =>
      g.groupName?.toLowerCase().includes(s) ||
      g.members?.some(m => m.displayName?.toLowerCase().includes(s) || m.registrationNumber?.toLowerCase().includes(s))
    );
  }, [groupClosings, searchGroup]);

  const filteredClosingMembers = useMemo(() => {
    if (!selectedGroup) return [];
    if (!searchClosing.trim()) return selectedGroup.members;
    const s = searchClosing.toLowerCase();
    return selectedGroup.members.filter(m =>
      m.displayName?.toLowerCase().includes(s) ||
      m.registrationNumber?.toLowerCase().includes(s) ||
      (m.phone||m.phoneNo||'').includes(searchClosing)
    );
  }, [selectedGroup, searchClosing]);

  const eligibleAgentMembers = useMemo(() => {
    if (!agentMembers.length || !selClosingMembers.size || !selectedGroup) return [];
    const pmIds = selectedGroup.paymentMemberIds || [];
    return agentMembers.filter(m => {
      if (m.delete_flag) return false;
      if ((m.closing_pendingAmount || 0) <= 0) return false;
      return pmIds.includes(m.id);
    });
  }, [agentMembers, selClosingMembers, selectedGroup]);

  const ineligibleCount = useMemo(() => {
    if (!agentMembers.length || !selClosingMembers.size) return 0;
    const selectedClosingIds = [...selClosingMembers];
    return agentMembers.filter(m => {
      if (m.delete_flag) return false;
      if ((m.closing_pendingAmount||0) <= 0) return false;
      const pmIds = m.paymentMemberIds || [];
      return !pmIds.some(id => selectedClosingIds.includes(id));
    }).length;
  }, [agentMembers, selClosingMembers]);

  // Yojna options built from the members actually in this list, so the dropdown
  // never offers a programme with nothing behind it.
  const agentProgramOptions = useMemo(() => {
    const seen = new Map();
    eligibleAgentMembers.forEach(m => {
      if (!m.programId) return;
      if (!seen.has(m.programId)) {
        const prog = (programList || []).find(p => p.id === m.programId);
        const name = prog?.hindiName || prog?.name || m.programName || m.programId;
        seen.set(m.programId, { value: m.programId, label: name, count: 0 });
      }
      seen.get(m.programId).count++;
    });
    return [
      { value: 'all', label: `All Yojna (${eligibleAgentMembers.length})` },
      ...[...seen.values()]
        .sort((a, b) => a.label.localeCompare(b.label))
        .map(o => ({ value: o.value, label: `${o.label} (${o.count})` })),
    ];
  }, [eligibleAgentMembers, programList]);

  const filteredAgentMembers = useMemo(() => {
    let list = eligibleAgentMembers;

    if (agentProgramFilter !== 'all') {
      list = list.filter(m => m.programId === agentProgramFilter);
    }

    if (agentStatusFilter !== 'all') {
      list = list.filter(m => {
        const isActive = m.active_flag === true && m.member_closed !== true;
        return agentStatusFilter === 'active' ? isActive : !isActive;
      });
    }

    const s = searchAgent.trim().toLowerCase();
    if (s) {
      list = list.filter(m =>
        m.displayName?.toLowerCase().includes(s) ||
        m.fatherName?.toLowerCase().includes(s) ||
        m.registrationNumber?.toLowerCase().includes(s) ||
        m.village?.toLowerCase().includes(s) ||
        (m.phone || '').includes(searchAgent.trim())
      );
    }

    return list;
  }, [eligibleAgentMembers, searchAgent, agentProgramFilter, agentStatusFilter]);

  // Counts shown on the active/inactive toggle — scoped to the chosen yojna so
  // the numbers always match what picking that tab would actually show.
  const agentStatusCounts = useMemo(() => {
    const base = agentProgramFilter === 'all'
      ? eligibleAgentMembers
      : eligibleAgentMembers.filter(m => m.programId === agentProgramFilter);
    let active = 0;
    base.forEach(m => { if (m.active_flag === true && m.member_closed !== true) active++; });
    return { all: base.length, active, inactive: base.length - active };
  }, [eligibleAgentMembers, agentProgramFilter]);

  const agentFiltersActive =
    agentProgramFilter !== 'all' || agentStatusFilter !== 'all' || !!searchAgent.trim();

  // ── Handlers ───────────────────────────────────────────────────────────────
  const toggleGroupExpand = (id) =>
    setExpandedGroups(p => p.includes(id) ? p.filter(x=>x!==id) : [...p, id]);

  const selectGroup = (id) => {
    setSelectedGroupId(id);
    setSelClosingMembers(new Set());
    setSelAgentMembers(new Set());
    setExpandedGroups(p => p.includes(id) ? p : [...p, id]);
  };

  const toggleClosingMember = (id) => setSelClosingMembers(p => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const selectAllClosing = (checked) =>
    setSelClosingMembers(checked ? new Set(selectedGroup.members.map(m=>m.id)) : new Set());

  const toggleAgentMember = (id) => setSelAgentMembers(p => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  // Select-all acts on what is VISIBLE. Members hidden by the yojna/status/search
  // filters keep whatever state they already had, so switching filters never
  // silently drops a selection the user made earlier.
  const selectAllAgent = (checked) =>
    setSelAgentMembers(prev => {
      const n = new Set(prev);
      filteredAgentMembers.forEach(m => { checked ? n.add(m.id) : n.delete(m.id); });
      return n;
    });

  // ── Build summary table HTML ──────────────────────────────────────────────
  const buildSummaryHTML = useCallback(() => {
    if (!previewList.length || !selectedGroup) return '';
    const dateStr = rasidDate.format('DD/MM/YYYY');
    // Header-level agent line — same "(code) Name Phone" format the receipt
    // uses for कार्यकर्ता.
    const agentStr = agent
      ? [agent.agentCode ? `(${agent.agentCode})` : '', agent.name || '', agent.phone1 || agent.phone || ''].filter(Boolean).join(' ')
      : '—';

    const rowHtml = previewList.map((r, idx) => {
      // Look the member up by ID, not by position — see the note on memberId in
      // buildRasid. Falls back to the values carried on the row itself.
      const am = agentMembers.find(m => m.id === r.memberId) || {};
      // The summary table already has its own रजि. नं. column, so the name is
      // shown WITHOUT the reg-no prefix that buildRasid adds for the receipt.
      const name = [am.displayName || r.displayName, (am.fatherName || r.fatherName) ? '/ ' + (am.fatherName || r.fatherName) : '']
                      .filter(Boolean).join(' ') || r.name;
      // Derived from the member's closing_payment docs; the cached field on the
      // member doc is only a fallback, and an em-dash is printed rather than a
      // misleading ₹0 when neither source can tell us.
      const derived = outstandingByMember[r.memberId];
      const pendingAll = derived
        ? derived.pending
        : Number(am.closing_pendingAmount ?? r.memberPending ?? 0);
      const pendingCell = (derived || am.closing_pendingAmount != null || r.memberPending != null)
        ? `₹${pendingAll.toLocaleString()}`
        : '—';
      return `
        <tr>
          <td class="c">${r.serialNo || (idx + 1)}</td>
          <td class="l">${name}</td>
          <td class="c">${am.registrationNumber || r.registrationNumber || '—'}${
            (getOldRegNo(am) || r.oldRegNo)
              ? `<div class="oldreg">पुराना: ${getOldRegNo(am) || r.oldRegNo}</div>`
              : ''
          }</td>
          <td class="l">${am.village || r.village || '—'}</td>
          <td class="c">${r.phone || '—'}</td>
          <td class="c">${r.entries?.length || 0}</td>
          <td class="c">₹${(r.sahyogRashi || 0).toLocaleString()}</td>
          <td class="c">₹${(r.totalAmount || 0).toLocaleString()}</td>
          <td class="c">${pendingCell}</td>
        </tr>
      `;
    });

    const totalMembers = previewList.length;
    const totalAmount = previewList.reduce((s, r) => s + (r.totalAmount || 0), 0);
    // NOTE: these two totals measure DIFFERENT THINGS and are not comparable.
    // `totalAmount` is what THIS receipt charges (closings in this group ×
    // each member's instalment). `totalPending` is what those members still owe
    // across EVERY closing group. Sitting side by side under headings "कुल राशि"
    // and "बकाया", it read as though ₹400 of the ₹1,200 was outstanding — the
    // headings below now say which scope each one covers.
    const totalPending = previewList.reduce((s, r) => {
      const derived = outstandingByMember[r.memberId];
      if (derived) return s + derived.pending;
      const am = agentMembers.find(m => m.id === r.memberId);
      return s + Number(am?.closing_pendingAmount ?? r.memberPending ?? 0);
    }, 0);
    const totalCount = previewList.reduce((s, r) => s + (r.entries?.length || 0), 0);

    // ── Pagination ───────────────────────────────────────────────────────────
    // Handled by the BROWSER, not by slicing rows into fixed-size chunks here.
    //
    // The manual version budgeted a row count per sheet, which only works while
    // every row is the same height. Once the old application number added a
    // second line to the रजि. नं. column — and longer villages wrapped too —
    // rows grew from ~21px to ~30px, 32 of them no longer fitted 297mm, and the
    // sheet overflowed: the browser then split it wherever it ran out of paper,
    // leaving half-empty pages and gaps.
    //
    // `thead{display:table-header-group}` makes the browser repeat the column
    // headings on every printed page by itself, and `tr{page-break-inside:avoid}`
    // keeps a member's row whole. The result fills each page completely whatever
    // the row heights turn out to be.
    const yojanaLabel = selectedGroup.yojanaName
      || (programList || []).find(p => p.id === selectedGroup.programId)?.hindiName
      || (programList || []).find(p => p.id === selectedGroup.programId)?.name
      || '—';

    return `<!DOCTYPE html><html lang="hi"><head>
      <meta charset="utf-8">
      <title>Payment Summary</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Noto Sans Devanagari',sans-serif;background:#b0b0b0;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        .print-bar{position:sticky;top:0;z-index:100;padding:12px 24px;background:${trustHtml().pdfColorPrimary};display:flex;gap:12px;align-items:center}
        .btn-print{background:${trustHtml().pdfColorAccent};color:#fff;border:none;padding:10px 28px;border-radius:6px;cursor:pointer;font-weight:700;font-size:14px;font-family:inherit}
        .btn-close{background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);padding:10px 20px;border-radius:6px;cursor:pointer;font-size:14px;font-family:inherit}
        @page{size:A4 portrait;margin:8mm}
        /* One continuous sheet — the browser decides where the page breaks
           fall. A fixed 297mm height here is what caused the half-empty pages:
           once rows grew to two lines the content no longer fitted the box, the
           box grew past one physical page, and the printer split it arbitrarily. */
        /* ON SCREEN: a full A4 sheet, so a short summary still looks like a
           page rather than a floating strip. min-height (not height) so a long
           list simply grows and the browser paginates it.
           IN PRINT this min-height is removed — see @media print — because a
           297mm minimum inside an already-margined @page box is what pushed
           content onto a second sheet. */
        .page{
          width:210mm;min-height:297mm;
          background:#fff;margin:18px auto;padding:6mm 7mm;
          box-shadow:0 6px 28px rgba(0,0,0,.25);position:relative;
          display:flex;flex-direction:column;
        }
        .warn{margin-top:5px;padding:5px 7px;border:1px solid ${trustHtml().pdfColorAccent};background:#fff3f0;font-size:8.5px;color:${trustHtml().pdfColorAccent};line-height:1.45}
        .note{margin-top:5px;font-size:8.5px;color:#555;line-height:1.45}
        .oldreg{font-size:7.5px;color:#777;line-height:1.2;margin-top:1px}
        .page::before{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:60%;height:60%;background:url('${trustHtml().logoSrc}') center/contain no-repeat;opacity:.04;pointer-events:none;z-index:0}
        .page>*{position:relative;z-index:1}
        .header{text-align:center;margin-bottom:10px}
        .header h2{font-size:15px;color:${trustHtml().pdfColorPrimary};margin-bottom:3px;line-height:1.3}
        .header p{font-size:10.5px;color:${trustHtml().pdfColorAccent}}
        .info-row{display:flex;gap:10px;margin-bottom:6px;flex-wrap:wrap;font-size:10px;color:#333}
        .info-row b{color:${trustHtml().pdfColorPrimary}}
        table{width:100%;border-collapse:collapse;border:1.5px solid #999}
        th{padding:4px 2px;font-size:9.5px;font-weight:700;color:${trustHtml().pdfColorPrimary};text-align:center;border:1px solid #999;background:#f0f0f0;line-height:1.25}
        td{padding:4px 3px;font-size:9.5px;color:#111;border:0.8px solid #c0c8d4;line-height:1.3}
        td.c{text-align:center}
        td.l{text-align:left;padding-left:6px;word-break:break-word}
        td.c{white-space:nowrap}
        table{table-layout:fixed}
        th.name,td.name{text-align:left;padding-left:6px}
        tr:nth-child(even){background:#fafafa}
        .total-row td{font-weight:700;background:#fff3f0;font-size:10px}
        .footer{text-align:center;margin-top:auto;padding-top:5px;border-top:1.5px solid ${trustHtml().pdfColorAccent};font-size:8.5px;color:#666}
        @media print{
          html,body{background:#fff;margin:0;padding:0}
          .print-bar{display:none!important}
          /* @page owns the paper and its margins; the sheet just fills it. */
          .page{
            width:auto;min-height:0;height:auto;
            margin:0;padding:0;box-shadow:none;
            display:block;                    /* margin-top:auto needs flex; not wanted here */
          }
          /* margin-top:auto only works under flex; and the footer is two lines
             plus a rule, so it must never be torn across a page break. */
          .footer{margin-top:10px;page-break-inside:avoid;break-inside:avoid}
          .page::before{display:none}            /* absolute watermark can spawn a blank sheet */

          /* The browser repeats these on every printed page, so each sheet
             carries its own column headings without us slicing the rows. */
          thead{display:table-header-group}
          tfoot{display:table-footer-group}
          tr{page-break-inside:avoid; break-inside:avoid}
          /* Keep the totals row with the table, and the notes together. */
          .total-row{page-break-inside:avoid}
          .warn,.note{page-break-inside:avoid}
        }</style>
    </head><body>
      <div class="print-bar">
        <button class="btn-print" onclick="window.print()">🖨 Print / Save PDF</button>
        <button class="btn-close" onclick="window.close()">✕ Close</button>
        <span class="print-info">📄 ${totalMembers} members | This receipt: ₹${totalAmount.toLocaleString()} | Outstanding (all groups): ₹${totalPending.toLocaleString()}</span>
      </div>
      <div class="page">
        <div class="header">
          <h2>${trustHtml().name}</h2>
          <p>क्लोजिंग पेमेंट सारांश — ${selectedGroup.groupName || 'Group'} · ${dateStr}</p>
        </div>
        <div class="info-row">
          <span><b>एजेंट :</b> ${agentStr}</span>
          <span><b>ग्रुप :</b> ${selectedGroup.groupName || '—'}</span>
          <span><b>योजना :</b> ${yojanaLabel}</span>
          <span><b>कुल सदस्य :</b> ${totalMembers}</span>
          <span><b>दिनांक :</b> ${dateStr}</span>
        </div>
        <table>
          <thead><tr>
            <th style="width:30px">क्र.<br>सं.</th>
            <th style="min-width:180px">नाम / पिता</th>
            <th style="width:92px">रजि. नं.</th>
            <th style="width:70px">गाँव</th>
            <th style="width:74px">फोन</th>
            <th style="width:42px">क्लोजिंग<br>काउंट</th>
            <th style="width:48px">किस्त</th>
            <th style="width:76px">इस रसीद<br>की राशि</th>
            <th style="width:76px">कुल बकाया<div style="font-size:7px;font-weight:400">(सभी ग्रुप)</div></th>
          </tr></thead>
          <tbody>
            ${rowHtml.join('')}
            <tr class="total-row">
              <td colspan="5" class="l">कुल योग (${totalMembers} सदस्य)</td>
              <td class="c">${totalCount}</td>
              <td class="c">—</td>
              <td class="c">₹${totalAmount.toLocaleString()}</td>
              <td class="c">₹${totalPending.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
        ${previewList.some(r => r.notCharged) ? `
        <div class="warn">
          <b>ध्यान दें :</b> ${previewList.filter(r => r.notCharged).length} सदस्य के लिए इस ग्रुप में कोई क्लोजिंग राशि दर्ज नहीं है,
          इसलिए उनकी राशि ₹0 दिख रही है। इनसे वसूली न करें जब तक क्लोजिंग एंट्री ठीक न हो जाए।
        </div>` : ''}
        ${previewList.some(r => r.chargeMismatch) ? `
        <div class="warn">
          <b>चेतावनी :</b> ${previewList.filter(r => r.chargeMismatch).length} सदस्य की दर्ज राशि उनकी क्लोजिंग गिनती × किस्त से मेल नहीं खाती।
          रसीद दर्ज राशि दिखा रही है। कृपया Settings → Closing System Check चलाएँ।
        </div>` : ''}
        <div class="note">
          <b>नोट :</b> "इस रसीद की राशि" = इस सदस्य से इस ग्रुप में वसूली जाने वाली दर्ज राशि
          (केवल वे क्लोजिंग जिनके लिए यह सदस्य पात्र था — जॉइन डेट और अपनी क्लोजिंग डेट के अनुसार)।
          "कुल बकाया" = सदस्य की सभी ग्रुप मिलाकर शेष राशि — इसमें पुराने ग्रुप भी शामिल हैं
          और इसमें से कुछ भुगतान हो चुका हो सकता है। दोनों कॉलम अलग-अलग हैं, एक दूसरे का हिस्सा नहीं।
        </div>
        <div class="footer">
          Generated on ${dayjs().format('DD MMM YYYY hh:mm A')} — ${trustHtml().shortName}
        </div>
      </div>
    </body></html>`;
  }, [agent, agentMembers, selAgentMembers, selectedGroup, rasidDate, previewList, programList, outstandingByMember]);

  // ── Build rasid list ───────────────────────────────────────────────────────
  // `chargeMap` is passed in by goToStep3 with the data it JUST fetched.
  // Reading outstandingByMember from state here would see the value from before
  // setOutstandingByMember() — React has not re-rendered yet — so every member
  // fell through to the "no doc" branch and was billed for the whole selection.
  const buildRasid = useCallback((chargeMap) => {
    const charges = chargeMap || outstandingByMember;
    if (!selectedGroup || !selClosingMembers.size || !selAgentMembers.size) return [];
    const dateStr    = rasidDate.format('DD/MM/YYYY');
    const closingDs  = selectedGroup.closedAt?.toDate
      ? dayjs(selectedGroup.closedAt.toDate()).format('DD-MM-YYYY')
      : rasidDate.format('DD-MM-YYYY');
    // The group doc stores only programId — the yojana name is resolved at
    // fetch time from the programs doc (Hindi preferred).
    const prog       = (programList || []).find(p => p.id === selectedGroup.programId) || {};

    const yojanaName =  selectedGroup.yojanaName || prog.hindiName || prog.name || '';
    // Printed receipt reads "अप्रैल-2026 सहयोग राशि (…)" — Hindi month name,
    // not dayjs's English abbreviation.
    const HINDI_MONTHS = ['जनवरी','फरवरी','मार्च','अप्रैल','मई','जून',
                          'जुलाई','अगस्त','सितंबर','अक्टूबर','नवंबर','दिसंबर'];
    const noteMonth = `${HINDI_MONTHS[rasidDate.month()]}-${rasidDate.format('YYYY')}`;
    const note = rasidNote ||
      `${noteMonth} सहयोग राशि ( "यह सहयोग राशि स्वैच्छिक है एवं गैर-वापसीयोग्य है।" )`;

    // Rows are listed date-wise: each member's closing date ascending.
    const ddToNum = (s) => {
      const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s || '');
      return m ? [Number(m[3]), Number(m[2]), Number(m[1])] : [0, 0, 0];
    };

    const entries = selectedGroup.members
      .filter(m => selClosingMembers.has(m.id))
      .sort((a, b) => {
        const pa = ddToNum(fmtDate(a.closed_date || a.marriageDate));
        const pb = ddToNum(fmtDate(b.closed_date || b.marriageDate));
        for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
        return 0;
      })
      .map(m => ({
        id:     m.id,
        code:   m.registrationNumber || '',
        oldCode: getOldRegNo(m) || '',
        name:   [m.displayName, m.fatherName ? '/ '+m.fatherName : ''].filter(Boolean).join(' '),
        // Printed receipt shows place after the name as "गाँव - जिला" /
        // "गाँव-जिला-राज्य", so village, district and state are joined here
        // rather than each getting a column.
        village: [m.village, m.district, m.state].filter(Boolean).join(' - '),
        ageGroup: m.ageGroupName || m.memberGroupName || m.ageGroup || '',
        // The row's closing date is the CLOSED MEMBER's own closed_date (the
        // marriage/closing event date), not the group's closedAt (when the
        // closing batch was recorded). Fall back to the group date only when
        // the member has no closed_date.
        date:   fmtDate(m.closed_date || m.marriageDate) || closingDs,
        mobile: m.phone || m.phoneNo || '',
      }));

    // "Group : B" on the receipt is the age group of the members being CLOSED,
    // not the closing batch name (which reads like "july-26") and not the
    // paying member's own group.
    const closingAgeGroup = entries.find(e => e.ageGroup)?.ageGroup || '';

    // क्र. सं. is a plain running number — 1, 2, 3 … — and it is set ONCE here,
    // on the rasid row. The summary prints the same `serialNo` off the same
    // array, so the receipt and the summary can never show a different number
    // for the same member. (It used to be a 5-digit receipt code, which meant
    // the two documents numbered the same person differently.)

    return agentMembers
      .filter(m => selAgentMembers.has(m.id))
      .map((am, idx) => {
        const payAmt = am.payAmount || 0;

        // Charge what this member was ACTUALLY billed for, not the whole
        // selection.
        //
        // `entries` is every closing ticked on screen, and this used to print
        // entries.length × payAmount for everyone — the same figure for each
        // paying member. But closed_payment_entry charges each member only for
        // the closings they were eligible for: it skips events dated before
        // they joined, and events after their own closing. A member who joined
        // part-way through was charged for 2 of the 6 closings, yet the receipt
        // billed them for all 6 — ₹1,200 on paper against ₹400 actually owed.
        //
        // The member's closing_payment doc for this group lists exactly which
        // closings they were charged for, so the receipt now shows those rows
        // and that doc's total.
        const info       = charges[am.id];
        const groupDoc   = info?.thisGroup || null;

        // No closing_payment doc for this group means this member was never
        // charged for it. Falling back to entries.length × payAmount here would
        // INVENT a charge — printing ₹1,200 for a member the system has no
        // record of billing. Show zero and flag them instead; a receipt must
        // never ask for money that was never raised.
        const myEntries  = groupDoc
          ? entries.filter(e => groupDoc.chargedIds.has(e.id))
          : [];
        const total      = groupDoc ? groupDoc.totalAmount : 0;
        const notCharged = !groupDoc;
        // Flags a member whose recorded charge doesn't match its own rows, so a
        // stale figure is visible rather than silently printed.
        const chargeMismatch = !!groupDoc && groupDoc.totalAmount !== myEntries.length * payAmt;

        return {
          entriesCharged: myEntries.length,
          chargeMismatch,
          notCharged,
          // Carried so the summary table can look the member up BY ID. It used
          // to pair previewList[i] with [...selAgentMembers][i] — a Set's
          // iteration order against a filtered array's order — so a row's name,
          // reg. no. and outstanding amount could be taken from a different
          // member than the one the row was actually for.
          memberId:     am.id,
          registrationNumber: am.registrationNumber || '',
          oldRegNo:     getOldRegNo(am) || '',
          displayName:  am.displayName || '',
          fatherName:   am.fatherName || '',
          memberPending: Number(am.closing_pendingAmount || 0),
          serialNo:     String(idx + 1),
          date:         dateStr,
          // Printed receipt shows the code ahead of the name:
          // "V100151 महेश / राजुभाई"
          // Name only. The registration number used to be prefixed onto this
          // string, which made the receipt read "MEM719396 विकास कुमार" under a
          // "नाम" label; it now has its own labelled field alongside the old
          // application number.
          name:         [am.displayName, am.fatherName ? '/ '+am.fatherName : '']
                          .filter(Boolean).join(' '),
          regNo:        am.registrationNumber || '',
          phone:        am.phone || '',
          address:      [am.village, am.city, am.state].filter(Boolean).join(', '),
          village:      am.village || '',
          yojana:       yojanaName,
          group:        selectedGroup.groupName || '',
          ageGroup:     closingAgeGroup || am.ageGroupName || am.memberGroupName || am.ageGroup || '',
          sahyogRashi:  payAmt,
          // The rows THIS member was charged for — not the whole selection.
          entries:      myEntries,
          totalAmount:  total,
          totalInWords: toWords(total),
          // "कार्यकर्ता : (100018) Vikash Borana 9427212990"
          worker:       agent
                          ? [agent.agentCode ? `(${agent.agentCode})` : '',
                             agent.name || '',
                             agent.phone1 || agent.phone || '']
                              .filter(Boolean).join(' ')
                          : '',
          note,
        };
      });
  }, [selectedGroup, selClosingMembers, selAgentMembers, agentMembers, rasidDate, rasidNote, programList, outstandingByMember]);

  // ── Step nav ───────────────────────────────────────────────────────────────
  const goToStep2 = () => {
    if (!selectedGroupId) { message.warning('Pehle ek group select karo!'); return; }
    if (!selClosingMembers.size) { message.warning('Kam se kam ek closing member select karo!'); return; }
    setStep(2);
  };

  const goToStep3 = async () => {
    if (!selAgentMembers.size) { message.warning('Kam se kam ek agent member select karo!'); return; }
    // Derive outstanding before building the preview, so the summary prints a
    // real figure instead of a possibly-stale cached one. The map is handed
    // straight to buildRasid — the state set inside loadOutstanding is not
    // visible until the next render, so relying on it here would silently use
    // the previous (empty) value.
    const charges = await loadOutstanding([...selAgentMembers]);
    const list = buildRasid(charges);
    setPreviewList(list);
    setStep(3);
  };

  // ── Misc ───────────────────────────────────────────────────────────────────
  const allClosingChecked = selectedGroup && selectedGroup.members.length > 0 &&
    selectedGroup.members.every(m => selClosingMembers.has(m.id));
  const allAgentChecked = filteredAgentMembers.length > 0 &&
    filteredAgentMembers.every(m => selAgentMembers.has(m.id));

  const stepTitles = [
    '1. Group & Closing Members',
    '2. Agent Members Select',
    '3. Preview & Print',
  ];

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <Drawer
      title={
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:34,height:34,borderRadius:8,background:`linear-gradient(135deg,${C.red},${C.blue})`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <FilePdfOutlined style={{color:'#fff',fontSize:17}}/>
          </div>
          <div style={{flex:1}}>
            <Text strong style={{fontSize:14,color:C.fg,display:'block'}}>रसीद जनरेटर</Text>
            <Text style={{fontSize:11,color:C.muted}}>{stepTitles[step-1]}</Text>
          </div>
        </div>
      }
      placement="right"
      width={860}
      onClose={()=>setOpen(false)}
      open={open}
      bodyStyle={{padding:0,background:C.bg,display:'flex',flexDirection:'column',height:'100%'}}
      headerStyle={{borderBottom:`2px solid ${C.border}`,background:C.surf}}
      extra={
        <Space>
          {step > 1 && <Button icon={<LeftOutlined/>} onClick={()=>setStep(s=>s-1)}>Back</Button>}
          {step === 1 && (
            <Button type="primary" icon={<RightOutlined/>} onClick={goToStep2}
              disabled={!selectedGroupId || !selClosingMembers.size}
              style={{background:`linear-gradient(135deg,${C.red},${C.blue})`,border:'none',borderRadius:8,fontWeight:700}}>
              Next: Agent Members
            </Button>
          )}
          {step === 2 && (
            <Button type="primary" icon={<RightOutlined/>} onClick={goToStep3}
              disabled={!selAgentMembers.size}
              style={{background:`linear-gradient(135deg,${C.red},${C.blue})`,border:'none',borderRadius:8,fontWeight:700}}>
              Preview ({selAgentMembers.size} रसीद)
            </Button>
          )}
          {step === 3 && (
            <Button type="primary" icon={<FilePdfOutlined/>} onClick={()=>openPrintWindow(previewList)}
              style={{background:`linear-gradient(135deg,${C.red},${C.blue})`,border:'none',borderRadius:8,fontWeight:700}}>
              🖨 Print / Save PDF
            </Button>
          )}
        </Space>
      }
    >

      {/* ── Step indicator ── */}
      <div style={{padding:'10px 16px',background:C.surf,borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:0}}>
        {[1,2,3].map((s,i)=>(
          <React.Fragment key={s}>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <div style={{
                width:26,height:26,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
                background: step>=s ? `linear-gradient(135deg,${C.red},${C.blue})` : '#e5e7eb',
                color: step>=s ? '#fff' : C.muted, fontSize:12, fontWeight:700,
              }}>{step>s ? '✓' : s}</div>
              <Text style={{fontSize:11,fontWeight:step===s?700:400,color:step>=s?C.fg:C.muted}}>
                {['Group Select','Agent Members','Preview'][i]}
              </Text>
            </div>
            {i<2 && <div style={{flex:1,height:1,background:step>s?C.blue:'#e5e7eb',margin:'0 10px'}}/>}
          </React.Fragment>
        ))}
      </div>

      {/* ════ STEP 1 ════ */}
      {step===1 && (
        <div style={{display:'flex',flex:1,overflow:'hidden'}}>

          {/* LEFT — Groups */}
          <div style={{width:280,flexShrink:0,borderRight:`1.5px solid ${C.border}`,display:'flex',flexDirection:'column',background:C.surf}}>
            <div style={{padding:'10px 12px',borderBottom:`1px solid ${C.border}`}}>
              <Text strong style={{fontSize:12,color:C.fg,display:'block',marginBottom:6}}>Group Closings</Text>
              <Input placeholder="Search groups..." size="small"
                prefix={<SearchOutlined style={{color:C.pink}}/>}
                value={searchGroup} onChange={e=>setSearchGroup(e.target.value)} allowClear/>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:8}}>
              {groupLoading ? <div style={{textAlign:'center',padding:40}}><Spin/></div>
                : filteredGroups.length===0 ? <Empty description="No groups" style={{marginTop:30}}/>
                : filteredGroups.map(g => {
                  const isSel   = selectedGroupId === g.id;
                  const isExp   = expandedGroups.includes(g.id);
                  const cd      = g.closedAt?.toDate ? dayjs(g.closedAt.toDate()).format('DD MMM YY') : '—';
                  const selCnt  = isSel ? [...selClosingMembers].filter(id => g.members.some(m=>m.id===id)).length : 0;
                  return (
                    <div key={g.id} style={{marginBottom:6,borderRadius:10,overflow:'hidden',border:`1.5px solid ${isSel?C.red:C.border}`,boxShadow:isSel?`0 0 0 2px ${C.red}20`:undefined}}>
                      <div onClick={()=>{ selectGroup(g.id); toggleGroupExpand(g.id); }}
                        style={{padding:'8px 10px',cursor:'pointer',background:isSel?`${C.red}0e`:'#fafafa',display:'flex',alignItems:'center',gap:8}}>
                        <div style={{flex:1}}>
                          <Text strong style={{fontSize:11.5,color:isSel?C.red:C.fg}}>
                            {g.groupName||`Group #${g.id.slice(-5)}`}
                          </Text>
                          <div style={{display:'flex',gap:5,marginTop:2,flexWrap:'wrap'}}>
                            <Tag style={{fontSize:9,padding:'0 5px',margin:0}} color="blue">
                              <CalendarOutlined/> {cd}
                            </Tag>
                            <Tag style={{fontSize:9,padding:'0 5px',margin:0}} color="geekblue">
                              <TeamOutlined/> {g.members.length}
                            </Tag>
                            {selCnt>0 && <Tag style={{fontSize:9,padding:'0 5px',margin:0}} color="volcano">{selCnt} sel</Tag>}
                          </div>
                        </div>
                        <span style={{color:C.muted,fontSize:11,transition:'transform .2s',transform:isExp?'rotate(90deg)':'none',display:'inline-block'}}>
                          <RightOutlined/>
                        </span>
                      </div>
                    </div>
                  );
                })
              }
            </div>
            <div style={{padding:'8px 12px',borderTop:`1px solid ${C.border}`}}>
              <Button size="small" icon={<ReloadOutlined/>} onClick={fetchGroupClosings} style={{width:'100%'}}>Refresh</Button>
            </div>
          </div>

          {/* RIGHT — Closing members */}
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
            {!selectedGroup ? (
              <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:10}}>
                <ArrowRightOutlined style={{fontSize:32,color:C.muted,transform:'rotate(180deg)'}}/>
                <Text type="secondary">Left se ek group select karo</Text>
              </div>
            ) : (
              <>
                <div style={{padding:'9px 14px',background:`${C.red}08`,borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:10}}>
                  <Checkbox
                    indeterminate={selClosingMembers.size>0&&!allClosingChecked}
                    checked={allClosingChecked}
                    onChange={e=>selectAllClosing(e.target.checked)}
                  >
                    <Text strong style={{fontSize:12}}>
                      {selectedGroup.groupName||'Group'} — Closing Members ({selectedGroup.members.length})
                    </Text>
                  </Checkbox>
                  <Badge count={selClosingMembers.size} style={{backgroundColor:C.red}}/>
                  <div style={{flex:1}}/>
                  <Input placeholder="Search..." size="small" style={{width:170}}
                    prefix={<SearchOutlined style={{fontSize:11,color:C.pink}}/>}
                    value={searchClosing} onChange={e=>setSearchClosing(e.target.value)} allowClear/>
                </div>

                <div style={{padding:'8px 14px',background:C.surf,borderBottom:`1px solid ${C.border}`,display:'flex',gap:12,flexWrap:'wrap',alignItems:'flex-end'}}>
                  <div>
                    <Text style={{fontSize:11,color:C.muted,display:'block'}}>दिनांक</Text>
                    <DatePicker value={rasidDate} onChange={d=>setRasidDate(d||dayjs())} format="DD/MM/YYYY" size="small" style={{width:130}}/>
                  </div>
                  <div style={{flex:1}}>
                    <Text style={{fontSize:11,color:C.muted,display:'block'}}>Note</Text>
                    <Input value={rasidNote} onChange={e=>setRasidNote(e.target.value)} placeholder="Optional note..." size="small"/>
                  </div>
                </div>

                <div style={{flex:1,overflowY:'auto',padding:'8px 12px'}}>
                  {filteredClosingMembers.length===0
                    ? <Empty description="No members" style={{marginTop:30}}/>
                    : <div style={{display:'flex',flexDirection:'column',gap:5}}>
                        {filteredClosingMembers.map((m,i) => {
                          const isSel = selClosingMembers.has(m.id);
                          return (
                            <div key={m.id} onClick={()=>toggleClosingMember(m.id)} style={{
                              display:'flex',alignItems:'center',gap:10,padding:'8px 12px',borderRadius:10,cursor:'pointer',
                              border:`1.5px solid ${isSel?C.pink:C.border}`,
                              background:isSel?`${C.pink}0e`:(i%2===0?'#fafafa':C.surf),
                              boxShadow:isSel?`0 0 0 2px ${C.pink}20`:undefined,
                              transition:'all .15s',
                            }}>
                              <Checkbox checked={isSel} onChange={()=>toggleClosingMember(m.id)} onClick={e=>e.stopPropagation()}/>
                              <Avatar size={32} src={m.photoURL} icon={!m.photoURL&&<UserOutlined/>}
                                style={{backgroundColor:C.blue,flexShrink:0,fontSize:12}}/>
                              <div style={{flex:1,minWidth:0}}>
                                <Text strong style={{fontSize:12,color:isSel?C.pink:C.fg}}>
                                  {m.displayName||'Unknown'}
                                  {m.fatherName&&<Text style={{fontWeight:400,color:C.muted,fontSize:11}}> / {m.fatherName}</Text>}
                                </Text>
                                <div>
                                  <Text style={{fontSize:11,color:C.muted}}>
                                    {m.registrationNumber}
                                    {(m.phone||m.phoneNo) ? ` · ${m.phone||m.phoneNo}` : ''}
                                  </Text>
                                </div>
                                <Text style={{fontSize:11,color:C.muted}}>
                                  {[m.village,m.city,m.state].filter(Boolean).join(', ')}
                                </Text>
                              </div>
                              {isSel && <CheckCircleOutlined style={{color:C.pink,fontSize:14,flexShrink:0}}/>}
                            </div>
                          );
                        })}
                      </div>
                  }
                </div>

                <div style={{padding:'10px 14px',background:C.surf,borderTop:`2px solid ${C.border}`,display:'flex',alignItems:'center',gap:10}}>
                  <Text style={{fontSize:12,color:C.muted,flex:1}}>
                    {selClosingMembers.size} / {selectedGroup.members.length} closing members selected
                  </Text>
                  <Button type="primary" icon={<RightOutlined/>} onClick={goToStep2}
                    disabled={!selClosingMembers.size}
                    style={{background:`linear-gradient(135deg,${C.red},${C.blue})`,border:'none',borderRadius:8,fontWeight:700}}>
                    Next: Agent Members
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ════ STEP 2 ════ */}
      {step===2 && (
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>

          <div style={{padding:'10px 16px',background:'#fffbeb',borderBottom:`1px solid #fde68a`,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <InfoCircleOutlined style={{color:C.amber,fontSize:14}}/>
            <Text style={{fontSize:12,color:'#78350f'}}>
              Sirf wo agent members dikh rahe hain jinke{' '}
              <b>paymentMemberIds</b> mein selected closing member hai.{' '}
              {ineligibleCount > 0 && (
                <span style={{color:C.orange}}>({ineligibleCount} members eligible nahi hain — skip honge)</span>
              )}
            </Text>
          </div>

          <div style={{padding:'6px 16px',background:'#f0fdf4',borderBottom:`1px solid #bbf7d0`}}>
            <Text style={{fontSize:11,color:'#166534',display:'block',marginBottom:3}}>
              <b>Rasid entries</b> (table mein ye rows hongi — {selClosingMembers.size} closing members):
            </Text>
            <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
              {selectedGroup?.members.filter(m=>selClosingMembers.has(m.id)).map(m=>(
                <Tag key={m.id} color="green" style={{fontSize:10}}>
                  {m.displayName?.split(' ')[0]} {m.fatherName?'/ '+m.fatherName.split(' ')[0]:''}
                </Tag>
              ))}
            </div>
          </div>

          <div style={{padding:'8px 16px',background:C.surf,borderBottom:`1px solid ${C.border}`,display:'flex',flexDirection:'column',gap:8}}>
            <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              <Checkbox
                indeterminate={selAgentMembers.size>0&&!allAgentChecked}
                checked={allAgentChecked}
                onChange={e=>selectAllAgent(e.target.checked)}
              >
                <Text strong style={{fontSize:12}}>
                  Agent Members — {agentFiltersActive ? 'दिख रहे' : 'सभी'} ({filteredAgentMembers.length})
                  {agentFiltersActive && (
                    <Text style={{fontSize:11,color:C.muted}}> / {eligibleAgentMembers.length}</Text>
                  )}
                </Text>
              </Checkbox>
              <Badge count={selAgentMembers.size} style={{backgroundColor:C.red}}/>
              <div style={{flex:1}}/>
              <Input placeholder="नाम / रजि. नं. / मोबाइल / गाँव खोजें..." size="small" style={{width:250}}
                prefix={<SearchOutlined style={{fontSize:11,color:C.pink}}/>}
                value={searchAgent} onChange={e=>setSearchAgent(e.target.value)} allowClear/>
            </div>

            {/* Yojna + active/inactive filters for the agent member list */}
            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              <Select
                size="small"
                style={{width:230}}
                value={agentProgramFilter}
                onChange={setAgentProgramFilter}
                options={agentProgramOptions}
                showSearch
                optionFilterProp="label"
                placeholder="योजना चुनें"
              />
              <Segmented
                size="small"
                value={agentStatusFilter}
                onChange={setAgentStatusFilter}
                options={[
                  { label: `सभी (${agentStatusCounts.all})`,        value: 'all' },
                  { label: `Active (${agentStatusCounts.active})`,   value: 'active' },
                  { label: `Inactive (${agentStatusCounts.inactive})`, value: 'inactive' },
                ]}
              />
              {agentFiltersActive && (
                <Button size="small" type="link" style={{fontSize:11,padding:0}}
                  onClick={()=>{ setAgentProgramFilter('all'); setAgentStatusFilter('all'); setSearchAgent(''); }}>
                  Clear filters
                </Button>
              )}
            </div>
          </div>

          <div style={{flex:1,overflowY:'auto',padding:'10px 16px'}}>
            {agentLoading ? (
              <div style={{textAlign:'center',padding:60}}><Spin size="large"/></div>
            ) : eligibleAgentMembers.length===0 ? (
              <div style={{textAlign:'center',padding:40}}>
                <ExclamationCircleOutlined style={{fontSize:36,color:C.amber,marginBottom:10,display:'block'}}/>
                <Text type="secondary" style={{fontSize:13}}>
                  Koi eligible agent member nahi mila.<br/>
                  <Text style={{fontSize:11}}>Selected closing members ki IDs kisi agent member ke paymentMemberIds mein nahi hain.</Text>
                </Text>
              </div>
            ) : filteredAgentMembers.length===0 ? (
              <div style={{textAlign:'center',padding:40}}>
                <SearchOutlined style={{fontSize:32,color:C.muted,marginBottom:10,display:'block'}}/>
                <Text type="secondary" style={{fontSize:13}}>
                  Is filter mein koi member nahi mila.<br/>
                  <Text style={{fontSize:11}}>{eligibleAgentMembers.length} eligible members hain — filter ya search change karo.</Text>
                </Text>
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:7}}>
                {filteredAgentMembers.map((m,i) => {
                  const isSel    = selAgentMembers.has(m.id);
                  const payAmt   = m.payAmount || 0;
                  const rasidAmt = selClosingMembers.size * payAmt;
                  const paid     = m.closing_paidAmount||0;
                  const total    = m.closing_totalAmount||0;
                  const pct      = total>0 ? Math.round((paid/total)*100) : 0;

                  return (
                    <div key={m.id} onClick={()=>toggleAgentMember(m.id)} style={{
                      display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:12,cursor:'pointer',
                      border:`1.5px solid ${isSel?C.pink:C.border}`,
                      background:isSel?`${C.pink}0e`:(i%2===0?'#fafafa':C.surf),
                      boxShadow:isSel?`0 0 0 2px ${C.pink}20`:undefined,
                      transition:'all .15s',
                    }}>
                      <Checkbox checked={isSel} onChange={()=>toggleAgentMember(m.id)} onClick={e=>e.stopPropagation()}/>
                      <Avatar size={38} src={m.photoURL} icon={!m.photoURL&&<UserOutlined/>}
                        style={{backgroundColor:C.blue,flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                          <Text strong style={{fontSize:13,color:isSel?C.pink:C.fg}}>{m.displayName}</Text>
                          {m.fatherName&&<Text style={{fontSize:11,color:C.muted}}>/ {m.fatherName}</Text>}
                          <Tag color="orange" style={{fontSize:10,margin:0}}>₹{payAmt}/closing</Tag>
                          <Tag color="geekblue" style={{fontSize:10,margin:0}}>{m.registrationNumber}</Tag>
                          {m.member_closed ? (
                            <Tag color="purple" style={{fontSize:10,margin:0}}>Closed</Tag>
                          ) : (
                            <Tag color={m.active_flag ? 'green' : 'red'} style={{fontSize:10,margin:0}}>
                              {m.active_flag ? 'Active' : 'Inactive'}
                            </Tag>
                          )}
                        </div>
                        <Text style={{fontSize:11,color:C.muted}}>
                          {m.phone}{m.village?` · ${m.village}`:''}
                          {m.city?`, ${m.city}`:''}
                          {m.programName ? ` · ${m.programName}` : ''}
                        </Text>
                        <div style={{display:'flex',alignItems:'center',gap:6,marginTop:3}}>
                          <div style={{height:3,width:100,background:'#f0f0f0',borderRadius:3,overflow:'hidden'}}>
                            <div style={{height:'100%',width:`${pct}%`,background:C.green,borderRadius:3}}/>
                          </div>
                          <Text style={{fontSize:10,color:C.muted}}>
                            pending: ₹{(m.closing_pendingAmount||0).toLocaleString()}
                          </Text>
                        </div>
                      </div>
                      <div style={{textAlign:'right',flexShrink:0,minWidth:90}}>
                        <div style={{fontSize:14,fontWeight:700,color:isSel?C.red:C.muted}}>
                          ₹{rasidAmt.toLocaleString()}
                        </div>
                        <Text style={{fontSize:10,color:C.muted}}>
                          {selClosingMembers.size} × ₹{payAmt}
                        </Text>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{padding:'10px 16px',background:C.surf,borderTop:`2px solid ${C.border}`,display:'flex',alignItems:'center',gap:10}}>
            <Text style={{fontSize:12,color:C.muted,flex:1}}>
              {selAgentMembers.size} members selected · {selClosingMembers.size} entries/rasid
            </Text>
            <Button onClick={()=>setStep(1)} icon={<LeftOutlined/>}>Back</Button>
            <Button type="primary" icon={<RightOutlined/>} onClick={goToStep3}
              disabled={!selAgentMembers.size}
              style={{background:`linear-gradient(135deg,${C.red},${C.blue})`,border:'none',borderRadius:8,fontWeight:700}}>
              Preview ({selAgentMembers.size} रसीद)
            </Button>
          </div>
        </div>
      )}

      {/* ════ STEP 3 ════ */}
      {step===3 && (
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{padding:'10px 16px',background:C.surf,borderBottom:`1px solid ${C.border}`,display:'flex',gap:12,flexWrap:'wrap'}}>
            {[
              {l:'Total रसीद',  v:previewList.length,                                            c:C.blue},
              {l:'Entries/रसीद',v:previewList[0]?.entries?.length||0,                            c:C.orange},
              {l:'Amount/रसीद', v:`₹${previewList[0]?.totalAmount?.toLocaleString()||0}`,        c:C.red},
              {l:'Grand Total', v:`₹${previewList.reduce((s,r)=>s+r.totalAmount,0).toLocaleString()}`, c:C.green},
            ].map(s=>(
              <div key={s.l} style={{background:'#fafafa',borderRadius:10,padding:'8px 16px',border:`1px solid ${C.border}`,minWidth:120}}>
                <div style={{fontSize:17,fontWeight:700,color:s.c}}>{s.v}</div>
                <div style={{fontSize:11,color:C.muted}}>{s.l}</div>
              </div>
            ))}
          </div>

          <div style={{flex:1,overflowY:'auto',padding:'12px 16px'}}>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {previewList.map((r,i)=>(
                <div key={i} style={{background:C.surf,borderRadius:12,overflow:'hidden',border:`1.5px solid ${C.border}`,boxShadow:'0 1px 6px rgba(0,0,0,.05)'}}>
                  <div style={{padding:'10px 14px',background:`linear-gradient(135deg,${C.red}0e,${C.blue}0a)`,borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:10}}>
                    <div style={{width:28,height:28,borderRadius:'50%',background:`linear-gradient(135deg,${C.red},${C.blue})`,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:12,fontWeight:700,flexShrink:0}}>{i+1}</div>
                    <div style={{flex:1}}>
                      <Text strong style={{fontSize:13,color:C.fg}}>{r.name}</Text>
                      <Text style={{fontSize:11,color:C.muted,marginLeft:8}}>{r.phone}</Text>
                    </div>
                    <Tag color="volcano" style={{fontWeight:700,fontSize:12}}>₹{r.totalAmount.toLocaleString()}</Tag>
                    <Tag color="blue" style={{fontSize:11}}>{r.group}</Tag>
                  </div>
                  <div style={{padding:'8px 14px'}}>
                    <Text style={{fontSize:11,color:C.muted,display:'block',marginBottom:4}}>
                      {r.entries.length} entries → <Text strong style={{color:C.blue}}>{r.totalInWords}</Text>
                    </Text>
                    <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                      {r.entries.slice(0,10).map((e,j)=>(
                        <Tag key={j} style={{fontSize:10}}>{e.name.split('/')[0]?.trim().split(' ')[0]} {e.mobile?'·'+e.mobile:''}</Tag>
                      ))}
                      {r.entries.length>10&&<Tag color="default" style={{fontSize:10}}>+{r.entries.length-10} more</Tag>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{padding:'10px 16px',background:C.surf,borderTop:`2px solid ${C.border}`,display:'flex',justifyContent:'flex-end',gap:10}}>
            <Button icon={<LeftOutlined/>} onClick={()=>setStep(2)}>Back</Button>
            <Button icon={<FileTextOutlined/>} onClick={() => {
              const html = buildSummaryHTML();
              if (html) openHtmlWindow(html);
              else message.warning('No data for summary');
            }}
              style={{borderColor:C.green,color:C.green,borderRadius:8,fontWeight:600,height:38,paddingInline:20}}>
              📄 Summary PDF
            </Button>
            <Button type="primary" icon={<FilePdfOutlined/>} onClick={()=>openPrintWindow(previewList)}
              style={{background:`linear-gradient(135deg,${C.red},${C.blue})`,border:'none',borderRadius:8,fontWeight:700,height:38,paddingInline:24}}>
              🖨 Print / Save PDF
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
};

export default RasidGroupClosingDrawer;