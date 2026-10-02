// GET /api/trust-image?p=settings/trust/<file>
//
// Serves an uploaded trust image (logo, right-side image, certificate frame)
// from the same origin as the panel. PDFs are generated in the browser and have
// to fetch() their images — going through this route means that works without
// configuring CORS on the Storage bucket.
//
// Only files inside settings/trust/ can be requested, and those are already
// publicly readable under storage.rules. Every upload gets a new file name, so
// responses are safe to cache forever.

import { NextResponse } from 'next/server';
import { getTrustImageServer } from '../db/trustServer';
import { isTrustStoragePath } from '@/utils/trust/trustStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const path = new URL(req.url).searchParams.get('p') || '';
  if (!isTrustStoragePath(path)) {
    return NextResponse.json({ success: false, message: 'Invalid image path' }, { status: 400 });
  }

  const image = await getTrustImageServer(path);
  if (!image) {
    return NextResponse.json({ success: false, message: 'Image not found' }, { status: 404 });
  }

  return new NextResponse(image.buffer, {
    status: 200,
    headers: {
      'Content-Type': image.contentType,
      'Content-Length': String(image.buffer.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
