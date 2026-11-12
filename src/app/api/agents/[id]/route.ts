import { NextResponse } from 'next/server';
import { syncEntityId } from '@/lib/entity';
import { getSession } from '@/lib/auth';
import { canWrite, forbidden } from '@/lib/session-util';
import { getAgent, recordAudit } from '@/lib/demo-db';
import { isDemo } from '@/lib/env';
import { sbAgent, sbUpdateAgent } from '@/lib/supabase-repo';
import { meta } from '@/lib/meta';

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const agent = isDemo() ? getAgent(id) : await sbAgent(id);
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  if (session.user.role !== 'platform_admin' && agent.tenant_id !== session.user.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json({ agent, tenant: session.tenants.find((t) => t.id === agent.tenant_id) || null });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canWrite(session)) return forbidden();
  const { id } = await ctx.params;
  const patch = await req.json();
  const agent = isDemo() ? getAgent(id) : await sbAgent(id);
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  if (session.user.role !== 'platform_admin' && agent.tenant_id !== session.user.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let remote: unknown = null;
  const entityId = await syncEntityId(agent);
  if (patch.business_info && entityId && process.env.META_SYSTEM_USER_TOKEN) {
    remote = await meta.putBusinessInfo(entityId, patch.business_info);
  }
  if (patch.settings && entityId && agent.meta_agent_id && process.env.META_SYSTEM_USER_TOKEN) {
    remote = await meta.putSettings(entityId, agent.meta_agent_id, patch.settings);
  }

  if (isDemo()) {
    Object.assign(agent, patch);
    recordAudit(agent.tenant_id, session.user.email, 'agent.update', `${agent.name}: ${Object.keys(patch).join(', ')}`);
    return NextResponse.json({ agent, remote });
  }
  await sbUpdateAgent(id, patch);
  return NextResponse.json({ agent: { ...agent, ...patch }, remote });
}
