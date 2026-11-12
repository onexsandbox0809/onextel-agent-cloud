import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';
import { findUserByEmail } from '@/lib/demo-db';
import { isDemo } from '@/lib/env';
import { publicUrl } from '@/lib/base-url';

/**
 * Demo-only deep link: /api/auth/demo?u=admin@onextel.io&next=/agents
 * Sets the demo session cookie and redirects. Returns 404 unless demo mode is
 * active, so it can never grant access to a Supabase-backed deployment.
 */
export async function GET(req: Request) {
  if (!isDemo()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { searchParams } = new URL(req.url);
  const email = searchParams.get('u') || 'admin@onextel.io';
  const next = searchParams.get('next') || '/dashboard';
  const user = findUserByEmail(email);
  if (!user) return NextResponse.json({ error: 'Unknown demo user' }, { status: 404 });
  const res = NextResponse.redirect(publicUrl(req, next));
  res.cookies.set(SESSION_COOKIE, user.id, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 12,
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
