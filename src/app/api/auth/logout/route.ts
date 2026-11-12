import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  try {
    const { createServerSupabase } = await import('@/lib/supabase-server');
    const supabase = await createServerSupabase();
    await supabase.auth.signOut();
  } catch {}
  return res;
}
