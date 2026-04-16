import { NextResponse } from 'next/server';

const MEDIA_KEY = process.env.MEDIA_KEY!;

// Returns the upload key so the client can upload directly to the media host.
// This keeps the secret server-side while avoiding Vercel's 4.5MB body size limit.
export async function GET() {
  if (!MEDIA_KEY) {
    return NextResponse.json({ error: 'MEDIA_KEY not configured' }, { status: 500 });
  }
  return NextResponse.json({ key: MEDIA_KEY });
}
