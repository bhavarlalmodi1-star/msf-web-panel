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

let RED  = DEFAULT_PDF_ACCENT;    // accent  (Settings → Trust Details → Colours)
let BLUE = DEFAULT_PDF_PRIMARY;  // primary (Settings → Trust Details → Colours)
const BORDER = '#bbb';

const buildStyles = () => StyleSheet.create({
  page: { backgroundColor: '#fff', fontFamily: 'NotoSansDevanagari' },
  outerView: { width: '100%', flexDirection: 'column', padding: 14 },
  watermark: { position: 'absolute', top: '30%', left: '20%', width: '60%', opacity: 0.06, zIndex: 0 },

  topText: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, paddingHorizontal: 4 },
  smallText: { fontSize: 8.5, color: RED, fontWeight: 'bold' },

  headerSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  imageBox: { width: 60, alignItems: 'center' },
  logoImage: { width: 52, height: 48, borderRadius: 3, objectFit: 'contain' },
  centerContent: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
  mainTitle: { fontSize: 16, color: BLUE, fontWeight: 'bold', textAlign: 'center', marginBottom: 1 },
  subTitle: { fontSize: 12, color: BLUE, fontWeight: 'bold', textAlign: 'center', marginBottom: 2 },
  addrLine: { fontSize: 7, color: '#000', textAlign: 'center' },
  contactLine: { fontSize: 7.5, fontWeight: 'bold', color: BLUE, textAlign: 'center', marginTop: 1 },

  sinceRegRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: BLUE, marginBottom: 4 },
  sinceRegText: { fontSize: 9, fontWeight: 'bold', color: BLUE },

  badgeWrap: { alignItems: 'center', marginVertical: 6 },
  badge: { borderWidth: 1.5, borderColor: RED, borderRadius: 4, paddingHorizontal: 20, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: 'bold', color: RED, textAlign: 'center' },

  filterRow: { fontSize: 8, color: '#666', marginBottom: 4 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  summaryCount: { fontSize: 10, fontWeight: 'bold', color: '#fff', backgroundColor: BLUE, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 3 },
  summaryDate: { fontSize: 8, color: '#999' },

  table: { borderWidth: 1, borderColor: BORDER, marginTop: 2 },
  thRow: { flexDirection: 'row', backgroundColor: BLUE, borderBottomWidth: 1, borderBottomColor: BORDER, height: 16, alignItems: 'center' },
  thCell: { fontSize: 8, fontWeight: 'bold', color: '#fff', paddingHorizontal: 3, textAlign: 'center' },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BORDER, height: 14, alignItems: 'center' },
  trEven: { backgroundColor: '#f8fafc' },
  td: { fontSize: 7, paddingHorizontal: 3, textAlign: 'center' },
  tdL: { fontSize: 7, paddingHorizontal: 3, textAlign: 'left' },

  footer: { borderTopWidth: 1, borderTopColor: RED, paddingTop: 4, marginTop: 6, alignItems: 'center' },
  footerText: { fontSize: 8, fontWeight: 'bold', color: RED, textAlign: 'center' },

  // Compact heading for continuation sheets — the full letterhead belongs on
  // the first page only, and repeating it would cost ~8 rows on every sheet.
  contTitle: { fontSize: 11, color: BLUE, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  contRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  contLabel: { fontSize: 8, color: '#666' },
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

// ── How many rows fit on a sheet ─────────────────────────────────────────────
// A4 landscape is 595pt tall; outerView takes 14pt of padding a side, leaving
// 567pt. Row height is 14pt, the column heading 16pt and the footer ~20pt.
//
// The first sheet also carries the full letterhead (blessings, logos, address,
// SINCE bar, badge, filters, summary) which comes to roughly 130pt, so it holds
// fewer rows than the ones after it. Both numbers are set a little below what
// actually fits so a slightly taller line can never push a row off the sheet.
const ROWS_FIRST = 25;
const ROWS_REST  = 32;

const clip = (value, max) => {
  const s = String(value ?? '').trim();
  if (!s) return '';
  return s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s;
};

const fmtDate = (raw) => {
  if (!raw) return '';
  const d = raw?.toDate ? dayjs(raw.toDate()) : dayjs(raw);
  return d.isValid() ? d.format('DD-MM-YYYY') : String(raw);
};

const ClosedMembersPdf = ({ members, filters, programList, agentList, closingGroups }) => {
  const trust = getTrust();
  applyPdfColors(trust);
  const progName = (id) => {
    const p = programList?.find(x => x.id === id);
    return p?.name || id || '-';
  };
  const getAgentName = (id) => agentList?.find(a => a.id === id)?.name || '-';
  const getGroupName = (id) => {
    const g = closingGroups?.find(x => x.id === id);
    return g?.groupName || (id ? id.slice(-6) : '-');
  };

  const filterParts = [];
  if (filters.programName) filterParts.push(`Yojna: ${filters.programName}`);
  if (filters.groupName) filterParts.push(`Group: ${filters.groupName}`);
  if (filters.agentName) filterParts.push(`Agent: ${filters.agentName}`);
  if (filters.fromDate) filterParts.push(`From: ${filters.fromDate}`);
  if (filters.toDate) filterParts.push(`To: ${filters.toDate}`);
  const filterStr = filterParts.length > 0 ? filterParts.join('  |  ') : null;

  const today = dayjs().format('DD-MM-YYYY');
  const list  = members || [];

  // ── Split the list into sheets ourselves ──────────────────────────────────
  //
  // Every row used to be handed to react-pdf inside one <Page> and one wrapping
  // <View>, leaving it to break the list up. It does not cope with a wrapper
  // holding hundreds of rows: the column heading appeared only on sheet one,
  // and the overflow ended up crushed on top of itself on the last sheet.
  // Chunking into explicit pages makes the layout deterministic instead.
  const chunks = [];
  for (let i = 0; i < list.length; ) {
    const take = chunks.length === 0 ? ROWS_FIRST : ROWS_REST;
    chunks.push(list.slice(i, i + take));
    i += take;
  }
  if (chunks.length === 0) chunks.push([]);

  const renderRow = (m, absIndex, i) => (
    <View key={m.id || absIndex} style={[styles.tr, i % 2 === 1 && styles.trEven]} wrap={false}>
      <Text style={[styles.td, { width: 24 }]}>{absIndex + 1}</Text>
      <Text style={[styles.td, { width: 84, color: BLUE, fontWeight: 'bold' }]}>
        {clip(m.registrationNumber, 16)}
      </Text>
      <Text style={[styles.tdL, { flex: 1 }]}>
        {clip(`${m.displayName || m.name || '-'} / ${m.fatherName || '-'}`, 46)}
      </Text>
      <Text style={[styles.td, { width: 64 }]}>{clip(m.phone, 12)}</Text>
      <Text style={[styles.td, { width: 88 }]}>{clip(progName(m.programId), 18)}</Text>
      <Text style={[styles.td, { width: 60 }]}>{clip(getGroupName(m.closingGroupId), 12)}</Text>
      <Text style={[styles.td, { width: 58 }]}>{fmtDate(m.closed_date)}</Text>
      <Text style={[styles.td, { width: 78 }]}>{clip(getAgentName(m.agentId), 16)}</Text>
      <Text style={[styles.td, { width: 68 }]}>{m.closed_invitation_url ? 'Yes' : 'No'}</Text>
    </View>
  );

  const tableHead = (
    <View style={styles.thRow}>
      <Text style={[styles.thCell, { width: 24 }]}>#</Text>
      <Text style={[styles.thCell, { width: 84 }]}>Reg No</Text>
      <Text style={[styles.thCell, { flex: 1 }]}>नाम / पिता</Text>
      <Text style={[styles.thCell, { width: 64 }]}>फोन</Text>
      <Text style={[styles.thCell, { width: 88 }]}>योजना</Text>
      <Text style={[styles.thCell, { width: 60 }]}>ग्रुप</Text>
      <Text style={[styles.thCell, { width: 58 }]}>क्लोजिंग</Text>
      <Text style={[styles.thCell, { width: 78 }]}>एजेंट</Text>
      <Text style={[styles.thCell, { width: 68 }]}>Invitation Card</Text>
    </View>
  );

  return (
    <Document>
      {chunks.map((chunk, pageIdx) => {
        // Running number so row 26 on sheet two still reads "26", not "1".
        const offset = pageIdx === 0 ? 0 : ROWS_FIRST + (pageIdx - 1) * ROWS_REST;

        return (
          <Page key={pageIdx} size="A4" orientation="landscape" style={styles.page}>
            <View style={styles.outerView}>
              <Image src={trust.logoSrc} style={styles.watermark} />

              {pageIdx === 0 ? (
                <>
                  <View style={styles.topText}>
                    {trust.blessings.map((line, i) => (<Text key={i} style={styles.smallText}>{line}</Text>))}
                  </View>

                  <View style={styles.headerSection}>
                    <View style={styles.imageBox}><Image src={trust.logoSrc} style={styles.logoImage} /></View>
                    <View style={styles.centerContent}>
                      <Text style={styles.mainTitle}>{trust.name}</Text>
                      <Text style={styles.subTitle}>{trust.cityLine}</Text>
                      <Text style={styles.addrLine}>हेड ऑफिस : {trust.addressShort}</Text>
                      <Text style={styles.contactLine}>संपर्क : {trust.contactNumbers}</Text>
                    </View>
                    <View style={styles.imageBox}><Image src={trust.rightImageSrc} style={styles.logoImage} /></View>
                  </View>

                  <View style={styles.sinceRegRow}>
                    <Text style={styles.sinceRegText}>{trust.sinceText}</Text>
                    <Text style={styles.sinceRegText}>{trust.regText}</Text>
                  </View>

                  <View style={styles.badgeWrap}>
                    <View style={styles.badge}><Text style={styles.badgeText}>क्लोजिंग सदस्य सूची</Text></View>
                  </View>

                  {filterStr && <Text style={styles.filterRow}>Filters: {filterStr}</Text>}

                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryCount}>कुल क्लोजिंग: {list.length}</Text>
                    <Text style={styles.summaryDate}>{today}</Text>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.contTitle}>क्लोजिंग सदस्य सूची</Text>
                  <View style={styles.contRow}>
                    <Text style={styles.contLabel}>कुल क्लोजिंग: {list.length}</Text>
                    <Text style={styles.contLabel}>{today}</Text>
                  </View>
                </>
              )}

              <View style={styles.table}>
                {tableHead}
                {chunk.map((m, i) => renderRow(m, offset + i, i))}
              </View>

              <View style={styles.footer}>
                <Text style={styles.footerText}>
                  Generated by {trust.shortName} • {dayjs().format('DD-MM-YYYY HH:mm')} • पृष्ठ {pageIdx + 1} / {chunks.length}
                </Text>
              </View>
            </View>
          </Page>
        );
      })}
    </Document>
  );
};

export default ClosedMembersPdf;