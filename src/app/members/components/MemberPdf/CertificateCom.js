import FrameImg from '@/app/api/helper/Images/FraameImg';
import LogoImg from '@/app/api/helper/Images/LogoImg';
import RigthImg from '@/app/api/helper/Images/rigthImg';
import NotoSansDevanagari from '@/app/api/helper/static/font/NotoSansDevanagari';
import NotoSansDevanagariBold from '@/app/api/helper/static/font/NotoSansDevanagariBold';
import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import React from 'react'
import { getTrust, fitFontSize } from '@/utils/trust/trustStore';
import { DEFAULT_PDF_PRIMARY, DEFAULT_PDF_ACCENT } from '@/utils/trust/theme';
import {
  normalizeCertificate, buildCertificateValues, fillCertificateText, certificateFieldValue,
} from '@/utils/trust/certificateConfig';

Font.register({
  family: 'NotoSansDevanagari',
  fonts: [
    {
      src: NotoSansDevanagari,
      fontWeight: 'normal',
    },
    {
      src: NotoSansDevanagariBold,
      fontWeight: 'bold',
    }
  ]
});

let RED = DEFAULT_PDF_ACCENT;    // accent  (Settings → Trust Details → Colours)
let BLUE = DEFAULT_PDF_PRIMARY;  // primary (Settings → Trust Details → Colours)

// Layout choices come from Settings → Certificate Builder (trust.certificate).
const DEFAULT_LAYOUT = normalizeCertificate();
const STATE_GAP = 26;   // space between the title badge and the state name on each side
// Lines wrap only between words — never in the middle of a word or a number
const wholeWords = (word) => [word];
const pick = (choice) => (choice === 'primary' ? BLUE : choice === 'accent' ? RED : '#000');

const buildStyles = (c = DEFAULT_LAYOUT) => StyleSheet.create({
  page: {
    backgroundColor: '#ffffff',
    fontFamily: 'NotoSansDevanagari',
    width: '210mm',
    height: '148mm',
  },
  outerView: {
    width: '100%',
    height: "100%",
    // borderWidth: 4,
    // borderColor: "#d4af37",
    // borderStyle: "solid",
    position: 'relative',
    // How far the text stays from the page edge — set to suit the frame picture
    paddingHorizontal: c.padX,
    paddingVertical: c.padY,
    display: 'flex',
    flexDirection: 'column',
  },
  
  // Header Styles
  topText: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 30,
  },
  smallText: {
    fontSize: 9,
    color: RED,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  // Header: logo | name + address | picture. Both side boxes are the SAME fixed
  // width, so the name is always in the exact middle of the page — no matter how
  // long the text under either picture is.
  headerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
    paddingHorizontal: 10,
  },
  sideBox: {
    width: 78,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: 70,
    height: 62,
    borderRadius: 4,
    objectFit: 'contain',
  },
  logoImage1: {
    width: 70,
    height: 62,
    borderRadius: 4,
    objectFit: 'contain',
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  mainTitle: {
    fontSize: 16,
    color: BLUE,
    fontWeight: 'bold',
    marginBottom: 3,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  // "label : value" printed as ONE centred line, so the label always sits right
  // beside its text (short address or long).
  infoLine: {
    fontSize: 8,
    color: '#000',
    textAlign: 'center',
    marginBottom: 2,
  },
  infoLabel: {
    color: RED,
    fontWeight: 600,
  },
  phoneNo: {
    fontWeight: 900,
    color: BLUE
  },
  // Row under the header: SINCE · state | title badge | state · Reg. No.
  // The two sides share the leftover width equally, which keeps the badge centred.
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  titleSide: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Sits under a picture: short text is centred below it, long text grows inwards
  captionBox: {
    minWidth: 84,
    flexShrink: 1,
    alignItems: 'center',
  },
  imageText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: BLUE,
    textAlign: 'center',
  },
  stateText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: BLUE,
    flexShrink: 0,
  },
  schemeBox: {
    backgroundColor: RED,
    borderRadius: 12,
    paddingVertical: 2,
    paddingHorizontal: 12,
    alignSelf: 'center',
  },
  schemeText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: 'bold',
    letterSpacing: 0.4,
    marginTop: 1,
  },
  watermark: {
    position: 'absolute',
    top: '40mm',
    left: '54mm',
    width: '90mm',
    height: '70mm',
    opacity: c.watermarkOpacity / 100,
    zIndex: 0,
  },
  
  // ========== IMPROVED CONTENT SECTION ==========
  
  // Member Info Row
  memberInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
    marginTop: 10,
    paddingHorizontal: 4,
  },
  
  memberIdText: {
    fontSize: 10,
    color: '#000',
    fontWeight: 'normal',
  },
  
  memberIdValue: {
    fontSize: 10,
    color: RED,
    fontWeight: 'bold',
  },
  
  schemeNameText: {
    fontSize: 11,
    color: '#000',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  dateLabel: {
    fontSize: 10,
    color: BLUE,
    fontWeight: 'normal',
  },
  
  dateValue: {
    fontSize: 10,
    color: RED,
    fontWeight: '500',
  },
  
  // Main Content Section with Controlled Height
  contentSection: {
    flexDirection: 'row',
    paddingHorizontal: 4,
    marginTop: 2,
    gap: 10,
    marginBottom: 4,
  },
  
  // Left Side - All Details in TWO COLUMNS
  leftDetails: {
    flex: 3,
    paddingRight: 6,
  },
  
  detailsWrapper: {
    flexDirection: 'row',
    gap: 12,
  },
  
  leftColumn: {
    flex: 1,
  },
  
  rightColumn: {
    flex: 1,
  },
  
  // Field Row Styles - Reduced spacing
  detailRow: {
    flexDirection: 'row',
    marginBottom: 4,
    alignItems: 'flex-start',
  },
  
  detailLabel: {
    fontSize: c.detailFontSize,
    color: pick(c.labelColor),
    fontWeight: 'normal',
    width: `${c.labelWidth}%`,
    textAlign: 'left',
  },
  
  detailColon: {
    fontSize: c.detailFontSize,
    color: pick(c.valueColor),
    fontWeight: '500',
    marginHorizontal: 2,
  },
  
  detailValue: {
    fontSize: c.detailFontSize,
    color: pick(c.valueColor),
    fontWeight: '500',
    flex: 1,
    textTransform: c.valuesUppercase ? 'uppercase' : 'none',
  },
  
  // Photo Section - Right Side (Only Photo)
  photoSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  
  memberPhotoContainer: {
    width: 95,
    height: 115,
    borderRadius: 2,
    overflow: 'hidden',
  },
  
  memberPhoto: {
    width: '100%',
    height: '100%',
    objectFit: 'fill',
  },
  
  noPhotoContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  noPhotoText: {
    color: '#999',
    fontSize: 8,
  },
  
  // Scheme Information - Compact
  schemeInfo: {
    paddingHorizontal: 4,
    marginTop: 4,
    marginBottom: 6,
  },
  
  contributionText: {
    fontSize: 10,
    color: '#000',
    fontWeight: 'bold',
    marginBottom: 2,
    textAlign: 'left',
  },
  
  rulesRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  rulesLabel: {
    fontSize: 10,
    color: RED,
    fontWeight: 'bold',
    marginRight: 4,
  },
  
  rulesText: {
    fontSize: 9.5,
    color: '#000',
    lineHeight: 1.3,
    flex: 1,
  },
  
  // ========== IMPROVED FOOTER SECTION ==========
  footer: {
    marginTop: 'auto',
    paddingTop: 6,
    paddingBottom: 2,
    paddingHorizontal: 15,
    borderTopWidth: 1,
    borderTopColor: BLUE,
    position:'relative',
    width:'100%'
  },
  
  footerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
     width:'100%'
  },
  
  founderSection: {
    paddingRight: 8,
    alignItems:'center'
  },
  
  founderLabel: {
    fontSize: 13,
    color: BLUE,
    fontWeight: 'bold',
    marginBottom: 2,
    textAlign:'center'
  },
  
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    width: 110,
    marginTop: 16,
    marginBottom: 2,
  },
  
  founderName: {
    fontSize: 11,
    color: BLUE,
    fontWeight: 'normal',
    textTransform:'uppercase',
     textAlign:'center'
  },
  
  centerFooter: {
    flex: 2,
    alignItems: 'center',
    paddingHorizontal: 8,
    position:'absolute',
    top:30,
    left:90,
    width:'50%'
  },
  
  
  trustNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    gap: 8,
  },
  
  trustNameFooter: {
    fontSize: 12,
    color: BLUE,
    fontWeight: '600',
    textAlign: 'center',
  },
  
  founderNameInline: {
    fontSize: 11,
    color: '#000',
    fontWeight: 'bold',
  },
  
  footerNote: {
    fontSize: 9,
    color: '#487BA3',
    textAlign: 'center',
    marginBottom: 1,
    lineHeight: 1.3,
    fontWeight:'bold'
  },
  
  rightFooter: {
    alignItems: 'center',
    maxWidth: '44%',
  },
  
  founderLabelRight: {
    fontSize: 13,
    color: RED,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  bgImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: 'fill',
    zIndex: -1,
      opacity: 0.8,
  },
  frameImg:{
     position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: c.frameFit === 'contain' ? 'contain' : 'fill',
    zIndex: -1,
      },
       rowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap', // For smaller screens
  },

  joinFeesText: {
    fontSize: 10,
    color: '#000',
    marginLeft: 10,
    fontWeight: '500',
  },

  noteText: {
    fontSize: 9.5,
    color: '#000',
    lineHeight: 1.3,
    marginTop: 2,
  },

  // Signature picture above a footer name (Certificate Builder)
  signImage: {
    height: 24,
    width: 96,
    objectFit: 'contain',
    marginBottom: 1,
  },

  // Keeps the title centred when a header picture is switched off
  logoGap: {
    width: 70,
    height: 62,
  },
});

// Styles are built by a function so the brand colours and the builder's layout
// choices can change. Rebuilt only when one of them actually differs.
let styles = buildStyles();
let styleKey = '';

const applyStyles = (trust, c) => {
  const key = [
    trust.pdfColorPrimary, trust.pdfColorAccent, c.watermarkOpacity, c.detailFontSize,
    c.labelWidth, c.labelColor, c.valueColor, c.valuesUppercase, c.padX, c.padY, c.frameFit,
  ].join('|');
  if (key === styleKey) return;
  styleKey = key;
  BLUE = trust.pdfColorPrimary;
  RED = trust.pdfColorAccent;
  styles = buildStyles(c);
};

// A picture the PDF renderer can actually load (full web address or embedded data)
const loadable = (src) => typeof src === 'string' && /^(https?:|data:)/.test(src);

const CertificatePage = ({ data, memberProgram, trust: trustProp }) => {
  // Trust details: passed in by server routes, otherwise the panel's live store.
  const trust = trustProp || getTrust();
  // Layout: Settings → Certificate Builder. Missing → the built-in certificate.
  const c = trust.certificate || DEFAULT_LAYOUT;
  applyStyles(trust, c);

  // Uploaded images win; otherwise the built-in ones bundled with the panel.
  const logoImg  = trust.hasCustomLogo && trust.logoSrc ? trust.logoSrc : LogoImg;
  const rightImg = trust.hasCustomRightImage && trust.rightImageSrc ? trust.rightImageSrc : RigthImg;
  const frameImg = trust.hasCustomFrame && trust.frameSrc ? trust.frameSrc : FrameImg;

  // Every value a row or a {placeholder} can print for this member
  const values = buildCertificateValues(data, memberProgram, trust);
  const fill = (text) => fillCertificateText(text, values).trim();

  const rows = c.fields.filter((f) => f.show);
  const leftRows = rows.filter((f) => f.col !== 'right');
  const rightRows = rows.filter((f) => f.col === 'right');

  const schemeLine = c.showScheme ? fill(c.schemeText) : '';
  const contribution = c.showContribution ? fill(c.contributionText) : '';
  const joinFeeLine = c.showJoinFee && !!data?.joinFees && values.joinFeePending !== '' ? fill(c.joinFeeText) : '';
  const rule = c.showRules ? String(memberProgram?.certificateRule || '').trim() : '';
  const note = fill(c.note);
  const centerLines = c.showCenter ? [fill(c.centerLine1), fill(c.centerLine2)].filter(Boolean) : [];
  const rightLine1 = fill(c.rightLine1);
  const rightLine2 = fill(c.rightLine2);
  const sinceText = c.showSince && trust.since ? `SINCE: ${trust.since}` : '';
  const regText = c.showRegNo ? trust.regText : '';

  const detailRow = (f) => (
    <View key={f.id} style={styles.detailRow}>
      <Text style={styles.detailLabel}>{f.label}</Text>
      <Text style={styles.detailColon}>:</Text>
      <Text style={styles.detailValue}>{certificateFieldValue(f, values)}</Text>
    </View>
  );

  return (
    <Page size={{ width: '210mm', height: '148mm' }} style={styles.page}>
      {c.showFrame && <Image src={frameImg} style={styles.frameImg} />}

      <View style={styles.outerView}>
        {c.showWatermark && <Image src={logoImg} style={styles.watermark} />}

        {/* Header Section */}
        {/* A single blessing line sits in the middle; two or three spread across */}
        <View style={[styles.topText, trust.blessings.length === 1 ? { justifyContent: 'center' } : null]}>
          {c.showBlessings && trust.blessings.map((line, i) => (<Text key={i} style={styles.smallText}>{line}</Text>))}
        </View>

        <View style={styles.headerSection}>
          <View style={styles.sideBox}>
            {c.showLogo ? <Image src={logoImg} style={styles.logoImage} /> : <View style={styles.logoGap} />}
          </View>

          <View style={styles.centerContent}>
            {/* The certificate is one fixed page — a long name shrinks instead of wrapping */}
            <Text hyphenationCallback={wholeWords} style={[styles.mainTitle, { fontSize: fitFontSize(trust.name, 16, 50) }]}>{trust.name}</Text>

            {c.showAddress && (
              <Text hyphenationCallback={wholeWords} style={styles.infoLine}>
                <Text style={styles.infoLabel}>{c.addressLabel} </Text>
                {trust.addressWithOffice}
              </Text>
            )}

            {c.showContact && (
              <Text hyphenationCallback={wholeWords} style={styles.infoLine}>
                <Text style={styles.infoLabel}>{c.contactLabel} </Text>
                <Text style={styles.phoneNo}>{trust.contactNumbers}</Text>
              </Text>
            )}
          </View>

          <View style={styles.sideBox}>
            {c.showRightImage ? <Image src={rightImg} style={styles.logoImage1} /> : <View style={styles.logoGap} />}
          </View>
        </View>

        <View style={styles.titleRow}>
          <View style={styles.titleSide}>
            <View style={[styles.captionBox, { paddingRight: 6 }]}>
              <Text style={styles.imageText}>{sinceText}</Text>
            </View>
            <Text style={[styles.stateText, { marginRight: STATE_GAP }]}>{c.showStates ? trust.stateLeft : ''}</Text>
          </View>

          {c.title.trim() ? (
            <View style={styles.schemeBox}>
              <Text style={styles.schemeText}>{c.title}</Text>
            </View>
          ) : null}

          <View style={styles.titleSide}>
            <Text style={[styles.stateText, { marginLeft: STATE_GAP }]}>{c.showStates ? trust.stateRight : ''}</Text>
            <View style={[styles.captionBox, { paddingLeft: 6 }]}>
              {/* A long registration number gets smaller instead of pushing the header sideways */}
              <Text hyphenationCallback={wholeWords} style={[styles.imageText, { fontSize: fitFontSize(regText, 9, 25.5, 0.6) }]}>{regText}</Text>
            </View>
          </View>
        </View>

        {/* Member ID, Scheme Name and Date Row */}
        <View style={styles.memberInfoRow}>
          {c.showMemberNo ? (
            <Text style={styles.memberIdText}>
              {c.memberNoLabel}{' '}
              <Text style={styles.memberIdValue}>
                {data?.registrationNumber}
                {data?.legacyApplicationNo && ` (${data.legacyApplicationNo})`}
              </Text>
            </Text>
          ) : <Text style={styles.memberIdText}>{' '}</Text>}
          <Text style={styles.schemeNameText}>{schemeLine}</Text>
          {c.showDate ? (
            <View style={styles.dateContainer}>
              <Text style={styles.dateLabel}>{c.dateLabel} </Text>
              <Text style={styles.dateValue}>{values.dateJoin}</Text>
            </View>
          ) : <Text style={styles.dateLabel}>{' '}</Text>}
        </View>

        {/* Main Content Section */}
        <View style={styles.contentSection}>
          {/* Left Side - the detail rows, in two columns */}
          <View style={styles.leftDetails}>
            <View style={styles.detailsWrapper}>
              <View style={styles.leftColumn}>{leftRows.map(detailRow)}</View>
              <View style={styles.rightColumn}>{rightRows.map(detailRow)}</View>
            </View>
          </View>

          {/* Right Side - Only Photo */}
          {c.showPhoto && (
            <View style={styles.photoSection}>
              <View style={styles.memberPhotoContainer}>
                {data?.photoURL ? (
                  <Image
                    src={data.photoURL}
                    style={styles.memberPhoto}
                  />
                ) : (
                  <View style={styles.noPhotoContainer}>
                    <Text style={styles.noPhotoText}>No Photo</Text>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>

        {/* Scheme Information */}
        <View style={styles.schemeInfo}>
          <View style={styles.rowContainer}>
            {contribution ? <Text style={styles.contributionText}>{contribution}</Text> : null}
            {joinFeeLine ? <Text style={styles.joinFeesText}>{joinFeeLine}</Text> : null}
          </View>

          {rule ? (
            <View style={styles.rulesRow}>
              <Text style={styles.rulesLabel}>{c.rulesLabel}</Text>
              <Text style={styles.rulesText}>{rule}</Text>
            </View>
          ) : null}

          {note ? <Text style={styles.noteText}>{note}</Text> : null}
        </View>

        {/* Footer Section */}
        <View style={styles.footer}>
          <View style={styles.footerTop}>
            <View style={styles.founderSection}>
              {c.showLeft && (
                <>
                  <Text style={styles.founderLabel}>{c.leftLabel}</Text>
                  {loadable(c.leftSignSrc) && <Image src={c.leftSignSrc} style={styles.signImage} />}
                  <Text style={styles.founderName}>{fill(c.leftText)}</Text>
                </>
              )}
            </View>

            <View style={styles.centerFooter}>
              {centerLines.map((line, i) => (<Text key={i} style={styles.footerNote}>{line}</Text>))}
            </View>

            <View style={styles.rightFooter}>
              {c.showRight && (
                <>
                  <Text style={styles.founderLabelRight}>{c.rightLabel}</Text>
                  {loadable(c.rightSignSrc) && <Image src={c.rightSignSrc} style={styles.signImage} />}
                  <Text style={[styles.trustNameFooter, { fontSize: fitFontSize(rightLine1, 12, 50) }]}>
                    {rightLine1}
                  </Text>
                  <Text style={styles.trustNameFooter}>
                    {rightLine2}
                  </Text>
                </>
              )}
            </View>
          </View>
        </View>
      </View>
    </Page>
  );
};

const CertificateCom = ({ data, memberProgram, trust }) => {
  const membersArray = Array.isArray(data) ? data : [data];

  return (
    <Document>
      {membersArray.map((member, index) => (
        <CertificatePage
          key={member?.id || member?.registrationNumber || index}
          data={member}
          // Each member carries its own program when present. A batch download
          // can span several yojnas, and using the single shared prop for every
          // page stamped the first member's scheme name onto all of them.
          // The prop remains the fallback for single-certificate rendering.
          memberProgram={member?.memberProgram || memberProgram}
          trust={trust}
          index={index}
        />
      ))}
    </Document>
  )
}

export default CertificateCom;
