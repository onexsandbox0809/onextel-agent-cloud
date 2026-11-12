import { NextResponse } from 'next/server';
import { META_ENDPOINTS } from '@/lib/meta';
import { isDemo } from '@/lib/env';

export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get('endpoints')) {
    return NextResponse.json({ endpoints: META_ENDPOINTS });
  }
  return NextResponse.json({
    ok: true, mode: isDemo() ? 'demo' : 'supabase', graph_version: process.env.META_GRAPH_VERSION || 'v25.0',
    time: new Date().toISOString(),
  });
}
