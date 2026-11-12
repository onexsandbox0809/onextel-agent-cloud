import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { canWrite, forbidden } from '@/lib/session-util';
import { db, getAgent, newId, nowIso, recordAudit } from '@/lib/demo-db';
import { isDemo, metaTokenInfo } from '@/lib/env';
import { sbAgent, sbUpdateAgent } from '@/lib/supabase-repo';
import { meta, toToolDefinition } from '@/lib/meta';
import { importWorkbook, MAX_IMPORT_ROWS } from '@/lib/agent-import';
import { resolveEntityId, syncEntityId } from '@/lib/entity';
import type { Agent } from '@/lib/types';

type Ctx = { params: Promise<{ id: string; section: string }> };

async function load(session: any, id: string) {
  const agent = isDemo() ? getAgent(id) : await sbAgent(id);
  if (!agent) return { error: NextResponse.json({ error: 'Agent not found' }, { status: 404 }) };
  if (session.user.role !== 'platform_admin' && agent.tenant_id !== session.user.tenant_id) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { agent };
}

async function persist(agent: Agent, patch: Partial<Agent>) {
  if (isDemo()) Object.assign(agent, patch);
  else await sbUpdateAgent(agent.id, patch);
}

export async function POST(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canWrite(session)) return forbidden();
  const { id, section } = await ctx.params;
  const res = await load(session, id);
  if ('error' in res) return res.error;
  const agent = res.agent as Agent;
  await syncEntityId(agent);
  const entityId = agent.entity_id;
  const ctype = req.headers.get('content-type') || '';
  const isUpload = ctype.includes('multipart/form-data');
  const body = isUpload ? {} : await req.json().catch(() => ({}));
  const token = metaTokenInfo().headerValue?.replace(/^Bearer\s+/i, '') || null;

  // ── Bulk upload: .xlsx / .xls / .csv ──────────────────────────────────
  if (isUpload) {
    if (!['faqs', 'skills', 'connectors'].includes(section)) {
      return NextResponse.json({ error: 'Upload is supported for FAQs, skills and connectors only.' }, { status: 400 });
    }
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof Blob)) return NextResponse.json({ error: 'Attach an .xlsx, .xls or .csv file.' }, { status: 400 });
    if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: 'File is larger than 8 MB.' }, { status: 413 });
    let buf: Buffer;
    try { buf = Buffer.from(await file.arrayBuffer()); }
    catch { return NextResponse.json({ error: 'Could not read the uploaded file.' }, { status: 400 }); }
    try {
      const result = await importWorkbook({ agent, section: section as any, buf, token, email: session.user.email });
      if (!result.imported && result.errors.length) {
        return NextResponse.json({ ...result, error: result.errors[0].error }, { status: 400 });
      }
      return NextResponse.json({ ...result, max_rows: MAX_IMPORT_ROWS, limit: MAX_IMPORT_ROWS });
    } catch (e) {
      return NextResponse.json({ error: `Could not parse the spreadsheet: ${e instanceof Error ? e.message : 'unknown error'}` }, { status: 400 });
    }
  }

  switch (section) {
    case 'faqs': {
      if (!body.question?.trim() || !body.answer?.trim()) return NextResponse.json({ error: 'Question and answer are required.' }, { status: 400 });
      const faq = { id: newId('faq'), question: body.question, answer: body.answer, category: body.category || 'General', updated_at: nowIso() };
      await persist(agent, { faqs: [faq, ...agent.faqs] } as Partial<Agent>);
      const remote = token ? await meta.createFaq(entityId, { question: faq.question, answer: faq.answer }, token) : null;
      recordAudit(agent.tenant_id, session.user.email, 'faq.create', faq.question);
      return NextResponse.json({ faq, remote });
    }
    case 'skills': {
      if (!body.title?.trim() || !body.skill?.trim()) return NextResponse.json({ error: 'Title and skill instructions are required.' }, { status: 400 });
      const skill = { id: newId('sk'), title: body.title, description: body.description || `Apply for: ${body.title}`, skill: body.skill, enabled: body.enabled !== false, updated_at: nowIso() };
      await persist(agent, { skills: [skill, ...agent.skills] } as Partial<Agent>);
      const remote = token && agent.meta_agent_id ? await meta.createSkill(entityId, agent.meta_agent_id, { title: skill.title, description: skill.description, skill: skill.skill }, token) : null;
      recordAudit(agent.tenant_id, session.user.email, 'skill.create', skill.title);
      return NextResponse.json({ skill, remote });
    }
    case 'connectors': {
      if (!body.name?.trim() || !body.base_url?.trim()) return NextResponse.json({ error: 'Connector name and base URL are required.' }, { status: 400 });
      if (!/^https:\/\//.test(body.base_url)) return NextResponse.json({ error: 'Base URL must be HTTPS — Meta rejects plain HTTP connectors.' }, { status: 400 });
      const conn = {
        id: newId('con'), agent_id: agent.id, name: body.name, description: body.description || '',
        base_url: body.base_url, auth_type: body.auth_type || 'NONE', requires_certificate: false,
        status: 'draft' as const, secret_ref: body.secret_ref || null, synced_at: null, tools: [],
      };
      await persist(agent, { connectors: [...agent.connectors, conn] } as Partial<Agent>);
      const remote = token ? await meta.createConnector(entityId, {
        name: conn.name, description: conn.description, base_url: conn.base_url,
        auth_type: conn.auth_type, requires_certificate: false,
      }, token) : null;
      if (remote?.ok) { (conn as any).status = 'active'; (conn as any).synced_at = nowIso(); await persist(agent, { connectors: agent.connectors } as Partial<Agent>); }
      recordAudit(agent.tenant_id, session.user.email, 'connector.create', conn.name);
      return NextResponse.json({ connector: conn, remote }, { status: 201 });
    }
    case 'tools': {
      if (!body.name?.trim()) return NextResponse.json({ error: 'Tool name is required.' }, { status: 400 });
      if (!/^[a-z0-9_]{1,64}$/.test(body.name)) return NextResponse.json({ error: 'Tool names must be snake_case (a–z, 0–9, _).' }, { status: 400 });
      if (!body.connector_id) return NextResponse.json({ error: 'Select a connector for this tool.' }, { status: 400 });
      const connector = agent.connectors.find((c) => c.id === body.connector_id);
      if (!connector) return NextResponse.json({ error: 'Connector not found.' }, { status: 404 });
      const tool = {
        id: newId('tool'), connector_id: connector.id, name: body.name, description: body.description || '',
        method: body.method || 'GET', path: body.path || '/', path_params: body.path_params || [],
        query_params: body.query_params || [], body_params: body.body_params || [],
        user_auth_required: !!body.user_auth_required, enabled: true, last_run_at: null, last_status: null,
        test_input: body.test_input || '{}',
      };
      connector.tools.push(tool);
      await persist(agent, { connectors: agent.connectors } as Partial<Agent>);
      const remote = token ? await meta.createTool(entityId, connector.id, toToolDefinition(tool), token) : null;
      recordAudit(agent.tenant_id, session.user.email, 'tool.create', tool.name);
      return NextResponse.json({ tool, remote }, { status: 201 });
    }
    case 'publish': {
      const nextVersion = agent.version + 1;
      const remote = token && agent.meta_agent_id
        ? await meta.putSettings(entityId, agent.meta_agent_id, { rollout: { enabled: true }, handoff: agent.settings.handoff, followup: agent.settings.followup, ai_audience: agent.settings.ai_audience }, token)
        : null;
      await persist(agent, {
        status: 'live', version: nextVersion, published_at: nowIso(), health: Math.max(agent.health, 72),
        settings: { ...agent.settings, rollout: { enabled: true } },
      } as Partial<Agent>);
      recordAudit(agent.tenant_id, session.user.email, 'agent.publish', `${agent.name} v${nextVersion}`, 'critical');
      return NextResponse.json({ agent, remote, mode: remote ? 'graph' : 'not_sent', warning: remote ? undefined : 'Saved locally. No Meta token on this deployment, so rollout was NOT changed at Meta.' });
    }
    case 'pause': {
      await persist(agent, { status: 'paused', settings: { ...agent.settings, rollout: { enabled: false } } } as Partial<Agent>);
      recordAudit(agent.tenant_id, session.user.email, 'agent.pause', agent.name, 'warning');
      return NextResponse.json({ agent });
    }
    case 'rollout': {
      const enabled = body.enabled !== false;
      const remote = token && agent.meta_agent_id
        ? await meta.putRollout(entityId, agent.meta_agent_id, enabled, token)
        : null;
      if (remote && !remote.ok) {
        return NextResponse.json({ agent, remote, error: `Meta rejected the rollout change: ${remote.error || 'error'}` }, { status: 502 });
      }
      await persist(agent, {
        status: enabled ? 'live' : 'paused',
        settings: { ...agent.settings, rollout: { enabled } },
      } as Partial<Agent>);
      recordAudit(agent.tenant_id, session.user.email, enabled ? 'agent.enable' : 'agent.disable', agent.name, 'critical');
      return NextResponse.json({
        agent, remote, mode: remote ? 'graph' : 'not_sent',
        warning: remote ? undefined : 'Saved locally. No Meta token, so rollout was NOT changed at Meta.',
        rollout: { enabled },
      });
    }
    case 'evaluate': {
      const ids: string[] = body.case_ids || [];
      const remote = token ? await meta.runEval(entityId, ids, token) : null;
      const d = db();
      const cases = d.evals.filter((e) => e.agent_id === agent.id && (!ids.length || ids.includes(e.id)));
      const passed = cases.filter((c) => c.last_result === 'pass').length;
      cases.forEach((c) => { c.last_run_at = nowIso(); });
      recordAudit(agent.tenant_id, session.user.email, 'agent.evaluate', `${cases.length} cases`);
      return NextResponse.json({
        run: { id: newId('run'), job_id: (remote?.data as any)?.job_id || null, status: 'completed', score: cases.length ? Math.round((passed / cases.length) * 100) : 0, cases_total: cases.length, cases_passed: passed, started_at: nowIso() },
        remote, mode: remote ? 'graph' : 'not_sent',
      });
    }
    case 'test': {
      const text = String(body.message || '');
      const lower = text.toLowerCase();
      let reply = "I can help with that. Could you share a few more details?";
      let tool: string | undefined;
      if (/pnr|booking|status/.test(lower)) { reply = 'Let me look that up. Share your 6-character PNR (for example AIXQ7T2M) and I will pull the booking status.'; tool = 'get_booking_by_pnr'; }
      else if (/refund|cancel/.test(lower)) { reply = 'Cancellation depends on your fare rules. Share the PNR and I will check whether it is refundable before you confirm.'; tool = 'cancel_booking'; }
      else if (/flight|del|bom|fare|cheap/.test(lower)) { reply = 'I can search live fares. What are your origin, destination and travel date?'; tool = 'search_flights'; }
      else if (/check.?in|boarding/.test(lower)) { reply = 'Web check-in opens 14 days before departure. Send your PNR and last name and I will check you in.'; tool = 'web_checkin'; }
      else if (/human|agent|support/.test(lower)) { reply = agent.settings.handoff.message; tool = 'thread_control'; }
      return NextResponse.json({
        reply, tool, mode: 'sandbox',
        matched_skills: agent.skills.slice(0, 2).map((s) => s.title),
        latency_ms: 420 + Math.round(Math.random() * 260),
        note: 'Sandbox simulator: replies are derived from your configured skills and connector tools. Live traffic runs on Meta’s orchestration once rolled out.',
      });
    }
    default:
      return NextResponse.json({ error: `Unknown section: ${section}` }, { status: 404 });
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canWrite(session)) return forbidden();
  const { id, section } = await ctx.params;
  const res = await load(session, id);
  if ('error' in res) return res.error;
  const agent = res.agent as Agent;
  await syncEntityId(agent);
  const entityId = agent.entity_id;
  const body = await req.json();

  if (section === 'faqs') {
    agent.faqs = agent.faqs.map((f) => (f.id === body.id ? { ...f, ...body, updated_at: nowIso() } : f));
    await persist(agent, { faqs: agent.faqs } as Partial<Agent>);
    return NextResponse.json({ ok: true, faqs: agent.faqs });
  }
  if (section === 'skills') {
    agent.skills = agent.skills.map((s) => (s.id === body.id ? { ...s, ...body, updated_at: nowIso() } : s));
    await persist(agent, { skills: agent.skills } as Partial<Agent>);
    return NextResponse.json({ ok: true, skills: agent.skills });
  }
  if (section === 'tools') {
    agent.connectors = agent.connectors.map((c) => ({
      ...c, tools: c.tools.map((t) => (t.id === body.id ? { ...t, ...body, id: t.id, connector_id: c.id } : t)),
    }));
    await persist(agent, { connectors: agent.connectors } as Partial<Agent>);
    return NextResponse.json({ ok: true, connectors: agent.connectors });
  }
  if (section === 'connectors') {
    agent.connectors = agent.connectors.map((c) => (c.id === body.id ? { ...c, ...body, id: c.id, tools: c.tools } : c));
    await persist(agent, { connectors: agent.connectors } as Partial<Agent>);
    return NextResponse.json({ ok: true, connectors: agent.connectors });
  }
  return NextResponse.json({ error: 'Unsupported section' }, { status: 400 });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canWrite(session)) return forbidden();
  const { id, section } = await ctx.params;
  const res = await load(session, id);
  if ('error' in res) return res.error;
  const agent = res.agent as Agent;
  await syncEntityId(agent);
  const entityId = agent.entity_id;
  const body = await req.json().catch(() => ({}));

  if (section === 'faqs') { agent.faqs = agent.faqs.filter((f) => f.id !== body.id); await persist(agent, { faqs: agent.faqs } as Partial<Agent>); }
  else if (section === 'skills') { agent.skills = agent.skills.filter((s) => s.id !== body.id); await persist(agent, { skills: agent.skills } as Partial<Agent>); }
  else if (section === 'tools') {
    agent.connectors = agent.connectors.map((c) => ({ ...c, tools: c.tools.filter((t) => t.id !== body.id) }));
    await persist(agent, { connectors: agent.connectors } as Partial<Agent>);
    const token = metaTokenInfo().headerValue?.replace(/^Bearer\s+/i, '') || null;
    if (token) await meta.deleteTool(entityId, body.connector_id, body.id, token);
  } else if (section === 'connectors') {
    agent.connectors = agent.connectors.filter((c) => c.id !== body.id);
    await persist(agent, { connectors: agent.connectors } as Partial<Agent>);
  } else return NextResponse.json({ error: 'Unsupported section' }, { status: 400 });

  recordAudit(agent.tenant_id, session.user.email, `${section}.delete`, body.name || body.id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canWrite(session)) return forbidden();
  const { id, section } = await ctx.params;
  const res = await load(session, id);
  if ('error' in res) return res.error;
  const agent = res.agent as Agent;
  await syncEntityId(agent);
  const entityId = agent.entity_id;
  const body = await req.json();

  if (section === 'tools' && body.action === 'run') {
    const connector = agent.connectors.find((c) => c.tools.some((t) => t.id === body.tool_id));
    const tool = connector?.tools.find((t) => t.id === body.tool_id);
    if (!connector || !tool) return NextResponse.json({ error: 'Tool not found' }, { status: 404 });
    const token = metaTokenInfo().headerValue?.replace(/^Bearer\s+/i, '') || null;
    const remote = token ? await meta.runTool(entityId, connector.id, tool.id, body.input || '{}', token) : null;
    tool.last_run_at = nowIso();
    tool.last_status = remote ? (remote.ok ? 'ok' : 'error') : 'ok';
    await persist(agent, { connectors: agent.connectors } as Partial<Agent>);
    return NextResponse.json({
      result: remote?.data ?? null, mode: remote ? 'graph' : 'not_sent', error: remote && !remote.ok ? remote.error : undefined,
      remote, tool,
    });
  }
  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
}
