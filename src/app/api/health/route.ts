import { NextResponse } from 'next/server';
import { isDemo } from '@/lib/env';

export async function GET() {
  return NextResponse.json({
    ok: true, mode: isDemo() ? 'demo' : 'supabase', graph_version: process.env.META_GRAPH_VERSION || 'v25.0',
    time: new Date().toISOString(),
  });
}
