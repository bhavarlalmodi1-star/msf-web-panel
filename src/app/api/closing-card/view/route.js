import { NextResponse } from "next/server";
import admin from "../../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../../middleware/authMiddleware";

const db = admin.firestore();

export async function GET(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success)
      return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });

    const url = new URL(req.url);

    // ── Mode 1: caller supplies the Firebase Storage URL directly ───────
    const directFileUrl = url.searchParams.get('fileUrl');
    if (directFileUrl) {
      return await proxyStorageUrl(directFileUrl);
    }

    // ── Mode 2: look up URL from Firestore by memberId ──────────────────
    const memberId = url.searchParams.get('memberId');
    if (!memberId)
      return NextResponse.json({ success: false, message: 'memberId or fileUrl required' }, { status: 400 });

    const closingGroupId = url.searchParams.get('closingGroupId') || '';

    const memberSnap = await db.collection('members').doc(memberId).get();
    if (!memberSnap.exists)
      return NextResponse.json({ success: false, message: 'Member not found' }, { status: 404 });

    let fileUrl = memberSnap.data().closed_invitation_url;

    if (!fileUrl && closingGroupId) {
      try {
        const cpSnap = await db.collection('closing_payment').doc(`${memberId}_${closingGroupId}`).get();
        if (cpSnap.exists) fileUrl = cpSnap.data().closed_invitation_url || null;
      } catch (_) {}
    }

    if (!fileUrl) {
      try {
        const q = await db.collection('closing_payment')
          .where('memberId', '==', memberId)
          .where('closed_invitation_url', '!=', '')
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();
        if (!q.empty) fileUrl = q.docs[0].data().closed_invitation_url || null;
      } catch (_) {}
    }

    if (!fileUrl)
      return NextResponse.json({ success: false, message: 'No invitation card found' }, { status: 404 });

    return await proxyStorageUrl(fileUrl);

  } catch (error) {
    console.error("View card error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// ── Shared proxy: fetch file via Admin SDK and stream back ─────────────────
async function proxyStorageUrl(fileUrl) {
  try {
    const path = extractStoragePath(fileUrl);
    if (path) {
      // Admin SDK always has access regardless of Storage security rules
      const bucket = admin.storage().bucket();
      const [buffer] = await bucket.file(path).download();
      const contentType = getContentType(path);
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': 'inline',
          'Cache-Control': 'private, max-age=300',
        },
      });
    }
  } catch (adminErr) {
    console.error('Admin SDK download failed:', adminErr);
    // Last resort: try direct fetch (works if Storage URL has a valid token)
    try {
      const response = await fetch(fileUrl);
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        return new NextResponse(buffer, {
          status: 200,
          headers: { 'Content-Type': contentType, 'Content-Disposition': 'inline' },
        });
      }
    } catch (_) {}
  }
  return NextResponse.json({ success: false, message: 'Failed to fetch card' }, { status: 502 });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function extractStoragePath(fileUrl) {
  // Firebase download URL format:
  // https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encoded-path}?alt=media&token={token}
  try {
    const u = new URL(fileUrl);
    const pathMatch = u.pathname.match(/\/o\/(.+)/);
    if (pathMatch) return decodeURIComponent(pathMatch[1]);
  } catch {}
  return null;
}

function getContentType(path) {
  const ext = path.split('.').pop().toLowerCase();
  const map = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf' };
  return map[ext] || 'application/octet-stream';
}
