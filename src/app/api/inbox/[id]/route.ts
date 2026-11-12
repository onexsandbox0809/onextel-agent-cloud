import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { canWrite, forbidden } from '@/lib/session-util';
import { db, newId, nowIso, recordAudit } from '@/lib/demo-db';
import { meta } from '@/lib/meta';
import type { Agent } from '@/lib/types';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canWrite(session)) return forbidden();
  const { id } = await ctx.params;
  const body = await req.json();
  const conv = db().conversations.find((c) => c.id === id);
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  const agent = db().agents.find((a) => a.id === conv.agent_id);

  if (body.action === 'reply') {
    conv.messages.push({ id: newId('m'), role: 'human', text: body.text, at: nowIso() });
  } else if (body.action === 'release' || body.action === 'takeover') {
    const token = process.env.META_SYSTEM_USER_TOKEN;
    const remote = token && agent ? await meta.threadControl(agent.entity_id, body.action, conv.handle.replace(/\D/g, ''), token) : null;
    conv.status = body.action === 'takeover' ? 'handoff' : 'resolved';
    conv.messages.push({ id: newId('m'), role: 'system', text: body.action === 'takeover' ? 'Human agent took over the thread.' : 'Thread released back to the agent.', at: nowIso() });
    recordAudit(conv.tenant_id, session.user.email, `thread.${body.action}`, conv.customer);
    return NextResponse.json({ conversation: conv, remote, mode: token ? 'graph' : 'simulated' });
  } else if (body.action === 'resolve') {
    conv.status = 'resolved';
  }
  conv.updated_at = nowIso();
  conv.unread = 0;
  return NextResponse.json({ conversation: conv });
}
