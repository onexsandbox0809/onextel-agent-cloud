import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db, findUserByEmail, newId, nowIso, recordAudit } from '@/lib/demo-db';
import { isDemo } from '@/lib/env';
import { sbAgents, sbAudit, sbConversations, sbNumbers, sbTenants, sbCreateTenant, sbAuditWrite } from '@/lib/supabase-repo';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'platform_admin') return NextResponse.json({ error: 'Platform admin only' }, { status: 403 });

  if (!isDemo()) {
    const [tenants, agents, numbers, conversations, events] = await Promise.all([
      sbTenants(), sbAgents(null), sbNumbers(null), sbConversations(null), sbAudit(null, 40),
    ]);
    const enriched = tenants.map((t) => {
      const ta = agents.filter((a) => a.tenant_id === t.id);
      return {
        ...t, agents: ta.length, numbers: numbers.filter((n) => n.tenant_id === t.id).length,
        conversations: ta.reduce((s, a) => s + a.metrics.conversations, 0),
        mrr: t.plan === 'enterprise' ? 148000 : t.plan === 'scale' ? 72000 : 28000,
        health: ta.length ? Math.round(ta.reduce((s, a) => s + a.health, 0) / ta.length) : 0,
      };
    });
    return NextResponse.json({
      tenants: enriched, agents: agents.map((a) => ({ ...a, tenant_name: tenants.find((t) => t.id === a.tenant_id)?.name || '—' })),
      events,
      totals: {
        tenants: tenants.length, agents: agents.length, numbers: numbers.length,
        conversations: agents.reduce((s, a) => s + a.metrics.conversations, 0),
        mrr: enriched.reduce((s, t) => s + t.mrr, 0),
      },
    });
  }

  const d = db();
  const enriched = d.tenants.map((t) => {
    const ta = d.agents.filter((a) => a.tenant_id === t.id);
    return {
      ...t,
      agents: ta.length,
      numbers: d.numbers.filter((n) => n.tenant_id === t.id).length,
      conversations: ta.reduce((s, a) => s + a.metrics.conversations, 0),
      mrr: t.plan === 'enterprise' ? 148000 : t.plan === 'scale' ? 72000 : 28000,
      health: ta.length ? Math.round(ta.reduce((s, a) => s + a.health, 0) / ta.length) : 0,
    };
  });
  return NextResponse.json({
    tenants: enriched,
    agents: d.agents.map((a) => ({ ...a, tenant_name: d.tenants.find((t) => t.id === a.tenant_id)?.name || '—' })),
    events: d.audit,
    totals: {
      tenants: d.tenants.length, agents: d.agents.length, numbers: d.numbers.length,
      conversations: d.agents.reduce((s, a) => s + a.metrics.conversations, 0),
      mrr: enriched.reduce((s, t) => s + t.mrr, 0),
    },
  });
}

const RESERVED = new Set(['admin', 'api', 'login', 'dashboard', 'agents', 'numbers', 'inbox', 'analytics', 'team', 'settings', 'audit', 'new', 'app', 'static']);

function slugify(input: string) {
  return input.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'platform_admin') {
    return NextResponse.json({ error: 'Only platform admins can create tenants.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  if (name.length < 2) return NextResponse.json({ error: 'Tenant name must be at least 2 characters.' }, { status: 400 });

  const slug = slugify(body.slug || name);
  if (!slug) return NextResponse.json({ error: 'Could not derive a slug — use letters and numbers.' }, { status: 400 });
  if (RESERVED.has(slug)) return NextResponse.json({ error: `"${slug}" is a reserved path. Choose another slug.` }, { status: 400 });

  const plan = ['growth', 'scale', 'enterprise'].includes(body.plan) ? body.plan : 'growth';
  const region = String(body.region || 'IN').toUpperCase().slice(0, 2);
  const seats = Math.max(1, Math.min(500, Number(body.seats) || 5));
  const accent = /^#[0-9A-Fa-f]{6}$/.test(body.accent) ? body.accent : '#C9F45B';
  const billing_email = String(body.billing_email || '').trim();
  const meta_business_id = String(body.meta_business_id || '').trim();

  const adminEmail = String(body.admin_email || '').trim().toLowerCase();
  const adminPassword = String(body.admin_password || '');
  const adminName = String(body.admin_name || '').trim() || (adminEmail ? adminEmail.split('@')[0] : '');

  if (!adminEmail) return NextResponse.json({ error: 'A tenant admin email is required so they can sign in.' }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(adminEmail)) return NextResponse.json({ error: 'Enter a valid admin email address.' }, { status: 400 });
  if (adminPassword.length < 8) return NextResponse.json({ error: 'Admin password must be at least 8 characters.' }, { status: 400 });

  // uniqueness checks before any write
  const existing = isDemo()
    ? db().tenants.some((t) => t.slug === slug)
    : (await sbTenants()).some((t) => t.slug === slug);
  if (existing) return NextResponse.json({ error: `Slug "${slug}" is already in use.` }, { status: 409 });

  if (isDemo() && findUserByEmail(adminEmail)) {
    return NextResponse.json({ error: `A user with ${adminEmail} already exists.` }, { status: 409 });
  }

  const tenant = {
    id: isDemo() ? newId('t') : slug,
    name, slug,
    plan: plan as 'growth' | 'scale' | 'enterprise',
    status: (body.status === 'trial' ? 'trial' : 'active') as 'active' | 'trial' | 'suspended',
    region, meta_business_id, billing_email, seats, accent,
    created_at: nowIso(),
  };

  let adminUser: { id: string; email: string; role: string } | null = null;

  try {
    if (isDemo()) {
      db().tenants.push(tenant);
      adminUser = {
        id: newId('u'),
        email: adminEmail,
        role: 'tenant_admin',
      };
      db().users.push({
        id: adminUser.id, tenant_id: tenant.id, name: adminName, email: adminEmail,
        role: 'tenant_admin', status: 'active', last_active: nowIso(),
        avatar_hue: Math.floor(Math.random() * 360), password: adminPassword,
      });
      recordAudit(tenant.id, session.user.email, 'tenant.create', `${name} + admin ${adminEmail}`, 'critical');
    } else {
      await sbCreateTenant(tenant);
      const { serviceSupabase } = await import('@/lib/supabase-server');
      const sb = serviceSupabase();
      const { data: created, error } = await sb.auth.admin.createUser({
        email: adminEmail, password: adminPassword, email_confirm: true,
        user_metadata: { name: adminName, role: 'tenant_admin', tenant_id: tenant.id },
      });
      if (error || !created?.user) {
        await sb.from('tenants').delete().eq('id', tenant.id);
        return NextResponse.json({ error: error?.message || 'Could not create the tenant admin account.' }, { status: 400 });
      }
      await sb.from('profiles').upsert(
        { id: created.user.id, email: adminEmail, name: adminName, role: 'tenant_admin', tenant_id: tenant.id, status: 'active' },
        { onConflict: 'id' },
      );
      adminUser = { id: created.user.id, email: adminEmail, role: 'tenant_admin' };
      await sbAuditWrite({
        tenant_id: tenant.id, actor: session.user.email, action: 'tenant.create',
        target: `${name} + admin ${adminEmail}`, severity: 'critical', ip: 'platform',
      });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to create tenant.' }, { status: 500 });
  }

  return NextResponse.json({ tenant, admin: adminUser }, { status: 201 });
}
