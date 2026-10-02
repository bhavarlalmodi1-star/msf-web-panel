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

const C = {
  red:   DEFAULT_PDF_ACCENT,    // accent  (Settings → Trust Details → Colours)
  blue:  DEFAULT_PDF_PRIMARY,   // primary (Settings → Trust Details → Colours)
  black: '#222222',
  label: '#666666',
  bg:    '#f9f9f9',
  bdr:   '#dddddd',
  green: '#16a34a',
  orange:'#ea580c',
};

const buildStyles = () => StyleSheet.create({
  page: { backgroundColor: '#ffffff', fontFamily: 'NotoSansDevanagari' },
  wrap: {
    width: '100%', minHeight: '100%',
    padding: 14, paddingBottom: 10,
    flexDirection: 'column',
  },

  watermark: {
    position: 'absolute', top: '28%', left: '15%',
    width: '70%', opacity: 0.04, zIndex: 0,
  },

  // ── Header ──
  blessRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginBottom: 5, paddingHorizontal: 4,
  },
  blessText: { fontSize: 8.5, color: C.red, fontWeight: 'bold' },

  hdr: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 2,
  },
  logoBox: { width: 58, alignItems: 'center', justifyContent: 'center' },
  logoImg: { width: 48, height: 44, borderRadius: 3, objectFit: 'contain' },

  hdrCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  hdrTitle: {
    fontSize: 14, color: C.blue, fontWeight: 'bold',
    textAlign: 'center', marginBottom: 1, letterSpacing: 0.2,
  },
  hdrSub: {
    fontSize: 10.5, color: C.blue, fontWeight: 'bold',
    textAlign: 'center', marginBottom: 2,
  },
  hdrAddr: {
    flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', marginBottom: 1,
  },
  hdrAddrLbl: { fontSize: 6.5, fontWeight: 'bold', color: C.black },
  hdrAddrVal: { fontSize: 6.5, color: C.black, textAlign: 'center' },
  hdrContact: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 1,
  },
  hdrCLbl: { fontSize: 6.5, fontWeight: 'bold', color: C.black },
  hdrCVal: { fontSize: 6.5, fontWeight: 'bold', color: C.blue },

  bar: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 3, paddingHorizontal: 2,
    borderBottomWidth: 1.5, borderBottomColor: C.blue,
    marginBottom: 3,
  },
  barText: { fontSize: 8, fontWeight: 'bold', color: C.blue },

  badge: { alignItems: 'center', marginVertical: 5 },
  badgeBox: {
    borderWidth: 1.5, borderColor: C.red, borderRadius: 4,
    paddingHorizontal: 20, paddingVertical: 3,
  },
  badgeText: { fontSize: 11, fontWeight: 'bold', color: C.red, textAlign: 'center' },

  // ── Card section ──
  card: {
    marginBottom: 6,
    borderWidth: 1, borderColor: C.bdr, borderRadius: 4,
    overflow: 'hidden',
  },
  cardHdr: {
    backgroundColor: C.blue, paddingHorizontal: 8, paddingVertical: 4,
  },
  cardHdrText: { fontSize: 9, fontWeight: 'bold', color: '#ffffff' },
  cardBody: {
    paddingHorizontal: 8, paddingVertical: 5,
  },

  // ── Photo row ──
  photoRow: {
    flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4,
  },
  photo: {
    width: 82, height: 92,
    borderWidth: 1, borderColor: C.bdr, borderRadius: 4,
  },
  photoPlaceholder: {
    width: 82, height: 92,
    backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: C.bdr, borderRadius: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  photoPlaceholderText: { fontSize: 7, color: '#999' },
  photoInfo: { flex: 1, paddingLeft: 10 },

  // ── Field grid ──
  fRow: {
    flexDirection: 'row', marginBottom: 3,
    borderBottomWidth: 0.5, borderBottomColor: '#eee',
    paddingBottom: 2,
  },
  fCell: {
    width: '50%', flexDirection: 'row', alignItems: 'center',
  },
  fCellFull: {
    width: '100%', flexDirection: 'row', alignItems: 'flex-start',
  },
  fLbl: { fontSize: 7.5, fontWeight: 'bold', color: C.label, width: 62 },
  fLblWide: { fontSize: 7.5, fontWeight: 'bold', color: C.label, width: 80 },
  fVal: { fontSize: 7.5, color: C.black, flex: 1 },

  // ── Guardian ──
  guardRow: {
    flexDirection: 'row', alignItems: 'center',
  },
  guardPhoto: {
    width: 44, height: 50,
    borderWidth: 1, borderColor: C.bdr, borderRadius: 4,
    marginRight: 10,
  },
  guardPlaceholder: {
    width: 44, height: 50,
    backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: C.bdr, borderRadius: 4,
    marginRight: 10, alignItems: 'center', justifyContent: 'center',
  },

  // ── Documents ──
  docsWrap: {
    flexDirection: 'row', flexWrap: 'wrap',
    marginTop: 2,
  },
  docCard: {
    width: '18%', marginBottom: 4, marginRight: '2%',
    borderWidth: 0.5, borderColor: C.bdr, borderRadius: 3,
    alignItems: 'center', padding: 3,
  },
  docImg: { width: '100%', height: 36, objectFit: 'cover', borderRadius: 2 },
  docLbl: { fontSize: 6, color: C.label, textAlign: 'center', marginTop: 2 },

  // ── Fees row ──
  feesRow: {
    flexDirection: 'row', marginTop: 3, paddingTop: 4,
    borderTopWidth: 0.5, borderTopColor: C.bdr,
  },
  feeItem: {
    flex: 1, alignItems: 'center',
  },
  feeVal: { fontSize: 9, fontWeight: 'bold' },
  feeLbl: { fontSize: 6.5, color: C.label, marginTop: 1 },

  // ── Signature + Footer ──
  signRow: {
    flexDirection: 'row', justifyContent: 'flex-end',
    marginTop: 6, paddingHorizontal: 4,
  },
  signText: { fontSize: 8.5, fontWeight: 'bold', color: C.blue },

  footer: {
    borderTopWidth: 1, borderTopColor: C.red,
    paddingTop: 4, marginTop: 6,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  footerCenter: { flex: 1, alignItems: 'center' },
  footerContact: { fontSize: 8, fontWeight: 'bold', color: C.red, textAlign: 'center', marginBottom: 1 },
  footerSub:     { fontSize: 8, fontWeight: 'bold', color: C.blue, textAlign: 'center' },
  footerEoe:     { fontSize: 8, fontWeight: 'bold', color: C.black, width: 50, textAlign: 'right' },
});

// Styles are built by a function so the two brand colours can change.
let styles = buildStyles();
let pdfColorKey = '';

// PDF colours come from Settings → Trust Details → Colours.
const applyPdfColors = (trust) => {
  const key = `${trust.pdfColorPrimary}|${trust.pdfColorAccent}`;
  if (key === pdfColorKey) return;
  pdfColorKey = key;
  C.blue = trust.pdfColorPrimary;
  C.red = trust.pdfColorAccent;
  styles = buildStyles();
};

const L = (text, wide) => (
  <Text style={wide ? styles.fLblWide : styles.fLbl}>{text}</Text>
);
const R = ({ label, value, wide }) => (
  <View style={wide ? styles.fCellFull : styles.fCell}>
    <Text style={wide ? styles.fLblWide : styles.fLbl}>{label}</Text>
    <Text style={styles.fVal}>{value ?? '—'}</Text>
  </View>
);

const MemberDetailsPdf = ({ member }) => {
  const trust = getTrust();
  applyPdfColors(trust);
  if (!member) return null;

  const docItems = [
    { label: 'Member Photo',    url: member.photoURL },
    { label: 'Nominee Photo',   url: member.guardianPhotoURL },
    { label: 'Doc Front',       url: member.documentFrontURL },
    { label: 'Doc Back',        url: member.documentBackURL },
    { label: 'Nominee Doc',     url: member.guardianDocumentURL },
  ].filter(d => d.url);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.wrap}>

          <Image src={trust.logoSrc} style={styles.watermark} />

          <View style={styles.blessRow}>
            {trust.blessings.map((line, i) => (<Text key={i} style={styles.blessText}>{line}</Text>))}
          </View>

          <View style={styles.hdr}>
            <View style={styles.logoBox}>
              <Image src={trust.logoSrc} style={styles.logoImg} />
            </View>
            <View style={styles.hdrCenter}>
              <Text style={styles.hdrTitle}>{trust.name}</Text>
              <Text style={styles.hdrSub}>{trust.cityLine}</Text>
              <View style={styles.hdrAddr}>
                <Text style={styles.hdrAddrLbl}>हेड ऑफिस : </Text>
                <Text style={styles.hdrAddrVal}>
                  {trust.addressWithOffice}
                </Text>
              </View>
              <View style={styles.hdrContact}>
                <Text style={styles.hdrCLbl}>संपर्क सूत्र : </Text>
                <Text style={styles.hdrCVal}>{trust.presidentName}</Text>
              </View>
              <View style={styles.hdrContact}>
                <Text style={styles.hdrCVal}>{trust.presidentPhone}</Text>
                <Text style={styles.hdrCLbl}>  ऑफिस : </Text>
                <Text style={styles.hdrCVal}> {trust.officePhone}</Text>
              </View>
            </View>
            <View style={styles.logoBox}>
              <Image src={trust.rightImageSrc} style={styles.logoImg} />
            </View>
          </View>

          <View style={styles.bar}>
            <Text style={styles.barText}>{trust.sinceText}</Text>
            <Text style={styles.barText}>{trust.regText}</Text>
          </View>

          <View style={styles.badge}>
            <View style={styles.badgeBox}>
              <Text style={styles.badgeText}>सदस्य विवरण पत्र</Text>
            </View>
          </View>

          {/* ═══ Photo + Key Info ═══ */}
          <View style={styles.photoRow}>
            {member.photoURL ? (
              <Image src={member.photoURL} style={styles.photo} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Text style={styles.photoPlaceholderText}>No Photo</Text>
              </View>
            )}
            <View style={styles.photoInfo}>
              <View style={styles.fRow}>
                <R label="सदस्य क्र." value={member.registrationNumber} />
                <R label="पंजीयन तिथि" value={member.dateJoin} />
              </View>
              <View style={[styles.fRow, { borderBottomWidth: 0 }]}>
                <View style={styles.fCellFull}>
                  <Text style={styles.fLblWide}>पूरा नाम</Text>
                  <Text style={[styles.fVal, { fontSize: 10, fontWeight: 'bold' }]}>
                    {member.displayName || ''}{member.fatherName ? ' / ' + member.fatherName : ''}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* ═══ Personal Info ═══ */}
          <View style={styles.card}>
            <View style={styles.cardHdr}><Text style={styles.cardHdrText}>व्यक्तिगत जानकारी</Text></View>
            <View style={styles.cardBody}>
              <View style={styles.fRow}>
                <R label="पिता का नाम" value={member.fatherName} />
                <R label="उपनाम (गोत्र)" value={member.surname} />
              </View>
              <View style={styles.fRow}>
                <R label="जाति" value={member.caste} />
                <R label="जन्म तिथि" value={member.dobDate} />
              </View>
              <View style={styles.fRow}>
                <R label="आयु" value={member.age ? member.age + ' वर्ष' : null} />
                <R label="आधार नं." value={member.aadhaarNo} />
              </View>
              <View style={[styles.fRow, { borderBottomWidth: 0 }]}>
                <R label="वैवाहिक स्थिति" value={member.marriage_flag ? 'विवाहित' : 'अविवाहित'} />
                <R label="आयु वर्ग" value={member.ageGroupName || member.ageGroup} />
              </View>
            </View>
          </View>

          {/* ═══ Contact ═══ */}
          <View style={styles.card}>
            <View style={styles.cardHdr}><Text style={styles.cardHdrText}>संपर्क विवरण</Text></View>
            <View style={styles.cardBody}>
              <View style={styles.fRow}>
                <View style={styles.fCellFull}>
                  <Text style={styles.fLblWide}>मोबाइल नं.</Text>
                  <Text style={styles.fVal}>
                    {member.phone || '—'}{member.phoneAlt ? ' / ' + member.phoneAlt : ''}
                  </Text>
                </View>
              </View>
              <View style={styles.fRow}>
                <View style={styles.fCellFull}>
                  <Text style={styles.fLblWide}>पता</Text>
                  <Text style={styles.fVal}>{member.currentAddress || '—'}</Text>
                </View>
              </View>
              <View style={[styles.fRow, { borderBottomWidth: 0 }]}>
                <R label="गाँव" value={member.village} />
                <R label="शहर" value={member.city} />
              </View>
              <View style={[styles.fRow, { borderBottomWidth: 0, marginTop: 3 }]}>
                <R label="जिला" value={member.district} />
                <R label="राज्य" value={member.state} />
              </View>
              <View style={[styles.fRow, { borderBottomWidth: 0, marginTop: 3 }]}>
                <R label="पिन कोड" value={member.pinCode} />
                <View style={styles.fCell}><Text style={styles.fLbl}></Text><Text style={styles.fVal}></Text></View>
              </View>
            </View>
          </View>

          {/* ═══ Program ═══ */}
          <View style={styles.card}>
            <View style={styles.cardHdr}><Text style={styles.cardHdrText}>कार्यक्रम विवरण</Text></View>
            <View style={styles.cardBody}>
              <View style={styles.fRow}>
                <View style={styles.fCellFull}>
                  <Text style={styles.fLblWide}>कार्यक्रम</Text>
                  <Text style={styles.fVal}>{member.programName || '—'}</Text>
                </View>
              </View>
              <View style={styles.fRow}>
                <R label="आयु वर्ग" value={member.ageGroupName || member.ageGroup} />
                <R label="भुगतान राशि" value={member.payAmount ? '₹' + member.payAmount : null} />
              </View>
              <View style={styles.fRow}>
                <R label="पंजीयन तिथि" value={member.dateJoin} />
                {member.periodStartDate ? (
                  <View style={styles.fCell}>
                    <Text style={styles.fLbl}>अवधि</Text>
                    <Text style={styles.fVal}>{member.periodStartDate} → {member.periodEndDate || ''}</Text>
                  </View>
                ) : (
                  <View style={styles.fCell}><Text style={styles.fLbl}></Text><Text style={styles.fVal}></Text></View>
                )}
              </View>
              <View style={[styles.feesRow]}>
                <View style={styles.feeItem}>
                  <Text style={[styles.feeVal, { color: C.blue }]}>₹{(member.joinFees || 0).toLocaleString()}</Text>
                  <Text style={styles.feeLbl}>कुल शुल्क</Text>
                </View>
                <View style={styles.feeItem}>
                  <Text style={[styles.feeVal, { color: C.green }]}>₹{(member.paidAmount || 0).toLocaleString()}</Text>
                  <Text style={styles.feeLbl}>भुगतान</Text>
                </View>
                <View style={styles.feeItem}>
                  <Text style={[styles.feeVal, { color: (member.pendingAmount || 0) > 0 ? C.orange : C.green }]}>
                    ₹{(member.pendingAmount || 0).toLocaleString()}
                  </Text>
                  <Text style={styles.feeLbl}>बकाया</Text>
                </View>
                <View style={styles.feeItem}>
                  <Text style={[styles.feeVal, { color: (member.paymentPercentage || 0) >= 100 ? C.green : C.orange }]}>
                    {member.paymentPercentage || 0}%
                  </Text>
                  <Text style={styles.feeLbl}>प्रतिशत</Text>
                </View>
              </View>
            </View>
          </View>

          {/* ═══ Nominee / Varisdar ═══ */}
          <View style={styles.card}>
            <View style={styles.cardHdr}><Text style={styles.cardHdrText}>नॉमिनी / वारिसदार विवरण</Text></View>
            <View style={styles.cardBody}>
              <View style={styles.guardRow}>
                {member.guardianPhotoURL ? (
                  <Image src={member.guardianPhotoURL} style={styles.guardPhoto} />
                ) : (
                  <View style={styles.guardPlaceholder}>
                    <Text style={{ fontSize: 6, color: '#999' }}>N/A</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={[styles.fRow, { borderBottomWidth: 0 }]}>
                    <View style={styles.fCellFull}>
                      <Text style={styles.fLblWide}>नाम</Text>
                      <Text style={styles.fVal}>{member.guardian || '—'}</Text>
                    </View>
                  </View>
                  <View style={[styles.fRow, { borderBottomWidth: 0, marginTop: 3 }]}>
                    <View style={styles.fCellFull}>
                      <Text style={styles.fLblWide}>संबंध</Text>
                      <Text style={styles.fVal}>{member.guardianRelation || '—'}</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* ═══ Documents ═══ */}
          {docItems.length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardHdr}><Text style={styles.cardHdrText}>दस्तावेज ({docItems.length})</Text></View>
              <View style={[styles.cardBody, { paddingBottom: 3 }]}>
                <View style={styles.docsWrap}>
                  {docItems.map((d, i) => (
                    <View key={i} style={styles.docCard}>
                      {d.url.includes('.pdf') ? (
                        <View style={{ width: '100%', height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff0f0', borderRadius: 2 }}>
                          <Text style={{ fontSize: 6, color: C.red, fontWeight: 'bold' }}>PDF</Text>
                        </View>
                      ) : (
                        <Image src={d.url} style={styles.docImg} />
                      )}
                      <Text style={styles.docLbl}>{d.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          )}

          <View style={styles.signRow}>
            <Text style={styles.signText}>संस्थापक हस्ताक्षर</Text>
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
      </Page>
    </Document>
  );
};

export default MemberDetailsPdf;
