// Member search — ONE place that decides (a) which words a member can be found
// by and (b) how a typed search is cleaned up before it is looked up.
//
// How search works: every member document carries `search_keywords`, a list of
// words and word-beginnings. The Members page asks Firestore for members whose
// list CONTAINS the typed text. So a member is only found by what is in its
// list — and the list has to be rebuilt every time a searchable detail changes.
// (That was the bug: editing a member saved the new name / phone / village but
// left the old list, so the member could no longer be found by the new values.)
//
// Used by: Add Member, Edit Member, request approval, the Members / Closed
// lists, and the server route that repairs existing members
// (/api/members/rebuild-search). No React or Firebase imports, so both the
// browser and the server can use it.

// Bump when the list's contents change — members whose `search_v` is lower get
// their list rebuilt automatically the next time an admin opens the Members page.
export const MEMBER_SEARCH_VERSION = 2;

const MAX_PREFIX = 40;

/**
 * Clean a typed search the same way the stored words are cleaned: lower case,
 * and everything that is not a letter or digit removed (spaces, dashes, dots…).
 * Works for Hindi as well as English — "Pooja Ben" → "poojaben",
 * "1234-5678-9012" → "123456789012", "राम लाल" → "रामलाल".
 */
export const normalizeSearchTerm = (term) =>
  String(term ?? '').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '');

const text = (v) => (v === null || v === undefined ? '' : String(v));

// Every beginning of `word` that is at least 2 characters long
const addBeginnings = (set, word) => {
  let prefix = '';
  for (const ch of word) {
    prefix += ch;
    if (prefix.length > MAX_PREFIX) break;
    if (prefix.length > 1) set.add(prefix);
  }
};

/**
 * The search list for one member. Pass the member as it will be SAVED (current
 * document merged with the changes).
 */
export const buildMemberSearchKeywords = (member) => {
  const m = member || {};
  const set = new Set();

  const fields = [
    m.displayName, m.fatherName, m.surname, m.phone, m.phoneAlt, m.aadhaarNo,
    m.registrationNumber, m.legacyApplicationNo, m.village, m.city, m.district,
    m.state, m.caste, m.guardian, m.programName, m.ageGroupName,
  ].map(text).filter((v) => v.trim());

  for (const value of fields) {
    // 1. As typed: the whole value, each word, and each word's beginnings
    const lower = value.toLowerCase().trim();
    set.add(lower);
    lower.split(/\s+/).forEach((word) => {
      if (word.length > 1) { set.add(word); addBeginnings(set, word); }
    });
    // 2. Cleaned (no spaces / dashes), so "pooja ben", "poojaben" and
    //    "1234 5678 9012" are all found
    const clean = normalizeSearchTerm(value);
    if (clean.length > 1) { set.add(clean); addBeginnings(set, clean); }
  }

  // 3. Name typed together with father's name and / or surname
  const name = normalizeSearchTerm(m.displayName);
  const father = normalizeSearchTerm(m.fatherName);
  const surname = normalizeSearchTerm(m.surname);
  if (name) {
    addBeginnings(set, name + father + surname);
    addBeginnings(set, name + surname);
  }

  // 4. Last 4 digits of the phone numbers and Aadhaar
  for (const value of [m.phone, m.phoneAlt, m.aadhaarNo]) {
    const digits = text(value).replace(/\D/g, '');
    if (digits.length >= 4) set.add(digits.slice(-4));
  }

  return Array.from(set).filter((item) => item.length > 0);
};

/** The fields to save on a member whenever its searchable details may have changed. */
export const memberSearchFields = (member) => ({
  search_keywords: buildMemberSearchKeywords(member),
  search_v: MEMBER_SEARCH_VERSION,
});
