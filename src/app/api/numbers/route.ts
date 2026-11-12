import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { canWrite, forbidden, scopeOf } from '@/lib/session-util';
import { db, newId, recordAudit } from '@/lib/demo-db';
import { isDemo } from '@/lib/env';
import { sbInsertNumber, sbNumbers } from '@/lib/supabase-repo';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const scope = scopeOf(session);
  const numbers = isDemo() ? (scope ? db().numbers.filter((n) => n.tenant_id === scope) : db().numbers) : await sbNumbers(scope);
  return NextResponse.json({ numbers });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canWrite(session)) return forbidden();
  const body = await req.json();
  if (!body.display || !String(body.display).trim()) {
    return NextResponse.json({ error: 'Display number is required.' }, { status: 400 });
  }
  const tenant_id = session.user.role === 'platform_admin' ? body.tenant_id : session.user.tenant_id;
  if (!tenant_id) {
    return NextResponse.json({
      error: session.user.role === 'platform_admin'
        ? 'Select which tenant owns this number.'
        : 'Your account is not linked to a tenant. Ask a platform admin to assign you one.',
    }, { status: 400 });
  }

  const number = {
    id: newId('pn'), tenant_id, agent_id: null, display: body.display,
    wa_phone_number_id: body.wa_phone_number_id || String(Math.floor(1e14 + Math.random() * 8e14)),
    waba_id: body.waba_id || String(Math.floor(1e14 + Math.random() * 8e14)),
    provider: 'onextel' as const, provider_ref: `ONX-WA-${Math.floor(10000 + Math.random() * 89999)}`,
    status: 'pending_registration' as const, quality: 'green' as const, messaging_limit: '1K / 24h',
    country: body.country || 'IN', category: body.category || 'OTHER', registered_at: null, two_step_pin_set: false,
  };
  try {
    if (isDemo()) {
      db().numbers.push(number);
      recordAudit(tenant_id, session.user.email, 'number.provision', number.display);
    } else {
      await sbInsertNumber(number);
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not save the number.' }, { status: 500 });
  }
  return NextResponse.json({ number }, { status: 201 });
}
