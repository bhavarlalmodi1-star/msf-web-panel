import NotoSansDevanagari from '@/app/api/helper/static/font/NotoSansDevanagari';
import NotoSansDevanagariBold from '@/app/api/helper/static/font/NotoSansDevanagariBold';
import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import React from 'react';
import { getTrust } from '@/utils/trust/trustStore';
import { DEFAULT_PDF_PRIMARY, DEFAULT_PDF_ACCENT } from '@/utils/trust/theme';

Font.register({
  family: 'NotoSansDevanagari',
  fonts: [
    { src: NotoSansDevanagari, fontWeight: 'normal' },
    { src: NotoSansDevanagariBold, fontWeight: 'bold' },
  ],
});

// ─── Colors ───────────────────────────────────────────────────────────────────
let RED    = DEFAULT_PDF_ACCENT;    // accent  (Settings → Trust Details → Colours)
let BLUE   = DEFAULT_PDF_PRIMARY;  // primary (Settings → Trust Details → Colours)
const BLACK  = '#000000';
const BORDER = '#aaaaaa';
const GREY   = '#f7f7f7';

// ─── Total table rows per page ────────────────────────────────────────────────
const TOTAL_ROWS = 20;

// ─── Styles ───────────────────────────────────────────────────────────────────
// Height set aside at the bottom of every page for the footer, which is pinned
// there rather than flowing after the note. 1pt border + 4pt padding + two 9pt
// lines with their leading, rounded up so a slightly taller line still fits.
const FOOTER_SPACE = 44;

const buildStyles = () => StyleSheet.create({

  page: {
    backgroundColor: '#ffffff',
    fontFamily: 'NotoSansDevanagari',
  },

  outerView: {
    width: '100%',
    height: '100%',
    paddingTop: 10,
    // Room reserved for the pinned footer below. The footer is no longer part of
    // this column, so without this the table's flex:1 would grow underneath it.
    paddingBottom: FOOTER_SPACE,
    paddingLeft: 12,
    paddingRight: 12,
    flexDirection: 'column',
  },

  watermark: {
    position: 'absolute',
    top: '30%',
    left: '20%',
    width: '60%',
    opacity: 0.06,
    zIndex: 0,
  },

  // ════════ HEADER ════════
  topText: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
    paddingHorizontal: 8,
  },
  smallText: {
    fontSize: 8.5,
    color: RED,
    fontWeight: 'bold',
  },

  headerSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
    marginBottom: 2,
  },
  imageBox: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: 70,
  },
  logoImage:  { width: 60, height: 55, borderRadius: 4, objectFit: 'contain' },
  logoImage1: { width: 60, height: 55, borderRadius: 4, objectFit: 'contain' },

  centerContent: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  mainTitle: {
    fontSize: 17,
    color: BLUE,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 1,
    letterSpacing: 0.3,
  },
  subTitle: {
    fontSize: 13,
    color: BLUE,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 3,
  },
  addressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginBottom: 1,
  },
  addressLabel: { color: BLACK, fontSize: 7.5, fontWeight: 'bold' },
  addressValue: { color: BLACK, fontSize: 7.5, textAlign: 'center' },
  contactRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  contactLabel: { fontSize: 7.5, fontWeight: 'bold', color: BLACK },
  contactValue: { fontSize: 7.5, fontWeight: 'bold', color: BLUE },

  // ── Since / Reg row ──
  sinceRegRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: BLUE,
    marginBottom: 0,
  },
  sinceText: { fontSize: 9, fontWeight: 'bold', color: BLUE },
  regText:   { fontSize: 9, fontWeight: 'bold', color: BLUE },

  // ════════ BADGE ════════
  badgeWrap: { alignItems: 'center', marginTop: 6, marginBottom: 6 },
  badge: {
    borderWidth: 1.5,
    borderColor: RED,
    borderRadius: 4,
    paddingHorizontal: 20,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 11, fontWeight: 'bold', color: RED, textAlign: 'center' },

  // ════════ INFO ROWS ════════
  infoRow: { flexDirection: 'row', marginBottom: 4, alignItems: 'center' },
  infoLeft:  { flex: 1 },
  infoRight: { width: 150, alignItems: 'flex-end' },
  infoLabel: { fontSize: 11, fontWeight: 'bold', color: RED },
  infoValue: { fontSize: 11, color: BLACK, fontWeight: 'normal' },

  // ════════ TABLE ════════
  table: {
    marginTop: 5,
    borderWidth: 1,
    borderColor: BORDER,
    flex: 1,           // fills all remaining vertical space
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: GREY,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
  },

  cellNo: {
    width: 24,
    borderRightWidth: 0.5, borderRightColor: BORDER,
    paddingHorizontal: 2, paddingVertical: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  cellCode: {
    width: 62,
    borderRightWidth: 0.5, borderRightColor: BORDER,
    paddingHorizontal: 3, paddingVertical: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  cellName: {
    flex: 1,
    borderRightWidth: 0.5, borderRightColor: BORDER,
    paddingHorizontal: 4, paddingVertical: 3,
    justifyContent: 'center',
  },
  // Village column removed — merged into the name cell, which now gets the
  // freed width via flex: 1
  cellDate: {
    width: 72,
    borderRightWidth: 0.5, borderRightColor: BORDER,
    paddingHorizontal: 3, paddingVertical: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  cellMobile: {
    width: 82,
    paddingHorizontal: 3, paddingVertical: 3,
    alignItems: 'center', justifyContent: 'center',
  },

  headerCellText: { fontSize: 10, fontWeight: 'bold', color: BLUE, textAlign: 'center' },
  cellTextCenter: { fontSize: 10, color: BLACK, textAlign: 'center', fontWeight: 'normal' },
  cellTextLeft:   { fontSize: 10, color: BLACK, fontWeight: 'normal' },

  // ════════ TOTAL ════════
  totalRow: {
    flexDirection: 'row',
    marginTop: 5, marginBottom: 2,
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  totalLabel:      { fontSize: 10, fontWeight: 'bold', color: BLACK, marginRight: 6 },
  totalAmount:     { fontSize: 12, fontWeight: 'bold', color: BLACK, marginRight: 16 },
  totalWordsLabel: { fontSize: 11, fontWeight: 'bold', color: BLACK, marginRight: 6 },
  totalWordsValue: { fontSize: 11, color: BLACK, fontWeight: 'normal' },

  // ════════ SIGNATURE + NOTE ════════
  signatureRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4, marginBottom: 1,
    paddingHorizontal: 2,
  },
  signatureText: { fontSize: 10, fontWeight: 'bold', color: BLUE },
  noteText:      { fontSize: 9, color: '#444', marginTop: 1, lineHeight: 1.4, fontWeight: 'normal' },

  // ════════ FOOTER ════════
  // Pinned to the bottom of the PAGE, not laid out after the note.
  //
  // In flow, the footer sat at the end of a column whose height was already
  // 100% of the page. When the content above came within a line of the bottom,
  // react-pdf split the footer and pushed its last line ("Exclusive
  // jurisdiction…") onto a second, otherwise-empty page. Anchoring it to the
  // page means it cannot be split or moved, whatever the rows above do.
  footer: {
    position: 'absolute',
    left: 12, right: 12, bottom: 10,
    borderTopWidth: 1,
    borderTopColor: RED,
    paddingTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerCenter: { flex: 1, alignItems: 'center' },
  footerContact: { fontSize: 9, fontWeight: 'bold', color: RED, textAlign: 'center', marginBottom: 1 },
  footerSub:     { fontSize: 9, fontWeight: 'bold', color: BLUE, textAlign: 'center' },
  footerEoe:     { fontSize: 10, fontWeight: 'bold', color: BLACK, width: 50, textAlign: 'right' },
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

// ─── Single receipt page ──────────────────────────────────────────────────────
const RasidPage = ({ data }) => {
  const trust = getTrust();
  applyPdfColors(trust);
  const filledEntries = [
    ...data.entries,
    ...Array(Math.max(0, TOTAL_ROWS - data.entries.length)).fill(null),
  ];

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.outerView}>

        {/* Watermark */}
        <Image src={trust.logoSrc} style={styles.watermark} />

        {/* ══ Blessing Row ══ */}
        <View style={styles.topText}>
          {trust.blessings.map((line, i) => (<Text key={i} style={styles.smallText}>{line}</Text>))}
        </View>

        {/* ══ Header ══ */}
        <View style={styles.headerSection}>
          <View style={styles.imageBox}>
            <Image src={trust.logoSrc} style={styles.logoImage} />
          </View>

          <View style={styles.centerContent}>
            <Text style={styles.mainTitle}>
              {trust.name}
            </Text>
            <Text style={styles.subTitle}>{trust.cityLine}</Text>

            <View style={styles.addressRow}>
              <Text style={styles.addressLabel}>हेड ऑफिस : </Text>
              <Text style={styles.addressValue}>
                {trust.addressWithOffice}
              </Text>
            </View>

            <View style={styles.contactRow}>
              <Text style={styles.contactLabel}>संपर्क सूत्र : </Text>
              <Text style={styles.contactValue}>{trust.presidentName}</Text>
            </View>
            <View style={styles.contactRow}>
              <Text style={styles.contactValue}>{trust.presidentPhone}</Text>
              <Text style={styles.contactLabel}>  ऑफिस : </Text>
              <Text style={styles.contactValue}> {trust.officePhone}</Text>
            </View>
          </View>

          <View style={styles.imageBox}>
            <Image src={trust.rightImageSrc} style={styles.logoImage1} />
          </View>
        </View>

        {/* ══ Since / Reg row ══ */}
        <View style={styles.sinceRegRow}>
          <Text style={styles.sinceText}>{trust.sinceText}</Text>
          <Text style={styles.regText}>{trust.regText}</Text>
        </View>

        {/* ══ Badge ══ */}
        <View style={styles.badgeWrap}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>सहयोग राशि रसीद</Text>
          </View>
        </View>

        {/* ══ Serial No + Date ══ */}
        <View style={styles.infoRow}>
          <View style={styles.infoLeft}>
            <Text>
              <Text style={styles.infoLabel}>क्र. सं. : </Text>
              <Text style={styles.infoValue}>{data.serialNo}</Text>
            </Text>
          </View>
          <View style={styles.infoRight}>
            <Text>
              <Text style={styles.infoLabel}>दिनांक : </Text>
              <Text style={styles.infoValue}>{data.date}</Text>
            </Text>
          </View>
        </View>

        {/* ══ Name + Phone ══ */}
        <View style={styles.infoRow}>
          <View style={styles.infoLeft}>
            <Text>
              <Text style={styles.infoLabel}>नाम : </Text>
              <Text style={styles.infoValue}>{data.name}</Text>
            </Text>
          </View>
          <View style={styles.infoRight}>
            <Text>
              <Text style={styles.infoLabel}>फोन नं. : </Text>
              <Text style={styles.infoValue}>{data.phone}</Text>
            </Text>
          </View>
        </View>

        {/* ══ Address ══ */}
        <View style={styles.infoRow}>
          <Text>
            <Text style={styles.infoLabel}>पता : </Text>
            <Text style={styles.infoValue}>{data.address}</Text>
          </Text>
        </View>

        {/* ══ Yojana + Sahyog Rashi ══ */}
        <View style={styles.infoRow}>
          <View style={styles.infoLeft}>
            <Text>
              <Text style={styles.infoLabel}>योजना : </Text>
              <Text style={styles.infoValue}>{data.yojana} वय ग्रुप : {data.ageGroup || '—'}</Text>
            </Text>
          </View>
          <View style={styles.infoRight}>
            <Text>
              <Text style={styles.infoLabel}>सहयोग राशि : </Text>
              <Text style={styles.infoValue}>{data.sahyogRashi}</Text>
            </Text>
          </View>
        </View>

        {/* ══ Table ══ */}
        <View style={styles.table}>
          {/* Header */}
          <View style={styles.tableHeaderRow}>
            <View style={styles.cellNo}>
              <Text style={styles.headerCellText}>#</Text>
            </View>
            <View style={styles.cellCode}>
              <Text style={styles.headerCellText}>कोड</Text>
            </View>
            <View style={styles.cellName}>
              <Text style={[styles.headerCellText, { textAlign: 'center' }]}>नाम</Text>
            </View>
            <View style={styles.cellDate}>
              <Text style={styles.headerCellText}>दिनांक</Text>
            </View>
            <View style={styles.cellMobile}>
              <Text style={styles.headerCellText}>मोबाइल न.</Text>
            </View>
          </View>

          {/* Data rows */}
          {filledEntries.map((entry, idx) => (
            <View key={idx} style={styles.tableRow}>
              <View style={styles.cellNo}>
                <Text style={styles.cellTextCenter}>{(data.startIndex || 0) + idx + 1}</Text>
              </View>
              <View style={styles.cellCode}>
                <Text style={styles.cellTextCenter}>{entry ? entry.code : ''}</Text>
              </View>
              <View style={styles.cellName}>
                {/* Village is appended to the name rather than given its own
                    column — matches the printed receipt, and leaves the name
                    column wide enough for "नाम / पिता  गाँव - तहसील". */}
                <Text style={styles.cellTextLeft}>
                  {entry ? [entry.name, entry.village].filter(Boolean).join('  ') : ''}
                </Text>
              </View>
              <View style={styles.cellDate}>
                <Text style={styles.cellTextCenter}>{entry ? entry.date : ''}</Text>
              </View>
              <View style={styles.cellMobile}>
                <Text style={styles.cellTextCenter}>{entry ? entry.mobile : ''}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ══ Total ══ */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>कुल राशि रु.: </Text>
          <Text style={styles.totalAmount}>{data.totalAmount}</Text>
          <Text style={styles.totalWordsLabel}>शब्दों में रूपये : </Text>
          <Text style={styles.totalWordsValue}>{data.totalInWords}</Text>
        </View>

        {/* ══ Signature ══ */}
        <View style={styles.signatureRow}>
          <Text style={styles.signatureText}>संस्थापक हस्ताक्षर</Text>
        </View>

        {/* ══ Note ══ */}
        <Text style={styles.noteText}>Note : {data.note}</Text>

      </View>

      {/* ══ Footer — anchored to the page, never breaks to a second page ══ */}
      <View style={styles.footer} fixed>
        <View style={{ width: 50 }} />
        <View style={styles.footerCenter}>
          <Text style={styles.footerContact}>
            संपर्क सूत्र : {trust.contactNumbers}
          </Text>
          <Text style={styles.footerSub}>
            {trust.jurisdiction}
          </Text>
        </View>
        <Text style={styles.footerEoe}>E. &amp; O.E.</Text>
      </View>
    </Page>
  );
};

// ─── Main component — accepts rasidList array ─────────────────────────────────
const RasidPdfCom = ({ rasidList: rawList = [] }) => {
  // A receipt sheet holds TOTAL_ROWS entries. A longer receipt continues on
  // further sheets instead of squeezing every row onto one.
  const rasidList = (rawList || []).flatMap((r) => {
    const list = r?.entries || [];
    if (list.length <= TOTAL_ROWS) return [{ ...r, entries: list }];
    return Array.from({ length: Math.ceil(list.length / TOTAL_ROWS) }, (_, i) => ({
      ...r,
      entries: list.slice(i * TOTAL_ROWS, (i + 1) * TOTAL_ROWS),
      startIndex: i * TOTAL_ROWS,
    }));
  });
  return (
    <Document>
      {rasidList.map((data, index) => (
        <RasidPage key={data.serialNo ?? index} data={data} />
      ))}
    </Document>
  );
};

export default RasidPdfCom;