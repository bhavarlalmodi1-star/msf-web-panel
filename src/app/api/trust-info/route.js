// GET /api/trust-info
//
// Public, read-only trust details (name, address, contacts, logo links).
// The login page needs these before anyone is signed in, and Firestore rules
// only let signed-in users read settings/* — so this route serves them through
// the Admin SDK. Nothing here is secret: it is the same information printed on
// every receipt.
//
//   ?refresh=1  → skip the short server cache (called after saving the form)

import { NextResponse } from 'next/server';
import { readTrustDocServer } from '../db/trustServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const fresh = new URL(req.url).searchParams.get('refresh') === '1';
  const { ok, raw } = await readTrustDocServer({ fresh });
  // On a read failure report it, so the browser keeps the values it already
  // has instead of falling back to the built-in defaults.
  return NextResponse.json(
    { success: ok, trust: raw },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
