import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';
import { findUserByEmail } from '@/lib/demo-db';
import { isDemo } from '@/lib/env';

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });

  if (isDemo()) {
    const user = findUserByEmail(String(email));
    if (!user || user.password !== password) {
      return NextResponse.json({ error: 'Invalid email or password. Try a demo workspace below.' }, { status: 401 });
    }
    const res = NextResponse.json({ ok: true, redirect: '/dashboard' });
    res.cookies.set(SESSION_COOKIE, user.id, {
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 12,
      secure: process.env.NODE_ENV === 'production',
    });
    return res;
  }

  const { createServerSupabase } = await import('@/lib/supabase-server');
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return NextResponse.json({ error: error.message }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').single();
  return NextResponse.json({ ok: true, redirect: profile?.role === 'platform_admin' ? '/admin/tenants' : '/dashboard' });
}
