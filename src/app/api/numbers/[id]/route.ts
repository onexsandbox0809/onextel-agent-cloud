import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { canWrite, forbidden } from '@/lib/session-util';
import { db, nowIso, recordAudit } from '@/lib/demo-db';
import { isDemo } from '@/lib/env';
import { meta } from '@/lib/meta';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canWrite(session)) return forbidden();
  const { id } = await ctx.params;
  const body = await req.json();
  const number = db().numbers.find((n) => n.id === id);
  if (!number) return NextResponse.json({ error: 'Number not found' }, { status: 404 });
  if (session.user.role !== 'platform_admin' && number.tenant_id !== session.user.tenant_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (body.action === 'register') {
    const pin = body.pin || '123456';
    const token = process.env.META_SYSTEM_USER_TOKEN;
    const reg = token ? await meta.registerNumber(number.wa_phone_number_id, pin, token) : null;
    const onboard = token && reg?.ok ? await meta.onboarding(number.wa_phone_number_id, token) : null;
    number.status = 'active';
    number.registered_at = nowIso();
    number.two_step_pin_set = true;
    if (isDemo()) recordAudit(number.tenant_id, session.user.email, 'number.register', `${number.display}`, 'critical');
    return NextResponse.json({ number, remote: { register: reg, onboarding: onboard }, mode: token ? 'graph' : 'simulated' });
  }
  Object.assign(number, body);
  return NextResponse.json({ number });
}
