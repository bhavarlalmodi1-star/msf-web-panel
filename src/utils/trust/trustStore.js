// Trust (organisation) details — single source of truth.
//
// Everything that prints or shows the trust's identity (PDF headers, receipts,
// print pages, login page, sidebar, WhatsApp / email text) reads from here.
// The values are edited at  Settings → Trust Details  and stored in Firestore
// at  settings/trustInfo ; images are stored in Firebase Storage under
// settings/trust/ .
//
// This file is deliberately free of React and Firebase imports so the same
// module can be used by:
//   • @react-pdf/renderer documents (React context does not reach inside a
//     PDF render, a plain getTrust() call does)
//   • plain HTML print-template builders
//   • server routes (certificate rendering, WhatsApp, e-mail)
//
// DEFAULT_TRUST is only the fallback used until the Firestore document exists
// (or while it is loading). Change values from the settings form, not here.

import {
  DEFAULT_PDF_PRIMARY, DEFAULT_PDF_ACCENT, DEFAULT_THEME_PRIMARY, DEFAULT_THEME_SECONDARY,
  cleanHex, buildPanelTheme,
} from './theme';

export const TRUST_DOC_PATH = ['settings', 'trustInfo'];
export const TRUST_STORAGE_FOLDER = 'settings/trust';
export const TRUST_CACHE_KEY = 'trust_info_cache_v1';

export const DEFAULT_TRUST = {
  // ── Identity ──────────────────────────────────────────────────────────────
  name: 'श्री क्षत्रिय घांची मोदी समाज सेवा संस्थान ट्रस्ट',
  shortName: 'SSGMSSS TRUST',
  cityLine: 'अहमदाबाद, गुजरात',
  city: 'अहमदाबाद',
  since: '2024',
  regNo: 'A/5231',

  // ── Address & contact ─────────────────────────────────────────────────────
  address: '68, वृंदावन शॉपिंग सेंटर, गुजरात हाउसिंग बोर्ड बी. एस. स्कूल के पास, चांदखेडा, साबरमती, अहमदाबाद 382424',
  addressShort: '68, वृंदावन शॉपिंग सेंटर, गुजरात हाउसिंग बोर्ड, चांदखेडा, साबरमती, अहमदाबाद 382424',
  officePhone: '9898535345',
  presidentName: 'अध्यक्ष श्री वोरारामजी टी. बोराणा',
  presidentPhone: '9374934004',
  contactNumbers: '9374934004, 9825289998, 9426517804, 9824017977',
  supportEmail: 'support@ssgmsss.com',

  // ── Header blessing lines (top of every PDF) ──────────────────────────────
  blessing1: '॥ श्री गणेशाय नमः ॥',
  blessing2: '॥ श्री शनिदेवाय नमः ॥',
  blessing3: '॥ श्री सांवलाजी महाराज नमः ॥',

  // ── Certificate / footer text ─────────────────────────────────────────────
  stateLeft: 'राजस्थान',
  stateRight: 'गुजरात',
  slogan: 'आपका सहयोग ही समाज की प्रगति है !',
  jurisdiction: 'Exclusive jurisdiction Ahmedabad, Gujarat',

  // ── Admin panel / app ─────────────────────────────────────────────────────
  panelTitle: 'Marriage Trust Admin Panel',
  footerTagline: 'Connecting Hearts, Building Futures',
  appLink: 'https://play.google.com/store/apps/details?id=com.ssgmssst_trust.app',

  // ── Features ──────────────────────────────────────────────────────────────
  // WhatsApp messaging: 'on' | 'off'. Off hides every WhatsApp menu, button and
  // tick-box in the panel and the server refuses to send. Off by default.
  whatsappEnabled: 'off',

  // ── Colours ───────────────────────────────────────────────────────────────
  pdfColorPrimary: DEFAULT_PDF_PRIMARY,     // PDF headings, bars, table headers
  pdfColorAccent: DEFAULT_PDF_ACCENT,       // PDF blessing line, badges, labels
  themePrimary: DEFAULT_THEME_PRIMARY,      // web panel main colour
  themeSecondary: DEFAULT_THEME_SECONDARY,  // web panel second (gradient) colour

  // ── Images (empty = use the built-in image shipped with the panel) ────────
  logoUrl: '',
  logoPath: '',
  rightImageUrl: '',
  rightImagePath: '',
  frameUrl: '',
  framePath: '',
};

export const TRUST_FIELD_KEYS = Object.keys(DEFAULT_TRUST);

// Built-in images used when nothing has been uploaded yet.
export const DEFAULT_LOGO_SRC = '/Images/logoT.png';
export const DEFAULT_RIGHT_IMAGE_SRC = '/Images/sanidevImg.jpeg';

const STORAGE_PATH_RE = /^settings\/trust\/[A-Za-z0-9._-]+$/;
export const isTrustStoragePath = (p) => typeof p === 'string' && STORAGE_PATH_RE.test(p);

const browserOrigin = () =>
  (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null')
    ? window.location.origin
    : '';

// Keep only the known, plain-string fields (drops Firestore timestamps etc.)
export const pickTrustFields = (raw) => {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const key of TRUST_FIELD_KEYS) {
    if (typeof raw[key] === 'string') out[key] = raw[key];
    else if (typeof raw[key] === 'number') out[key] = String(raw[key]);
  }
  return out;
};

// Same-origin image address. Uploaded images are served through
// /api/trust-image so that PDF generation in the browser never depends on the
// Storage bucket's CORS configuration.
const imageSrc = (path, fallback, origin) =>
  isTrustStoragePath(path)
    ? `${origin}/api/trust-image?p=${encodeURIComponent(path)}`
    : (fallback ? `${origin}${fallback}` : '');

// Merge stored values over the defaults and add the derived, ready-to-print
// values every template uses.
export const normalizeTrust = (raw, options = {}) => {
  const origin = options.origin ?? browserOrigin();
  const t = { ...DEFAULT_TRUST, ...pickTrustFields(raw) };

  // An explicitly emptied short address falls back to the full one
  if (!t.addressShort.trim()) t.addressShort = t.address;
  if (!t.name.trim()) t.name = DEFAULT_TRUST.name;
  if (!t.shortName.trim()) t.shortName = t.name;

  // Colours: anything that is not a valid #rrggbb falls back to the default
  t.pdfColorPrimary = cleanHex(t.pdfColorPrimary, DEFAULT_PDF_PRIMARY);
  t.pdfColorAccent = cleanHex(t.pdfColorAccent, DEFAULT_PDF_ACCENT);
  t.themePrimary = cleanHex(t.themePrimary, DEFAULT_THEME_PRIMARY);
  t.themeSecondary = cleanHex(t.themeSecondary, DEFAULT_THEME_SECONDARY);
  t.theme = buildPanelTheme(t.themePrimary, t.themeSecondary);   // every panel colour, derived

  t.whatsappOn = t.whatsappEnabled === 'on';

  t.blessings = [t.blessing1, t.blessing2, t.blessing3].map(s => s.trim()).filter(Boolean);
  t.addressWithOffice = t.officePhone ? `${t.address} (O) ${t.officePhone}` : t.address;
  t.sinceText = t.since ? `SINCE : ${t.since}` : '';
  t.regText = t.regNo ? `Reg. No: ${t.regNo}` : '';

  t.hasCustomLogo = isTrustStoragePath(t.logoPath);
  t.hasCustomRightImage = isTrustStoragePath(t.rightImagePath);
  t.hasCustomFrame = isTrustStoragePath(t.framePath);

  t.logoSrc = imageSrc(t.logoPath, DEFAULT_LOGO_SRC, origin);
  t.rightImageSrc = imageSrc(t.rightImagePath, DEFAULT_RIGHT_IMAGE_SRC, origin);
  t.frameSrc = imageSrc(t.framePath, '', origin);   // '' → certificate uses its built-in frame

  return t;
};

// ── In-memory store ─────────────────────────────────────────────────────────
// Stable object for server rendering / hydration (no origin, pure defaults).
export const SERVER_TRUST = normalizeTrust({}, { origin: '' });

let current = SERVER_TRUST;
let currentRaw = {};
let browserReady = false;
const listeners = new Set();

const emit = () => listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });

/** Current trust details. Safe to call anywhere, any time (falls back to defaults). */
export const getTrust = () => {
  // First call in the browser: re-derive so image links carry the site origin.
  if (!browserReady && typeof window !== 'undefined') {
    browserReady = true;
    current = normalizeTrust(currentRaw);
  }
  return current;
};

/** Current web-panel colours (see theme.js). `panelTheme().primary`, `.secondary`, `.border` … */
export const panelTheme = () => getTrust().theme;

/** Raw stored fields (plain strings only) — what goes to Redux / the form. */
export const getTrustRaw = () => currentRaw;

/** Replace the current trust details (called by the loader and the settings form). */
export const setTrust = (raw, { persist = true } = {}) => {
  currentRaw = pickTrustFields(raw);
  browserReady = typeof window !== 'undefined';
  current = normalizeTrust(currentRaw);
  if (persist && typeof window !== 'undefined') {
    try { window.localStorage.setItem(TRUST_CACHE_KEY, JSON.stringify(currentRaw)); } catch { /* private mode */ }
  }
  emit();
  return current;
};

/** Load the last known values from this browser so the first paint is right. */
export const hydrateTrustFromCache = () => {
  if (typeof window === 'undefined') return false;
  try {
    const cached = JSON.parse(window.localStorage.getItem(TRUST_CACHE_KEY) || 'null');
    if (cached && typeof cached === 'object') {
      setTrust(cached, { persist: false });
      return true;
    }
  } catch { /* corrupt cache — ignore */ }
  return false;
};

export const subscribeTrust = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

// ── Helper for fixed-size PDFs (certificate, closing form) ──────────────────
// Those pages cannot grow, so a longer trust name has to get smaller instead of
// pushing the rest of the page out of place. Returns `base` while the text is
// no longer than `fitChars`, then scales down (never below `minRatio`).
export const fitFontSize = (text, base, fitChars, minRatio = 0.62) => {
  const len = String(text ?? '').length;
  if (!len || len <= fitChars) return base;
  return Math.round(base * Math.max(minRatio, fitChars / len) * 10) / 10;
};

// ── Small helpers for HTML print templates ──────────────────────────────────
export const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

let htmlCacheFor = null;
let htmlCache = null;

/**
 * Trust details with every text value HTML-escaped — for `${trustHtml().name}`
 * inside print-template strings. Cached until the trust details change.
 */
export const trustHtml = () => {
  const t = getTrust();
  if (htmlCacheFor === t && htmlCache) return htmlCache;
  const safe = {};
  for (const [key, value] of Object.entries(t)) {
    safe[key] = typeof value === 'string' ? escapeHtml(value) : value;
  }
  safe.blessings = t.blessings.map(escapeHtml);
  safe.blessingsHtml = safe.blessings.map((b) => `<span>${b}</span>`).join('\n');
  // Two-line logo fallback text shown if the image fails to load
  safe.logoFallbackHtml = escapeHtml(t.shortName).replace(/\s+/, '<br>');
  htmlCacheFor = t;
  htmlCache = safe;
  return safe;
};
