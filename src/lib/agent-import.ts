import * as XLSX from 'xlsx';
import type { Agent } from './types';
import { newId, nowIso, recordAudit } from './demo-db';
import { isDemo } from './env';
import { sbUpdateAgent } from './supabase-repo';
import { meta, toToolDefinition } from './meta';

export const MAX_IMPORT_ROWS = 300;

type Row = Record<string, any>;
export interface ImportResult {
  imported: number;
  skipped: number;
  warnings: string[];
  errors: { row: number; error: string }[];
  created: string[];
  meta?: { synced: number; duplicates: number; failed: number };
}

const norm = (k: string) => String(k).trim().toLowerCase().replace(/[\s\-./]+/g, '_');
const str = (v: any) => (v === undefined || v === null ? '' : String(v).trim());
const bool = (v: any) => /^(1|true|yes|y|x)$/i.test(str(v));

function readSheets(wb: XLSX.WorkBook) {
  return wb.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json<Row>(wb.Sheets[name], { defval: '', raw: false });
    return { name: norm(name), rows: rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [norm(k), v]))) };
  });
}

/** Sheet whose header row matches the most expected columns. */
function bestSheet(sheets: { name: string; rows: Row[] }[], keys: string[]) {
  let best = { name: '', rows: [] as Row[], score: -1 };
  for (const s of sheets) {
    const cols = new Set<string>();
    s.rows.slice(0, 5).forEach((r) => Object.keys(r).forEach((c) => cols.add(c)));
    const score = keys.filter((k) => cols.has(k)).length;
    if (score > best.score && s.rows.length) best = { name: s.name, rows: s.rows, score };
  }
  return best;
}

function parseParams(v: any) {
  const s = str(v);
  if (!s) return [];
  try {
    const arr = JSON.parse(s);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((p: any) => p && p.name)
      .map((p: any) => ({
        name: str(p.name),
        type: str(p.type) || 'string',
        description: str(p.description),
        required: !!p.required,
      }));
  } catch {
    return [];
  }
}

async function persist(agent: Agent, patch: Partial<Agent>) {
  if (isDemo()) Object.assign(agent, patch);
  else await sbUpdateAgent(agent.id, patch);
}

const isDuplicate = (r: any) =>
  !!r && r.ok === false && (r.status === 409 || /duplicate/i.test(String(r.error || '')));

async function push(items: (() => Promise<any>)[], limit = 4) {
  const results: any[] = [];
  for (let i = 0; i < items.length; i += limit) {
    results.push(...(await Promise.all(items.slice(i, i + limit).map((f) => f().catch((e) => ({ ok: false, error: String(e) }))))));
  }
  return results;
}

export async function importWorkbook(args: {
  agent: Agent;
  section: 'faqs' | 'skills' | 'connectors';
  buf: Buffer;
  token?: string | null;
  email: string;
}): Promise<ImportResult> {
  const { agent, section, token, email } = args;
  const entityId = agent.entity_id;
  const wb = XLSX.read(args.buf, { type: 'buffer', cellDates: false });
  const sheets = readSheets(wb);
  const out: ImportResult = { imported: 0, skipped: 0, warnings: [], errors: [], created: [] };

  // ── FAQs ──────────────────────────────────────────────────────────────
  if (section === 'faqs') {
    const { rows } = bestSheet(sheets, ['question', 'answer']);
    const seen = new Set(agent.faqs.map((f) => f.question.trim().toLowerCase()));
    const fresh: any[] = [];
    rows.forEach((r, i) => {
      const rowNo = i + 2;
      const question = str(r.question ?? r.q ?? r.question_text ?? r.query);
      const answer = str(r.answer ?? r.a ?? r.response ?? r.reply);
      if (!question || !answer) { out.errors.push({ row: rowNo, error: 'Both question and answer are required.' }); return; }
      const key = question.toLowerCase();
      if (seen.has(key)) { out.skipped++; out.warnings.push(`Row ${rowNo}: duplicate question skipped.`); return; }
      seen.add(key);
      fresh.push({ id: newId('faq'), question, answer, category: str(r.category ?? r.topic) || 'General', updated_at: nowIso() });
    });
    if (fresh.length > MAX_IMPORT_ROWS) {
      out.errors.push({ row: MAX_IMPORT_ROWS + 2, error: `Only ${MAX_IMPORT_ROWS} rows per upload — split the file.` });
      fresh.length = MAX_IMPORT_ROWS;
    }
    if (fresh.length) {
      await persist(agent, { faqs: [...fresh, ...agent.faqs] } as Partial<Agent>);
      out.imported = fresh.length;
      out.created = fresh.slice(0, 5).map((f) => f.question);
      recordAudit(agent.tenant_id, email, 'faq.import', `${fresh.length} FAQs from file`);
      if (token) {
        const res = await push(fresh.map((f) => () => meta.createFaq(entityId, { question: f.question, answer: f.answer }, token)));
        let synced = 0, dupes = 0, failed = 0;
        res.forEach((r, i) => {
          if (r && r.ok) { synced++; fresh[i].synced = true; }
          else if (isDuplicate(r)) { dupes++; fresh[i].synced = true; }
          else { failed++; out.warnings.push(`Row ${i + 2}: saved locally, Meta rejected it — ${r?.error || 'error'}`); }
        });
        out.meta = { synced, duplicates: dupes, failed };
        if (dupes) out.warnings.push(`${dupes} FAQ${dupes === 1 ? '' : 's'} already existed in Meta (HTTP 409 Duplicate FAQ) and were treated as configured.`);
        await persist(agent, { faqs: agent.faqs } as Partial<Agent>);
      } else out.warnings.push('Saved locally. No Meta token configured, so nothing was pushed to Meta.');
    }
    return out;
  }

  // ── Skills ────────────────────────────────────────────────────────────
  if (section === 'skills') {
    const { rows } = bestSheet(sheets, ['title', 'skill']);
    const seen = new Set(agent.skills.map((s) => s.title.trim().toLowerCase()));
    const fresh: any[] = [];
    rows.forEach((r, i) => {
      const rowNo = i + 2;
      const title = str(r.title ?? r.name ?? r.skill_title ?? r.id);
      const skill = str(r.skill ?? r.instructions ?? r.content ?? r.body ?? r.prompt ?? r.text);
      if (!title || !skill) { out.errors.push({ row: rowNo, error: 'Both title and skill instructions are required.' }); return; }
      if (seen.has(title.toLowerCase())) { out.skipped++; out.warnings.push(`Row ${rowNo}: skill "${title}" already exists — skipped.`); return; }
      seen.add(title.toLowerCase());
      fresh.push({
        id: newId('sk'), title,
        description: str(r.description ?? r.summary ?? r.when_to_apply) || `Apply for: ${title}`,
        skill, enabled: r.enabled === '' || r.enabled === undefined ? true : bool(r.enabled), updated_at: nowIso(),
      });
    });
    if (fresh.length > MAX_IMPORT_ROWS) { fresh.length = MAX_IMPORT_ROWS; }
    if (fresh.length) {
      await persist(agent, { skills: [...fresh, ...agent.skills] } as Partial<Agent>);
      out.imported = fresh.length;
      out.created = fresh.map((s) => s.title);
      recordAudit(agent.tenant_id, email, 'skill.import', `${fresh.length} skills from file`);
      if (token && agent.meta_agent_id) {
        const res = await push(fresh.map((s) => () => meta.createSkill(entityId, agent.meta_agent_id as string, { title: s.title, description: s.description, skill: s.skill }, token)));
        let synced = 0, dupes = 0, failed = 0;
        res.forEach((r, i) => {
          if (r && r.ok) { synced++; fresh[i].synced = true; }
          else if (isDuplicate(r)) { dupes++; fresh[i].synced = true; }
          else { failed++; out.warnings.push(`Row ${i + 2}: saved locally, Meta rejected it — ${r?.error || 'error'}`); }
        });
        out.meta = { synced, duplicates: dupes, failed };
        if (dupes) out.warnings.push(`${dupes} skill${dupes === 1 ? '' : 's'} already existed in Meta and were treated as configured.`);
        await persist(agent, { skills: agent.skills } as Partial<Agent>);
      } else out.warnings.push(token ? 'Saved locally. Register the number to get an agent ID before skills can sync to Meta.' : 'Saved locally. No Meta token configured.');
    }
    return out;
  }

  // ── Connectors + tools ────────────────────────────────────────────────
  const connSheet = sheets.find((s) => s.name.includes('connector') && s.rows.length) || bestSheet(sheets, ['name', 'base_url']);
  const toolSheet = sheets.find((s) => s.name.includes('tool') && s.rows.length);

  const primary = toolSheet && connSheet.name ? connSheet : bestSheet(sheets, ['connector_name', 'tool_name']);
  const connRows = primary.rows;
  const toolRows = toolSheet ? toolSheet.rows : primary.rows;

  const byName = new Map<string, any>();
  const createdKeys: string[] = [];

  const ensureConnector = async (name: string, r: Row) => {
    const key = name.toLowerCase();
    if (byName.has(key)) return { conn: byName.get(key), isNew: false };
    const existing = agent.connectors.find((c) => c.name.toLowerCase() === key);
    if (existing) return { conn: existing, isNew: false };
    const base = str(r.base_url ?? r.url ?? r.base) || '';
    if (!/^https:\/\//i.test(base)) {
      out.errors.push({ row: 0, error: `Connector "${name}" needs an https base_url.` });
      return { conn: null, isNew: false };
    }
    const conn = {
      id: newId('con'), agent_id: agent.id, name,
      description: str(r.connector_description ?? r.conn_description ?? r.description) || '',
      base_url: base, auth_type: (str(r.auth_type ?? r.auth) || 'NONE').toUpperCase(),
      requires_certificate: false, status: 'draft' as const, secret_ref: null, synced_at: null, tools: [] as any[],
    };
    byName.set(key, conn);
    createdKeys.push(name);
    return { conn, isNew: true };
  };

  for (const [i, r] of connRows.entries()) {
    const rowNo = i + 2;
    const name = str(r.connector_name ?? r.name ?? r.connector);
    if (!name) { out.errors.push({ row: rowNo, error: 'connector_name is required.' }); continue; }
    const { conn } = await ensureConnector(name, r);
    if (!conn) continue;

    const toolName = str(r.tool_name ?? r.tool ?? '');
    if (!toolName) continue; // connector-only row
    if (!/^[a-z0-9_]{1,64}$/.test(toolName)) { out.errors.push({ row: rowNo, error: `Tool "${toolName}" must be snake_case.` }); continue; }
    if (conn.tools.some((t: any) => t.name === toolName)) { out.skipped++; out.warnings.push(`Row ${rowNo}: tool ${toolName} already exists.`); continue; }
    conn.tools.push({
      id: newId('tool'), connector_id: conn.id, name: toolName,
      description: str(r.tool_description ?? r.description) || '',
      method: ((str(r.method) || 'GET').toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'),
      path: str(r.path ?? r.endpoint) || '/',
      path_params: parseParams(r.path_params), query_params: parseParams(r.query_params),
      body_params: parseParams(r.body_params), user_auth_required: bool(r.user_auth_required),
      enabled: true, last_run_at: null, last_status: null, test_input: str(r.test_input) || '{}',
    });
  }

  // also honour a dedicated Tools sheet (connector referenced by name)
  if (toolSheet) {
    for (const [i, r] of toolRows.entries()) {
      const rowNo = i + 2;
      const cname = str(r.connector_name ?? r.connector ?? '');
      const toolName = str(r.tool_name ?? r.name ?? r.tool);
      if (!cname || !toolName) { out.errors.push({ row: rowNo, error: 'connector_name and tool_name are required on the Tools sheet.' }); continue; }
      const { conn } = await ensureConnector(cname, connRows[0] || {});
      if (!conn) continue;
      if (!/^[a-z0-9_]{1,64}$/.test(toolName)) { out.errors.push({ row: rowNo, error: `Tool "${toolName}" must be snake_case.` }); continue; }
      if (conn.tools.some((t: any) => t.name === toolName)) { out.skipped++; out.warnings.push(`Row ${rowNo}: tool ${toolName} already exists.`); continue; }
      conn.tools.push({
        id: newId('tool'), connector_id: conn.id, name: toolName,
        description: str(r.description ?? r.tool_description) || '',
        method: ((str(r.method) || 'GET').toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'), path: str(r.path ?? r.endpoint) || '/',
        path_params: parseParams(r.path_params), query_params: parseParams(r.query_params),
        body_params: parseParams(r.body_params), user_auth_required: bool(r.user_auth_required),
        enabled: true, last_run_at: null, last_status: null, test_input: str(r.test_input) || '{}',
      });
    }
  }

  const newConns = [...byName.values()];
  if (newConns.length) {
    await persist(agent, { connectors: [...agent.connectors, ...newConns] } as Partial<Agent>);
    out.imported = newConns.length;
    out.created = newConns.map((c) => `${c.name} (${c.tools.length} tools)`);
    recordAudit(agent.tenant_id, email, 'connector.import', `${newConns.length} connectors, ${newConns.reduce((n, c) => n + c.tools.length, 0)} tools`);
    if (token) {
      for (const c of newConns) {
        const rem = await meta.createConnector(entityId, {
          name: c.name, description: c.description, base_url: c.base_url,
          auth_type: c.auth_type, requires_certificate: false,
        }, token);
        if (rem.ok) { c.status = 'active'; c.synced_at = nowIso(); }
        else out.warnings.push(`Connector ${c.name}: saved locally, Meta rejected it — ${rem.error || 'error'}`);
        if (rem.ok && c.tools.length) {
          const res = await push(c.tools.map((t: any) => () => meta.createTool(entityId, c.id, toToolDefinition(t), token)));
          res.forEach((r, i) => { if (r && r.ok === false) out.warnings.push(`Tool ${c.tools[i].name}: Meta rejected it — ${r.error || 'error'}`); });
        }
      }
      await persist(agent, { connectors: agent.connectors } as Partial<Agent>);
    } else out.warnings.push('Saved locally. No Meta token configured, so nothing was pushed to Meta.');
  }
  return out;
}
