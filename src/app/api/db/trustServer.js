// Server-side access to the trust details (settings/trustInfo).
//
// Used by API routes that print or mention the trust: the membership
// certificate, WhatsApp messages and e-mails. Values are cached in memory for
// a short time so a burst of requests costs a single Firestore read.

import admin from './firebaseAdmin';
import {
  TRUST_DOC_PATH,
  normalizeTrust,
  pickTrustFields,
  isTrustStoragePath,
} from '@/utils/trust/trustStore';

const DOC_TTL_MS = 30 * 1000;
const IMAGE_CACHE_MAX = 12;

let docCache = { at: 0, raw: null };
const imageCache = new Map();   // storage path → { buffer, contentType }

export const clearTrustServerCache = () => { docCache = { at: 0, raw: null }; };

/**
 * Read the stored fields. Never throws.
 *   ok: false → Firestore could not be read (raw is the last good copy, or {}),
 *   so callers that would overwrite something should not trust it.
 */
export const readTrustDocServer = async ({ fresh = false } = {}) => {
  const now = Date.now();
  if (!fresh && docCache.raw && now - docCache.at < DOC_TTL_MS) return { ok: true, raw: docCache.raw };
  try {
    const snap = await admin.firestore().collection(TRUST_DOC_PATH[0]).doc(TRUST_DOC_PATH[1]).get();
    const raw = snap.exists ? pickTrustFields(snap.data()) : {};
    docCache = { at: now, raw };
    return { ok: true, raw };
  } catch (err) {
    console.error('[trust] Failed to read settings/trustInfo:', err?.message || err);
    return { ok: false, raw: docCache.raw || {} };
  }
};

/** Raw stored fields (plain strings). Never throws — returns {} on failure. */
export const getTrustRawServer = async (options) => (await readTrustDocServer(options)).raw;

/** Is WhatsApp messaging switched on? (Settings → Trust Details). Off by default. */
export const isWhatsAppOn = async () => normalizeTrust(await getTrustRawServer(), { origin: '' }).whatsappOn;

/** Download one uploaded trust image from Storage (cached). Returns null if missing. */
export const getTrustImageServer = async (path) => {
  if (!isTrustStoragePath(path)) return null;
  if (imageCache.has(path)) return imageCache.get(path);
  try {
    const file = admin.storage().bucket().file(path);
    const [buffer] = await file.download();
    let contentType = 'image/png';
    try {
      const [meta] = await file.getMetadata();
      if (meta?.contentType) contentType = meta.contentType;
    } catch { /* keep default */ }
    const entry = { buffer, contentType };
    if (imageCache.size >= IMAGE_CACHE_MAX) imageCache.delete(imageCache.keys().next().value);
    imageCache.set(path, entry);
    return entry;
  } catch (err) {
    console.error(`[trust] Failed to download ${path}:`, err?.message || err);
    return null;
  }
};

const toDataUrl = (img) => `data:${img.contentType};base64,${img.buffer.toString('base64')}`;

/**
 * Trust details for server-side use.
 *   withImages: true → logoSrc / rightImageSrc / frameSrc (and the certificate's
 *   signature pictures) become data: URLs so
 *   @react-pdf/renderer can embed them without any network call. An image that
 *   has not been uploaded (or fails to download) is reported as "not custom",
 *   and the PDF falls back to its built-in picture.
 */
export const getTrustServer = async ({ withImages = false, fresh = false } = {}) => {
  const raw = await getTrustRawServer({ fresh });
  const trust = normalizeTrust(raw, { origin: '' });
  if (!withImages) return trust;

  const [logo, right, frame, leftSign, rightSign] = await Promise.all([
    getTrustImageServer(trust.logoPath),
    getTrustImageServer(trust.rightImagePath),
    getTrustImageServer(trust.framePath),
    getTrustImageServer(trust.certificate.leftSignPath),
    getTrustImageServer(trust.certificate.rightSignPath),
  ]);

  trust.hasCustomLogo = !!logo;
  trust.logoSrc = logo ? toDataUrl(logo) : '';
  trust.hasCustomRightImage = !!right;
  trust.rightImageSrc = right ? toDataUrl(right) : '';
  trust.hasCustomFrame = !!frame;
  trust.frameSrc = frame ? toDataUrl(frame) : '';
  // Certificate signatures (Settings → Certificate Builder)
  trust.certificate.leftSignSrc = leftSign ? toDataUrl(leftSign) : '';
  trust.certificate.rightSignSrc = rightSign ? toDataUrl(rightSign) : '';
  return trust;
};
