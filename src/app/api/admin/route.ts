import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/demo-db';
import { isDemo } from '@/lib/env';
import { sbAgents, sbAudit, sbConversations, sbNumbers, sbTenants } from '@/lib/supabase-repo';

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
