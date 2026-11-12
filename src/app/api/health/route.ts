import { NextResponse } from 'next/server';
import { META_ENDPOINTS } from '@/lib/meta';
import { createClient } from '@supabase/supabase-js';
import { isDemo } from '@/lib/env';

export async function GET(req: Request) {
  const q = new URL(req.url);
  if (q.searchParams.get('diag')) {
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      META_SYSTEM_USER_TOKEN: !!process.env.META_SYSTEM_USER_TOKEN,
      META_VERIFY_TOKEN: !!process.env.META_VERIFY_TOKEN,
      DEMO_MODE: process.env.DEMO_MODE || '(unset)',
    };
    const checks: any[] = [];
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
      const t = await sb.from('tenants').select('id').limit(1);
      checks.push({ check: 'table tenants', ok: !t.error, error: t.error?.message || null });
      const c = await sb.from('phone_numbers').select('id').limit(1);
      checks.push({ check: 'table phone_numbers', ok: !c.error, error: c.error?.message || null });
      const m = await sb.from('phone_numbers').select('id, meta_agent_id').limit(1);
      checks.push({ check: 'column phone_numbers.meta_agent_id', ok: !m.error, error: m.error?.message || null });
      const n = await sb.from('phone_numbers').select('id, display, wa_phone_number_id, waba_id, status').order('created_at');
      checks.push({ check: 'read numbers', ok: !n.error, error: n.error?.message || null, rows: n.data || [] });
    }
    return NextResponse.json({ env, checks });
  }
  if (new URL(req.url).searchParams.get('endpoints')) {
    return NextResponse.json({ endpoints: META_ENDPOINTS });
  }
  return NextResponse.json({
    ok: true, mode: isDemo() ? 'demo' : 'supabase', graph_version: process.env.META_GRAPH_VERSION || 'v25.0',
    time: new Date().toISOString(),
  });
}
