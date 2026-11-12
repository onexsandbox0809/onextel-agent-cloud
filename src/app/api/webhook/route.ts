import { NextResponse } from 'next/server';
import { db, newId, nowIso } from '@/lib/demo-db';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token === (process.env.META_VERIFY_TOKEN || 'change-me-webhook-verify-token')) {
    return new Response(challenge || '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

export async function POST(req: Request) {
  const payload = await req.json().catch(() => ({}));
  const entry = payload?.entry?.[0];
  const change = entry?.changes?.[0];
  const phoneId = change?.value?.metadata?.phone_number_id || entry?.id || '';
  const agent = db().agents.find((a) => a.entity_id === phoneId || a.phone_number_id === phoneId) || db().agents[0];
  db().webhooks.unshift({
    id: newId('wh'), tenant_id: agent?.tenant_id || 't_aix', agent_id: agent?.id || 'a_aix',
    type: change?.field || payload?.object || 'messages', status: 'processed', at: nowIso(), latency_ms: 120 + Math.floor(Math.random() * 240), payload,
  });
  return NextResponse.json({ received: true });
}
