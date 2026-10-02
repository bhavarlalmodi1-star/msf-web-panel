import NotoSansDevanagari from '@/app/api/helper/static/font/NotoSansDevanagari';
import NotoSansDevanagariBold from '@/app/api/helper/static/font/NotoSansDevanagariBold';
import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import React from 'react';
import { getTrust } from '@/utils/trust/trustStore';
import { DEFAULT_PDF_PRIMARY, DEFAULT_PDF_ACCENT } from '@/utils/trust/theme';
import dayjs from 'dayjs';

Font.register({
  family: 'NotoSansDevanagari',
  fonts: [
    { src: NotoSansDevanagari, fontWeight: 'normal' },
    { src: NotoSansDevanagariBold, fontWeight: 'bold' },
  ],
});

let RED    = DEFAULT_PDF_ACCENT;    // accent  (Settings → Trust Details → Colours)
let BLUE   = DEFAULT_PDF_PRIMARY;  // primary (Settings → Trust Details → Colours)
const BLACK  = '#111';
const BORDER = '#c8c8c8';

// ── Shared cell base (applied to every column cell) ──────────────────────────
// Each column adds its own width / flex and borderRightWidth for the separator.
const CELL_BASE = {
  paddingHorizontal: 4,
  paddingVertical:   4,
  justifyContent:    'center',
  borderRightWidth:  0.5,
  borderRightColor:  '#d0d0d0',
};
// Last column in a row has no right border
const CELL_LAST = { ...CELL_BASE, borderRightWidth: 0 };

const buildStyles = () => StyleSheet.create({
  // Margin on the page itself and no wrapper View, so long tables continue on
  // the next sheet with a proper margin instead of being squeezed together.
  page:        { backgroundColor: '#fff', fontFamily: 'NotoSansDevanagari', paddingTop: 14, paddingHorizontal: 14, paddingBottom: 22 },
  watermark:   { position: 'absolute', top: '30%', left: '20%', width: '60%', opacity: 0.06 },
  pageNo: { position: 'absolute', bottom: 8, right: 14, fontSize: 7, color: '#888' },

  // ── Page header ────────────────────────────────────────────────────────────
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  logoBox:     { width: 60, alignItems: 'center' },
  logoImg:     { width: 52, height: 48, borderRadius: 3, objectFit: 'contain' },
  centerBlock: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
  mainTitle:   { fontSize: 16, color: BLUE, fontWeight: 'bold', textAlign: 'center', marginBottom: 1 },
  subTitle:    { fontSize: 12, color: BLUE, fontWeight: 'bold', textAlign: 'center', marginBottom: 2 },
  addrText:    { fontSize: 7, color: BLACK, textAlign: 'center' },
  contactLine: { fontSize: 7.5, fontWeight: 'bold', color: BLUE, textAlign: 'center' },
  regBar:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: BLUE, marginBottom: 4 },
  regText:     { fontSize: 9, fontWeight: 'bold', color: BLUE },

  // ── Badge / title ──────────────────────────────────────────────────────────
  badgeWrap:   { alignItems: 'center', marginVertical: 6 },
  badge:       { borderWidth: 1.5, borderColor: RED, borderRadius: 4, paddingHorizontal: 20, paddingVertical: 3 },
  badgeText:   { fontSize: 12, fontWeight: 'bold', color: RED, textAlign: 'center' },

  // ── Member info ────────────────────────────────────────────────────────────
  infoRow:     { flexDirection: 'row', marginBottom: 3, alignItems: 'center' },
  infoLabel:   { fontSize: 10, fontWeight: 'bold', color: RED },
  infoValue:   { fontSize: 10, color: BLACK },
  infoRight:   { flex: 1, alignItems: 'flex-end' },

  // ── Section headings ───────────────────────────────────────────────────────
  sectionTitle: {
    fontSize: 9, fontWeight: 'bold', color: '#fff',
    backgroundColor: BLUE,
    paddingVertical: 3, paddingHorizontal: 6,
    marginTop: 8, marginBottom: 0,
  },

  // ── Summary cards ──────────────────────────────────────────────────────────
  summaryGrid: { flexDirection: 'row', gap: 4, marginBottom: 4, marginTop: 4 },
  summaryCard: { flex: 1, backgroundColor: '#f0f4ff', padding: 5, alignItems: 'center', borderRadius: 3, borderWidth: 0.5, borderColor: '#c8d4f0' },
  summaryVal:  { fontSize: 13, fontWeight: 'bold' },
  summaryLbl:  { fontSize: 7, color: '#555', marginTop: 1 },

  // ── Table shell ────────────────────────────────────────────────────────────
  table:       { borderWidth: 1, borderColor: BORDER },

  // ── Header row ─────────────────────────────────────────────────────────────
  thRow:       { flexDirection: 'row', backgroundColor: BLUE },

  // ── Data rows ─────────────────────────────────────────────────────────────
  trEven:      { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#e0e0e0', backgroundColor: '#fff' },
  trOdd:       { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#e0e0e0', backgroundColor: '#f4f7ff' },

  // ── Text styles ────────────────────────────────────────────────────────────
  thTxt:       { fontSize: 7.5, fontWeight: 'bold', color: '#fff', textAlign: 'center' },
  thTxtL:      { fontSize: 7.5, fontWeight: 'bold', color: '#fff', textAlign: 'left' },
  tdTxt:       { fontSize: 7.5, color: BLACK, textAlign: 'center' },
  tdTxtL:      { fontSize: 7.5, color: BLACK, textAlign: 'left' },
  tdTxtSm:     { fontSize: 6.5, color: '#333', textAlign: 'left' },  // long IDs

  // ── Closing entry cards ────────────────────────────────────────────────────
  entryCard:   { marginBottom: 4, borderWidth: 0.5, borderColor: BORDER, borderRadius: 2 },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#f0f0f0', paddingHorizontal: 5, paddingVertical: 3 },

  // ── Footer ─────────────────────────────────────────────────────────────────
  footer:      { borderTopWidth: 1, borderTopColor: RED, paddingTop: 4, marginTop: 8, alignItems: 'center' },
  footerText:  { fontSize: 8, fontWeight: 'bold', color: RED, textAlign: 'center' },
});

// Styles are built by a function so the two brand colours can change.
let styles = buildStyles();
let pdfColorKey = '';

// PDF colours come from Settings → Trust Details → Colours.
const applyPdfColors = (trust) => {
  const key = `${trust.pdfColorPrimary}|${trust.pdfColorAccent}`;
  if (key === pdfColorKey) return;
  pdfColorKey = key;
  BLUE = trust.pdfColorPrimary;
  RED = trust.pdfColorAccent;
  styles = buildStyles();
};

const fmtDate = (d) => d ? (dayjs(d).isValid() ? dayjs(d).format('DD/MM/YY') : d) : '—';

// ── Column width constants ────────────────────────────────────────────────────
// A4 usable width = 595 − 28(padding) = 567pt

// Join Fee table  (#20 + Type58 + Amt54 + Mode44 + Date52 + TxID flex + Status46)
const JF = { no: 20, type: 58, amt: 54, mode: 44, date: 52, status: 46 };

// Closing txn table  (#20 + Amt54 + Mode44 + Date52 + TxID flex + Note62)
const CL = { no: 20, amt: 54, mode: 44, date: 52, note: 62 };

// Closing entry sub-table  (#20 + Name flex + RegNo68 + Village52)
const CE = { no: 20, regNo: 68, village: 52 };


const PayPage = ({ member, transactions, closingTransactions, closingEntries }) => {
  const trust = getTrust();
  applyPdfColors(trust);
  return (
  <Page size="A4" style={styles.page}>
      {/* fixed → repeats on every sheet */}
      <Image src={trust.logoSrc} style={styles.watermark} fixed />

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.logoBox}><Image src={trust.logoSrc} style={styles.logoImg} /></View>
        <View style={styles.centerBlock}>
          <Text style={styles.mainTitle}>{trust.name}</Text>
          <Text style={styles.subTitle}>{trust.cityLine}</Text>
          <Text style={styles.addrText}>{trust.addressShort}</Text>
          <Text style={styles.contactLine}>अध्यक्ष : {trust.presidentPhone} | ऑफिस : {trust.officePhone}</Text>
        </View>
        <View style={styles.logoBox}><Image src={trust.rightImageSrc} style={styles.logoImg} /></View>
      </View>
      <View style={styles.regBar}>
        <Text style={styles.regText}>{trust.sinceText}</Text>
        <Text style={styles.regText}>{trust.regText}</Text>
      </View>

      {/* ── Badge ─────────────────────────────────────────────────────────── */}
      <View style={styles.badgeWrap}>
        <View style={styles.badge}><Text style={styles.badgeText}>भुगतान विवरण</Text></View>
      </View>

      {/* ── Member info ───────────────────────────────────────────────────── */}
      <View style={styles.infoRow}>
        <Text><Text style={styles.infoLabel}>नाम : </Text><Text style={styles.infoValue}>{member.displayName} {member.fatherName}</Text></Text>
      </View>
      <View style={styles.infoRow}>
        <Text><Text style={styles.infoLabel}>पंजीयन क्र. : </Text><Text style={styles.infoValue}>{member.registrationNumber}</Text></Text>
        <View style={styles.infoRight}><Text><Text style={styles.infoLabel}>फोन : </Text><Text style={styles.infoValue}>{member.phone}</Text></Text></View>
      </View>
      <View style={styles.infoRow}>
        <Text><Text style={styles.infoLabel}>योजना : </Text><Text style={styles.infoValue}>{member.programName || '—'}</Text></Text>
      </View>

      {/* ── Join Fee Summary ──────────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Join Fee Summary</Text>
      <View style={styles.summaryGrid}>
        {[
          { label: 'Total Fees', value: `₹${(member.joinFees||0).toLocaleString()}`,      color: BLUE },
          { label: 'Paid',       value: `₹${(member.paidAmount||0).toLocaleString()}`,    color: '#16a34a' },
          { label: 'Pending',    value: `₹${(member.pendingAmount||0).toLocaleString()}`, color: (member.pendingAmount||0) > 0 ? RED : '#16a34a' },
        ].map((s, i) => (
          <View key={i} style={styles.summaryCard}>
            <Text style={[styles.summaryVal, { color: s.color }]}>{s.value}</Text>
            <Text style={styles.summaryLbl}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* ── Closing Summary ───────────────────────────────────────────────── */}
      {(member.closing_totalAmount||0) > 0 && (
        <>
          <Text style={styles.sectionTitle}>Closing Summary</Text>
          <View style={styles.summaryGrid}>
            {[
              { label: 'Total',  value: `₹${(member.closing_totalAmount||0).toLocaleString()}`,  color: '#7c3aed' },
              { label: 'Paid',   value: `₹${(member.closing_paidAmount||0).toLocaleString()}`,   color: '#16a34a' },
              { label: 'Pending',value: `₹${(member.closing_pendingAmount||0).toLocaleString()}`,color: (member.closing_pendingAmount||0) > 0 ? RED : '#16a34a' },
              { label: 'Events', value: `${member.paidClosingCount||0}/${member.totalClosingCount||0}`, color: BLUE },
            ].map((s, i) => (
              <View key={i} style={styles.summaryCard}>
                <Text style={[styles.summaryVal, { color: s.color }]}>{s.value}</Text>
                <Text style={styles.summaryLbl}>{s.label}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* ── Closing Entries ───────────────────────────────────────────────── */}
      {closingEntries.length > 0 && (
        <>
          <Text style={styles.sectionTitle} minPresenceAhead={50}>Closing Entries</Text>
          {closingEntries.map((entry, ei) => (
            <View key={ei} style={[styles.entryCard, { marginTop: 4 }]}>
              <View style={styles.entryHeader} minPresenceAhead={40}>
                <Text style={{ fontSize: 8, fontWeight: 'bold', color: entry.status === 'paid' ? '#16a34a' : RED }}>
                  {entry.status === 'paid' ? '✓ PAID' : '⏳ PENDING'}  —  ₹{(entry.totalAmount||0).toLocaleString()}  ({entry.closingCount||0} members)
                </Text>
                <Text style={{ fontSize: 7, color: '#555' }}>{entry.closingGroupName || entry.closingGroupId?.slice(-6) || ''}</Text>
              </View>
              <View style={styles.table}>
                {/* Sub-table header */}
                <View style={styles.thRow} wrap={false} minPresenceAhead={20}>
                  <View style={{ ...CELL_BASE, width: CE.no,    alignItems: 'center' }}><Text style={styles.thTxt}>#</Text></View>
                  <View style={{ ...CELL_BASE, flex: 1 }}><Text style={styles.thTxtL}>Name</Text></View>
                  <View style={{ ...CELL_BASE, width: CE.regNo, alignItems: 'center' }}><Text style={styles.thTxt}>Reg No</Text></View>
                  <View style={{ ...CELL_LAST, width: CE.village,alignItems: 'center'}}><Text style={styles.thTxt}>Village</Text></View>
                </View>
                {(entry.closingDetails || []).map((d, di) => (
                  <View key={di} style={di % 2 === 0 ? styles.trEven : styles.trOdd} wrap={false}>
                    <View style={{ ...CELL_BASE, width: CE.no,     alignItems: 'center' }}><Text style={styles.tdTxt}>{di + 1}</Text></View>
                    <View style={{ ...CELL_BASE, flex: 1 }}><Text style={styles.tdTxtL}>{d.closed_memberName}</Text></View>
                    <View style={{ ...CELL_BASE, width: CE.regNo,  alignItems: 'center' }}><Text style={[styles.tdTxtSm, { textAlign: 'center' }]}>{d.closed_registrationNumber || entry.closing_registrationNumber || '—'}</Text></View>
                    <View style={{ ...CELL_LAST, width: CE.village,alignItems: 'center'}}><Text style={styles.tdTxt}>{d.closed_village || '—'}</Text></View>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </>
      )}

      {/* ── Join Fee Transactions ─────────────────────────────────────────── */}
      {transactions.length > 0 && (
        <>
          <Text style={styles.sectionTitle} minPresenceAhead={50}>Join Fee Transactions</Text>
          <View style={styles.table}>
            {/* Header */}
            <View style={styles.thRow} wrap={false} minPresenceAhead={20}>
              <View style={{ ...CELL_BASE, width: JF.no,     alignItems: 'center' }}><Text style={styles.thTxt}>#</Text></View>
              <View style={{ ...CELL_BASE, width: JF.type }}><Text style={styles.thTxtL}>Type</Text></View>
              <View style={{ ...CELL_BASE, width: JF.amt,    alignItems: 'center' }}><Text style={styles.thTxt}>Amount</Text></View>
              <View style={{ ...CELL_BASE, width: JF.mode,   alignItems: 'center' }}><Text style={styles.thTxt}>Mode</Text></View>
              <View style={{ ...CELL_BASE, width: JF.date,   alignItems: 'center' }}><Text style={styles.thTxt}>Date</Text></View>
              <View style={{ ...CELL_BASE, flex: 1 }}><Text style={styles.thTxtL}>UTR / Cash ID</Text></View>
              <View style={{ ...CELL_LAST, width: JF.status, alignItems: 'center' }}><Text style={styles.thTxt}>Status</Text></View>
            </View>
            {/* Rows */}
            {transactions.map((t, i) => (
              <View key={i} style={i % 2 === 0 ? styles.trEven : styles.trOdd} wrap={false}>
                <View style={{ ...CELL_BASE, width: JF.no,     alignItems: 'center' }}><Text style={styles.tdTxt}>{i + 1}</Text></View>
                <View style={{ ...CELL_BASE, width: JF.type }}>
                  <Text style={styles.tdTxtL}>{t.transactionType === 'join_fee' ? 'Join Fee' : 'Additional'}</Text>
                </View>
                <View style={{ ...CELL_BASE, width: JF.amt,    alignItems: 'center' }}>
                  <Text style={[styles.tdTxt, { color: '#16a34a', fontWeight: 'bold' }]}>₹{(t.amount||0).toLocaleString()}</Text>
                </View>
                <View style={{ ...CELL_BASE, width: JF.mode,   alignItems: 'center' }}>
                  <Text style={styles.tdTxt}>{t.paymentMode || '—'}</Text>
                </View>
                <View style={{ ...CELL_BASE, width: JF.date,   alignItems: 'center' }}>
                  <Text style={styles.tdTxt}>{fmtDate(t.transactionDate || t.date)}</Text>
                </View>
                <View style={{ ...CELL_BASE, flex: 1 }}>
                  <Text style={styles.tdTxtSm}>{t.transactionId || '—'}</Text>
                </View>
                <View style={{ ...CELL_LAST, width: JF.status, alignItems: 'center' }}>
                  <Text style={[styles.tdTxt, { color: t.status === 'completed' ? '#16a34a' : '#ea580c', fontWeight: 'bold' }]}>
                    {t.status === 'completed' ? 'Paid' : 'Pending'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {/* ── Closing Payment Transactions ──────────────────────────────────── */}
      {closingTransactions.length > 0 && (
        <>
          <Text style={styles.sectionTitle} minPresenceAhead={50}>Closing Payment Transactions</Text>
          <View style={styles.table}>
            {/* Header */}
            <View style={styles.thRow} wrap={false} minPresenceAhead={20}>
              <View style={{ ...CELL_BASE, width: CL.no,   alignItems: 'center' }}><Text style={styles.thTxt}>#</Text></View>
              <View style={{ ...CELL_BASE, width: CL.amt,  alignItems: 'center' }}><Text style={styles.thTxt}>Amount</Text></View>
              <View style={{ ...CELL_BASE, width: CL.mode, alignItems: 'center' }}><Text style={styles.thTxt}>Mode</Text></View>
              <View style={{ ...CELL_BASE, width: CL.date, alignItems: 'center' }}><Text style={styles.thTxt}>Date</Text></View>
              <View style={{ ...CELL_BASE, flex: 1 }}><Text style={styles.thTxtL}>UTR / Cash ID</Text></View>
              <View style={{ ...CELL_LAST, width: CL.note }}><Text style={styles.thTxtL}>Note</Text></View>
            </View>
            {/* Rows */}
            {closingTransactions.map((t, i) => (
              <View key={i} style={i % 2 === 0 ? styles.trEven : styles.trOdd} wrap={false}>
                <View style={{ ...CELL_BASE, width: CL.no,   alignItems: 'center' }}><Text style={styles.tdTxt}>{i + 1}</Text></View>
                <View style={{ ...CELL_BASE, width: CL.amt,  alignItems: 'center' }}>
                  <Text style={[styles.tdTxt, { color: '#7c3aed', fontWeight: 'bold' }]}>₹{(t.amount||t.amountPaid||0).toLocaleString()}</Text>
                </View>
                <View style={{ ...CELL_BASE, width: CL.mode, alignItems: 'center' }}>
                  <Text style={styles.tdTxt}>{t.paymentMode || '—'}</Text>
                </View>
                <View style={{ ...CELL_BASE, width: CL.date, alignItems: 'center' }}>
                  <Text style={styles.tdTxt}>{fmtDate(t.transactionDate || t.date)}</Text>
                </View>
                <View style={{ ...CELL_BASE, flex: 1 }}>
                  <Text style={styles.tdTxtSm}>{t.transactionId || '—'}</Text>
                </View>
                <View style={{ ...CELL_LAST, width: CL.note }}>
                  <Text style={styles.tdTxtL}>{t.paymentNote || '—'}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <View style={styles.footer} wrap={false}>
        <Text style={styles.footerText}>संपर्क सूत्र : {trust.contactNumbers}</Text>
      </View>
    <Text
      style={styles.pageNo} fixed
      render={({ pageNumber, totalPages }) => (totalPages > 1 ? `पृष्ठ ${pageNumber} / ${totalPages}` : '')}
    />
  </Page>
  );
};

const PaymentDetailsPdf = ({ member, transactions, closingTransactions, closingEntries }) => (
  <Document>
    <PayPage
      member={member}
      transactions={transactions}
      closingTransactions={closingTransactions}
      closingEntries={closingEntries}
    />
  </Document>
);

export default PaymentDetailsPdf;
