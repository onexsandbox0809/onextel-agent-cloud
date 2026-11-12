import { NextResponse } from 'next/server';
import { resolveEntity } from '@/lib/entity';
import { getSession } from '@/lib/auth';
import { canWrite, scopeOf, forbidden } from '@/lib/session-util';
import { blendAgent, db, newId, nowIso, recordAudit, scopedAgents } from '@/lib/demo-db';
import { isDemo } from '@/lib/env';
import { sbAgents, sbInsertAgent } from '@/lib/supabase-repo';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const scope = scopeOf(session);
  const agents = isDemo() ? scopedAgents(scope) : await sbAgents(scope);
  const resolved = await Promise.all(agents.map(async (a) => {
    const r = await resolveEntity(a);
    return { ...a, entity_id: r.bound ? r.entityId : '', bound_number: r.bound ? { id: r.bound.id, display: r.bound.display } : null };
  }));
  return NextResponse.json({ agents: resolved });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canWrite(session)) return forbidden();
  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: 'Agent name is required.' }, { status: 400 });

  const tenant_id = session.user.role === 'platform_admin' ? body.tenant_id : session.user.tenant_id;
  if (!tenant_id) return NextResponse.json({ error: 'Select a tenant for this agent.' }, { status: 400 });

  if (isDemo()) {
    const d = db();
    const number = d.numbers.find((n) => n.id === body.phone_number_id);
    const agent = blendAgent({ ...body, tenant_id, phone_number_id: body.phone_number_id || null });
    if (number) { number.agent_id = agent.id; agent.entity_id = number.wa_phone_number_id; }
    d.agents.unshift(agent);
    recordAudit(tenant_id, session.user.email, 'agent.create', agent.name, 'info');
    return NextResponse.json({ agent }, { status: 201 });
  }

  const agent = blendAgent({ ...body, tenant_id });
  agent.id = newId('a');
  await sbInsertAgent(agent);
  return NextResponse.json({ agent }, { status: 201 });
}
