// Membership certificate — everything that can be changed from
// Settings → Certificate Builder.
//
// The builder saves ONE object. It is stored (as JSON text) in the field
// `certificateConfig` of settings/trustInfo, so it travels with the trust
// details everywhere they already go: the browser store, the public API, the
// live Firestore listener and the server routes that render the certificate.
//
// DEFAULT_CERTIFICATE is exactly the certificate as it was before the builder
// existed — an empty / missing config prints the same page as always.
//
// No React and no Firebase imports here: the PDF document, the builder page and
// the server all share this file.

export const CERT_CONFIG_VERSION = 1;
export const CERT_MAX_FIELDS = 20;

// Uploaded signature images live beside the other trust images.
const STORAGE_PATH_RE = /^settings\/trust\/[A-Za-z0-9._-]+$/;
const isStoragePath = (p) => typeof p === 'string' && STORAGE_PATH_RE.test(p);

// ── What a detail row can show ───────────────────────────────────────────────
// `sample` is only used by the builder's preview.
export const CERT_FIELD_SOURCES = [
  { key: 'displayName',        label: 'Member name',            sample: 'रामलालजी' },
  { key: 'fatherName',         label: "Father's name",          sample: 'लछारामजी' },
  { key: 'surname',            label: 'Gotra / surname',        sample: 'घांची' },
  { key: 'gender',             label: 'Gender',                 sample: 'पुरुष' },
  { key: 'phone',              label: 'Phone number',           sample: '8005948238' },
  { key: 'phoneAlt',           label: 'Second phone number',    sample: '9000000000' },
  { key: 'caste',              label: 'Caste',                  sample: 'घाँची' },
  { key: 'dobDate',            label: 'Date of birth',          sample: '01-01-1974' },
  { key: 'age',                label: 'Age',                    sample: '52' },
  { key: 'guardian',           label: 'Nominee (वारिसदार)',      sample: 'चंपादेवी' },
  { key: 'guardianRelation',   label: 'Relation with nominee',  sample: 'पति-पत्नी' },
  { key: 'address',            label: 'Address',                sample: 'हेमावास' },
  { key: 'village',            label: 'Village',                sample: 'पाली' },
  { key: 'villageDistrict',    label: 'Village & district',     sample: 'पाली, Pali' },
  { key: 'city',               label: 'City',                   sample: 'पाली' },
  { key: 'district',           label: 'District',               sample: 'Pali' },
  { key: 'state',              label: 'State',                  sample: 'Rajasthan' },
  { key: 'pinCode',            label: 'PIN code',               sample: '306401' },
  { key: 'aadhaarNo',          label: 'Aadhaar number',         sample: '7459-0183-8700' },
  { key: 'registrationNumber', label: 'Member number',          sample: 'MEM548217' },
  { key: 'srNo',               label: 'Sr. No.',                sample: '125' },
  { key: 'dateJoin',           label: 'Join date',              sample: '09-01-2026' },
  { key: 'programName',        label: 'Yojna name',             sample: 'विवाह सहयोग योजना' },
  { key: 'groupName',          label: 'Age group',              sample: 'A' },
  { key: 'payAmount',          label: 'Sahyog amount',          sample: '500' },
  { key: 'agentName',          label: 'Agent (कार्यकर्ता) name',  sample: 'रमेशजी' },
  { key: 'custom',             label: 'Your own text',          sample: '' },
];
const SOURCE_KEYS = new Set(CERT_FIELD_SOURCES.map((s) => s.key));

// Words in { } that can be typed into any text box of the builder.
export const CERT_PLACEHOLDERS = [
  ...CERT_FIELD_SOURCES.filter((s) => s.key !== 'custom').map((s) => ({ key: s.key, label: s.label })),
  { key: 'joinFeePending', label: 'Join fee still pending' },
  { key: 'trustName',      label: 'Trust name' },
  { key: 'trustCity',      label: 'Trust city' },
  { key: 'slogan',         label: 'Slogan (Trust Details)' },
  { key: 'jurisdiction',   label: 'Jurisdiction line (Trust Details)' },
];

const field = (id, label, source, col) => ({ id, label, source, col, show: true, text: '' });

export const DEFAULT_CERT_FIELDS = [
  field('f1',  'नाम',          'displayName',      'left'),
  field('f2',  'पिता का नाम',   'fatherName',       'left'),
  field('f3',  'फोन न.',       'phone',            'left'),
  field('f4',  'जाति',         'caste',            'left'),
  field('f5',  'जन्मतिथि',      'dobDate',          'left'),
  field('f6',  'गोत्र',         'surname',          'left'),
  field('f7',  'वारिसदार',      'guardian',         'right'),
  field('f8',  'संबंध',         'guardianRelation', 'right'),
  field('f9',  'पता',          'address',          'right'),
  field('f10', 'गांव & जिला',   'villageDistrict',  'right'),
  field('f11', 'राज्य',         'state',            'right'),
  field('f12', 'आधार कार्ड',    'aadhaarNo',        'right'),
];

export const DEFAULT_CERTIFICATE = {
  v: CERT_CONFIG_VERSION,

  // ── Page ──────────────────────────────────────────────────────────────────
  // The frame PICTURE itself is a trust image (settings/trustInfo.framePath);
  // these say how it is drawn and how far the text stays away from the edge.
  showFrame: true,
  frameFit: 'fill',               // 'fill' = stretch over the whole page | 'contain' = keep its shape
  padX: 35,                       // space left & right of the text (points)
  padY: 35,                       // space above & below the text (points)

  // ── Header ────────────────────────────────────────────────────────────────
  showWatermark: true,
  watermarkOpacity: 8,            // percent
  showBlessings: true,
  showLogo: true,
  showSince: true,
  showRightImage: true,
  showRegNo: true,
  showAddress: true,
  addressLabel: 'हेड ऑफिस :',
  showContact: true,
  contactLabel: 'संपर्क सूत्र :',
  showStates: true,
  title: 'सदस्यता प्रमाण पत्र',

  // ── Line under the header ─────────────────────────────────────────────────
  showMemberNo: true,
  memberNoLabel: 'सदस्य क्रमांक :',
  showScheme: true,
  schemeText: '{programName} Group - {groupName}',
  showDate: true,
  dateLabel: 'दिनांक :',

  // ── Member details ────────────────────────────────────────────────────────
  fields: DEFAULT_CERT_FIELDS,
  showPhoto: true,
  valuesUppercase: true,
  detailFontSize: 10,
  labelWidth: 30,                 // percent of a column
  labelColor: 'primary',          // 'primary' | 'accent' | 'black'
  valueColor: 'accent',

  // ── Lines under the details ───────────────────────────────────────────────
  showContribution: true,
  contributionText: 'सहयोग राशि : ₹ {payAmount} रूपये प्रत्येक कार्यक्रम पर लागु।',
  showJoinFee: true,
  joinFeeText: 'जॉइन फीस : ₹ {joinFeePending} Pending',
  showRules: true,
  rulesLabel: 'योजना नियम :',
  note: '',

  // ── Footer ────────────────────────────────────────────────────────────────
  showLeft: true,
  leftLabel: 'कार्यकर्ता',
  leftText: '{agentName}',
  leftSignPath: '',
  showCenter: true,
  centerLine1: '{slogan}',
  centerLine2: '{jurisdiction}',
  showRight: true,
  rightLabel: 'संस्थापक',
  rightLine1: '{trustName}',
  rightLine2: '{trustCity}',
  rightSignPath: '',
};

const TEXT_LIMITS = {
  addressLabel: 40, contactLabel: 40, title: 60, memberNoLabel: 40, schemeText: 120, dateLabel: 40,
  contributionText: 200, joinFeeText: 120, rulesLabel: 40, note: 300,
  leftLabel: 40, leftText: 80, centerLine1: 160, centerLine2: 160,
  rightLabel: 40, rightLine1: 120, rightLine2: 80,
};
const NUMBER_LIMITS = {
  watermarkOpacity: [0, 40], detailFontSize: [7, 13], labelWidth: [15, 55],
  padX: [15, 60], padY: [15, 60],
};
const COLOR_CHOICES = ['primary', 'accent', 'black'];
// Settings that must be one of a fixed list
const CHOICES = { labelColor: COLOR_CHOICES, valueColor: COLOR_CHOICES, frameFit: ['fill', 'contain'] };

const cleanText = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]+/g, ' ').slice(0, max);

const cleanField = (f, index) => {
  if (!f || typeof f !== 'object') return null;
  const source = SOURCE_KEYS.has(f.source) ? f.source : 'custom';
  return {
    id: cleanText(f.id, 24) || `f${Date.now().toString(36)}${index}`,
    label: cleanText(f.label, 40),
    source,
    col: f.col === 'right' ? 'right' : 'left',
    show: f.show !== false,
    text: source === 'custom' ? cleanText(f.text, 120) : '',
  };
};

/**
 * Stored config (JSON text or object, possibly partial or damaged) → a complete,
 * safe config. Anything missing or of the wrong type falls back to the default,
 * so a bad save can never produce a broken certificate.
 */
export const normalizeCertificate = (raw) => {
  let input = raw;
  if (typeof raw === 'string') {
    try { input = raw.trim() ? JSON.parse(raw) : {}; } catch { input = {}; }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) input = {};

  const out = { ...DEFAULT_CERTIFICATE };
  for (const [key, def] of Object.entries(DEFAULT_CERTIFICATE)) {
    const v = input[key];
    if (v === undefined || v === null || key === 'fields' || key === 'v') continue;
    if (typeof def === 'boolean') { if (typeof v === 'boolean') out[key] = v; }
    else if (typeof def === 'number') {
      const n = Number(v);
      const [min, max] = NUMBER_LIMITS[key] || [-Infinity, Infinity];
      if (Number.isFinite(n)) out[key] = Math.min(max, Math.max(min, n));
    } else if (CHOICES[key]) { if (CHOICES[key].includes(v)) out[key] = v; }
    else if (key === 'leftSignPath' || key === 'rightSignPath') out[key] = isStoragePath(v) ? v : '';
    else if (typeof v === 'string') out[key] = cleanText(v, TEXT_LIMITS[key] || 200);
  }

  const ids = new Set();
  out.fields = (Array.isArray(input.fields) ? input.fields : DEFAULT_CERT_FIELDS)
    .slice(0, CERT_MAX_FIELDS)
    .map(cleanField)
    .filter(Boolean)
    .map((f, i) => {                      // ids must be unique (React keys, reordering)
      let id = f.id;
      for (let n = 0; ids.has(id); n += 1) id = `${f.id}_${i}_${n}`;
      ids.add(id);
      return { ...f, id };
    });
  out.v = CERT_CONFIG_VERSION;
  return out;
};

/** What gets saved: the normalised config as JSON text. */
export const serializeCertificate = (config) => JSON.stringify(normalizeCertificate(config));

/** True when the config prints exactly the built-in certificate. */
export const isDefaultCertificate = (config) =>
  serializeCertificate(config) === serializeCertificate(DEFAULT_CERTIFICATE);

// ── Values printed on one certificate ────────────────────────────────────────
const show = (v) => (v === undefined || v === null ? '' : String(v));

/**
 * Every value a row or a { } placeholder can use, for one member.
 * Missing data prints as blank — never as made-up sample text.
 */
export const buildCertificateValues = (data, memberProgram, trust) => {
  const d = data || {};
  const village = show(d.village);
  const district = show(d.district);
  const fixed = Number(d.fixedJoinFees);
  const fees = Number(d.joinFees);
  const pending = Number.isFinite(fixed) && Number.isFinite(fees) ? fixed - fees : NaN;
  return {
    displayName: show(d.displayName),
    fatherName: show(d.fatherName),
    surname: show(d.surname),
    gender: show(d.gender),
    phone: show(d.phone),
    phoneAlt: show(d.phoneAlt),
    caste: show(d.caste),
    dobDate: show(d.dobDate),
    age: show(d.age),
    guardian: show(d.guardian),
    guardianRelation: show(d.guardianRelation),
    address: show(d.currentAddress || d.village),
    village,
    villageDistrict: district ? `${village}, ${district}` : village,
    city: show(d.city),
    district,
    state: show(d.state),
    pinCode: show(d.pinCode),
    aadhaarNo: show(d.aadhaarNo),
    registrationNumber: show(d.registrationNumber),
    srNo: show(d.srNo),
    dateJoin: show(d.dateJoin),
    programName: show(memberProgram?.name || d.programName) || '-',
    groupName: show(d.ageGroupName || d.memberGroupName || d.ageGroup) || '-',
    payAmount: show(d.payAmount),
    agentName: show(d.agentName),
    // Same sum the certificate has always printed; blank when it cannot be worked out.
    joinFeePending: Number.isFinite(pending) ? String(pending) : '',
    trustName: show(trust?.name),
    trustCity: show(trust?.city),
    slogan: show(trust?.slogan),
    jurisdiction: show(trust?.jurisdiction),
  };
};

/** Replace {word} with its value. An unknown word is left as typed, so a typo is visible. */
export const fillCertificateText = (text, values) =>
  String(text ?? '').replace(/\{([A-Za-z]+)\}/g, (whole, key) =>
    (Object.prototype.hasOwnProperty.call(values, key) ? values[key] : whole));

/** The text one detail row prints. */
export const certificateFieldValue = (f, values) =>
  (f.source === 'custom' ? fillCertificateText(f.text, values) : show(values[f.source]));

// A made-up member for the builder's preview.
export const CERT_SAMPLE_MEMBER = {
  id: 'sample',
  ...Object.fromEntries(CERT_FIELD_SOURCES.filter((s) => s.key !== 'custom').map((s) => [s.key, s.sample])),
  currentAddress: 'हेमावास',
  village: 'पाली',
  district: 'Pali',
  ageGroupName: 'A',
  joinFees: 600,
  fixedJoinFees: 1100,
  photoURL: '',
};
export const CERT_SAMPLE_PROGRAM = {
  id: 'sample',
  name: 'विवाह सहयोग योजना',
  certificateRule: 'सदस्यता लेने के 6 माह बाद ही योजना का लाभ देय होगा। सहयोग राशि समय पर जमा कराना अनिवार्य है।',
};
