import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';
import { db, findUserByEmail, newId, nowIso, recordAudit } from '@/lib/demo-db';
import { isDemo } from '@/lib/env';
import { sbCreateTenant } from '@/lib/supabase-repo';

const RESERVED = new Set(['admin', 'api', 'login', 'signup', 'dashboard', 'agents', 'numbers', 'inbox', 'analytics', 'team', 'settings', 'audit', 'new', 'app', 'static']);

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

/** Public self-service workspace registration: tenant + first tenant_admin, then signed in. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const company = String(body.company || '').trim();
  const person = String(body.person || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (company.length < 2) return NextResponse.json({ error: 'Company name must be at least 2 characters.' }, { status: 400 });
  if (person.length < 2) return NextResponse.json({ error: 'Your name must be at least 2 characters.' }, { status: 400 });
  if (!isEmail(email)) return NextResponse.json({ error: 'Enter a valid work email.' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });

  const slug = slugify(body.slug || company);
  if (!slug) return NextResponse.json({ error: 'Could not derive a slug — use letters and numbers.' }, { status: 400 });
  if (RESERVED.has(slug)) return NextResponse.json({ error: `"${slug}" is reserved. Choose a different company name.` }, { status: 400 });

  if (isDemo() && findUserByEmail(email)) {
    return NextResponse.json({ error: 'An account with that email already exists. Sign in instead.' }, { status: 409 });
  }

  const tenant = {
    id: isDemo() ? newId('t') : slug,
    name: company,
    slug,
    plan: 'growth' as const,
    status: 'trial' as const,
    region: String(body.region || 'IN').toUpperCase().slice(0, 2),
    meta_business_id: String(body.meta_business_id || '').trim(),
    billing_email: email,
    seats: 5,
    accent: '#C9F45B',
    created_at: nowIso(),
  };

  if (isDemo()) {
    if (db().tenants.some((t) => t.slug === slug)) {
      return NextResponse.json({ error: `"${slug}" is taken. Try a slightly different company name.` }, { status: 409 });
    }
    const user = {
      id: newId('u'), tenant_id: tenant.id, name: person, email,
      role: 'tenant_admin' as const, status: 'active' as const,
      last_active: nowIso(), avatar_hue: Math.floor(Math.random() * 360), password,
    };
    db().tenants.push(tenant);
    db().users.push(user);
    recordAudit(tenant.id, email, 'tenant.self_signup', company, 'critical');

    const res = NextResponse.json({ tenant, redirect: '/dashboard' }, { status: 201 });
    res.cookies.set(SESSION_COOKIE, user.id, {
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 12,
      secure: process.env.NODE_ENV === 'production',
    });
    return res;
  }

  try {
    await sbCreateTenant(tenant);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not create workspace';
    return NextResponse.json({ error: /duplicate|unique/i.test(msg) ? `"${slug}" is already taken.` : msg }, { status: 409 });
  }

  const { serviceSupabase, createServerSupabase } = await import('@/lib/supabase-server');
  const admin = serviceSupabase();
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { name: person, role: 'tenant_admin', tenant_id: tenant.id },
  });

  if (error || !created?.user) {
    await admin.from('tenants').delete().eq('id', tenant.id);
    return NextResponse.json({ error: error?.message || 'Could not create your account.' }, { status: 400 });
  }

  await admin.from('profiles').upsert(
    { id: created.user.id, email, name: person, role: 'tenant_admin', tenant_id: tenant.id, status: 'active' },
    { onConflict: 'id' },
  );

  const supabase = await createServerSupabase();
  await supabase.auth.signInWithPassword({ email, password });

  return NextResponse.json({ tenant, redirect: '/dashboard' }, { status: 201 });
}
