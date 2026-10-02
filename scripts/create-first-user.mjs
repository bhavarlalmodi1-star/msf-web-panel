#!/usr/bin/env node
// Create the FIRST login (Super Admin) for this panel.
//
// A new Firebase project has no users, and the panel only lets a super admin
// create other users — so the very first one has to be made from outside.
// This script makes it in one go:
//   1. Firebase Authentication user (email + password)
//   2. role = superadmin on the login token
//   3. users/{uid} document in Firestore, in the same shape the panel writes
//
// HOW TO RUN (from the project folder):
//   npm run create-admin
//       → asks for name, email, phone and password
//   npm run create-admin -- --name "Lalit Kumar" --email you@example.com --password "Secret@123" --phone 9876543210
//       → no questions
//
// It uses the Firebase keys already in .env (FIREBASE_CLIENT_EMAIL,
// FIREBASE_PRIVATE_KEY, NEXT_PUBLIC_FIREBASE_PROJECT_ID), so make sure .env
// points at the project you want before running.
//
// If the email already exists, the script offers to turn that account into a
// super admin instead (and to set a new password if you gave one).

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── .env reader (no extra package needed) ────────────────────────────────────
function loadEnv() {
  for (const name of ['.env', '.env.local']) {
    const file = path.join(ROOT, name);
    if (!fs.existsSync(file)) continue;
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
      process.env[key] = value;      // .env.local wins over .env, like Next.js
    }
  }
}

// ── Command-line options:  --email a@b.com --name "X" … ─────────────────────
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

// ── Questions ────────────────────────────────────────────────────────────────
function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Do not echo the password while it is typed
      rl._writeToOutput = (text) => {
        if (text.includes(question)) rl.output.write(text);
        else if (text === '\r\n' || text === '\n') rl.output.write(text);
      };
    }
    rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer.trim()); });
  });
}

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const fail = (msg) => { console.error(`\n✖ ${msg}\n`); process.exit(1); };

// Everything switched on — a super admin is never restricted by these, but the
// panel expects the object to exist.
const FULL_PERMISSIONS = {
  pages: ['/'],
  actions: {
    create: true, edit: true, delete: true, view: true, download: true,
    request: true, approve: true, add_agent: true, add_member: true,
  },
  moduleAccess: {
    dashboard: true, programs: true, agents: true, members: true, requests: true,
    payments: true, master: true, expenses: true, rulePolicy: true, settings: true,
    activity: true, trash: true,
  },
  pagePermissions: {},
};

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    fail('Firebase keys are missing in .env — need NEXT_PUBLIC_FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.');
  }

  const { default: admin } = await import('firebase-admin');
  admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) });

  console.log('\n──────────────────────────────────────────────');
  console.log('  Create first user (Super Admin)');
  console.log(`  Firebase project : ${projectId}`);
  console.log('──────────────────────────────────────────────');

  if (args['dry-run']) {
    console.log('\n✔ .env keys read and Firebase initialised. Dry run — nothing was created.\n');
    return;
  }

  // ── Collect details ────────────────────────────────────────────────────────
  const interactive = !(args.email && args.password && args.name);
  const name = args.name || await ask('Full name        : ');
  const email = String(args.email || await ask('Email (login ID) : ')).toLowerCase();
  const phone = args.phone !== undefined ? String(args.phone) : await ask('Mobile (optional): ');
  let password = args.password ? String(args.password) : await ask('Password (min 6) : ', { hidden: true });
  if (!args.password) {
    const again = await ask('Password again   : ', { hidden: true });
    if (again !== password) fail('The two passwords do not match.');
  }

  if (!name) fail('Name is required.');
  if (!isEmail(email)) fail(`"${email}" is not a valid email address.`);
  if (password.length < 6) fail('Password must be at least 6 characters.');

  const auth = admin.auth();
  const db = admin.firestore();

  // ── Existing account? ──────────────────────────────────────────────────────
  let existing = null;
  try { existing = await auth.getUserByEmail(email); }
  catch (e) { if (e.code !== 'auth/user-not-found') throw e; }

  let uid;
  if (existing) {
    console.log(`\n! ${email} already has a login in this project.`);
    if (interactive && !args.yes) {
      const ok = (await ask('  Make this account a Super Admin and set this password? (yes/no): ')).toLowerCase();
      if (!['y', 'yes'].includes(ok)) { console.log('\nNothing changed.\n'); return; }
    }
    uid = existing.uid;
    await auth.updateUser(uid, { password, displayName: name, disabled: false, emailVerified: true });
  } else {
    if (interactive && !args.yes) {
      const ok = (await ask(`\nCreate Super Admin "${name}" <${email}> in project "${projectId}"? (yes/no): `)).toLowerCase();
      if (!['y', 'yes'].includes(ok)) { console.log('\nNothing created.\n'); return; }
    }
    const created = await auth.createUser({ email, password, displayName: name, emailVerified: true, disabled: false });
    uid = created.uid;
  }

  // Role on the login token (Firestore rules and the API routes read this)
  await auth.setCustomUserClaims(uid, { role: 'superadmin', createdBy: 'create-first-user-script' });

  // Profile document — same fields the panel writes for users it creates
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  const now = admin.firestore.FieldValue.serverTimestamp();
  await ref.set({
    uid,
    name,
    email,
    phone: phone || '',
    role: 'superadmin',
    photoURL: snap.exists ? (snap.data().photoURL || '') : '',
    status: 'active',
    permissions: FULL_PERMISSIONS,
    active_flag: true,
    delete_flag: false,
    updatedAt: now,
    lastPasswordReset: new Date().toISOString(),
    ...(snap.exists ? {} : { createdAt: now, lastLogin: null, createdBy: 'create-first-user-script' }),
  }, { merge: true });

  console.log('\n✔ Super Admin is ready');
  console.log(`  Name   : ${name}`);
  console.log(`  Email  : ${email}`);
  console.log(`  UID    : ${uid}`);
  console.log('\n  Now run "npm run dev" and sign in at /auth/login with this email and password.');
  console.log('  The login page sends a one-time code by e-mail, so EMAIL_USER and EMAIL_PASS must be set in .env.\n');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    const hints = {
      'auth/email-already-exists': 'This email already has a login.',
      'auth/invalid-password': 'Password must be at least 6 characters.',
      'auth/invalid-email': 'The email address is not valid.',
      'auth/configuration-not-found': 'Email/Password sign-in is not enabled. Firebase Console → Authentication → Sign-in method → enable "Email/Password".',
      'auth/insufficient-permission': 'The service account in .env is not allowed to manage users in this project.',
      'app/invalid-credential': 'FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY in .env are not valid for this project.',
    };
    console.error(`\n✖ Failed: ${hints[err?.code] || err?.message || err}`);
    if (err?.code) console.error(`  (${err.code})`);
    console.error('');
    process.exit(1);
  });
