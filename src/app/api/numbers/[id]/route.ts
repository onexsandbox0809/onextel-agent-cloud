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

  if (body.action === 'onboard' || body.action === 'register') {
    const pin = String(body.pin || '').trim();
    const token = process.env.META_SYSTEM_USER_TOKEN;

    // No token → simulated so the whole flow is demoable.
    if (!token) {
      number.status = 'active';
      number.registered_at = nowIso();
      number.meta_agent_id = number.meta_agent_id || `sim_${Math.random().toString(36).slice(2, 12)}`;
      if (!isDemo()) await sbUpdateNumber(number);
      return NextResponse.json({
        number, agent_id: number.meta_agent_id, mode: 'simulated', needs_pin: false,
        steps: [{ step: 'agent_onboarding', ok: true, note: 'Simulated — add META_SYSTEM_USER_TOKEN to call Meta.' }],
      });
    }

    const steps: any[] = [];

    // 1) Meta Business Agent onboarding — no PIN involved.
    let onboard = await meta.onboarding(number.wa_phone_number_id, token);
    steps.push({ step: 'agent_onboarding', ok: onboard.ok, status: onboard.status, error: onboard.error || null, data: onboard.data ?? null });

    // 2) Only if Meta says the number itself must be registered, use the optional PIN.
    const pinRequired = !onboard.ok && /pin|two.?step|not registered|unregistered|verify your (number|phone)/i.test(String(onboard.error || ''));
    if (pinRequired && pin) {
      if (!/^\d{6}$/.test(pin)) {
        return NextResponse.json({ number, needs_pin: true, error: 'That PIN must be exactly 6 digits.', steps }, { status: 400 });
      }
      const reg = await meta.registerNumber(number.wa_phone_number_id, pin, token);
      const already = !reg.ok && /already (been )?registered|already_registered/i.test(String(reg.error || ''));
      steps.push({ step: 'register_number', ok: reg.ok || already, status: reg.status, error: reg.error || null, note: already ? 'Already registered — continuing.' : undefined, data: reg.data ?? null });
      if (reg.ok || already) {
        onboard = await meta.onboarding(number.wa_phone_number_id, token);
        steps.push({ step: 'agent_onboarding_retry', ok: onboard.ok, status: onboard.status, error: onboard.error || null, data: onboard.data ?? null });
      }
    }

    if (!onboard.ok) {
      number.status = 'pending_registration';
      if (!isDemo()) await sbUpdateNumber(number);
      return NextResponse.json({
        number, needs_pin: pinRequired, steps,
        error: pinRequired && !pin
          ? 'Meta says this number is not registered yet. Enter the number\'s 6-digit two-step PIN to register it, then onboarding runs again.'
          : String(onboard.error || 'Onboarding failed at Meta.'),
      }, { status: pinRequired && !pin ? 428 : 502 });
    }

    const d: any = onboard.data || {};
    const agentId = d.agent_id || d.agent?.id || d.id || d.data?.agent_id || null;

    number.status = 'active';
    number.registered_at = nowIso();
    number.two_step_pin_set = number.two_step_pin_set || !!pin;
    number.meta_agent_id = agentId || number.meta_agent_id || null;
    if (!isDemo()) await sbUpdateNumber(number);
    recordAudit(number.tenant_id, session.user.email, 'agent.onboard', `${number.display} → agent ${agentId || 'unknown'}`, 'critical');

    return NextResponse.json({ number, agent_id: agentId, mode: 'graph', needs_pin: false, steps });
  }

  Object.assign(number, body);
  return NextResponse.json({ number });
}
