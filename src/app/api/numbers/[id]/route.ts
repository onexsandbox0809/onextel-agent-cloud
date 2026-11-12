import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { canWrite, forbidden } from '@/lib/session-util';
import { db, nowIso, recordAudit } from '@/lib/demo-db';
import { isDemo } from '@/lib/env';
import { meta } from '@/lib/meta';
import { sbNumber, sbUpdateNumber } from '@/lib/supabase-repo';
import type { PhoneNumber } from '@/lib/types';

const PN_RE = /^\d{10,20}$/;

const digits = (v: unknown) => String(v ?? '').replace(/[^0-9]/g, '');

async function load(id: string): Promise<PhoneNumber | undefined> {
  if (isDemo()) return db().numbers.find((n) => n.id === id);
  return (await sbNumber(id)) || undefined;
}

async function persist(n: PhoneNumber) {
  if (!isDemo()) await sbUpdateNumber(n);
}

async function handle(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canWrite(session)) return forbidden();
  const { id } = await ctx.params;
  const body = await req.json();

  const number = await load(id);
  if (!number) return NextResponse.json({ error: 'Number not found' }, { status: 404 });
  if (session.user.role !== 'platform_admin' && number.tenant_id !== session.user.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Fix the stored Meta IDs (the usual cause of "Number not found" from Graph) ──
  if (body.action === 'update') {
    const pn = digits(body.wa_phone_number_id ?? number.wa_phone_number_id);
    const waba = digits(body.waba_id ?? number.waba_id);
    if (!PN_RE.test(pn)) {
      return NextResponse.json({
        error: 'The Meta phone number ID must be 10-20 digits (e.g. 1312665798592137). That is the numeric ID from Meta, not the phone number itself.',
      }, { status: 400 });
    }
    if (body.display) number.display = String(body.display).trim();
    number.wa_phone_number_id = pn;
    number.waba_id = waba || number.waba_id;
    await persist(number);
    recordAudit(number.tenant_id, session.user.email, 'number.update_ids', `${number.display} → PN ${pn}`, 'warning');
    return NextResponse.json({ number });
  }

  if (body.action === 'onboard' || body.action === 'register') {
    const pin = String(body.pin || '').trim();
    const token = process.env.META_SYSTEM_USER_TOKEN;

    if (!PN_RE.test(digits(number.wa_phone_number_id))) {
      return NextResponse.json({
        number, needs_pin: false, steps: [],
        error: `This number has no valid Meta phone number ID (stored: "${number.wa_phone_number_id}"). Use "Fix IDs" on the row and paste the numeric Phone number ID from WhatsApp Manager.`,
      }, { status: 400 });
    }

    if (!token) {
      number.status = 'active';
      number.registered_at = nowIso();
      number.meta_agent_id = number.meta_agent_id || `sim_${Math.random().toString(36).slice(2, 12)}`;
      await persist(number);
      return NextResponse.json({
        number, agent_id: number.meta_agent_id, mode: 'simulated', needs_pin: false,
        steps: [{ step: 'agent_onboarding', ok: true, status: 200, note: 'Simulated — add META_SYSTEM_USER_TOKEN to call Meta.' }],
      });
    }

    // The PIN is required by /register (Cloud API number registration), not by agent onboarding.
    if (!/^\d{6}$/.test(pin)) {
      return NextResponse.json({
        number, needs_pin: true, steps: [],
        error: 'Enter the 6-digit two-step verification PIN for this number (WhatsApp Manager → Phone numbers → Two-step verification set by your business). Meta requires it on the /register call that precedes onboarding.',
      }, { status: 428 });
    }

    const steps: any[] = [];
    const pn = digits(number.wa_phone_number_id);

    // ── Step 1: POST graph.facebook.com/v25.0/<pn>/register {messaging_product, pin} ──
    const reg = await meta.registerNumber(pn, pin, token);
    const regMsg = `${reg.error || ''} ${String((reg.data as any)?.error?.message || '')}`;
    const already = !reg.ok && /already (been )?registered|already_registered|is already registered/i.test(regMsg);
    steps.push({
      step: 'register', host: 'graph.facebook.com', ok: reg.ok || already, http: reg.status,
      note: already ? 'Already registered on the Cloud API — continuing to onboarding.' : undefined,
      error: reg.ok || already ? null : reg.error || null, data: reg.data ?? null,
    });

    if (!reg.ok && !already) {
      number.status = 'pending_registration';
      await persist(number);
      const raw = String(reg.error || '');
      return NextResponse.json({
        number, needs_pin: true, steps,
        error: /pin|two.?step|verify/i.test(raw)
          ? `Meta rejected the PIN: ${raw}. It must be the 6-digit two-step PIN configured for this number in WhatsApp Manager.`
          : /not found|does not exist|invalid.*(phone|number)|Object with ID/i.test(raw)
          ? `Meta could not find phone number ID ${pn} (${raw}). Use "Fix IDs" and paste the numeric Phone number ID from WhatsApp Manager.`
          : raw || 'The /register call failed.',
      }, { status: 502 });
    }

    // ── Step 2: POST api.facebook.com/<pn>/agent_onboarding?channel=whatsapp ──
    const onboard = await meta.onboarding(pn, token);
    steps.push({
      step: 'agent_onboarding', host: 'api.facebook.com', ok: onboard.ok, http: onboard.status,
      error: onboard.ok ? null : onboard.error || null, data: onboard.data ?? null,
    });

    if (!onboard.ok) {
      number.status = 'pending_registration';
      await persist(number);
      const raw = String(onboard.error || 'Onboarding failed at Meta.');
      return NextResponse.json({
        number, needs_pin: false, steps,
        error: /not found|does not exist|invalid.*(phone|number)/i.test(raw)
          ? `Number registered, but Meta could not onboard phone number ID ${pn} (${raw}). Check the ID with "Fix IDs".`
          : raw,
      }, { status: 502 });
    }

    const d: any = onboard.data || {};
    const agentId = d.agent_id || d.agent?.id || d.id || d.data?.agent_id || null;
    number.status = 'active';
    number.registered_at = nowIso();
    number.two_step_pin_set = true;
    number.meta_agent_id = agentId || number.meta_agent_id || null;
    await persist(number);
    recordAudit(number.tenant_id, session.user.email, 'agent.onboard', `${number.display} → agent ${agentId || 'unknown'}`, 'critical');
    return NextResponse.json({ number, agent_id: agentId, mode: 'graph', needs_pin: false, steps });
  }

  if (body.action === 'assign') {
    number.agent_id = body.agent_id || null;
    await persist(number);
    return NextResponse.json({ number });
  }

  Object.assign(number, body);
  await persist(number);
  return NextResponse.json({ number });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    return await handle(req, ctx);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const hint = /meta_agent_id/i.test(raw)
      ? 'The database is missing a column this build needs. Run in Supabase SQL editor: alter table public.phone_numbers add column if not exists meta_agent_id text;'
      : /schema cache|column .* does not exist|Could not find the/i.test(raw)
      ? 'Your Supabase schema is behind this build. Re-run supabase/schema.sql in the SQL editor (it is safe to re-run).'
      : /relation .* does not exist/i.test(raw)
      ? 'A table is missing. Run supabase/schema.sql in the SQL editor.'
      : /SUPABASE|fetch failed|ECONN|getaddrinfo/i.test(raw)
      ? 'Cannot reach Supabase. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel → Settings → Environment Variables, then redeploy.'
      : undefined;
    return NextResponse.json(
      { error: `Registration failed server-side: ${raw}${hint ? ` — ${hint}` : ''}`, hint, steps: [] },
      { status: 500 },
    );
  }
}
