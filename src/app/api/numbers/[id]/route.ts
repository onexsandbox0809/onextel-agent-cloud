import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { canWrite, forbidden } from '@/lib/session-util';
import { db, nowIso, recordAudit } from '@/lib/demo-db';
import { isDemo } from '@/lib/env';
import { meta } from '@/lib/meta';
import { sbUpdateNumber } from '@/lib/supabase-repo';

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
    const pin = String(body.pin || '').trim();
    if (!/^\d{6}$/.test(pin)) {
      return NextResponse.json({ error: 'Enter the 6-digit two-step PIN Meta will use for this number.' }, { status: 400 });
    }
    const token = process.env.META_SYSTEM_USER_TOKEN;

    // No token → simulated, so the whole flow stays demoable.
    if (!token) {
      number.status = 'active';
      number.registered_at = nowIso();
      number.two_step_pin_set = true;
      number.meta_agent_id = number.meta_agent_id || `sim_${Math.random().toString(36).slice(2, 12)}`;
      if (!isDemo()) await sbUpdateNumber(number);
      return NextResponse.json({
        number,
        agent_id: number.meta_agent_id,
        mode: 'simulated',
        steps: [{ step: 'register', ok: true, note: 'Simulated — add META_SYSTEM_USER_TOKEN to call Meta.' }],
      });
    }

    const reg = await meta.registerNumber(number.wa_phone_number_id, pin, token);
    const steps: any[] = [{ step: 'register', ok: reg.ok, status: reg.status, error: reg.error || null, data: reg.data ?? null }];

    // "already registered" is not a failure — continue to onboarding.
    const already = !reg.ok && /already (been )?registered|already_registered/i.test(String(reg.error || ''));
    if (already) steps[0].ok = true, steps[0].note = 'Number was already registered — continuing to onboarding.';

    if (!steps[0].ok) {
      number.status = 'pending_registration';
      if (!isDemo()) await sbUpdateNumber(number);
      return NextResponse.json({ number, mode: 'graph', steps, error: reg.error || 'Meta rejected the registration.' }, { status: 502 });
    }

    const onboard = await meta.onboarding(number.wa_phone_number_id, token);
    steps.push({ step: 'onboarding', ok: onboard.ok, status: onboard.status, error: onboard.error || null, data: onboard.data ?? null });

    if (!onboard.ok) {
      number.status = 'pending_registration';
      if (!isDemo()) await sbUpdateNumber(number);
      return NextResponse.json({ number, mode: 'graph', steps, error: onboard.error || 'Onboarding failed at Meta.' }, { status: 502 });
    }

    const d: any = onboard.data || {};
    const agentId = d.agent_id || d.agent?.id || d.id || d.data?.agent_id || null;

    number.status = 'active';
    number.registered_at = nowIso();
    number.two_step_pin_set = true;
    number.meta_agent_id = agentId || number.meta_agent_id || null;
    if (!isDemo()) await sbUpdateNumber(number);
    recordAudit(number.tenant_id, session.user.email, 'number.register', `${number.display} → agent ${agentId || 'unknown'}`, 'critical');

    return NextResponse.json({ number, agent_id: agentId, mode: 'graph', steps });
  }

  Object.assign(number, body);
  return NextResponse.json({ number });
}
