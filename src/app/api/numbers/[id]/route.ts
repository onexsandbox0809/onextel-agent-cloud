import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { canWrite, forbidden } from '@/lib/session-util';
import { db, nowIso, recordAudit } from '@/lib/demo-db';
import { isDemo, metaTokenInfo } from '@/lib/env';
import { meta } from '@/lib/meta';
import { sbNumber, sbUpdateNumber } from '@/lib/supabase-repo';
import { propagateNumberId } from '@/lib/entity';
import type { PhoneNumber } from '@/lib/types';

const PN_RE = /^\d{10,20}$/;

const digits = (v: unknown) => String(v ?? '').replace(/[^0-9]/g, '');

/**
 * Meta Business Agent IDs come in two shapes, both confirmed against live API:
 *   numeric     771209384756102
 *   pfbid…      pfbid0QupfkJygt8jk8jQcXt6HBHuF7Bn6QuepT8kmoh…
 * Anything else (URLs, HTML, "undefined") is rejected.
 */
const AGENT_ID_RE = /^(\d{5,30}|pfbid[0-9A-Za-z]{30,})$/;

function pickAgentId(body: any): { id: string | null; raw: string | null } {
  if (!body || typeof body !== 'object') return { id: null, raw: null };
  const candidates = [
    body.agent_id, body.agentId,
    body.data?.agent_id, body.data?.agentId,
    body.agent?.agent_id, body.agent?.id,
    body.result?.agent_id, body.result?.id,
    body.agents?.[0]?.agent_id, body.agents?.[0]?.id,
    body.id,
  ];
  const raw = candidates.find((c) => typeof c === 'string' && c.trim()) ?? null;
  if (!raw) return { id: null, raw: null };
  return { id: AGENT_ID_RE.test(raw.trim()) ? raw.trim() : null, raw: raw.trim() };
}

async function load(id: string): Promise<PhoneNumber | undefined> {
  if (isDemo()) return db().numbers.find((n) => n.id === id);
  return (await sbNumber(id)) || undefined;
}

async function persist(n: PhoneNumber): Promise<{ agentIdPersisted: boolean }> {
  if (isDemo()) return { agentIdPersisted: true };
  return sbUpdateNumber(n);
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
    if (body.agent_id !== undefined) {
      const v = String(body.agent_id || '').trim();
      if (v && !AGENT_ID_RE.test(v)) {
        return NextResponse.json({ error: 'That does not look like a Meta agent ID — expected a number (771209384756102) or a pfbid… id.' }, { status: 400 });
      }
      number.meta_agent_id = v || null;
      if (v) number.status = 'active';
    }
    if (body.display) number.display = String(body.display).trim();
    number.wa_phone_number_id = pn;
    number.waba_id = waba || number.waba_id;
    await persist(number);
    await propagateNumberId(number.tenant_id, number.id, number.wa_phone_number_id);
    recordAudit(number.tenant_id, session.user.email, 'number.update_ids', `${number.display} → PN ${pn}`, 'warning');
    return NextResponse.json({ number });
  }

  if (body.action === 'onboard' || body.action === 'register') {
    const pin = String(body.pin || '').trim();

    if (!PN_RE.test(digits(number.wa_phone_number_id))) {
      return NextResponse.json({
        number, needs_pin: false, steps: [],
        error: `This number has no valid Meta phone number ID (stored: "${number.wa_phone_number_id}"). Use "Fix IDs" on the row and paste the numeric Phone number ID from WhatsApp Manager.`,
      }, { status: 400 });
    }

    const ti = metaTokenInfo();
    const token = ti.headerValue ? ti.headerValue.replace(/^Bearer\s+/i, '') : null;
    if (!ti.present || ti.problems.length) {
      const msg = ti.problems.length
        ? `Meta token misconfigured: ${ti.problems.join(' ')}`
        : 'META_SYSTEM_USER_TOKEN is not set on this deployment. Vercel environment variables only apply to a NEW deployment — set it, then redeploy.';
      return NextResponse.json({ number, needs_pin: false, steps: [], error: msg, mode: 'unconfigured' }, { status: 503 });
    }

    const steps: any[] = [];
    const pn = digits(number.wa_phone_number_id);
    const ctx = { actor: session.user.email, tenant: number.tenant_id, number: number.display, phone_number_id: pn };

    // ── Fast path: a number that is already registered only needs onboarding. ──
    // No PIN is asked for unless Meta explicitly says the number is not registered yet.
    if (!pin) {
      const onboardOnly = await meta.onboarding(pn, token, { ...ctx, action: 'agent_onboarding' });
      steps.push({
        step: 'agent_onboarding', host: 'api.facebook.com', ok: onboardOnly.ok, http: onboardOnly.status,
        error: onboardOnly.ok ? null : onboardOnly.error || null, data: onboardOnly.data ?? null,
      });

      if (onboardOnly.ok) {
        const d: any = onboardOnly.data || {};
        const picked = pickAgentId(d);
        number.status = 'active';
        number.registered_at = number.registered_at || nowIso();
        number.two_step_pin_set = number.two_step_pin_set || false;
        number.meta_agent_id = picked.id || number.meta_agent_id || null;
        const saved = await persist(number);
        recordAudit(number.tenant_id, session.user.email, 'agent.onboard', `${number.display} → agent ${picked.id || 'unconfirmed'}`, picked.id ? 'critical' : 'warning');
        return NextResponse.json({
          number, agent_id: picked.id, agent_id_saved: saved.agentIdPersisted, mode: 'graph', needs_pin: false, steps,
          raw_agent_value: picked.raw,
          warning: !picked.id
            ? `Onboarded, but Meta's response had no recognisable agent ID${picked.raw ? ` (got "${picked.raw.slice(0, 40)}")` : ''}. Check the raw response and paste the ID under Fix IDs if it exists in Meta Business Suite.`
            : !saved.agentIdPersisted
            ? `Meta returned agent ID ${picked.id} but it could NOT be saved: the phone_numbers.meta_agent_id column is missing. Copy the ID from this panel, then run: alter table public.phone_numbers add column if not exists meta_agent_id text; and paste it under Fix IDs → Agent ID.`
            : undefined,
        });
      }

      const raw = String(onboardOnly.error || '');
      if (/pin|two.?step|not registered|unregistered|verify your (number|phone)|register the (number|phone)/i.test(raw)) {
        number.status = 'pending_registration';
        await persist(number);
        return NextResponse.json({
          number, needs_pin: true, steps,
          error: "Meta says this number itself is not registered on the WhatsApp Cloud API yet, so it needs the number's 6-digit two-step PIN once. After that, onboarding runs without a PIN.",
        }, { status: 428 });
      }

      number.status = 'pending_registration';
      await persist(number);
      return NextResponse.json({
        number, needs_pin: false, steps,
        error: /not found|does not exist|invalid.*(phone|number)|Object with ID/i.test(raw)
          ? `Meta could not find phone number ID ${pn} (${raw}). Use "Fix IDs" and paste the numeric Phone number ID from WhatsApp Manager.`
          : raw || 'Onboarding failed at Meta.',
      }, { status: 502 });
    }

    // ── Explicit path: PIN supplied → /register, then onboarding. ──
    if (!/^\d{6}$/.test(pin)) {
      return NextResponse.json({ number, needs_pin: true, steps, error: 'The two-step PIN must be exactly 6 digits.' }, { status: 400 });
    }

    const reg = await meta.registerNumber(pn, pin, token, { ...ctx, action: 'register' });
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

    const onboard = await meta.onboarding(pn, token, { ...ctx, action: 'agent_onboarding' });
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

    const d2: any = onboard.data || {};
    const picked2 = pickAgentId(d2);
    number.status = 'active';
    number.registered_at = nowIso();
    number.two_step_pin_set = true;
    number.meta_agent_id = picked2.id || number.meta_agent_id || null;
    const saved2 = await persist(number);
    recordAudit(number.tenant_id, session.user.email, 'agent.onboard', `${number.display} → agent ${picked2.id || 'unconfirmed'}`, picked2.id ? 'critical' : 'warning');
    return NextResponse.json({
      number, agent_id: picked2.id, agent_id_saved: saved2.agentIdPersisted, mode: 'graph', needs_pin: false, steps,
      raw_agent_value: picked2.raw,
      warning: picked2.id && !saved2.agentIdPersisted
        ? `Meta returned agent ID ${picked2.id} but it could NOT be saved: the phone_numbers.meta_agent_id column is missing. Run: alter table public.phone_numbers add column if not exists meta_agent_id text; then paste the ID under Fix IDs → Agent ID.`
        : picked2.id ? undefined
        : picked2.raw
        ? `Registered and onboarded, but Meta's response did not contain a numeric or pfbid agent ID (got "${picked2.raw.slice(0, 60)}"). Nothing was saved as the agent ID.`
        : 'Registered and onboarded, but the response had no agent ID field. Check the raw response; paste the ID under Fix IDs if it exists in Meta Business Suite.',
    });
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
