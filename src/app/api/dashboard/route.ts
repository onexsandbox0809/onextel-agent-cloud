import { NextResponse } from 'next/server';
import { db, scopedAgents } from '@/lib/demo-db';
import { getSession } from '@/lib/auth';
import { isDemo } from '@/lib/env';
import { sbAgents, sbAudit, sbConversations, sbNumbers } from '@/lib/supabase-repo';
import { trendData } from '@/lib/demo-db';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const scope = session.user.role === 'platform_admin' ? null : session.user.tenant_id;

  if (!isDemo()) {
    const [agents, numbers, convs, events] = await Promise.all([sbAgents(scope), sbNumbers(scope), sbConversations(scope), sbAudit(scope)]);
    const live = agents.filter((a) => a.status === 'live');
    const total = agents.reduce((s, a) => s + a.metrics.conversations, 0);
    return NextResponse.json({
      session,
      agents, numbers, conversations: convs, events,
      stats: {
        live_agents: live.length,
        numbers: numbers.length,
        conversations_30d: total,
        resolution_rate: live.length ? live.reduce((s, a) => s + a.metrics.resolution_rate, 0) / live.length : 0,
        handoff_rate: live.length ? live.reduce((s, a) => s + a.metrics.handoff_rate, 0) / live.length : 0,
        csat: live.length ? live.reduce((s, a) => s + a.metrics.csat, 0) / live.length : 0,
      },
      trend: trendData,
      spend: trendData.slice(-6).map((t) => ({ label: t.day, conversations: t.conversations, cost: Math.round(t.conversations * 0.42) })),
    });
  }

  const d = db();
  const agents = scopedAgents(scope);
  const numbers = scope ? d.numbers.filter((n) => n.tenant_id === scope) : d.numbers;
  const conversations = scope ? d.conversations.filter((c) => c.tenant_id === scope) : d.conversations;
  const events = scope ? d.audit.filter((a) => a.tenant_id === scope) : d.audit;
  const live = agents.filter((a) => a.status === 'live');
  const total = agents.reduce((s, a) => s + a.metrics.conversations, 0);

  return NextResponse.json({
    session, agents, numbers, conversations, events: events.slice(0, 8),
    stats: {
      live_agents: live.length,
      numbers: numbers.length,
      conversations_30d: total,
      resolution_rate: live.length ? live.reduce((s, a) => s + a.metrics.resolution_rate, 0) / live.length : 0,
      handoff_rate: live.length ? live.reduce((s, a) => s + a.metrics.handoff_rate, 0) / live.length : 0,
      csat: live.length ? live.reduce((s, a) => s + a.metrics.csat, 0) / live.length : 0,
    },
    trend: trendData,
    spend: trendData.slice(-6).map((t) => ({ label: t.day, conversations: t.conversations, cost: Math.round(t.conversations * 0.42) })),
  });
}
