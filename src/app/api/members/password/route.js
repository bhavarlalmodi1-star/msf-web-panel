// /api/members/password
//
// GET  ?memberId=…   → reveal a member's app login password (superadmin only)
// POST { memberId, password? } → set a new one
//
// WHY THE AUTH ACCOUNT IS UPDATED TOO
// The member logs in through Firebase Auth. Writing a new password onto the
// member document alone would leave the displayed value and the working login
// disagreeing — the member would still get in with the OLD password while the
// panel confidently showed a new one. So the Auth user is updated FIRST, and
// the member document is only written once that succeeds. If Auth fails,
// nothing is written and the caller is told; a half-applied password change is
// worse than a failed one.
//
// Passwords are never written to the WhatsApp inbox or to the audit log — the
// audit records that a reset happened, by whom, not what the value was.

import { NextResponse } from 'next/server';
import admin from '../../db/firebaseAdmin';
import { checkRole, verifyToken } from '../../../../../middleware/authMiddleware';
import { generatePassword } from '../route';

export const runtime = 'nodejs';

const db   = admin.firestore();
const auth = admin.auth();

// Firebase Auth requires at least 6 characters.
const MIN_LEN = 6;

const randomPassword = () => {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';   // no l/o/0/1 — read aloud over the phone
  let out = '';
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
};

// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Only superadmin can view member passwords' }, { status: 403 });

    const memberId = new URL(req.url).searchParams.get('memberId');
    if (!memberId)
      return NextResponse.json({ success: false, message: 'memberId is required' }, { status: 400 });

    const snap = await db.collection('members').doc(memberId).get();
    if (!snap.exists)
      return NextResponse.json({ success: false, message: 'Member not found' }, { status: 404 });

    const m = snap.data();

    // Same fallback the Auth account was created with, so what is shown is what
    // actually works.
    const stored  = m.password || '';
    const derived = generatePassword(m.displayName, m.dobDate) || '';
    const password = stored || derived;

    // Does the member even have a login?
    let hasAuthAccount = false;
    try { await auth.getUser(memberId); hasAuthAccount = true; } catch { /* no account */ }

    console.log(`[MemberPassword] revealed for ${memberId} by ${authResult.user.uid}`);

    return NextResponse.json({
      success: true,
      data: {
        memberId,
        loginId: m.registrationNumber || '',
        password,
        source: stored ? 'stored' : (derived ? 'derived' : 'none'),
        hasAuthAccount,
        lastChangedAt: m.passwordChangedAt?.toDate?.()?.toISOString() || null,
      },
    });
  } catch (error) {
    console.error('member password GET error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Only superadmin can change member passwords' }, { status: 403 });

    const { memberId, password: raw } = await req.json().catch(() => ({}));
    if (!memberId)
      return NextResponse.json({ success: false, message: 'memberId is required' }, { status: 400 });

    const password = String(raw ?? '').trim() || randomPassword();
    if (password.length < MIN_LEN)
      return NextResponse.json({
        success: false,
        message: `Password must be at least ${MIN_LEN} characters (Firebase requirement)`,
      }, { status: 400 });

    const ref  = db.collection('members').doc(memberId);
    const snap = await ref.get();
    if (!snap.exists)
      return NextResponse.json({ success: false, message: 'Member not found' }, { status: 404 });

    const m = snap.data();

    // ── 1. Firebase Auth FIRST ──────────────────────────────────────────────
    // If this fails we write nothing, so the stored value never claims to be
    // something the member cannot log in with.
    let authUpdated = false;
    try {
      await auth.updateUser(memberId, { password });
      authUpdated = true;
    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        // No login yet — create one so the password is usable immediately.
        try {
          // Must match createMemberAccount() in api/members exactly — same
          // email shape, same claims — or the member could not sign in with it.
          await auth.createUser({
            uid: memberId,
            email: `${m.registrationNumber || memberId}@ssgmsss.com`,
            emailVerified: true,
            displayName: m.displayName || '',
            photoURL: m.photoURL || null,
            password,
          });
          await auth.setCustomUserClaims(memberId, {
            role: 'member',
            programId: m.programId || '',
          });
          await ref.update({ uid: memberId, account_flag: true });
          authUpdated = true;
        } catch (ce) {
          return NextResponse.json({
            success: false,
            message: `Could not create a login for this member: ${ce.message}`,
          }, { status: 500 });
        }
      } else {
        return NextResponse.json({
          success: false,
          message: `Firebase Auth rejected the new password: ${e.message}. Nothing was changed.`,
        }, { status: 500 });
      }
    }

    // ── 2. Member document, only now that the login works ───────────────────
    await ref.update({
      password,
      passwordChangedAt: admin.firestore.FieldValue.serverTimestamp(),
      passwordChangedBy: authResult.user.uid,
      updated_at:        admin.firestore.FieldValue.serverTimestamp(),
    });

    // ── 3. Audit — who and when, never the value ────────────────────────────
    try {
      await db.collection('memberPasswordChanges').add({
        memberId,
        memberName:         m.displayName || '',
        registrationNumber: m.registrationNumber || '',
        changedBy:          authResult.user.uid,
        changedByName:      authResult.user.name || authResult.user.email || '',
        wasGenerated:       !String(raw ?? '').trim(),
        createdAt:          admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.warn('[MemberPassword] audit write failed:', e.message);
    }

    console.log(`[MemberPassword] changed for ${memberId} by ${authResult.user.uid} (auth updated: ${authUpdated})`);

    return NextResponse.json({
      success: true,
      message: 'Password updated — the member can log in with it now',
      data: { memberId, loginId: m.registrationNumber || '', password, authUpdated },
    });
  } catch (error) {
    console.error('member password POST error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
