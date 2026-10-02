// Colours — one place for the PDF colours and the web-panel theme.
//
// Both are chosen at  Settings → Trust Details → Colours  and stored with the
// other trust details (settings/trustInfo):
//   pdfColorPrimary / pdfColorAccent   → every PDF, receipt and print page
//   themePrimary    / themeSecondary   → the web panel (buttons, sidebar, login…)
//
// Pure functions only (no React / Firebase), so PDFs, print templates, server
// routes and the browser can all use it.

export const DEFAULT_PDF_PRIMARY = '#1B385A';     // headings, bars, table headers
export const DEFAULT_PDF_ACCENT = '#D3292F';      // blessing line, badges, labels
export const DEFAULT_THEME_PRIMARY = '#db2777';
export const DEFAULT_THEME_SECONDARY = '#ea580c';

// localStorage key: the generated theme CSS, re-applied before first paint (see app/layout.js)
export const THEME_CSS_CACHE_KEY = 'trust_theme_css_v1';
export const THEME_STYLE_ID = 'trust-theme';

// ── Colour maths ────────────────────────────────────────────────────────────
export const isHexColor = (v) => typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());

/** '#abc' / '#AABBCC' → '#aabbcc'; anything else → fallback */
export const cleanHex = (v, fallback) => {
  if (!isHexColor(v)) return fallback;
  let h = v.trim().toLowerCase();
  if (h.length === 4) h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  return h;
};

export const hexToRgb = (hex) => {
  const h = cleanHex(hex, '#000000');
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
};

const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** Blend `hex` towards `other` — amount 0 = hex, 1 = other */
export const mixColor = (hex, other, amount) => {
  const a = hexToRgb(hex);
  const b = hexToRgb(other);
  return `#${a.map((v, i) => toHex(v + (b[i] - v) * amount)).join('')}`;
};
export const tint = (hex, amount) => mixColor(hex, '#ffffff', amount);
export const shade = (hex, amount) => mixColor(hex, '#000000', amount);

/** 0 (black) … 1 (white) — WCAG relative luminance */
export const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** True when white text on this colour would be hard to read */
export const isTooLight = (hex) => luminance(hex) > 0.42;

/** Same colour with transparency, e.g. alpha(C.primary, 0.12) — works for PDFs too */
export const alpha = (hex, opacity) => `rgba(${hexToRgb(hex).join(', ')}, ${opacity})`;

// ── Panel theme ─────────────────────────────────────────────────────────────
// The original look, value for value. Used untouched while the theme colours
// are the defaults, so nothing changes until someone picks new colours.
const ORIGINAL_THEME = {
  isDefault: true,
  primary: '#db2777', primaryLight: '#f472b6', primaryDark: '#be185d', primaryDarker: '#9f1239',
  primary50: '#fff1f2', primary100: '#ffe4e6', primary200: '#fecdd3', primary300: '#fda4af',
  pink50: '#fdf2f8', pink100: '#fce7f3', pink200: '#fbcfe8', pink300: '#f9a8d4',
  primaryRgb: '219, 39, 119',
  secondary: '#ea580c', secondaryLight: '#fb923c', secondaryDark: '#c2410c', secondaryRgb: '234, 88, 12',
  background: '#fff8f5', surfaceSecondary: '#fef2ed', border: '#fde2d8', borderHover: '#fcd1c2',
  fillStrong: '#fbb8a8', input: '#fecaca', ring: '#f43f5e',
  foreground: '#3e1f1a', heading: '#2d1810', foregroundSecondary: '#6b4f47',
  muted: '#8b7871', placeholder: '#a8998f', disabled: '#d4cbc5',
};

/** Every colour the panel uses, derived from the two chosen colours. */
export const buildPanelTheme = (primaryIn, secondaryIn) => {
  const p = cleanHex(primaryIn, DEFAULT_THEME_PRIMARY);
  const s = cleanHex(secondaryIn, DEFAULT_THEME_SECONDARY);
  if (p === DEFAULT_THEME_PRIMARY && s === DEFAULT_THEME_SECONDARY) return ORIGINAL_THEME;

  const t50 = tint(p, 0.94);
  const t100 = tint(p, 0.88);
  const t200 = tint(p, 0.78);
  const t300 = tint(p, 0.62);
  return {
    isDefault: false,
    primary: p, primaryLight: tint(p, 0.35), primaryDark: shade(p, 0.16), primaryDarker: shade(p, 0.32),
    primary50: t50, primary100: t100, primary200: t200, primary300: t300,
    pink50: t50, pink100: t100, pink200: t200, pink300: t300,
    primaryRgb: hexToRgb(p).join(', '),
    secondary: s, secondaryLight: tint(s, 0.3), secondaryDark: shade(s, 0.16), secondaryRgb: hexToRgb(s).join(', '),
    background: tint(p, 0.97), surfaceSecondary: tint(p, 0.94), border: tint(p, 0.86), borderHover: tint(p, 0.78),
    fillStrong: tint(p, 0.66), input: tint(p, 0.78), ring: tint(p, 0.15),
    // neutral greys — the original warm browns only suit the original pink
    foreground: '#1f2937', heading: '#111827', foregroundSecondary: '#4b5563',
    muted: '#6b7280', placeholder: '#9ca3af', disabled: '#d1d5db',
  };
};

// Original colour → which theme value replaces it. Used to re-colour the antd
// theme object (and documents what each hard-coded colour meant).
const ORIGINAL_COLOR_KEYS = {};
for (const [key, value] of Object.entries(ORIGINAL_THEME)) {
  // `input` (#fecaca) is skipped: the same colour is antd's error border, which must stay red
  if (key === 'input') continue;
  if (typeof value === 'string' && value.startsWith('#') && !(value in ORIGINAL_COLOR_KEYS)) ORIGINAL_COLOR_KEYS[value] = key;
}

const recolorString = (str, theme) => str
  .replace(/#[0-9a-fA-F]{6}\b/g, (hex) => {
    const key = ORIGINAL_COLOR_KEYS[hex.toLowerCase()];
    return key ? theme[key] : hex;
  })
  .replace(/219,\s*39,\s*119/g, theme.primaryRgb)
  .replace(/234,\s*88,\s*12/g, theme.secondaryRgb);

/** Deep copy of an object with every original theme colour swapped for the current one. */
export const recolor = (value, theme) => {
  if (!theme || theme.isDefault) return value;
  if (typeof value === 'string') return recolorString(value, theme);
  if (Array.isArray(value)) return value.map((v) => recolor(v, theme));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = recolor(v, theme);
    return out;
  }
  return value;
};

// Tailwind colour scale (50…950) built around the chosen colour at 600
const scale = (hex) => ({
  50: tint(hex, 0.94), 100: tint(hex, 0.88), 200: tint(hex, 0.78), 300: tint(hex, 0.62),
  400: tint(hex, 0.4), 500: tint(hex, 0.18), 600: hex,
  700: shade(hex, 0.16), 800: shade(hex, 0.32), 900: shade(hex, 0.45), 950: shade(hex, 0.6),
});

/**
 * CSS that re-colours the panel. Empty for the default theme.
 *   • the --primary / --secondary … variables from globals.css
 *   • Tailwind's rose-* and pink-* palettes (the panel's brand classes)
 *   • the orange END of brand gradients (to-orange-*). Other orange classes are
 *     left alone — they mean "pending", not "brand".
 */
export const buildThemeCss = (theme) => {
  if (!theme || theme.isDefault) return '';
  const vars = {
    '--primary': theme.primary, '--primary-light': theme.primaryLight,
    '--primary-dark': theme.primaryDark, '--primary-darker': theme.primaryDarker,
    '--primary-50': theme.primary50, '--primary-100': theme.primary100,
    '--primary-200': theme.primary200, '--primary-300': theme.primary300,
    '--primary-rgb': theme.primaryRgb,
    '--pink-50': theme.pink50, '--pink-100': theme.pink100, '--pink-200': theme.pink200, '--pink-300': theme.pink300,
    '--secondary': theme.secondary, '--secondary-light': theme.secondaryLight,
    '--secondary-dark': theme.secondaryDark, '--secondary-rgb': theme.secondaryRgb,
    '--background': theme.background, '--surface-secondary': theme.surfaceSecondary,
    '--foreground': theme.foreground, '--foreground-secondary': theme.foregroundSecondary,
    '--muted-foreground': theme.muted,
    '--border': theme.border, '--border-hover': theme.borderHover,
    '--input': theme.input, '--ring': theme.ring,
  };
  const brand = scale(theme.primary);
  for (const [step, color] of Object.entries(brand)) {
    vars[`--color-rose-${step}`] = color;
    vars[`--color-pink-${step}`] = color;
  }
  const sec = scale(theme.secondary);
  // `html:root` (not just `:root`) so it beats globals.css whatever order the stylesheets load in
  const root = `html:root{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')}}`;
  const gradientEnds = [50, 100, 500, 600, 700].map((step) => {
    const sel = [`.to-orange-${step}`, `.hover\\:to-orange-${step}:hover`].join(',');
    return `${sel}{--tw-gradient-to:${sec[step]}}`;
  }).join('');
  return root + gradientEnds;
};

// ── Ready-made choices for the settings form ────────────────────────────────
export const THEME_PRESETS = [
  { name: 'Rose & Orange (original)', primary: DEFAULT_THEME_PRIMARY, secondary: DEFAULT_THEME_SECONDARY },
  { name: 'Royal Blue', primary: '#1d4ed8', secondary: '#0891b2' },
  { name: 'Navy & Red', primary: '#1b385a', secondary: '#d3292f' },
  { name: 'Emerald', primary: '#047857', secondary: '#65a30d' },
  { name: 'Maroon & Gold', primary: '#9f1239', secondary: '#b45309' },
  { name: 'Purple', primary: '#7c3aed', secondary: '#db2777' },
  { name: 'Saffron', primary: '#ea580c', secondary: '#b91c1c' },
  { name: 'Teal', primary: '#0f766e', secondary: '#0369a1' },
];

export const PDF_PRESETS = [
  { name: 'Navy & Red (original)', primary: DEFAULT_PDF_PRIMARY, accent: DEFAULT_PDF_ACCENT },
  { name: 'Maroon & Navy', primary: '#7f1d1d', accent: '#1b385a' },
  { name: 'Green & Maroon', primary: '#14532d', accent: '#9f1239' },
  { name: 'Blue & Orange', primary: '#1e3a8a', accent: '#c2410c' },
  { name: 'Purple & Pink', primary: '#4c1d95', accent: '#be185d' },
  { name: 'Black & Red', primary: '#111827', accent: '#b91c1c' },
];
