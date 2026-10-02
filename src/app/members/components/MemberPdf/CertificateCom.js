import FrameImg from '@/app/api/helper/Images/FraameImg';
import LogoImg from '@/app/api/helper/Images/LogoImg';
import RigthImg from '@/app/api/helper/Images/rigthImg';
import NotoSansDevanagari from '@/app/api/helper/static/font/NotoSansDevanagari';
import NotoSansDevanagariBold from '@/app/api/helper/static/font/NotoSansDevanagariBold';
import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import React from 'react'
import { getTrust, fitFontSize } from '@/utils/trust/trustStore';
import { DEFAULT_PDF_PRIMARY, DEFAULT_PDF_ACCENT } from '@/utils/trust/theme';

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

const buildStyles = () => StyleSheet.create({
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
    padding: 35,
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
  headerSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 10,
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
    paddingHorizontal: 12,
  },
  mainTitle: {
    fontSize: 16,
    color: BLUE,
    fontWeight: 'bold',
    marginBottom: 3,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  addressBox: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 2,
  },
  addresshLabel: {
    color: RED,
    fontSize: 8,
    fontWeight: 600
  },
  addressValue: {
    color: '#000',
    fontSize: 8,
    textAlign: 'center',
    width: '90%',
  },
  phoneNo: {
    fontWeight: 900,
    color: BLUE
  },
  imageText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: BLUE,
    marginTop: 2,
  },
  imageBox: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2
  },
  headingBox: {
    flexDirection: 'row',
    width: '80%',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 3
  },
  stateText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: BLUE
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
    opacity: 0.08,
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
    fontSize: 10,
    color: BLUE,
    fontWeight: 'normal',
    width: '30%',
    textAlign: 'left',
  },
  
  detailColon: {
    fontSize: 10,
     color: RED,
    fontWeight: '500',
    marginHorizontal: 2,
  },
  
  detailValue: {
    fontSize: 10,
    color: RED,
    fontWeight: '500',
    flex: 1,
    textTransform: 'uppercase',
  },
  
  detailValueNormal: {
    fontSize: 10,
    color: RED,
    fontWeight: '500',
    flex: 1,
    textTransform: 'uppercase',
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
    objectFit: 'fill',
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

  const formatDate = (dateString) => {
    if (!dateString) return '09-01-2026';
    return dateString;
  };

  const CertificatePage=({data, memberProgram, trust: trustProp})=>{
  // Trust details: passed in by server routes, otherwise the panel's live store.
  const trust = trustProp || getTrust();
  applyPdfColors(trust);
  // Uploaded images win; otherwise the built-in ones bundled with the panel.
  const logoImg  = trust.hasCustomLogo && trust.logoSrc ? trust.logoSrc : LogoImg;
  const rightImg = trust.hasCustomRightImage && trust.rightImageSrc ? trust.rightImageSrc : RigthImg;
  const frameImg = trust.hasCustomFrame && trust.frameSrc ? trust.frameSrc : FrameImg;
  return (   <Page size={{ width: '210mm', height: '148mm' }} style={styles.page}>

           <Image
            src={frameImg}
            style={styles.frameImg}
          />
                {/* <Image
            src="/Images/frameImg4.jpg"
            style={styles.bgImage}
          /> */}
        <View style={styles.outerView}>
          <Image
            src={logoImg}
            style={styles.watermark}
          />
     
          {/* Header Section */}
          <View style={styles.topText}>
            {trust.blessings.map((line, i) => (<Text key={i} style={styles.smallText}>{line}</Text>))}
          </View>

          <View style={styles.headerSection}>
            <View style={styles.imageBox}>
              <Image
                src={logoImg}
                style={styles.logoImage}
              />
              <Text style={styles.imageText}>{trust.since ? `SINCE: ${trust.since}` : ''}</Text>
            </View>

            <View style={styles.centerContent}>
              {/* The certificate is one fixed page — a long name shrinks instead of wrapping */}
              <Text style={[styles.mainTitle, { fontSize: fitFontSize(trust.name, 16, 50) }]}>{trust.name}</Text>

              <View style={styles.addressBox}>
                <Text style={styles.addresshLabel}> हेड ऑफिस : </Text>
                <Text style={styles.addressValue}>
                  {trust.addressWithOffice}
                </Text>
              </View>

              <View style={styles.addressBox}>
                <Text style={styles.addresshLabel}> संपर्क सूत्र : </Text>
                <Text style={[styles.addressValue, styles.phoneNo]}>
                  {trust.contactNumbers}
                </Text>
              </View>

              <View style={styles.headingBox}>
                <Text style={styles.stateText}>{trust.stateLeft} </Text>
                <View style={styles.schemeBox}>
                  <Text style={styles.schemeText}>सदस्यता प्रमाण पत्र</Text>
                </View>
                <Text style={styles.stateText}>{trust.stateRight}</Text>
              </View>
            </View>

            <View style={styles.imageBox}>
              <Image
                src={rightImg}
                style={styles.logoImage1}
              />
              <Text style={styles.imageText}>{trust.regText}</Text>
            </View>
          </View>

          {/* Member ID, Scheme Name and Date Row */}
          <View style={styles.memberInfoRow}>
       <Text style={styles.memberIdText}>
  सदस्य क्रमांक :{" "}
  <Text style={styles.memberIdValue}>
    {data?.registrationNumber}
    {data?.legacyApplicationNo && ` (${data.legacyApplicationNo})`}
  </Text>
</Text>
            <Text style={styles.schemeNameText}>
             {memberProgram?.name || '-'} Group - { data.ageGroupName || data.memberGroupName || data.ageGroup || '-'}
            </Text>
            <View style={styles.dateContainer}>
              <Text style={styles.dateLabel}>दिनांक : </Text>
              <Text style={styles.dateValue}>{formatDate(data?.dateJoin)}</Text>
            </View>
          </View>

          {/* Main Content Section */}
          <View style={styles.contentSection}>
            {/* Left Side - All Details in Two Columns */}
            <View style={styles.leftDetails}>
              <View style={styles.detailsWrapper}>
                {/* Left Column */}
                <View style={styles.leftColumn}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>नाम</Text>
                    <Text style={styles.detailColon}>:</Text>
                    <Text style={styles.detailValue}>
                      {data?.displayName || 'रामलालजी'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>पिता का नाम</Text>
                    <Text style={styles.detailColon}>:</Text>
                    <Text style={styles.detailValueNormal}>
                      {data?.fatherName || 'लछारामजी'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>फोन न.</Text>
                    <Text style={styles.detailColon}>:</Text>
                    <Text style={styles.detailValue}>
                      {data?.phone || '8005948238'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>जाति</Text>
                    <Text style={styles.detailColon}>:</Text>
                    <Text style={styles.detailValueNormal}>
                      {data?.caste || 'घाँची'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>जन्मतिथि</Text>
                    <Text style={styles.detailColon}>:</Text>
                    <Text style={styles.detailValueNormal}>
                      {data?.dobDate || '01-01-1974'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>गोत्र</Text>
                    <Text style={styles.detailColon}>:</Text>
                    <Text style={styles.detailValueNormal}>
                      {data?.surname || 'घांची'}
                    </Text>
                  </View>
                </View>

                {/* Right Column */}
                <View style={styles.rightColumn}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>वारिसदार</Text>
                    <Text style={styles.detailColon}>:</Text>
                    <Text style={styles.detailValueNormal}>
                      {data?.guardian || 'चंपादेवी'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>संबंध</Text>
                    <Text style={styles.detailColon}>:</Text>
                    <Text style={styles.detailValueNormal}>
                      {data?.guardianRelation || 'पति-पत्नी'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>पता</Text>
                    <Text style={styles.detailColon}>:</Text>
                    <Text style={styles.detailValueNormal}>
                      {data?.currentAddress || data?.village || 'हेमावास'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>गांव & जिला</Text>
                    <Text style={styles.detailColon}>:</Text>
                    <Text style={styles.detailValueNormal}>
                      {`${data?.village || 'पाली'}${data?.district ? `, ${data.district}` : ', ( Pali )'}`}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>राज्य</Text>
                    <Text style={styles.detailColon}>:</Text>
                    <Text style={styles.detailValue}>
                      {data?.state || 'Rajasthan'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>आधार कार्ड</Text>
                    <Text style={styles.detailColon}>:</Text>
                    <Text style={styles.detailValue}>
                      {data?.aadhaarNo || '7459-0183-8700'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Right Side - Only Photo */}
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
          </View>

          {/* Scheme Information */}
 <View style={styles.schemeInfo}>
  <View style={styles.rowContainer}>
    <Text style={styles.contributionText}>
      सहयोग राशि : ₹ {data?.payAmount} रूपये प्रत्येक कार्यक्रम पर लागु।
    </Text>
    {data?.joinFees && (
      <Text style={styles.joinFeesText}>
        जॉइन फीस : ₹ {data?.fixedJoinFees-data?.joinFees} Pending
      </Text>
    )}
  </View>
  
  {memberProgram?.certificateRule?.trim() && (
    <View style={styles.rulesRow}>
      <Text style={styles.rulesLabel}>योजना नियम :</Text>
      <Text style={styles.rulesText}>
        {memberProgram?.certificateRule}
      </Text>
    </View>
  )}
</View>

          {/* Improved Footer Section */}
          <View style={styles.footer}>
            <View style={styles.footerTop}>
              <View style={styles.founderSection}>
                <Text style={styles.founderLabel}>कार्यकर्ता</Text>
                <Text style={styles.founderName}>{data?.agentName || ''}</Text>
                {/* <Text style={styles.founderName}>{data?.agentPhone || ''}</Text> */}

              </View>

              <View style={styles.centerFooter}>
                <Text style={styles.footerNote}>{trust.slogan}</Text>
                <Text style={styles.footerNote}>{trust.jurisdiction}</Text>
              </View>

              <View style={styles.rightFooter}>
                <Text style={styles.founderLabelRight}>संस्थापक</Text>
                   <Text style={[styles.trustNameFooter, { fontSize: fitFontSize(trust.name, 12, 50) }]}>
                    {trust.name}
                  </Text>
                     <Text style={styles.trustNameFooter}>
                    {trust.city}
                  </Text>
           
              </View>
            </View>
          </View>
        </View>
      </Page>)}

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