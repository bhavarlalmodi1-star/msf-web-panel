#!/usr/bin/env node
// Move data from the OLD trust panel's Firebase project into THIS project,
// reshaped to what this panel expects.
//
// Both panels come from the same codebase, but this one is newer. Old records
// are missing fields this panel filters and sorts on (a member without
// joinDateTs never shows in a date range; a closing balance without a
// closing_payment record is wiped by the next closing). So this is NOT a plain
// copy — every document keeps its ID and its original values, and the fields
// the new panel needs are filled in beside them.
//
// NOTHING IS WRITTEN unless you add --commit. Without it every command is a
// dry run that only reads and prints what it would do.
// The OLD project is only ever read. It is never written to.
//
// HOW TO RUN (from the project folder):
//   npm run migrate-old -- inspect            look at both databases (read only)
//   npm run migrate-old -- data               dry run: what would be copied
//   npm run migrate-old -- data --commit      copy Firestore data
//   npm run migrate-old -- auth --commit      copy logins (users, agents, members)
//   npm run migrate-old -- storage --commit   copy photos/documents, fix their links
//   npm run migrate-old -- verify             compare old vs new, check totals
//   npm run migrate-old -- recalc --commit    rebuild agent/yojna/dashboard totals
//
// KEYS — do not paste them anywhere, the script reads them from the .env files:
//   old project : --old-env <path to old .env>   (default: the old panel folder)
//                 or --old-key <service-account.json>
//   new project : this project's .env / .env.local
//
// OPTIONS
//   --commit              really write (default is a dry run)
//   --yes                 do not ask for confirmation
//   --only a,b            only these collections        --skip a,b   leave these out
//   --overwrite           replace documents that already exist in the new project
//                         (default: existing documents are left untouched)
//   --allow-non-empty     allow copying into a project that already has other members
//   --subcollections a,b  sub-collections to copy (default: memberPrograms)
//   --commission on|off   set agent commission switches (default: leave as they are)
//   --hash-config <file>  auth: password hash parameters of the OLD project
//   --temp-password <pw>  auth: password for logins whose password cannot be carried over
//   --sample <n>          inspect: documents sampled per collection (default 50)
//   --no-exist-check      dry run: skip checking which documents already exist

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OLD_ENV = 'D:\\Development\\sksssb_project\\sksssb_web_panel\\.env';
const DEFAULT_HASH_FILE = path.join(ROOT, 'scripts', 'old-auth-hash.txt');
const REPORT_DIR = path.join(ROOT, 'migration-reports');
const MARKER_COLLECTION = '_migrations';

// Collections that are reshaped (loaded fully, cross-checked, then written).
const TRANSFORMED = [
  'programs', 'agents', 'members', 'groupClosings', 'closing_payment',
  'paymentGroups', 'memberJoinFees', 'memberClosingFees',
  'organizationStats', 'registrationNumbers',
];
// Short-lived / device-specific data that has no meaning in another project.
const SKIP_COLLECTIONS = [
  'emailOtps', 'trustedDevices', 'paymentIdempotency',
  'whatsappLogs', 'whatsappChats', 'credentialSendLogs', MARKER_COLLECTION,
];
// settings/trustInfo belongs to THIS trust (name, logo, colours) — never copied.
const SKIP_SETTINGS_DOCS = ['trustInfo'];
const SKIP_SUBCOLLECTIONS = ['sessions', 'messages'];
// Join requests that were never approved do not get a Sr. No.
const NO_SRNO_STATUS = new Set(['pending', 'pending_approval', 'rejected']);

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────
export class StopError extends Error {}
const fail = (msg) => { throw new StopError(msg); };

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v) => (v === null || v === undefined ? '' : String(v).trim());
const round2 = (v) => Math.round(num(v) * 100) / 100;
const isPlain = (v) => {
  if (v === null || typeof v !== 'object') return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const isDocRef = (v) =>
  !!v && typeof v === 'object' && typeof v.path === 'string' && typeof v.id === 'string' &&
  !!v.firestore && typeof v.collection === 'function';
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

// Walk plain objects/arrays; everything else (Timestamp, GeoPoint, Buffer…) is a leaf.
function deepMap(value, fn) {
  if (Array.isArray(value)) return value.map((v) => deepMap(v, fn));
  if (isPlain(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepMap(v, fn);
    return out;
  }
  return fn(value);
}

// A document reference read from the old project points INTO the old project.
// Re-point it at the same path in the new one, otherwise the write is rejected.
const cloneForTarget = (data, dstDb) =>
  deepMap(data, (v) => (isDocRef(v) ? dstDb.doc(v.path) : v));

export function readEnvFile(file) {
  const out = {};
  if (!file || !fs.existsSync(file)) return out;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const eq = a.indexOf('=');
    if (eq > 2) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}
const listArg = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Dates
// The panel stores join dates as DD-MM-YYYY text and closing dates as ISO text.
// The trust works in India time, so a bare day means midnight IST.
// ─────────────────────────────────────────────────────────────────────────────
const IST_MIN = 330;
const dayStart = (y, m, d, mode) => {
  const utc = Date.UTC(y, m - 1, d);
  return new Date(mode === 'utc' ? utc : utc - IST_MIN * 60000);
};
const valid = (d) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d : null);

export function toDate(v, mode = 'ist') {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return valid(v);
  if (typeof v === 'object') {
    if (typeof v.toDate === 'function') { try { return valid(v.toDate()); } catch { return null; } }
    const s = v.seconds ?? v._seconds;
    if (typeof s === 'number') return valid(new Date(s * 1000));
    return null;
  }
  if (typeof v === 'number') return valid(new Date(v));
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);          // DD-MM-YYYY
  if (m) return valid(dayStart(Number(m[3]), Number(m[2]), Number(m[1]), mode));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);                           // YYYY-MM-DD
  if (m) return valid(dayStart(Number(m[1]), Number(m[2]), Number(m[3]), mode));
  return valid(new Date(s));
}
const isIsoText = (v) => typeof v === 'string' && v.includes('T') && !!valid(new Date(v));
const istParts = (d) => {
  const t = new Date(d.getTime() + IST_MIN * 60000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 };
};

// Same word/prefix index the panel builds when a member is added, so search
// works on migrated members exactly as on new ones.
export function createSearchIndex(data) {
  const set = new Set();
  const add = (text) => {
    const s = String(text).toLowerCase().trim();
    if (!s) return;
    set.add(s);
    s.split(/\s+/).forEach((word) => {
      if (word.length > 1) {
        set.add(word);
        let prefix = '';
        for (const ch of word) { prefix += ch; if (prefix.length > 1) set.add(prefix); }
      }
    });
  };
  const walk = (v) => {
    if (v === null || v === undefined) return;
    if (typeof v === 'object') (Array.isArray(v) ? v : Object.values(v)).forEach(walk);
    else add(v);
  };
  walk(data);
  return Array.from(set).filter((x) => x.length > 0);
}

export class Report {
  constructor() { this.counts = {}; this.lists = {}; }
  bump(key, n = 1) { this.counts[key] = (this.counts[key] || 0) + n; }
  note(key, item, cap = 300) {
    this.bump(key);
    const list = (this.lists[key] ||= []);
    if (list.length < cap) list.push(item);
  }
}

// A map field such as closingGroupAmounts can exist in two forms: a real nested
// map, or (from an old set+merge bug) top-level fields literally named
// "closingGroupAmounts.<id>". Read both.
function readMap(doc, name) {
  const out = {};
  if (isPlain(doc[name])) Object.assign(out, doc[name]);
  const prefix = `${name}.`;
  for (const k of Object.keys(doc)) if (k.startsWith(prefix)) out[k.slice(prefix.length)] = doc[k];
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE RESHAPING — pure functions, no database access.
// Input : everything read from the old project.
// Output: the documents to write, plus a report of what was filled in or looks odd.
// Rule  : an existing value is never changed. Only missing fields are filled,
//         and money figures are never recalculated — mismatches are reported.
// ─────────────────────────────────────────────────────────────────────────────
const cpStatus = (total, paid) => (total > 0 && paid >= total ? 'paid' : paid > 0 ? 'partial' : 'pending');
const cpPct = (total, paid) => (total > 0 ? Number(((paid / total) * 100).toFixed(2)) : 0);

// A closed member's closing date can live in four places; most specific first.
function resolveClosedDate(m) {
  const prog = m.member_closed_program || m.programId || null;
  const arr = Array.isArray(m.closedStatus) ? m.closedStatus : [];
  for (const cs of arr) {
    if (prog && cs?.programId !== prog) continue;
    const t = toDate(cs?.closed_date);
    if (t) return t;
  }
  for (const cs of arr) { const t = toDate(cs?.closed_date); if (t) return t; }
  return toDate(m.closed_date) || toDate(m.marriageDate) || toDate(m.member_closed_at);
}

function shapeMember(id, m, ctx) {
  const { rep, programIds, agentIds } = ctx;
  const who = { id, regNo: str(m.registrationNumber) };

  if (m.gender === undefined) { m.gender = ''; rep.bump('members: gender added (blank)'); }
  if (typeof m.delete_flag !== 'boolean') { m.delete_flag = false; rep.note('members: delete_flag was missing, set false', who); }
  if (m.active_flag === undefined && m.status === 'active') { m.active_flag = true; rep.bump('members: active_flag added'); }
  if (m.member_closed === undefined) { m.member_closed = false; rep.bump('members: member_closed added (false)'); }

  // Join date as a real timestamp — date filters and "sort by join date" need it.
  const hasTs = m.joinDateTs && (m.joinDateTs instanceof Date || typeof m.joinDateTs.toDate === 'function');
  let join = hasTs ? toDate(m.joinDateTs) : null;
  if (!hasTs) {
    join = toDate(m.dateJoin) || toDate(m.programJoinDate) || toDate(m.joinDateTs);
    if (join) rep.bump('members: joinDateTs added from join date');
    else {
      join = toDate(m.createdAt);
      if (join) rep.note('members: join date unreadable, joinDateTs taken from created date', who);
      else rep.note('members: NO join date at all (will not show in date filters)', who);
    }
    if (join) m.joinDateTs = join;
  }
  if (join) {
    const { y, m: mo } = istParts(join);
    if (m.joinYear === undefined) m.joinYear = y;
    if (m.joinMonth === undefined) m.joinMonth = mo;
    if (m.joinYearMonth === undefined) m.joinYearMonth = `${y}-${String(mo).padStart(2, '0')}`;
  }

  // Search
  if (!Array.isArray(m.search_keywords) || m.search_keywords.length === 0) {
    m.search_keywords = createSearchIndex({
      name: m.displayName, fatherName: m.fatherName, surname: m.surname, phone: m.phone,
      aadhaarNo: m.aadhaarNo, registrationNumber: m.registrationNumber, village: m.village,
      city: m.city, district: m.district, state: m.state, caste: m.caste, guardian: m.guardian,
      programName: m.programName, ageGroupName: m.ageGroupName,
    });
    rep.bump('members: search_keywords built');
  }
  if (m.search_registrationNumber === undefined && str(m.registrationNumber)) {
    m.search_registrationNumber = m.registrationNumber;
    rep.bump('members: search_registrationNumber added');
  }

  // Join-fee figures: fill only what is absent, report what does not add up.
  const joinFees = num(m.joinFees), paid = num(m.paidAmount);
  if (m.pendingAmount === undefined) { m.pendingAmount = Math.max(0, joinFees - paid); rep.bump('members: pendingAmount added'); }
  if (m.paymentPercentage === undefined) { m.paymentPercentage = joinFees > 0 ? Math.round((paid / joinFees) * 100) : 0; rep.bump('members: paymentPercentage added'); }
  if (m.paymentStatus === undefined) {
    m.paymentStatus = num(m.paymentPercentage) >= 100 ? 'paid' : num(m.paymentPercentage) > 0 ? 'partial' : 'pending';
    rep.bump('members: paymentStatus added');
  }
  if (m.hasPendingPayments === undefined) m.hasPendingPayments = num(m.pendingAmount) > 0;
  if (Math.abs(num(m.pendingAmount) - Math.max(0, joinFees - paid)) > 0.5) {
    rep.note('members: pending join fee is not (join fee - paid) [left as it is]',
      { ...who, joinFees, paid, pending: num(m.pendingAmount) });
  }

  // Closed members: the closed list filters on an ISO closed_date, and the
  // closing logic reads the date from closedStatus[] first.
  if (m.member_closed === true) {
    const best = resolveClosedDate(m);
    if (!best) {
      rep.note('members: CLOSED but no closing date anywhere (set it on the Closed list)', who);
    } else {
      const iso = best.toISOString();
      if (!isIsoText(m.closed_date)) { m.closed_date = iso; rep.bump('members: closed_date normalised to ISO'); }
      const prog = m.member_closed_program || m.programId || null;
      const arr = Array.isArray(m.closedStatus) ? m.closedStatus : [];
      const hasDated = arr.some((cs) => (!prog || cs?.programId === prog) && toDate(cs?.closed_date));
      if (!hasDated) {
        const idx = arr.findIndex((cs) => prog && cs?.programId === prog);
        const next = [...arr];
        if (idx >= 0) next[idx] = { ...next[idx], closed_date: iso };
        else next.push({
          programId: prog, closingGroupId: m.closingGroupId || null, closed_date: iso,
          closed_note: m.closed_note || '', closed_invitation_url: m.closed_invitation_url || null,
          closed_at: m.member_closed_at || null, closed_by: m.member_closed_by || null,
        });
        m.closedStatus = next;
        rep.bump('members: closedStatus entry added');
      }
    }
    if (m.member_closed_program === undefined && m.programId) m.member_closed_program = m.programId;
  }

  if (m.programId && !programIds.has(m.programId)) rep.note('members: yojna (programId) not found in old data', { ...who, programId: m.programId });
  if (m.agentId && !agentIds.has(m.agentId)) rep.note('members: agent (agentId) not found in old data', { ...who, agentId: m.agentId });
}

// Sr. No. — the old panel had none. Numbered in the order members were created.
function assignSrNo(members, ctx) {
  const { rep, opts } = ctx;
  const target = opts.targetSrNo || new Map();      // members already in the new project
  let max = num(opts.srNoBase);
  const todo = [];
  const seen = new Map();
  for (const [id, m] of members) {
    if (target.has(id)) {                           // already migrated: keep its number
      const t = target.get(id);
      if (typeof t === 'number') { m.srNo = t; max = Math.max(max, t); }
      continue;
    }
    if (typeof m.srNo === 'number' && m.srNo > 0) {
      max = Math.max(max, m.srNo);
      if (seen.has(m.srNo)) rep.note('members: duplicate Sr. No. in old data', { id, srNo: m.srNo, other: seen.get(m.srNo) });
      seen.set(m.srNo, id);
      continue;
    }
    if (NO_SRNO_STATUS.has(str(m.status).toLowerCase())) continue;
    todo.push([id, m]);
  }
  const t = (m) => (toDate(m.createdAt) || toDate(m.joinDateTs) || new Date(0)).getTime();
  todo.sort((a, b) => t(a[1]) - t(b[1]) || (a[0] < b[0] ? -1 : 1));
  for (const [, m] of todo) { max += 1; m.srNo = max; }
  if (todo.length) rep.bump('members: Sr. No. assigned', todo.length);
  return max;
}

// closing_payment — one record per member per closing group. In the new panel
// these records ARE the closing balance: the next closing recomputes a member's
// totals from them. The old panel kept the balance only on the member, so a
// record is built for every old balance that does not have one.
function shapeClosing(source, members, ctx) {
  const { rep, opts } = ctx;
  const groups = new Map((source.groupClosings || []).map((g) => [g.id, g.data]));
  const out = new Map();                 // doc id → data
  const byMember = new Map();            // memberId → [data] (live docs only)
  const link = (mid, d) => { if (!byMember.has(mid)) byMember.set(mid, []); byMember.get(mid).push(d); };

  // 1. Records that already exist in the old project
  for (const { id, data } of source.closing_payment || []) {
    const d = { ...data };
    const mid = str(d.memberId), gid = str(d.closingGroupId);
    let key = mid && gid ? `${mid}_${gid}` : id;
    if (key !== id) {
      if (out.has(key)) { rep.note('closing_payment: two old records for the same member+group (second kept under its old id)', { id, key }); key = id; }
      else rep.bump('closing_payment: re-keyed to memberId_groupId');
    }
    const total = num(d.totalAmount), paid = num(d.paidAmount);
    if (typeof d.paidAmount !== 'number') d.paidAmount = paid;
    if (typeof d.pendingAmount !== 'number') d.pendingAmount = Math.max(0, total - paid);
    if (typeof d.isReversed !== 'boolean') d.isReversed = false;
    if (!d.status) d.status = cpStatus(total, paid);
    out.set(key, d);
    if (mid && d.isReversed !== true) link(mid, d);
  }

  // 2. Per-group charges recorded on the closing groups
  const breakdown = new Map();           // memberId → Map(groupId → {amount,count})
  for (const [gid, g] of groups) {
    if (g.status === 'reversed') continue;
    for (const [mid, info] of Object.entries(isPlain(g.paymentBreakdown) ? g.paymentBreakdown : {})) {
      if (!breakdown.has(mid)) breakdown.set(mid, new Map());
      breakdown.get(mid).set(gid, { amount: num(info?.amount), count: num(info?.count) });
    }
  }
  const groupTime = (gid) => {
    const g = groups.get(gid);
    return (toDate(g?.closedAt) || toDate(g?.createdAt) || new Date(0)).getTime();
  };

  // Which closing events did this member pay for in this group? Rebuilt from the
  // group's closed members with the panel's own rule (joined on/before the
  // event, and not after the member's own closing). Used only if it reproduces
  // the recorded count exactly — otherwise the list is left empty rather than guessed.
  const eventsFor = (m, gid, wantCount) => {
    const g = groups.get(gid);
    const closedIds = g?.closedMemberIds || g?.memberIds || [];
    if (!wantCount || !closedIds.length) return [];
    for (const mode of ['ist', 'utc']) {
      const join = toDate(m.dateJoin, mode);
      if (!join) return [];
      const own = m.member_closed === true ? resolveClosedDate(m) : null;
      const events = [];
      for (const cid of closedIds) {
        const cm = members.get(cid);
        if (!cm) continue;
        const entry = (Array.isArray(cm.closedStatus) ? cm.closedStatus : []).find((cs) => cs?.closingGroupId === gid);
        const raw = entry?.closed_date || cm.closed_date || cm.marriageDate || cm.member_closed_at;
        const date = toDate(raw, mode);
        if (!date) continue;
        if (join > date) continue;
        if (own && date > own) continue;
        events.push({ cid, cm, date, entry });
      }
      if (events.length === wantCount) {
        return events.map(({ cid, cm, date, entry }) => ({
          closed_memberId: cid,
          closed_memberName: cm.displayName || cm.name || null,
          closed_fatherName: cm.fatherName || null,
          closed_village: cm.village || null,
          closingPhone: cm.phone || null,
          closing_registrationNumber: cm.registrationNumber || null,
          closed_photoURL: cm.photoURL || null,
          closed_date: date.toISOString(),
          closed_note: entry?.closed_note || cm.closed_note || null,
          closed_invitation_url: entry?.closed_invitation_url || cm.closed_invitation_url || null,
          marriageDate: null,
        }));
      }
    }
    return [];
  };

  for (const [mid, m] of members) {
    const who = { id: mid, regNo: str(m.registrationNumber) };
    const amounts = readMap(m, 'closingGroupAmounts');
    const counts = readMap(m, 'closingGroupCounts');
    const ledger = new Map();
    for (const gid of Object.keys(amounts)) ledger.set(gid, { amount: num(amounts[gid]), count: num(counts[gid]) });
    for (const [gid, info] of breakdown.get(mid) || []) if (!ledger.has(gid)) ledger.set(gid, info);

    const existing = byMember.get(mid) || [];
    const storedTotal = num(m.closing_totalAmount), storedPaid = num(m.closing_paidAmount);
    if (!ledger.size && !existing.length && storedTotal <= 0 && storedPaid <= 0) continue;

    const made = [];
    for (const gid of [...ledger.keys()].sort((a, b) => groupTime(a) - groupTime(b))) {
      const { amount, count } = ledger.get(gid);
      if (groups.get(gid)?.status === 'reversed') { rep.note('closing: member still carries an amount for a REVERSED group (not copied)', { ...who, groupId: gid, amount }); continue; }
      if (amount <= 0) continue;
      const key = `${mid}_${gid}`;
      if (out.has(key)) continue;
      const g = groups.get(gid) || {};
      const details = eventsFor(m, gid, count);
      if (count > 0 && !details.length) rep.bump('closing: event list could not be rebuilt exactly (left empty, amounts kept)');
      const per = count > 0 ? amount / count : 0;
      const first = details[0];
      made.push({ key, gid, data: {
        memberId: mid, closingGroupId: gid, closingGroupName: g.groupName || '', programId: g.programId || m.programId || '',
        memberName: m.displayName || m.name || null, memberCode: m.memberCode || m.code || null,
        registrationNumber: m.registrationNumber || null, agentId: m.agentId || null,
        ageGroupId: m.ageGroupId || null, memberGroupId: m.memberGroupId || null, dateJoin: m.dateJoin || null,
        closing_Name: first?.closed_memberName || null, closing_fatherName: first?.closed_fatherName || null,
        closing_village: first?.closed_village || null, closingPhone: first?.closingPhone || null,
        closing_registrationNumber: first?.closing_registrationNumber || null, closed_photoURL: first?.closed_photoURL || null,
        // payAmount is kept only when count × payAmount is exactly the amount, so
        // the panel's Closing System Check never "corrects" a migrated balance.
        payAmount: count > 0 && Number.isInteger(per) ? per : 0,
        closingCount: count, totalAmount: amount, closingDetails: details,
        createdAt: g.closedAt || g.createdAt || m.createdAt || opts.now,
        createdBy: g.closedBy || null, createdByName: g.closedByName || null,
        isReversed: false, reversedAt: null, reversedBy: null, reversedByName: null, reversalReason: null,
        migratedFrom: opts.sourceProject,
      } });
    }

    // Balance on the member that no group accounts for → one "old balance" record,
    // so the money is not lost the next time a closing recomputes this member.
    const covered = round2(made.reduce((s, x) => s + x.data.totalAmount, 0) + existing.reduce((s, d) => s + num(d.totalAmount), 0));
    const rest = round2(storedTotal - covered);
    if (rest > 0.5) {
      const restCount = Math.max(0, num(m.totalClosingCount)
        - made.reduce((s, x) => s + x.data.closingCount, 0) - existing.reduce((s, d) => s + num(d.closingCount), 0));
      const per = restCount > 0 ? rest / restCount : 0;
      made.unshift({ key: `${mid}_legacy`, gid: null, data: {
        memberId: mid, closingGroupId: 'legacy', closingGroupName: 'Old system balance', programId: m.programId || '',
        memberName: m.displayName || m.name || null, memberCode: m.memberCode || m.code || null,
        registrationNumber: m.registrationNumber || null, agentId: m.agentId || null,
        ageGroupId: m.ageGroupId || null, memberGroupId: m.memberGroupId || null, dateJoin: m.dateJoin || null,
        closing_Name: null, closing_fatherName: null, closing_village: null, closingPhone: null,
        closing_registrationNumber: null, closed_photoURL: null,
        payAmount: restCount > 0 && Number.isInteger(per) ? per : 0,
        closingCount: restCount, totalAmount: rest, closingDetails: [],
        createdAt: m.createdAt || opts.now, createdBy: null, createdByName: null,
        isReversed: false, reversedAt: null, reversedBy: null, reversedByName: null, reversalReason: null,
        migratedFrom: opts.sourceProject, legacyBalance: true,
      } });
      rep.note('closing: "Old system balance" record created (balance with no closing group)', { ...who, amount: rest });
    } else if (rest < -0.5) {
      rep.note('closing: group amounts add up to MORE than the member total [left as it is — run Closing System Check]',
        { ...who, memberTotal: storedTotal, groupsTotal: covered });
    }

    // What has already been paid: per-group figures if the member has them,
    // otherwise oldest group first.
    const paidMap = readMap(m, 'closingGroupPaidAmounts');
    let paidLeft = Math.max(0, round2(storedPaid - existing.reduce((s, d) => s + num(d.paidAmount), 0)));
    for (const x of made) {
      if (x.gid && paidMap[x.gid] !== undefined) {
        x.paid = Math.min(num(paidMap[x.gid]), x.data.totalAmount);
        paidLeft = Math.max(0, round2(paidLeft - x.paid));
      }
    }
    for (const x of made) {
      if (x.paid !== undefined) continue;
      x.paid = Math.min(paidLeft, x.data.totalAmount);
      paidLeft = round2(paidLeft - x.paid);
    }
    if (paidLeft > 0.5) rep.note('closing: member paid MORE than all closing records together [left as it is]', { ...who, extraPaid: paidLeft });

    for (const x of made) {
      const d = x.data;
      d.paidAmount = x.paid;
      d.pendingAmount = Math.max(0, round2(d.totalAmount - x.paid));
      d.status = cpStatus(d.totalAmount, x.paid);
      d.paymentPercentage = cpPct(d.totalAmount, x.paid);
      out.set(x.key, d);
      rep.bump('closing_payment: records built from old balances');
      if (!x.gid) continue;
      // Mirror on the member, in the nested-map form the new panel maintains.
      const put = (name, value) => {
        const cur = readMap(m, name);
        if (cur[x.gid] === undefined) m[name] = { ...cur, [x.gid]: value };
      };
      put('closingGroupAmounts', d.totalAmount);
      put('closingGroupCounts', d.closingCount);
      put('closingGroupPaidAmounts', d.paidAmount);
      put('closingGroupPendingAmounts', d.pendingAmount);
      put('closingGroupStatus', d.status);
      const ids = Array.isArray(m.closingGroupIds) ? m.closingGroupIds : [];
      if (!ids.includes(x.gid)) m.closingGroupIds = [...ids, x.gid];
    }
  }
  return [...out].map(([id, data]) => ({ id, data }));
}

// Payment records. The new Payment History page lists paymentGroups and loads
// each group's rows by groupId, and searches rows by search_keyword.
function shapeFees(source, members, ctx) {
  const { rep, opts } = ctx;
  const groups = new Map((source.paymentGroups || []).map((g) => [g.id, { ...g.data }]));
  const madeGroups = new Map();

  const shape = (collection, paymentType) => (source[collection] || []).map(({ id, data }) => {
    const d = { ...data };
    const m = members.get(str(d.memberId));
    if (!m) rep.note(`${collection}: member not found in old data`, { id, memberId: str(d.memberId) });
    const fill = (key, value) => { if ((d[key] === undefined || d[key] === null || d[key] === '') && value) d[key] = value; };
    fill('memberName', m?.displayName);
    fill('memberFatherName', m?.fatherName);
    fill('memberPhone', m?.phone);
    fill('memberRegNo', d.registrationNumber || m?.registrationNumber);
    fill('memberAadhaar', m?.aadhaarNo);
    fill('programId', m?.programId);
    fill('programName', m?.programName);
    if (paymentType === 'closingPayment') fill('paymentType', 'closingPayment');
    if (d.search_keyword === undefined) {
      d.search_keyword = [d.memberName, d.memberRegNo, d.memberFatherName, d.memberPhone, d.memberAadhaar]
        .filter(Boolean).join(' ').toLowerCase();
      rep.bump(`${collection}: search_keyword added`);
    }

    let gid = str(d.groupId);
    if (!gid) { gid = `mig_${id}`; d.groupId = gid; rep.bump(`${collection}: payment had no group, one was created`); }
    const g = groups.get(gid);
    if (d.agentId === undefined) d.agentId = g?.agentId || m?.agentId || '';

    if (!g) {
      // No paymentGroups record → this payment would be invisible in Payment History.
      const when = toDate(d.transactionDate) || toDate(d.createdAt) || null;
      if (!madeGroups.has(gid)) {
        madeGroups.set(gid, {
          agentId: d.agentId || '', totalAmount: 0, paymentMethod: d.paymentMode || 'cash',
          transactionId: d.transactionId || '', paymentDate: when, paymentNote: d.notes || d.paymentNote || '',
          fileUrl: d.fileUrl || '', paymentType,
          ...(paymentType === 'joinFees'
            ? { source: d.transactionType === 'additional_payment' ? 'additional_payment' : 'member_approval' } : {}),
          createdBy: d.createdBy || '', createdAt: d.createdAt || when || opts.now,
          status: 'completed', memberAllocations: {}, migratedFrom: opts.sourceProject,
        });
        if (str(data.groupId)) rep.note(`${collection}: payment group missing in old data, rebuilt from its payments`, { groupId: gid });
      }
      const mg = madeGroups.get(gid);
      mg.totalAmount = round2(mg.totalAmount + num(d.amount));
      mg.actualTotalPaid = mg.totalAmount;
      if (str(d.memberId)) {
        const prev = mg.memberAllocations[d.memberId]?.amount || 0;
        mg.memberAllocations[d.memberId] = { programId: d.programId || '', programName: d.programName || '', amount: round2(prev + num(d.amount)) };
      }
    }
    return { id, data: d };
  });

  const joinFees = shape('memberJoinFees', 'joinFees');
  const closingFees = shape('memberClosingFees', 'closingPayment');
  const paymentGroups = [
    ...[...groups].map(([id, data]) => ({ id, data })),
    ...[...madeGroups].map(([id, data]) => ({ id, data })),
  ];
  return { joinFees, closingFees, paymentGroups };
}

export function buildPlan(source, options = {}) {
  const rep = new Report();
  const opts = { sourceProject: 'old-project', commission: 'keep', srNoBase: 0, now: new Date(), ...options };
  const S = (name) => source[name] || [];

  const programs = S('programs').map(({ id, data }) => {
    const d = { ...data };
    if (!str(d.regNoPrefix)) { d.regNoPrefix = 'MEM'; rep.bump('programs: regNoPrefix added (MEM)'); }
    return { id, data: d };
  });

  const agents = S('agents').map(({ id, data }) => {
    const d = { ...data };
    if (!str(d.uid)) { d.uid = id; rep.bump('agents: uid added'); }
    for (const f of ['walletBalance', 'totalCommissionEarned', 'totalCommissionWithdrawn']) {
      if (typeof d[f] !== 'number') { d[f] = 0; rep.bump(`agents: ${f} added (0)`); }
    }
    if (opts.commission === 'on' || opts.commission === 'off') {
      d.commissionJoinFeesEnabled = opts.commission === 'on';
      d.commissionClosingEnabled = opts.commission === 'on';
    }
    return { id, data: d };
  });

  const ctx = {
    rep, opts,
    programIds: new Set(programs.map((p) => p.id)),
    agentIds: new Set(agents.map((a) => a.id)),
  };

  const members = new Map();
  for (const { id, data } of S('members')) members.set(id, { ...data });
  for (const [id, m] of members) shapeMember(id, m, ctx);
  const maxSrNo = assignSrNo(members, ctx);

  const closingPayments = shapeClosing(source, members, ctx);
  const { joinFees, closingFees, paymentGroups } = shapeFees(source, members, ctx);

  // Reserve every registration number in use, so the new panel's generator can
  // never hand an old member's number to someone else.
  const reservations = new Map(S('registrationNumbers').map((r) => [r.id, r.data]));
  for (const [, m] of members) {
    const regNo = str(m.registrationNumber).toUpperCase();
    if (!regNo) continue;
    if (regNo.includes('/')) { rep.note('registrationNumbers: number contains "/" and cannot be reserved', { regNo }); continue; }
    if (!reservations.has(regNo)) {
      reservations.set(regNo, { registrationNumber: regNo, programId: m.programId || null, migrated: true, createdAt: m.createdAt || opts.now });
    }
  }

  const organizationStats = S('organizationStats').map(({ id, data }) => ({ id, data: { ...data } }));
  let current = organizationStats.find((d) => d.id === 'current');
  if (!current && members.size) { current = { id: 'current', data: {} }; organizationStats.push(current); }
  if (current) current.data.totalMembersAdded = Math.max(num(current.data.totalMembersAdded), maxSrNo);

  return {
    report: rep,
    maxSrNo,
    docs: {
      programs,
      agents,
      members: [...members].map(([id, data]) => ({ id, data })),
      groupClosings: S('groupClosings').map(({ id, data }) => ({ id, data: { ...data } })),
      closing_payment: closingPayments,
      paymentGroups,
      memberJoinFees: joinFees,
      memberClosingFees: closingFees,
      organizationStats,
      registrationNumbers: [...reservations].map(([id, data]) => ({ id, data })),
    },
  };
}

// Totals rebuilt from member documents — the same rule the panel's own
// "recalculate stats" uses: only accepted (active), non-deleted members count.
export function computeAggregates(memberList) {
  const blank = () => ({
    memberCount: 0, totalJoinFees: 0, totalJoinFeesPaid: 0, totalJoinFeesPending: 0,
    totalClosingAmount: 0, totalClosingPaidAmount: 0, totalClosingPendingAmount: 0,
    totalClosingCount: 0, paidClosingCount: 0, pendingClosingCount: 0, closedCount: 0,
  });
  const org = blank();
  const programs = new Map();
  const agents = new Map();            // agentId → { total, byProgram: Map }
  const add = (t, m) => {
    const migrated = m.migratedData === true;       // counted, but fees were tracked outside
    const jf = migrated ? 0 : num(m.joinFees), jp = migrated ? 0 : num(m.paidAmount);
    t.memberCount += 1;
    t.totalJoinFees += jf; t.totalJoinFeesPaid += jp; t.totalJoinFeesPending += Math.max(0, jf - jp);
    t.totalClosingAmount += num(m.closing_totalAmount);
    t.totalClosingPaidAmount += num(m.closing_paidAmount);
    t.totalClosingPendingAmount += num(m.closing_pendingAmount);
    t.totalClosingCount += num(m.totalClosingCount);
    t.paidClosingCount += num(m.paidClosingCount);
    t.pendingClosingCount += num(m.pendingClosingCount);
    t.closedCount += m.member_closed === true ? 1 : 0;
  };
  for (const { data: m } of memberList) {
    if (m.status !== 'active' || m.delete_flag === true) continue;
    add(org, m);
    if (m.programId) {
      if (!programs.has(m.programId)) programs.set(m.programId, { ...blank(), programName: m.programName || '' });
      add(programs.get(m.programId), m);
    }
    if (m.agentId) {
      if (!agents.has(m.agentId)) agents.set(m.agentId, { total: blank(), byProgram: new Map() });
      const a = agents.get(m.agentId);
      add(a.total, m);
      if (m.programId) {
        if (!a.byProgram.has(m.programId)) a.byProgram.set(m.programId, { ...blank(), programName: m.programName || '' });
        add(a.byProgram.get(m.programId), m);
      }
    }
  }
  return { org, programs, agents };
}

// ─────────────────────────────────────────────────────────────────────────────
// Database access
// ─────────────────────────────────────────────────────────────────────────────
function loadCreds({ label, keyFile, envFiles, bucket }) {
  if (keyFile) {
    if (!fs.existsSync(keyFile)) fail(`${label} project: key file not found: ${keyFile}`);
    const j = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
    if (!j.project_id || !j.client_email || !j.private_key) fail(`${label} project: ${keyFile} is not a service-account key file.`);
    return {
      projectId: j.project_id, clientEmail: j.client_email, privateKey: j.private_key,
      storageBucket: bucket || `${j.project_id}.firebasestorage.app`,
    };
  }
  const found = envFiles.filter((f) => fs.existsSync(f));
  if (!found.length) {
    fail(`${label} project: .env file not found (${envFiles.join(', ')}).\n  Give its location with --${label === 'OLD' ? 'old' : 'new'}-env "<path>"`);
  }
  const env = Object.assign({}, ...found.map(readEnvFile));        // later file wins, like Next.js
  const projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || env.FIREBASE_PROJECT_ID;
  const clientEmail = env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    fail(`${label} project: keys missing in ${found.join(', ')} — need NEXT_PUBLIC_FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.`);
  }
  return {
    projectId, clientEmail, privateKey,
    storageBucket: bucket || env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`,
  };
}

async function connect(args) {
  const oldCreds = loadCreds({
    label: 'OLD', keyFile: args['old-key'], bucket: args['old-bucket'],
    envFiles: [typeof args['old-env'] === 'string' ? args['old-env'] : DEFAULT_OLD_ENV],
  });
  const newCreds = loadCreds({
    label: 'NEW', keyFile: args['new-key'], bucket: args['new-bucket'],
    envFiles: typeof args['new-env'] === 'string' ? [args['new-env']] : [path.join(ROOT, '.env'), path.join(ROOT, '.env.local')],
  });
  if (oldCreds.projectId === newCreds.projectId) {
    fail(`Old and new are the SAME Firebase project (${oldCreds.projectId}). Check the two .env files.`);
  }
  // The new project must be the one this folder deploys to — guards against a
  // .env that still points somewhere else.
  const rcFile = path.join(ROOT, '.firebaserc');
  if (fs.existsSync(rcFile)) {
    let expected = null;
    try { expected = JSON.parse(fs.readFileSync(rcFile, 'utf8'))?.projects?.default || null; } catch { /* ignore */ }
    if (expected && expected !== newCreds.projectId && args['target-project'] !== newCreds.projectId) {
      fail(`.env points at "${newCreds.projectId}" but .firebaserc says this project is "${expected}".\n` +
        `  Fix .env, or pass --target-project ${newCreds.projectId} if that really is the destination.`);
    }
  }

  const { default: admin } = await import('firebase-admin');
  const make = (c, name) => {
    const app = admin.initializeApp({
      credential: admin.credential.cert({ projectId: c.projectId, clientEmail: c.clientEmail, privateKey: c.privateKey }),
      storageBucket: c.storageBucket,
    }, name);
    return {
      projectId: c.projectId, bucketName: c.storageBucket, app,
      db: admin.firestore(app), auth: admin.auth(app),
      bucket: () => admin.storage(app).bucket(),
    };
  };
  const src = make(oldCreds, 'old-project');
  const dst = make(newCreds, 'new-project');
  dst.db.settings({ ignoreUndefinedProperties: true });
  return { src, dst, F: admin.firestore, close: () => Promise.all([src.app.delete(), dst.app.delete()]) };
}

// Page through a collection in document-id order (stable, resumable).
async function streamCollection(db, F, name, onPage, { fields, group = false, pageSize = 500 } = {}) {
  let last = null, total = 0;
  for (;;) {
    let q = (group ? db.collectionGroup(name) : db.collection(name)).orderBy(F.FieldPath.documentId()).limit(pageSize);
    if (fields) q = q.select(...fields);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.docs.length) await onPage(snap.docs);
    total += snap.docs.length;
    if (snap.docs.length < pageSize) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return total;
}

async function readAll(db, F, name, log, opts) {
  const out = [];
  await streamCollection(db, F, name, (docs) => {
    for (const d of docs) out.push({ id: d.id, data: d.data() });
    if (log && out.length % 5000 < docs.length && out.length >= 5000) log(`    ${name}: ${fmt(out.length)} read…`);
  }, opts);
  return out;
}

async function countOf(db, name) {
  try { return (await db.collection(name).count().get()).data().count; } catch { return null; }
}

const listRoot = async (db) => (await db.listCollections()).map((c) => c.id).sort();

// Writes go through one place. Default is "create": a document that already
// exists in the new project is left exactly as it is, so a re-run never undoes
// work done in the new panel.
const RETRYABLE = new Set([4, 8, 10, 13, 14]);
class Sink {
  constructor(db, { commit, overwrite, existCheck }) {
    Object.assign(this, { db, commit, overwrite, existCheck });
    this.stats = {}; this.failures = []; this.queue = []; this.sent = 0;
    if (commit) {
      this.writer = db.bulkWriter();
      this.writer.onWriteError((err) => RETRYABLE.has(err.code) && err.failedAttempts < 5);
    }
  }
  stat(name) { return (this.stats[name] ||= { planned: 0, written: 0, existing: 0, failed: 0 }); }
  async write(name, docPath, data) {
    const s = this.stat(name);
    s.planned += 1;
    const ref = this.db.doc(docPath);
    if (!this.commit) {
      if (this.existCheck) { this.queue.push({ ref, s }); if (this.queue.length >= 300) await this.check(); }
      return;
    }
    (this.overwrite ? this.writer.set(ref, data) : this.writer.create(ref, data)).then(
      () => { s.written += 1; },
      (err) => {
        if (err.code === 6) { s.existing += 1; return; }            // ALREADY_EXISTS
        s.failed += 1;
        if (this.failures.length < 300) this.failures.push({ path: docPath, error: err.message });
      },
    );
    if (++this.sent % 2000 === 0) await this.writer.flush();
  }
  async check() {
    const items = this.queue.splice(0);
    if (!items.length) return;
    const snaps = await this.db.getAll(...items.map((i) => i.ref), { fieldMask: [] });
    snaps.forEach((snap, i) => { if (snap.exists) items[i].s.existing += 1; });
  }
  async close() { if (this.commit) await this.writer.close(); else await this.check(); }
}

function printWriteTable(stats, { commit, overwrite }, log) {
  const names = Object.keys(stats);
  const w = Math.max(12, ...names.map((n) => n.length));
  const head = commit ? ['records', 'written', 'already there', 'FAILED'] : ['records', 'would write', 'already there', ''];
  log(`\n  ${'collection'.padEnd(w)}  ${head.map((h) => h.padStart(13)).join('  ')}`);
  for (const n of names) {
    const s = stats[n];
    const cols = commit
      ? [s.planned, s.written, s.existing, s.failed || '']
      : [s.planned, overwrite ? s.planned : s.planned - s.existing, s.existing, ''];
    log(`  ${n.padEnd(w)}  ${cols.map((c) => (c === '' ? '' : fmt(c)).padStart(13)).join('  ')}`);
  }
}

function printReport(rep, log) {
  const keys = Object.keys(rep.counts).sort();
  if (!keys.length) return;
  log('\n  What was filled in / needs a look:');
  for (const k of keys) log(`    ${fmt(rep.counts[k]).padStart(8)}  ${k}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// inspect — look at both databases. Prints field NAMES and types only, never values.
// ─────────────────────────────────────────────────────────────────────────────
const typeOf = (v) => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (v instanceof Date || typeof v?.toDate === 'function') return 'timestamp';
  if (isDocRef(v)) return 'reference';
  if (typeof v === 'object' && typeof v.latitude === 'number' && typeof v.longitude === 'number') return 'geopoint';
  if (v instanceof Uint8Array) return 'bytes';
  if (typeof v === 'object') return 'map';
  return typeof v;
};

export async function runInspect(ctx) {
  const { src, dst, args, log } = ctx;
  const n = Math.max(1, Number(args.sample) || 50);
  const look = async (side) => {
    const out = {};
    for (const name of await listRoot(side.db)) {
      const snap = await side.db.collection(name).limit(n).get();
      const fields = {};
      const subs = new Set();
      for (const d of snap.docs) {
        for (const [k, v] of Object.entries(d.data())) {
          const f = (fields[k] ||= { seen: 0, types: new Set() });
          f.seen += 1; f.types.add(typeOf(v));
        }
      }
      for (const d of snap.docs.slice(0, 5)) for (const c of await d.ref.listCollections()) subs.add(c.id);
      out[name] = {
        count: await countOf(side.db, name), sampled: snap.docs.length, subcollections: [...subs].sort(),
        fields: Object.fromEntries(Object.entries(fields).sort().map(([k, f]) => [k, { seen: f.seen, types: [...f.types].sort() }])),
      };
    }
    return out;
  };
  log('\nReading old project…');
  const oldSide = await look(src);
  log('Reading new project…');
  const newSide = await look(dst);

  const names = [...new Set([...Object.keys(oldSide), ...Object.keys(newSide)])].sort();
  const w = Math.max(12, ...names.map((x) => x.length));
  log(`\n  ${'collection'.padEnd(w)}  ${'old'.padStart(10)}  ${'new'.padStart(10)}  notes`);
  for (const name of names) {
    const o = oldSide[name], nw = newSide[name];
    const notes = [];
    if (SKIP_COLLECTIONS.includes(name)) notes.push('not copied (temporary data)');
    else if (TRANSFORMED.includes(name)) notes.push('copied + reshaped');
    else if (o) notes.push('copied as it is');
    if (o?.subcollections.length) notes.push(`sub-collections: ${o.subcollections.join(', ')}`);
    log(`  ${name.padEnd(w)}  ${(o ? fmt(o.count ?? o.sampled) : '-').padStart(10)}  ${(nw ? fmt(nw.count ?? nw.sampled) : '-').padStart(10)}  ${notes.join(' · ')}`);
  }
  for (const name of names) {
    const o = oldSide[name], nw = newSide[name];
    if (!o || !nw || !nw.sampled || !o.sampled) continue;
    const onlyNew = Object.keys(nw.fields).filter((k) => !(k in o.fields));
    if (onlyNew.length) log(`\n  ${name}: fields the new panel writes that old documents do not have:\n    ${onlyNew.join(', ')}`);
  }
  const unknownSubs = new Set();
  for (const o of Object.values(oldSide)) o.subcollections.forEach((s) => { if (!SKIP_SUBCOLLECTIONS.includes(s)) unknownSubs.add(s); });
  if (unknownSubs.size) log(`\n  Sub-collections found in old data: ${[...unknownSubs].join(', ')}\n  ("data" copies memberPrograms by default; add others with --subcollections a,b)`);
  log(`\n  Field lists for every collection are in the report file (names and types only, no values).`);
  return { old: oldSide, new: newSide };
}

// ─────────────────────────────────────────────────────────────────────────────
// data — copy Firestore
// ─────────────────────────────────────────────────────────────────────────────
export async function runData(ctx) {
  const { src, dst, F, args, commit, log } = ctx;
  const only = listArg(args.only);
  const skip = new Set([...SKIP_COLLECTIONS, ...listArg(args.skip)]);
  const inScope = (name) => !skip.has(name) && (!only.length || only.includes(name));
  const commission = ['on', 'off'].includes(args.commission) ? args.commission : 'keep';
  const subs = (args.subcollections === undefined ? ['memberPrograms'] : listArg(args.subcollections))
    .filter((s) => !SKIP_SUBCOLLECTIONS.includes(s));

  const srcCols = await listRoot(src.db);
  if (!srcCols.length) fail('The old project has no Firestore collections — are the old keys correct?');

  log('\nReading old project…');
  const source = {};
  for (const name of TRANSFORMED) {
    source[name] = srcCols.includes(name) ? await readAll(src.db, F, name, log) : [];
    log(`    ${name.padEnd(20)} ${fmt(source[name].length)}`);
  }

  // What is already in the new project
  const targetMembers = await readAll(dst.db, F, 'members', null, { fields: ['srNo'] });
  const srcIds = new Set(source.members.map((m) => m.id));
  const foreign = targetMembers.filter((d) => !srcIds.has(d.id)).length;
  if (foreign && inScope('members') && !args['allow-non-empty']) {
    fail(`The new project already has ${fmt(foreign)} member(s) that did not come from the old project.\n` +
      `  Mixing is possible but Sr. No. and dashboard totals then need care. If that is what you want:\n` +
      `    add --allow-non-empty, and run "recalc --commit" afterwards.`);
  }
  const markerRef = dst.db.collection(MARKER_COLLECTION).doc(src.projectId);
  const firstRun = !(await markerRef.get()).exists;
  const orgRef = dst.db.collection('organizationStats').doc('current');
  const orgSnap = await orgRef.get();
  const srNoBase = Math.max(
    0, num(orgSnap.exists ? orgSnap.data().totalMembersAdded : 0),
    ...targetMembers.map((d) => (typeof d.data.srNo === 'number' ? d.data.srNo : 0)),
  );

  const plan = buildPlan(source, {
    sourceProject: src.projectId, commission, srNoBase,
    targetSrNo: new Map(targetMembers.map((d) => [d.id, d.data.srNo])),
    now: new Date(),
  });

  const sink = new Sink(dst.db, { commit, overwrite: !!args.overwrite, existCheck: !args['no-exist-check'] });
  log(commit ? '\nWriting to new project…' : '\nDry run — checking against new project…');

  for (const name of TRANSFORMED) {
    if (!inScope(name)) continue;
    for (const { id, data } of plan.docs[name]) await sink.write(name, `${name}/${id}`, cloneForTarget(data, dst.db));
  }
  for (const name of srcCols) {
    if (TRANSFORMED.includes(name) || !inScope(name)) continue;
    await streamCollection(src.db, F, name, async (docs) => {
      for (const d of docs) {
        if (name === 'settings' && SKIP_SETTINGS_DOCS.includes(d.id)) continue;
        await sink.write(name, `${name}/${d.id}`, cloneForTarget(d.data(), dst.db));
      }
    });
  }
  for (const sub of subs) {
    const onPage = async (docs) => {
      for (const d of docs) {
        const root = d.ref.path.split('/')[0];
        if (!inScope(root)) continue;
        await sink.write(`${root}/*/${sub}`, d.ref.path, cloneForTarget(d.data(), dst.db));
      }
    };
    try { await streamCollection(src.db, F, sub, onPage, { group: true }); }
    catch (e) { plan.report.note('sub-collection could not be read', { name: sub, error: e.message }); }
  }
  await sink.close();

  if (commit) {
    // Sr. No. counter: the next member added in the panel continues after the last one.
    if (inScope('organizationStats') || inScope('members')) {
      const cur = await orgRef.get();
      if (num(cur.exists ? cur.data().totalMembersAdded : 0) < plan.maxSrNo) {
        await orgRef.set({ totalMembersAdded: plan.maxSrNo }, { merge: true });
      }
    }
    await markerRef.set({
      sourceProject: src.projectId, targetProject: dst.projectId, lastRunAt: new Date(),
      lastRunWritten: Object.fromEntries(Object.entries(sink.stats).map(([k, s]) => [k.replace(/[/*]/g, '_'), s.written])),
    }, { merge: true });
  }

  printWriteTable(sink.stats, { commit, overwrite: !!args.overwrite }, log);
  printReport(plan.report, log);
  if (sink.failures.length) log(`\n  ✖ ${fmt(sink.failures.length)} write(s) FAILED — see the report file, fix, and run again (finished documents are skipped).`);
  if (foreign) log('\n  The new project had its own members too → run "recalc --commit" to rebuild the totals.');
  else if (firstRun && orgSnap.exists && inScope('organizationStats')) {
    log('\n  The new project already had dashboard totals (organizationStats/current), so the old ones were not\n' +
        '  copied over them → run "recalc --commit" to rebuild the dashboard totals from the members.');
  }
  log(`\n  Sr. No. counter after migration: ${fmt(plan.maxSrNo)}`);
  if (!commit) log('\n  Nothing was written. Add --commit to do it.');
  return { stats: sink.stats, failures: sink.failures, counts: plan.report.counts, lists: plan.report.lists };
}

// ─────────────────────────────────────────────────────────────────────────────
// verify / recalc
// ─────────────────────────────────────────────────────────────────────────────
const AGG_FIELDS = [
  'memberCount', 'totalJoinFees', 'totalJoinFeesPaid', 'totalJoinFeesPending',
  'totalClosingAmount', 'totalClosingPaidAmount', 'totalClosingPendingAmount',
  'totalClosingCount', 'paidClosingCount', 'pendingClosingCount', 'closedCount',
];
// The agent document uses different names for its top-level closing totals.
const AGENT_NAME = {
  totalClosingAmount: 'closing_totalAmount', totalClosingPaidAmount: 'closing_paidAmount',
  totalClosingPendingAmount: 'closing_pendingAmount',
};
const ORG_NAME = { memberCount: 'totalMembers' };
const aggDiff = (stored, want, rename = {}) =>
  AGG_FIELDS.filter((f) => Math.abs(num(stored?.[rename[f] || f]) - num(want[f])) > 0.5)
    .map((f) => ({ field: rename[f] || f, stored: num(stored?.[rename[f] || f]), fromMembers: num(want[f]) }));

async function aggregateCheck(ctx, members) {
  const { dst, F } = ctx;
  const agg = computeAggregates(members);
  const zero = Object.fromEntries(AGG_FIELDS.map((f) => [f, 0]));
  const out = { agents: [], programs: [], org: [] };
  for (const { id, data } of await readAll(dst.db, F, 'agents')) {
    const diff = aggDiff(data, agg.agents.get(id)?.total || zero, AGENT_NAME);
    if (diff.length) out.agents.push({ id, diff });
  }
  for (const { id, data } of await readAll(dst.db, F, 'programs')) {
    const diff = aggDiff(data, agg.programs.get(id) || zero);
    if (diff.length) out.programs.push({ id, diff });
  }
  const orgSnap = await dst.db.collection('organizationStats').doc('current').get();
  out.org = aggDiff(orgSnap.exists ? orgSnap.data() : {}, agg.org, ORG_NAME);
  return { agg, out };
}

export async function runVerify(ctx) {
  const { src, dst, F, log } = ctx;
  let problems = 0;
  const ok = (good, text) => { if (!good) problems += 1; log(`  ${good ? '✔' : '✖'} ${text}`); };

  log('\nDocument counts');
  const names = [...new Set([...(await listRoot(src.db)), ...(await listRoot(dst.db))])]
    .filter((n) => !SKIP_COLLECTIONS.includes(n)).sort();
  const counts = {};
  for (const name of names) {
    const [o, n] = await Promise.all([countOf(src.db, name), countOf(dst.db, name)]);
    counts[name] = { old: o, new: n };
    // Some collections legitimately grow: built records, new-panel activity.
    const grows = ['closing_payment', 'paymentGroups', 'registrationNumbers', 'settings', 'users'].includes(name);
    ok(o === null || n === null || n >= o, `${name.padEnd(24)} old ${fmt(o).padStart(9)}   new ${fmt(n).padStart(9)}${grows && n > o ? '   (more is expected here)' : ''}`);
  }

  log('\nMembers');
  const oldM = await readAll(src.db, F, 'members', log);
  const newM = await readAll(dst.db, F, 'members', log);
  const newById = new Map(newM.map((m) => [m.id, m.data]));
  const MONEY = ['joinFees', 'paidAmount', 'pendingAmount', 'closing_totalAmount', 'closing_paidAmount', 'closing_pendingAmount'];
  const missing = [], changed = [];
  const sums = { old: {}, new: {} };
  for (const { id, data } of oldM) {
    const n = newById.get(id);
    if (!n) { missing.push(id); continue; }
    for (const f of MONEY) {
      sums.old[f] = (sums.old[f] || 0) + num(data[f]);
      sums.new[f] = (sums.new[f] || 0) + num(n[f]);
      if (Math.abs(num(data[f]) - num(n[f])) > 0.5 && changed.length < 300) changed.push({ id, field: f, old: num(data[f]), new: num(n[f]) });
    }
  }
  ok(!missing.length, `every old member exists in the new project${missing.length ? ` — ${fmt(missing.length)} MISSING` : ''}`);
  for (const f of MONEY) ok(Math.abs(num(sums.old[f]) - num(sums.new[f])) <= 0.5, `${f.padEnd(24)} old ₹${fmt(round2(sums.old[f]))}   new ₹${fmt(round2(sums.new[f]))}`);
  if (changed.length) log(`    (${fmt(changed.length)} member figure(s) differ — normal if payments were taken in the new panel after migrating)`);

  log('\nNew project health');
  const live = newM.filter((m) => m.data.delete_flag !== true);
  const hasTs = (v) => v && (v instanceof Date || typeof v.toDate === 'function');
  const noJoin = live.filter((m) => !hasTs(m.data.joinDateTs));
  const noSr = live.filter((m) => !NO_SRNO_STATUS.has(str(m.data.status).toLowerCase()) && typeof m.data.srNo !== 'number');
  const noKeys = live.filter((m) => !Array.isArray(m.data.search_keywords) || !m.data.search_keywords.length);
  const noClosedDate = live.filter((m) => m.data.member_closed === true && !isIsoText(m.data.closed_date));
  const dup = (key) => {
    const seen = new Map(), out = [];
    for (const m of live) {
      const v = m.data[key];
      if (v === undefined || v === null || v === '') continue;
      if (seen.has(v)) out.push({ value: v, ids: [seen.get(v), m.id] }); else seen.set(v, m.id);
    }
    return out;
  };
  const dupSr = dup('srNo'), dupReg = dup('registrationNumber');
  ok(!noJoin.length, `members with a sortable join date (joinDateTs)${noJoin.length ? ` — ${fmt(noJoin.length)} without` : ''}`);
  ok(!noSr.length, `members with a Sr. No.${noSr.length ? ` — ${fmt(noSr.length)} without` : ''}`);
  ok(!noKeys.length, `members searchable${noKeys.length ? ` — ${fmt(noKeys.length)} without search keywords` : ''}`);
  ok(!noClosedDate.length, `closed members with a closing date${noClosedDate.length ? ` — ${fmt(noClosedDate.length)} without` : ''}`);
  ok(!dupSr.length, `Sr. No. unique${dupSr.length ? ` — ${fmt(dupSr.length)} duplicate(s)` : ''}`);
  ok(!dupReg.length, `registration numbers unique${dupReg.length ? ` — ${fmt(dupReg.length)} duplicate(s)` : ''}`);

  // Closing balance on each member must equal its closing_payment records.
  const cpByMember = new Map();
  for (const { data } of await readAll(dst.db, F, 'closing_payment', log)) {
    if (data.isReversed === true || !data.memberId) continue;
    const t = cpByMember.get(data.memberId) || { total: 0, paid: 0 };
    t.total += num(data.totalAmount); t.paid += num(data.paidAmount);
    cpByMember.set(data.memberId, t);
  }
  const closingOff = [];
  for (const m of live) {
    const t = cpByMember.get(m.id) || { total: 0, paid: 0 };
    if (Math.abs(t.total - num(m.data.closing_totalAmount)) > 0.5 || Math.abs(t.paid - num(m.data.closing_paidAmount)) > 0.5) {
      closingOff.push({ id: m.id, regNo: str(m.data.registrationNumber), memberTotal: num(m.data.closing_totalAmount), recordsTotal: round2(t.total), memberPaid: num(m.data.closing_paidAmount), recordsPaid: round2(t.paid) });
    }
  }
  ok(!closingOff.length, `closing balance matches closing records${closingOff.length ? ` — ${fmt(closingOff.length)} member(s) differ (panel: Settings → Closing System Check)` : ''}`);

  const { out: aggOut } = await aggregateCheck(ctx, newM);
  const aggBad = aggOut.agents.length + aggOut.programs.length + (aggOut.org.length ? 1 : 0);
  log(`  ${aggBad ? '•' : '✔'} stored totals vs member documents: ${fmt(aggOut.agents.length)} agent(s), ${fmt(aggOut.programs.length)} yojna(s)` +
    `${aggOut.org.length ? ', dashboard' : ''} differ${aggBad ? ' — these totals were copied as the old panel had them; "recalc" shows/rebuilds them' : ''}`);

  log(problems ? `\n  ${problems} check(s) need a look — details are in the report file.` : '\n  All checks passed.');
  return {
    problems, counts, sums, missingMembers: missing.slice(0, 300), changedFigures: changed,
    noJoinDate: noJoin.slice(0, 300).map((m) => m.id), noSrNo: noSr.slice(0, 300).map((m) => m.id),
    noSearchKeywords: noKeys.slice(0, 300).map((m) => m.id), closedWithoutDate: noClosedDate.slice(0, 300).map((m) => m.id),
    duplicateSrNo: dupSr.slice(0, 300), duplicateRegistrationNumbers: dupReg.slice(0, 300),
    closingMismatch: closingOff.slice(0, 300), aggregateDifferences: aggOut,
  };
}

export async function runRecalc(ctx) {
  const { dst, F, commit, log } = ctx;
  log('\nReading members of the new project…');
  const members = await readAll(dst.db, F, 'members', log);
  const { agg, out } = await aggregateCheck(ctx, members);
  const zero = Object.fromEntries(AGG_FIELDS.map((f) => [f, 0]));

  log(`\n  Totals that differ from the member documents:`);
  log(`    agents    : ${fmt(out.agents.length)}`);
  log(`    yojnas    : ${fmt(out.programs.length)}`);
  log(`    dashboard : ${out.org.length ? out.org.map((d) => `${d.field} ${fmt(d.stored)} → ${fmt(d.fromMembers)}`).join(', ') : 'matches'}`);

  if (commit) {
    const now = new Date();
    for (const { id } of out.agents) {
      const a = agg.agents.get(id) || { total: zero, byProgram: new Map() };
      const t = a.total;
      await dst.db.collection('agents').doc(id).update({
        memberCount: t.memberCount, totalJoinFees: t.totalJoinFees, totalJoinFeesPaid: t.totalJoinFeesPaid,
        totalJoinFeesPending: t.totalJoinFeesPending, closing_totalAmount: t.totalClosingAmount,
        closing_paidAmount: t.totalClosingPaidAmount, closing_pendingAmount: t.totalClosingPendingAmount,
        totalClosingCount: t.totalClosingCount, paidClosingCount: t.paidClosingCount,
        pendingClosingCount: t.pendingClosingCount, closedCount: t.closedCount,
        programStats: Object.fromEntries([...a.byProgram].map(([pid, s]) => [pid, { ...s, lastUpdated: now }])),
        stats_recalculated_at: now, updated_at: now,
      });
    }
    for (const { id } of out.programs) {
      const { programName, ...t } = agg.programs.get(id) || zero;
      await dst.db.collection('programs').doc(id).update({ ...t, updated_at: now });
    }
    if (out.org.length) {
      const { memberCount, ...rest } = agg.org;
      await dst.db.collection('organizationStats').doc('current').set({ totalMembers: memberCount, ...rest, updated_at: now }, { merge: true });
    }
    log('\n  Totals rebuilt.');
  } else {
    log('\n  Nothing was written. Add --commit to rebuild these totals from the member documents.');
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// auth — copy logins. UIDs are kept, because every agent/member/user document
// is stored under its login's UID.
//
// Passwords: Firebase never gives out a password, only its hash, and a hash can
// only be re-used with the OLD project's hash parameters. Get them once from
//   Firebase console → OLD project → Authentication → Users → ⋮ (top right of
//   the table) → "Password hash parameters"
// paste that block into scripts/old-auth-hash.txt (it is git-ignored), and
// everyone keeps their current password.
// Without that file: members get the password saved on their member record,
// and users/agents are copied without a password (they use "Forgot password",
// or you pass --temp-password).
// ─────────────────────────────────────────────────────────────────────────────
export function loadHashConfig(file) {
  if (!file || !fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  let key, sep, rounds, mem;
  try {
    const j = JSON.parse(text);
    const h = j.hash_config || j;
    key = h.base64_signer_key || h.signerKey; sep = h.base64_salt_separator || h.saltSeparator;
    rounds = h.rounds; mem = h.mem_cost ?? h.memoryCost;
  } catch {
    const pick = (re) => (text.match(re) || [])[1];
    key = pick(/base64_signer_key\s*[:=]\s*["']?([A-Za-z0-9+/=_-]+)/);
    sep = pick(/base64_salt_separator\s*[:=]\s*["']?([A-Za-z0-9+/=_-]+)/);
    rounds = pick(/rounds\s*[:=]\s*(\d+)/); mem = pick(/mem_cost\s*[:=]\s*(\d+)/);
  }
  if (!key || !rounds || !mem) fail(`${file} does not contain base64_signer_key, rounds and mem_cost.`);
  return {
    key: Buffer.from(key, 'base64'), saltSeparator: Buffer.from(sep || '', 'base64'),
    rounds: Number(rounds), memoryCost: Number(mem),
  };
}

async function eachUser(auth, fn) {
  let token;
  do {
    const page = await auth.listUsers(1000, token);
    for (const u of page.users) await fn(u);
    token = page.pageToken;
  } while (token);
}

export async function runAuth(ctx) {
  const { src, dst, F, args, commit, log } = ctx;
  const hashFile = typeof args['hash-config'] === 'string' ? args['hash-config'] : DEFAULT_HASH_FILE;
  const hash = loadHashConfig(hashFile);
  const temp = typeof args['temp-password'] === 'string' ? args['temp-password'] : null;
  if (temp && temp.length < 6) fail('--temp-password must be at least 6 characters.');
  const rep = new Report();

  const have = { uid: new Set(), email: new Map(), phone: new Map() };
  await eachUser(dst.auth, (u) => {
    have.uid.add(u.uid);
    if (u.email) have.email.set(u.email.toLowerCase(), u.uid);
    if (u.phoneNumber) have.phone.set(u.phoneNumber, u.uid);
  });

  // The panel keeps each member's password on the member record.
  const memberPw = new Map();
  if (!hash) {
    await streamCollection(src.db, F, 'members', (docs) => {
      for (const d of docs) {
        const pw = d.data().password;
        if (typeof pw === 'string' && pw.length >= 6) memberPw.set(d.id, pw);
      }
    }, { fields: ['password'] });
  }

  const sets = { scrypt: [], sha: [], none: [] };
  let total = 0, redacted = 0, realHashes = 0;
  await eachUser(src.auth, (u) => {
    total += 1;
    const role = u.customClaims?.role || 'no role';
    if (have.uid.has(u.uid) && !args.overwrite) { rep.bump('already in new project (left as it is)'); return; }
    const email = u.email ? u.email.toLowerCase() : null;
    if (email && have.email.has(email) && have.email.get(email) !== u.uid) {
      rep.note('NOT copied — e-mail already used by another login in the new project', { uid: u.uid, email: u.email, role });
      return;
    }
    const rec = { uid: u.uid, emailVerified: !!u.emailVerified, disabled: !!u.disabled };
    if (u.email) rec.email = u.email;
    if (u.displayName) rec.displayName = u.displayName;
    if (u.photoURL) rec.photoURL = u.photoURL;
    if (u.phoneNumber) {
      if (have.phone.has(u.phoneNumber) && have.phone.get(u.phoneNumber) !== u.uid) {
        rep.note('copied WITHOUT phone number — it is already used by another login in the new project', { uid: u.uid, role });
      } else rec.phoneNumber = u.phoneNumber;
    }
    if (u.customClaims && Object.keys(u.customClaims).length) rec.customClaims = u.customClaims;
    const meta = {};
    if (u.metadata?.creationTime) meta.creationTime = u.metadata.creationTime;
    if (u.metadata?.lastSignInTime) meta.lastSignInTime = u.metadata.lastSignInTime;
    if (Object.keys(meta).length) rec.metadata = meta;

    const hasHash = !!u.passwordHash;
    const isRedacted = hasHash && Buffer.from(u.passwordHash, 'base64').toString('utf8') === 'REDACTED';
    if (isRedacted) redacted += 1;
    if (hasHash && !isRedacted) realHashes += 1;

    if (hash && hasHash && !isRedacted) {
      rec.passwordHash = Buffer.from(u.passwordHash, 'base64');
      if (u.passwordSalt) rec.passwordSalt = Buffer.from(u.passwordSalt, 'base64');
      sets.scrypt.push(rec);
      rep.bump(`${role}: password kept`);
    } else if (memberPw.has(u.uid)) {
      rec.passwordHash = crypto.createHash('sha256').update(memberPw.get(u.uid)).digest();
      sets.sha.push(rec);
      rep.bump(`${role}: password taken from the member record`);
    } else if (temp) {
      rec.passwordHash = crypto.createHash('sha256').update(temp).digest();
      sets.sha.push(rec);
      rep.note(`${role}: given the temporary password`, { uid: u.uid, email: u.email || '' });
    } else {
      sets.none.push(rec);
      rep.note(`${role}: copied WITHOUT a password (must use "Forgot password")`, { uid: u.uid, email: u.email || '' });
    }
  });

  let imported = 0, failed = 0;
  if (commit) {
    const options = {
      scrypt: hash && { hash: { algorithm: 'SCRYPT', key: hash.key, saltSeparator: hash.saltSeparator, rounds: hash.rounds, memoryCost: hash.memoryCost } },
      sha: { hash: { algorithm: 'SHA256', rounds: 1 } },
      none: undefined,
    };
    for (const kind of Object.keys(sets)) {
      for (const part of chunk(sets[kind], 1000)) {
        const res = await dst.auth.importUsers(part, options[kind]);
        imported += res.successCount; failed += res.failureCount;
        for (const e of res.errors) rep.note('FAILED to copy', { uid: part[e.index]?.uid, error: e.error?.message || String(e.error) });
        log(`    ${fmt(imported)} copied…`);
      }
    }
  }

  const planned = sets.scrypt.length + sets.sha.length + sets.none.length;
  log(`\n  Logins in old project : ${fmt(total)}`);
  log(`  ${commit ? 'Copied' : 'Would copy'}            : ${fmt(commit ? imported : planned)}${failed ? `   FAILED: ${fmt(failed)}` : ''}`);
  log(`  Password hash file    : ${hash ? `found (${path.basename(hashFile)}) — passwords are kept` : 'not found'}`);
  for (const k of Object.keys(rep.counts).sort()) log(`    ${fmt(rep.counts[k]).padStart(8)}  ${k}`);
  if (!hash && realHashes) {
    log(`\n  Tip: to let everyone keep their current password, save the old project's\n` +
        `  "Password hash parameters" into scripts/${path.basename(DEFAULT_HASH_FILE)} and run again.`);
  }
  if (hash && redacted) log(`\n  ✖ ${fmt(redacted)} password hash(es) were hidden — the old project's key is not allowed to read them.`);
  if (!commit) log('\n  Nothing was written. Add --commit to do it.');
  return { total, planned, imported, failed, counts: rep.counts, lists: rep.lists };
}

// ─────────────────────────────────────────────────────────────────────────────
// storage — photos and documents.
// After "data", the copied records still link to files in the OLD project's
// storage. They keep working while the old project exists. This command copies
// each linked file to the same path in the new project and rewrites the link.
// It works on the NEW project's records, so run it after "data --commit".
// ─────────────────────────────────────────────────────────────────────────────
export function parseStorageUrl(u, buckets) {
  if (typeof u !== 'string' || u.length < 12) return null;
  let bucket, objectPath, token = null, gs = false, m;
  try {
    if ((m = u.match(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/([^?#]+)(?:\?([^#]*))?/))) {
      bucket = m[1]; objectPath = decodeURIComponent(m[2]); token = new URLSearchParams(m[3] || '').get('token');
    } else if ((m = u.match(/^https:\/\/storage\.googleapis\.com\/([^/]+)\/([^?#]+)/))) {
      bucket = m[1]; objectPath = decodeURIComponent(m[2]);
    } else if ((m = u.match(/^https:\/\/([^/.]+(?:\.[^/.]+)*)\.storage\.googleapis\.com\/([^?#]+)/))) {
      bucket = m[1]; objectPath = decodeURIComponent(m[2]);
    } else if ((m = u.match(/^gs:\/\/([^/]+)\/(.+)$/))) {
      bucket = m[1]; objectPath = m[2]; gs = true;
    } else return null;
  } catch { return null; }
  if (!buckets.has(bucket) || !objectPath) return null;
  return { bucket, path: objectPath, token, gs };
}

async function copyFile(srcBucket, dstBucket, objectPath, token, overwrite) {
  const from = srcBucket.file(objectPath), to = dstBucket.file(objectPath);
  const [exists] = await to.exists();
  if (exists && !overwrite) {
    const [meta] = await to.getMetadata();
    let t = str(meta.metadata?.firebaseStorageDownloadTokens).split(',')[0];
    if (!t) { t = token || crypto.randomUUID(); await to.setMetadata({ metadata: { firebaseStorageDownloadTokens: t } }); }
    return { token: t, copied: false };
  }
  const [meta] = await from.getMetadata();
  const t = token || str(meta.metadata?.firebaseStorageDownloadTokens).split(',')[0] || crypto.randomUUID();
  await pipeline(from.createReadStream(), to.createWriteStream({
    resumable: false,
    metadata: {
      contentType: meta.contentType || 'application/octet-stream',
      ...(meta.cacheControl ? { cacheControl: meta.cacheControl } : {}),
      metadata: { firebaseStorageDownloadTokens: t },
    },
  }));
  return { token: t, copied: true };
}

export async function runStorage(ctx) {
  const { src, dst, F, args, commit, log } = ctx;
  const only = listArg(args.only);
  const skip = new Set([...SKIP_COLLECTIONS, ...listArg(args.skip)]);
  const buckets = new Set([src.bucketName, `${src.projectId}.appspot.com`, `${src.projectId}.firebasestorage.app`].filter(Boolean));
  const rep = new Report();

  log('\nLooking for links to old storage in the new project…');
  const files = new Map();               // object path → token found in a link
  const docs = [];                       // { path, fields: { topLevelKey: value } }
  for (const name of await listRoot(dst.db)) {
    if (skip.has(name) || (only.length && !only.includes(name))) continue;
    await streamCollection(dst.db, F, name, (page) => {
      for (const d of page) {
        const fields = {};
        for (const [key, value] of Object.entries(d.data())) {
          let hit = false;
          deepMap(value, (v) => {
            const p = parseStorageUrl(v, buckets);
            if (p) { hit = true; if (!files.get(p.path)) files.set(p.path, p.token); }
            return v;
          });
          if (hit) fields[key] = value;
        }
        if (Object.keys(fields).length) { docs.push({ path: d.ref.path, fields }); rep.bump(`${name}: records with old links`); }
      }
    });
  }
  log(`  ${fmt(docs.length)} record(s) link to ${fmt(files.size)} file(s) in old storage.`);
  for (const k of Object.keys(rep.counts).sort()) log(`    ${fmt(rep.counts[k]).padStart(8)}  ${k}`);
  if (!commit) {
    log('\n  Nothing was copied. Add --commit to copy the files and fix the links.');
    return { records: docs.length, files: files.size, counts: rep.counts };
  }

  const srcBucket = src.bucket(), dstBucket = dst.bucket();
  const newUrl = new Map();
  let copied = 0, present = 0, done = 0;
  const failures = [];
  const queue = [...files];
  const worker = async () => {
    for (;;) {
      const item = queue.pop();
      if (!item) return;
      const [objectPath, token] = item;
      try {
        const r = await copyFile(srcBucket, dstBucket, objectPath, token, !!args.overwrite);
        if (r.copied) copied += 1; else present += 1;
        newUrl.set(objectPath, r.token);
      } catch (e) {
        if (failures.length < 300) failures.push({ file: objectPath, error: e.code === 404 ? 'not found in old storage' : e.message });
      }
      if (++done % 200 === 0) log(`    ${fmt(done)} / ${fmt(files.size)} files…`);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));

  // Rewrite a link only when its file really is in the new storage.
  const rewrite = (v) => {
    const p = parseStorageUrl(v, buckets);
    if (!p || !newUrl.has(p.path)) return v;
    if (p.gs) return `gs://${dst.bucketName}/${p.path}`;
    return `https://firebasestorage.googleapis.com/v0/b/${dst.bucketName}/o/${encodeURIComponent(p.path)}?alt=media&token=${newUrl.get(p.path)}`;
  };
  const writer = dst.db.bulkWriter();
  writer.onWriteError((err) => RETRYABLE.has(err.code) && err.failedAttempts < 5);
  let fixed = 0, fixFailed = 0, sent = 0;
  for (const d of docs) {
    const pairs = [];
    for (const [key, value] of Object.entries(d.fields)) {
      const next = deepMap(value, rewrite);
      if (JSON.stringify(next) !== JSON.stringify(value)) pairs.push(new F.FieldPath(key), next);
    }
    if (!pairs.length) continue;
    writer.update(dst.db.doc(d.path), ...pairs).then(() => { fixed += 1; }, (e) => {
      fixFailed += 1;
      if (failures.length < 300) failures.push({ record: d.path, error: e.message });
    });
    if (++sent % 2000 === 0) await writer.flush();
  }
  await writer.close();

  log(`\n  Files copied          : ${fmt(copied)}`);
  log(`  Files already there   : ${fmt(present)}`);
  log(`  Records with new links: ${fmt(fixed)}`);
  if (failures.length || fixFailed) log(`  ✖ Problems            : ${fmt(failures.length)} — see the report file. Those links still point to old storage.`);
  return { records: docs.length, files: files.size, copied, present, fixed, failures };
}

// ─────────────────────────────────────────────────────────────────────────────
const COMMANDS = {
  inspect: { run: runInspect, writes: false, title: 'Inspect both projects' },
  data:    { run: runData,    writes: true,  title: 'Copy Firestore data' },
  auth:    { run: runAuth,    writes: true,  title: 'Copy logins' },
  storage: { run: runStorage, writes: true,  title: 'Copy photos/documents' },
  verify:  { run: runVerify,  writes: false, title: 'Verify' },
  recalc:  { run: runRecalc,  writes: true,  title: 'Rebuild totals from members' },
};

function usage() {
  console.log(`
  Move data from the old panel's Firebase project into this one.

    npm run migrate-old -- <command> [--commit] [options]

    inspect   look at both databases (read only)
    data      copy Firestore data, reshaped for this panel
    auth      copy logins (users, agents, members)
    storage   copy photos/documents and fix their links
    verify    compare old vs new and check totals (read only)
    recalc    rebuild agent / yojna / dashboard totals from the members

  Nothing is written without --commit. The old project is never written to.
  Options are listed at the top of scripts/migrate-old-data.mjs
`);
}

function saveReport(command, commit, result) {
  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = path.join(REPORT_DIR, `${stamp}-${command}${commit ? '' : '-dryrun'}.json`);
    fs.writeFileSync(file, JSON.stringify(result, (k, v) => (typeof v === 'bigint' ? String(v) : v), 2));
    return file;
  } catch (e) {
    console.warn(`  (could not save the report file: ${e.message})`);
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const name = args._[0];
  const command = COMMANDS[name];
  if (!command || args.help) { usage(); if (name && !command) fail(`Unknown command "${name}".`); return; }

  const conn = await connect(args);
  const commit = command.writes && !!args.commit;
  console.log('\n──────────────────────────────────────────────────────────');
  console.log(`  ${command.title}`);
  console.log(`  OLD project (read only) : ${conn.src.projectId}`);
  console.log(`  NEW project             : ${conn.dst.projectId}`);
  console.log(`  Mode                    : ${!command.writes ? 'read only' : commit ? 'WRITE (--commit)' : 'dry run (nothing is written)'}`);
  console.log('──────────────────────────────────────────────────────────');

  try {
    if (commit && !args.yes) {
      const typed = await ask(`\n  This writes into "${conn.dst.projectId}". Type the project id to continue: `);
      if (typed !== conn.dst.projectId) fail('Cancelled — nothing was written.');
    }
    const result = await command.run({ ...conn, args, commit, log: console.log });
    const file = saveReport(name, commit, { command: name, commit, oldProject: conn.src.projectId, newProject: conn.dst.projectId, at: new Date().toISOString(), result });
    if (file) console.log(`\n  Report: ${path.relative(ROOT, file)}\n`);
  } finally {
    await conn.close().catch(() => {});
  }
}

const isMain = !!process.argv[1] &&
  path.basename(process.argv[1]).toLowerCase() === path.basename(fileURLToPath(import.meta.url)).toLowerCase();
if (isMain) {
  main().then(() => process.exit(0)).catch((e) => {
    if (e instanceof StopError) console.error(`\n✖ ${e.message}\n`);
    else console.error('\n✖ Unexpected error:\n', e);
    process.exit(1);
  });
}
