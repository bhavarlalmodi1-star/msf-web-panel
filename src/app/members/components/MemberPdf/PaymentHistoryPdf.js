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
const BLACK  = '#000000';
const GREY   = '#f5f5f5';
const BG_ALT = '#fafafa';

const buildStyles = () => StyleSheet.create({
  // Margin on the page itself and no fixed-height wrapper: a wrapper pinned to
  // height 100% forced every transaction onto ONE sheet, so long histories
  // printed with rows on top of each other. Now the table continues onto the
  // next sheet.
  page: {
    backgroundColor: '#ffffff', fontFamily: 'NotoSansDevanagari',
    paddingTop: 12, paddingBottom: 22, paddingHorizontal: 14,
  },
  pageNo: { position: 'absolute', bottom: 8, right: 14, fontSize: 7, color: '#888' },

  watermark: {
    position: 'absolute', top: '30%', left: '20%',
    width: '60%', opacity: 0.05,
  },

  topText: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginBottom: 6, paddingHorizontal: 6,
  },
  smallText: { fontSize: 9, color: RED, fontWeight: 'bold' },

  headerSection: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 2, marginBottom: 3,
  },
  imageBox: {
    flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', width: 65,
  },
  logoImage:  { width: 55, height: 50, borderRadius: 4, objectFit: 'contain' },
  logoImage1: { width: 55, height: 50, borderRadius: 4, objectFit: 'contain' },

  centerContent: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
  mainTitle: {
    fontSize: 16, color: BLUE, fontWeight: 'bold',
    textAlign: 'center', marginBottom: 2, letterSpacing: 0.3,
  },
  subTitle: {
    fontSize: 12, color: BLUE, fontWeight: 'bold',
    textAlign: 'center', marginBottom: 4,
  },
  addressRow: {
    flexDirection: 'row', justifyContent: 'center',
    flexWrap: 'wrap', marginBottom: 2,
  },
  addressLabel: { color: BLACK, fontSize: 7, fontWeight: 'bold' },
  addressValue: { color: BLACK, fontSize: 7, textAlign: 'center' },
  contactRow: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', marginTop: 1,
  },
  contactLabel: { fontSize: 7, fontWeight: 'bold', color: BLACK },
  contactValue: { fontSize: 7, fontWeight: 'bold', color: BLUE },

  sinceRegRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 2, paddingVertical: 4,
    borderBottomWidth: 1, borderBottomColor: BLUE, marginBottom: 1,
  },
  sinceText: { fontSize: 9, fontWeight: 'bold', color: BLUE },
  regText:   { fontSize: 9, fontWeight: 'bold', color: BLUE },

  badgeWrap: { alignItems: 'center', marginVertical: 8 },
  badge: {
    borderWidth: 1.5, borderColor: RED, borderRadius: 4,
    paddingHorizontal: 24, paddingVertical: 4,
  },
  badgeText: { fontSize: 12, fontWeight: 'bold', color: RED, textAlign: 'center' },

  infoRow: {
    flexDirection: 'row', marginBottom: 4, alignItems: 'center',
  },
  infoLeft:  { flex: 1 },
  infoRight: { width: 160, alignItems: 'flex-end' },
  infoLabel: { fontSize: 10, fontWeight: 'bold', color: RED },
  infoValue: { fontSize: 10, color: BLACK, fontWeight: 'normal' },

  table: {
    marginTop: 6,
    borderWidth: 1, borderColor: '#ccc',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: BLUE,
    borderBottomWidth: 1, borderBottomColor: '#ccc',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5, borderBottomColor: '#ddd',
  },

  cellNo:     { width: 24, borderRightWidth: 0.5, borderRightColor: '#ddd', paddingHorizontal: 3, paddingVertical: 4, alignItems: 'center', justifyContent: 'center' },
  cellDate:   { width: 72, borderRightWidth: 0.5, borderRightColor: '#ddd', paddingHorizontal: 3, paddingVertical: 4, alignItems: 'center', justifyContent: 'center' },
  cellType:   { width: 64, borderRightWidth: 0.5, borderRightColor: '#ddd', paddingHorizontal: 3, paddingVertical: 4, alignItems: 'center', justifyContent: 'center' },
  cellAmount: { width: 62, borderRightWidth: 0.5, borderRightColor: '#ddd', paddingHorizontal: 3, paddingVertical: 4, alignItems: 'center', justifyContent: 'center' },
  cellMode:   { width: 56, borderRightWidth: 0.5, borderRightColor: '#ddd', paddingHorizontal: 3, paddingVertical: 4, alignItems: 'center', justifyContent: 'center' },
  cellTxn:    { flex: 1, borderRightWidth: 0.5, borderRightColor: '#ddd', paddingHorizontal: 4, paddingVertical: 4, justifyContent: 'center', minWidth: 0 },
  cellStatus: { width: 56, paddingHorizontal: 3, paddingVertical: 4, alignItems: 'center', justifyContent: 'center' },

  headerCellText: { fontSize: 8, fontWeight: 'bold', color: '#ffffff', textAlign: 'center' },
  cellTextCenter: { fontSize: 8, color: BLACK, textAlign: 'center', fontWeight: 'normal' },
  cellTextLeft:   { fontSize: 8, color: BLACK, fontWeight: 'normal' },

  totalRow: {
    flexDirection: 'row', justifyContent: 'flex-end',
    marginTop: 6, marginBottom: 3, paddingHorizontal: 4,
    alignItems: 'center',
  },
  totalLabel:  { fontSize: 10, fontWeight: 'bold', color: BLACK, marginRight: 8 },
  totalAmount: { fontSize: 11, fontWeight: 'bold', color: RED },

  signatureRow: {
    flexDirection: 'row', justifyContent: 'flex-end',
    marginTop: 6, marginBottom: 2, paddingHorizontal: 4,
  },
  signatureText: { fontSize: 9, fontWeight: 'bold', color: BLUE },

  footer: {
    borderTopWidth: 1, borderTopColor: RED,
    paddingTop: 5, marginTop: 6,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  footerCenter: { flex: 1, alignItems: 'center' },
  footerContact: { fontSize: 8.5, fontWeight: 'bold', color: RED, textAlign: 'center', marginBottom: 1 },
  footerSub:     { fontSize: 8.5, fontWeight: 'bold', color: BLUE, textAlign: 'center' },
  footerEoe:     { fontSize: 9, fontWeight: 'bold', color: BLACK, width: 50, textAlign: 'right' },
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

const formatDate = (val) => {
  if (!val) return '—';
  if (dayjs(val).isValid()) return dayjs(val).format('DD MMM YYYY');
  return String(val);
};

const PaymentHistoryPdf = ({ member, transactions = [], closingTransactions = [] }) => {
  const trust = getTrust();
  applyPdfColors(trust);
  const allTxns = [
    ...transactions.map(t => ({ ...t, txnType: 'join_fee' })),
    ...closingTransactions.map(t => ({ ...t, txnType: 'closing' })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const totalAmount = allTxns.reduce((s, t) => s + (t.amount || t.amountPaid || 0), 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
          {/* fixed → repeats on every sheet */}
          <Image src={trust.logoSrc} style={styles.watermark} fixed />

          <View style={styles.topText}>
            {trust.blessings.map((line, i) => (<Text key={i} style={styles.smallText}>{line}</Text>))}
          </View>

          <View style={styles.headerSection}>
            <View style={styles.imageBox}>
              <Image src={trust.logoSrc} style={styles.logoImage} />
            </View>
            <View style={styles.centerContent}>
              <Text style={styles.mainTitle}>{trust.name}</Text>
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

          <View style={styles.sinceRegRow}>
            <Text style={styles.sinceText}>{trust.sinceText}</Text>
            <Text style={styles.regText}>{trust.regText}</Text>
          </View>

          <View style={styles.badgeWrap}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>भुगतान इतिहास</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoLeft}>
              <Text>
                <Text style={styles.infoLabel}>नाम : </Text>
                <Text style={styles.infoValue}>{member?.displayName || ''}{member?.fatherName ? ' / ' + member.fatherName : ''}</Text>
              </Text>
            </View>
            <View style={styles.infoRight}>
              <Text>
                <Text style={styles.infoLabel}>फोन : </Text>
                <Text style={styles.infoValue}>{member?.phone || ''}</Text>
              </Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoLeft}>
              <Text>
                <Text style={styles.infoLabel}>सदस्य क्र. : </Text>
                <Text style={styles.infoValue}>{member?.registrationNumber || ''}</Text>
              </Text>
            </View>
            <View style={styles.infoRight}>
              <Text>
                <Text style={styles.infoLabel}>योजना : </Text>
                <Text style={styles.infoValue}>{member?.programName || ''}</Text>
              </Text>
            </View>
          </View>

          <View style={styles.table}>
            {/* fixed → column headings repeat at the top of every sheet */}
            <View style={styles.tableHeaderRow} fixed>
              <View style={styles.cellNo}><Text style={styles.headerCellText}>#</Text></View>
              <View style={styles.cellDate}><Text style={styles.headerCellText}>दिनांक</Text></View>
              <View style={styles.cellType}><Text style={styles.headerCellText}>प्रकार</Text></View>
              <View style={styles.cellAmount}><Text style={styles.headerCellText}>राशि</Text></View>
              <View style={styles.cellMode}><Text style={styles.headerCellText}>मोड</Text></View>
              <View style={styles.cellTxn}><Text style={[styles.headerCellText, { textAlign: 'center' }]}>UTR / Cash ID</Text></View>
              <View style={styles.cellStatus}><Text style={styles.headerCellText}>स्थिति</Text></View>
            </View>

            {allTxns.length === 0 ? (
              <View style={styles.tableRow}>
                <View style={[styles.cellNo, { borderRightWidth: 0, width: '100%', flex: 1 }]}>
                  <Text style={{ fontSize: 8, color: '#999', textAlign: 'center' }}>कोई लेन-देन नहीं</Text>
                </View>
              </View>
            ) : allTxns.map((t, idx) => (
              <View key={idx} style={[styles.tableRow, idx % 2 === 1 && { backgroundColor: BG_ALT }]} wrap={false}>
                <View style={styles.cellNo}><Text style={styles.cellTextCenter}>{idx + 1}</Text></View>
                <View style={styles.cellDate}><Text style={styles.cellTextCenter}>{formatDate(t.transactionDate || t.date)}</Text></View>
                <View style={styles.cellType}><Text style={styles.cellTextCenter}>{t.txnType === 'join_fee' ? 'जॉइन फीस' : 'क्लोज़िंग'}</Text></View>
                <View style={styles.cellAmount}><Text style={styles.cellTextCenter}>₹{(t.amount || t.amountPaid || 0).toLocaleString()}</Text></View>
                <View style={styles.cellMode}><Text style={styles.cellTextCenter}>{t.paymentMode || '—'}</Text></View>
                <View style={styles.cellTxn}><Text style={[styles.cellTextLeft, { fontSize: 7 }]}>{t.transactionId || '—'}</Text></View>
                <View style={styles.cellStatus}>
                  <Text style={[styles.cellTextCenter, {
                    color: t.status === 'completed' ? '#16a34a' : '#ea580c',
                    fontWeight: 'bold',
                  }]}>
                    {t.status === 'completed' ? 'पूर्ण' : 'लंबित'}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Totals, signature and footer stay together on one sheet */}
          <View wrap={false}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>कुल भुगतान : </Text>
            <Text style={styles.totalAmount}>₹{totalAmount.toLocaleString()}</Text>
          </View>

          {allTxns.length > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 4 }}>
              <Text style={{ fontSize: 7.5, color: '#888' }}>
                कुल {allTxns.length} लेन-देन  •  जॉइन फीस: {transactions.length}  •  क्लोज़िंग: {closingTransactions.length}
              </Text>
            </View>
          )}

          <View style={styles.signatureRow}>
            <Text style={styles.signatureText}>संस्थापक हस्ताक्षर</Text>
          </View>

          <View style={styles.footer}>
            <View style={{ width: 50 }} />
            <View style={styles.footerCenter}>
              <Text style={styles.footerContact}>संपर्क सूत्र : {trust.contactNumbers}</Text>
              <Text style={styles.footerSub}>{trust.jurisdiction}</Text>
            </View>
            <Text style={styles.footerEoe}>E. &amp; O.E.</Text>
          </View>
          </View>
          <Text
            style={styles.pageNo} fixed
            render={({ pageNumber, totalPages }) => (totalPages > 1 ? `पृष्ठ ${pageNumber} / ${totalPages}` : '')}
          />
      </Page>
    </Document>
  );
};

export default PaymentHistoryPdf;
