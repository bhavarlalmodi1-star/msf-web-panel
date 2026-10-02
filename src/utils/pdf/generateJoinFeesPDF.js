// utils/pdf/generateJoinFeesPDF.ts
// ─── Standalone export — import from anywhere ────────────────────────────────
// Usage:
//   import { generateJoinFeesPDF } from '@/utils/pdf/generateJoinFeesPDF'
//   generateJoinFeesPDF(members, agent, 'All Members')
//
// members[] fields used:
//   displayName, registrationNumber, phone,
//   programName / programNames,
//   ageGroupName, dateJoin,
//   joinFees, paidAmount, pendingAmount,
//   delete_flag, isDeleted
//
// agent fields used:
//   name, phone1, village, city, caste
// ─────────────────────────────────────────────────────────────────────────────

import { trustHtml } from '@/utils/trust/trustStore';
import dayjs from 'dayjs';

export const generateJoinFeesPDF = (
  members,
  agent,
  filterLabel = 'All Members'
) => {
  const win = window.open('', '_blank');
  if (!win) { alert('Popup blocked — please allow popups'); return; }

  const active = members.filter(m => !m.delete_flag && !m.isDeleted);

  const totalJoinFees = active.reduce((s, m) => s + (m.joinFees     || 0), 0);
  const totalPaid     = active.reduce((s, m) => s + (m.paidAmount   || 0), 0);
  const totalPending  = active.reduce((s, m) => s + (m.pendingAmount || 0), 0);
  const fullyPaid     = active.filter(m => (m.pendingAmount || 0) === 0 && (m.paidAmount || 0) > 0).length;
  const withPending   = active.filter(m => (m.pendingAmount || 0) > 0).length;
  const collRate      = totalJoinFees > 0 ? Math.round((totalPaid / totalJoinFees) * 100) : 0;

  const rows = active.map((m, i) => {
    const pct = m.joinFees > 0 ? Math.round(((m.paidAmount || 0) / m.joinFees) * 100) : 0;
    const statusBg    = pct === 100 ? '#dcfce7' : pct > 0 ? '#fef3c7' : '#fee2e2';
    const statusColor = pct === 100 ? '#16a34a' : pct > 0 ? '#92400e' : '#dc2626';
    const statusLabel = pct === 100 ? 'Paid'    : pct > 0 ? 'Partial' : 'Pending';
    const progWidth   = pct;
    const barColor    = pct === 100 ? '#16a34a' : '#db2777';

    return `<tr style="background:${i % 2 === 0 ? '#fff' : '#fdf2f8'}">
      <td>${i + 1}</td>
      <td>
        <strong>${m.displayName || '—'}</strong><br>
        <small style="color:#888">${m.registrationNumber || ''}</small>
      </td>
      <td>${m.phone || '—'}</td>
      <td>${m.programName || m.programNames || '—'}</td>
      <td>${m.ageGroupName || '—'}</td>
      <td>${m.dateJoin || '—'}</td>
      <td style="text-align:right">₹${(m.joinFees || 0).toLocaleString()}</td>
      <td style="text-align:right;color:#16a34a">₹${(m.paidAmount || 0).toLocaleString()}</td>
      <td style="text-align:right;color:#dc2626">₹${(m.pendingAmount || 0).toLocaleString()}</td>
   
      <td style="text-align:center">
        <span style="padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:${statusBg};color:${statusColor}">
          ${statusLabel}
        </span>
      </td>
    </tr>`;
  }).join('');

  const agentName     = agent?.name     || '—';
  const agentPhone    = agent?.phone1   || '—';
  const agentLocation = (agent?.village || '') + (agent?.city ? ', ' + agent.city : '');
  const agentCaste    = agent?.caste    || '—';
  const generated     = dayjs().format('DD MMM YYYY, hh:mm A');

  win.document.write(`<!DOCTYPE html><html><head>
  <meta charset="utf-8">
  <title>Join Fees Report — ${agentName}</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;700&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Noto Sans Devanagari','Segoe UI',sans-serif;font-size:13px;color:#1a1a1a;background:#fff}

    /* ── toolbar ── */
    .no-print{padding:10px 24px;background:#fff;border-bottom:1px solid #eee;display:flex;gap:10px;align-items:center}

    /* ── org header ── */
    .org-header{padding:8px 16px 0;border-bottom:2px solid ${trustHtml().pdfColorPrimary}}
    .blessing-row{display:flex;justify-content:space-between;margin-bottom:5px}
    .blessing-row span{font-size:8.5px;color:${trustHtml().pdfColorAccent};font-weight:700}
    .header-body{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
    .logo-box{width:68px;display:flex;align-items:center;justify-content:center}
    .logo-box img{width:60px;height:55px;border-radius:4px;object-fit:contain}
    .logo-fallback{width:60px;height:55px;border-radius:4px;background:#E8EFF7;border:1px solid #b5c5d8;
      display:flex;align-items:center;justify-content:center;font-size:9px;
      color:${trustHtml().pdfColorPrimary};font-weight:700;text-align:center;line-height:1.3}
    .center-block{flex:1;text-align:center;padding:0 8px}
    .main-title{font-size:16px;font-weight:700;color:${trustHtml().pdfColorPrimary};margin-bottom:1px}
    .sub-title{font-size:12px;font-weight:700;color:${trustHtml().pdfColorPrimary};margin-bottom:3px}
    .addr-line{font-size:7.5px;color:#000;margin-bottom:1px;line-height:1.5}
    .contact-line{font-size:7.5px;color:#000;line-height:1.6}
    .contact-line b{font-weight:700}
    .contact-line span{color:${trustHtml().pdfColorPrimary};font-weight:700}
    .since-reg-row{display:flex;justify-content:space-between;padding:3px 2px;
      border-top:1px solid ${trustHtml().pdfColorPrimary};margin-top:3px}
    .since-reg-row span{font-size:9px;font-weight:700;color:${trustHtml().pdfColorPrimary}}

    /* ── report bar ── */
    .report-bar{background:${trustHtml().pdfColorPrimary};color:#fff;padding:8px 24px;
      display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px}
    .report-bar h2{font-size:13px;font-weight:700}
    .report-bar p{font-size:11px;opacity:0.85}

    /* ── meta ── */
    .meta{display:flex;gap:24px;padding:12px 24px;background:#fff8f5;
      border-bottom:1px solid #fde2d8;flex-wrap:wrap}
    .meta-item{display:flex;flex-direction:column}
    .meta-item label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px}
    .meta-item value{font-size:13px;font-weight:700;color:#3e1f1a}

    /* ── stats ── */
    .stats{display:flex;gap:12px;padding:12px 24px;background:#fdf2f8;flex-wrap:wrap}
    .stat{flex:1;min-width:100px;background:#fff;border-radius:10px;
      padding:10px 14px;border:1px solid #fde2d8}
    .stat .val{font-size:17px;font-weight:700}
    .stat .lbl{font-size:11px;color:#888;margin-top:2px}

    /* ── table ── */
    .table-wrap{padding:16px 24px}
    table{width:100%;border-collapse:collapse}
    th{background:${trustHtml().pdfColorPrimary};color:#fff;padding:9px 8px;font-size:11px;text-align:left}
    td{padding:7px 8px;font-size:11px;border-bottom:1px solid #fde2d8;vertical-align:middle}

    /* ── footer ── */
    .doc-footer{padding:10px 24px;border-top:2px solid ${trustHtml().pdfColorAccent};
      display:flex;justify-content:space-between;align-items:center;margin-top:4px}
    .doc-footer-center{flex:1;text-align:center}
    .doc-footer-contact{font-size:9px;font-weight:700;color:${trustHtml().pdfColorAccent};margin-bottom:2px}
    .doc-footer-sub{font-size:9px;font-weight:700;color:${trustHtml().pdfColorPrimary}}
    .doc-footer-eoe{font-size:10px;font-weight:700;color:#000;width:50px;text-align:right}

    @media print {
      body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .no-print{display:none}
      /* The footer is a rule plus two centred lines. Without this the browser
         is free to break between them, leaving "Exclusive jurisdiction…"
         alone on an otherwise-empty last sheet. */
      .doc-footer{page-break-inside:avoid;break-inside:avoid}
      tr{page-break-inside:avoid;break-inside:avoid}
      thead{display:table-header-group}
    }
  </style>
  </head><body>

  <!-- toolbar -->
  <div class="no-print">
    <button onclick="window.print()"
      style="background:${trustHtml().pdfColorAccent};color:#fff;border:none;padding:8px 20px;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px">
      🖨️ Print / Save as PDF
    </button>
    <button onclick="window.close()"
      style="background:#f5f5f5;border:1px solid #ddd;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px">
      Close
    </button>
    <span style="font-size:12px;color:#888;margin-left:12px">
      Join Fees Report — ${agentName}
    </span>
  </div>

  <!-- org header -->
  <div class="org-header">
    <div class="blessing-row">
      ${trustHtml().blessingsHtml}
    </div>
    <div class="header-body">
      <div class="logo-box">
        <img src="${trustHtml().logoSrc}"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" alt="Logo"/>
        <div class="logo-fallback" style="display:none">${trustHtml().logoFallbackHtml}</div>
      </div>
      <div class="center-block">
        <div class="main-title">${trustHtml().name}</div>
        <div class="sub-title">${trustHtml().cityLine}</div>
        <div class="addr-line">
          <b>हेड ऑफिस : </b>${trustHtml().addressWithOffice}
        </div>
        <div class="contact-line">
          <b>संपर्क सूत्र : </b><span>${trustHtml().presidentName}</span>
        </div>
        <div class="contact-line">
          <span>${trustHtml().presidentPhone}</span>&nbsp;&nbsp;<b>ऑफिस : </b><span>${trustHtml().officePhone}</span>
        </div>
      </div>
      <div class="logo-box">
        <img src="${trustHtml().rightImageSrc}"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" alt="Shanidev"/>
        <div class="logo-fallback" style="display:none;background:#f5ece0;border-color:#c9a87a;color:#7a4a1e;">
          शनि<br>देव
        </div>
      </div>
    </div>
    <div class="since-reg-row">
      <span>${trustHtml().sinceText}</span>
      <span>${trustHtml().regText}</span>
    </div>
  </div>

  <!-- report title bar -->
  <div class="report-bar">
    <h2>Join Fees Report — ${filterLabel}</h2>
    <p>Agent: ${agentName} &nbsp;|&nbsp; Generated: ${generated}</p>
  </div>

  <!-- agent meta -->
  <div class="meta">
    <div class="meta-item"><label>Agent Name</label><value>${agentName}</value></div>
    <div class="meta-item"><label>Phone</label><value>${agentPhone}</value></div>
    <div class="meta-item"><label>Location</label><value>${agentLocation}</value></div>
    <div class="meta-item"><label>Caste</label><value>${agentCaste}</value></div>
    <div class="meta-item"><label>Total Members</label><value>${active.length}</value></div>
  </div>

  <!-- summary stats -->
  <div class="stats">
    <div class="stat">
      <div class="val" style="color:${trustHtml().pdfColorPrimary}">₹${totalJoinFees.toLocaleString()}</div>
      <div class="lbl">Total Join Fees</div>
    </div>
    <div class="stat">
      <div class="val" style="color:#16a34a">₹${totalPaid.toLocaleString()}</div>
      <div class="lbl">Collected</div>
    </div>
    <div class="stat">
      <div class="val" style="color:#dc2626">₹${totalPending.toLocaleString()}</div>
      <div class="lbl">Pending</div>
    </div>
    <div class="stat">
      <div class="val" style="color:#16a34a">${fullyPaid}</div>
      <div class="lbl">Fully Paid</div>
    </div>
    <div class="stat">
      <div class="val" style="color:#f59e0b">${withPending}</div>
      <div class="lbl">With Pending</div>
    </div>
    <div class="stat">
      <div class="val" style="color:#db2777">${collRate}%</div>
      <div class="lbl">Collection Rate</div>
    </div>
  </div>

  <!-- members table -->
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Member</th>
          <th>Phone</th>
          <th>Program</th>
          <th>Age Group</th>
          <th>Join Date</th>
          <th style="text-align:right">Join Fees</th>
          <th style="text-align:right">Paid</th>
          <th style="text-align:right">Pending</th>
          <th style="text-align:center">Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="background:${trustHtml().pdfColorPrimary};color:#fff;font-weight:700">
          <td colspan="6">TOTAL (${active.length} members)</td>
          <td style="text-align:right">₹${totalJoinFees.toLocaleString()}</td>
          <td style="text-align:right">₹${totalPaid.toLocaleString()}</td>
          <td style="text-align:right">₹${totalPending.toLocaleString()}</td>
          <td style="text-align:center">${collRate}%</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- doc footer -->
  <div class="doc-footer">
    <div style="width:50px"></div>
    <div class="doc-footer-center">
      <div class="doc-footer-contact">
        संपर्क सूत्र : ${trustHtml().contactNumbers}
      </div>
      <div class="doc-footer-sub">${trustHtml().jurisdiction}</div>
    </div>
    <div class="doc-footer-eoe">E. &amp; O.E.</div>
  </div>

  </body></html>`);
  win.document.close();
};