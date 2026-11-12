import { GRAPH_VERSION } from './env';

/**
 * Meta Business Agent (WhatsApp) Graph client.
 * Endpoints mirror the documented flows:
 *   - POST /{phone-number-id}/register                     (Cloud API number registration)
 *   - POST /{phone-number-id}/agent_onboarding?channel=whatsapp
 *   - PUT  /{phone-number-id}/agent_config/settings?agent_id=
 *   - PUT  /{phone-number-id}/agent_config/business_info
 *   - POST /{phone-number-id}/agent_config/faq
 *   - POST /{phone-number-id}/agent_config/skills?agent_id=
 *   - POST /{phone-number-id}/agent_connectors
 *   - POST /{phone-number-id}/agent_connectors/{id}/tools
 *   - POST /{phone-number-id}/agent_connectors/{id}/tools/{toolId}/run
 *   - POST /business/whatsapp/phone_numbers/{id}/thread_control
 *   - GET  /{phone-number-id}/agent_connectors
 *   - GET  /{phone-number-id}/agent-eval/cases
 *   - POST /{phone-number-id}/agent-eval/run?eval_case_ids=
 *   - GET  /{phone-number-id}/agent-eval/run?job_id=
 *
 * Two hosts: graph.facebook.com/<v25.0>/… for Cloud API + config, and
 * api.facebook.com/<id>/agent_onboarding (unversioned) for agent onboarding.
 * X-API-Version: 2.0.0 is sent everywhere (onboarding requires it).
 */

/**
 * Meta Business Agent (WhatsApp) client — TWO hosts, exactly as the Postman
 * collection defines them ({{API}} = https://api.facebook.com):
 *
 *   graph.facebook.com/v25.0/{id}/register          Cloud API number registration (PIN, no X-API-Version)
 *   api.facebook.com/{id}/agent_onboarding          agent onboarding  (UNVERSIONED, 2.0.0)
 *   api.facebook.com/{id}/agent_config/...          settings 2.0.0 · business_info 1.0.0 · faq 1.0.0 · skills 2.0.0
 *   api.facebook.com/{id}/agent_connectors...       connectors + tools 2.0.0
 *   api.facebook.com/business/whatsapp/...          thread_control 1.0.0
 *   api.facebook.com/{id}/agent-eval/...            cases 1.0.0 · run 1.0.0 · status 2.0.0
 */
const GRAPH_BASE = process.env.META_GRAPH_BASE || 'https://graph.facebook.com';
/** Everything other than /register lives here — api.facebook.com, no /vXX.X segment. */
const API_BASE = process.env.META_API_BASE || process.env.META_ONBOARDING_BASE || 'https://api.facebook.com';

export interface GraphResult<T = any> { ok: boolean; status: number; data?: T; error?: string; skipped?: boolean }

export function metaToken(tenantToken?: string | null) {
  return tenantToken || process.env.META_SYSTEM_USER_TOKEN || '';
}

export async function graph<T = any>(
  path: string,
  opts: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: unknown;
    token?: string | null;
    apiVersion?: string | null;
    base?: string;
    versioned?: boolean;
  } = {},
): Promise<GraphResult<T>> {
  const token = metaToken(opts.token);
  if (!token) {
    return { ok: false, status: 0, skipped: true, error: 'No Meta access token configured for this tenant. Add one under Settings → API credentials.' };
  }
  const base = opts.base || API_BASE;
  const clean = path.replace(/^\//, '');
  const url = opts.versioned ? `${base}/${GRAPH_VERSION}/${clean}` : `${base}/${clean}`;
  const hasBody = opts.body !== undefined && opts.body !== null;
  try {
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(opts.apiVersion === null ? {} : { 'X-API-Version': opts.apiVersion || '2.0.0' }),
      },
      body: hasBody ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : undefined,
      cache: 'no-store',
    });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      return { ok: false, status: res.status, data, error: data?.error?.message || `Graph API error ${res.status}` };
    }
    return { ok: true, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : 'Network error' };
  }
}

export const meta = {
  // ── graph.facebook.com/v25.0 — Cloud API number registration (no X-API-Version) ──
  registerNumber: (entityId: string, pin: string, token?: string | null) =>
    graph(`${entityId}/register`, {
      method: 'POST', body: { messaging_product: 'whatsapp', pin }, token,
      apiVersion: null, base: GRAPH_BASE, versioned: true,
    }),

  // ── api.facebook.com — Business Agent surface (unversioned paths) ──
  onboarding: (entityId: string, token?: string | null) =>
    graph(`${entityId}/agent_onboarding?channel=whatsapp`, { method: 'POST', body: '', token, apiVersion: '2.0.0' }),

  putSettings: (entityId: string, agentId: string, settings: unknown, token?: string | null) =>
    graph(`${entityId}/agent_config/settings?agent_id=${encodeURIComponent(agentId)}`, {
      method: 'PUT', body: settings, token, apiVersion: '2.0.0',
    }),

  putRollout: (entityId: string, agentId: string, enabled: boolean, token?: string | null) =>
    graph(`${entityId}/agent_config/settings?agent_id=${encodeURIComponent(agentId)}`, {
      method: 'PUT', body: { rollout: { enabled } }, token, apiVersion: '1.0.0',
    }),

  putBusinessInfo: (entityId: string, info: unknown, token?: string | null) =>
    graph(`${entityId}/agent_config/business_info`, { method: 'PUT', body: info, token, apiVersion: '1.0.0' }),

  createFaq: (entityId: string, faq: { question: string; answer: string }, token?: string | null) =>
    graph(`${entityId}/agent_config/faq`, { method: 'POST', body: faq, token, apiVersion: '1.0.0' }),

  createSkill: (entityId: string, agentId: string, skill: unknown, token?: string | null) =>
    graph(`${entityId}/agent_config/skills?agent_id=${encodeURIComponent(agentId)}`, {
      method: 'POST', body: skill, token, apiVersion: '2.0.0',
    }),

  createConnector: (entityId: string, connector: unknown, token?: string | null) =>
    graph(`${entityId}/agent_connectors`, { method: 'POST', body: connector, token, apiVersion: '2.0.0' }),

  listConnectors: (entityId: string, token?: string | null) =>
    graph(`${entityId}/agent_connectors`, { token, apiVersion: '2.0.0' }),

  createTool: (entityId: string, connectorId: string, tool: unknown, token?: string | null) =>
    graph(`${entityId}/agent_connectors/${connectorId}/tools`, { method: 'POST', body: tool, token, apiVersion: '2.0.0' }),

  listTools: (entityId: string, connectorId: string, token?: string | null) =>
    graph(`${entityId}/agent_connectors/${connectorId}/tools`, { token, apiVersion: '2.0.0' }),

  deleteTool: (entityId: string, connectorId: string, toolId: string, token?: string | null) =>
    graph(`${entityId}/agent_connectors/${connectorId}/tools/${toolId}`, { method: 'DELETE', token, apiVersion: '2.0.0' }),

  runTool: (entityId: string, connectorId: string, toolId: string, input: string, token?: string | null) =>
    graph(`${entityId}/agent_connectors/${connectorId}/tools/${toolId}/run`, {
      method: 'POST', body: { input }, token, apiVersion: '2.0.0',
    }),

  threadControl: (entityId: string, action: 'takeover' | 'release', to: string, token?: string | null) =>
    graph(`business/whatsapp/phone_numbers/${entityId}/thread_control`, {
      method: 'POST', body: { messaging_product: 'whatsapp', action, to }, token, apiVersion: '1.0.0',
    }),

  evalCases: (entityId: string, token?: string | null) =>
    graph(`${entityId}/agent-eval/cases`, { token, apiVersion: '1.0.0' }),

  runEval: (entityId: string, caseIds: string[], token?: string | null) =>
    graph(`${entityId}/agent-eval/run?eval_case_ids=${caseIds.join(',')}`, {
      method: 'POST', body: {}, token, apiVersion: '1.0.0',
    }),

  evalStatus: (entityId: string, jobId: string, token?: string | null) =>
    graph(`${entityId}/agent-eval/run?job_id=${jobId}`, { token, apiVersion: '2.0.0' }),
};

/** Every Graph call this app can make — host, path, API version. Used by the Settings audit table. */
export const META_ENDPOINTS = [
  { op: 'Number registration', method: 'POST', host: 'graph.facebook.com/v25.0', path: '{id}/register', version: '—', note: 'PIN required' },
  { op: 'Agent onboarding', method: 'POST', host: 'api.facebook.com', path: '{id}/agent_onboarding?channel=whatsapp', version: '2.0.0', note: 'returns agent_id' },
  { op: 'Agent settings', method: 'PUT', host: 'api.facebook.com', path: '{id}/agent_config/settings?agent_id=', version: '2.0.0', note: 'rollout/handoff' },
  { op: 'Rollout toggle', method: 'PUT', host: 'api.facebook.com', path: '{id}/agent_config/settings?agent_id=', version: '1.0.0', note: 'publish / pause' },
  { op: 'Business info', method: 'PUT', host: 'api.facebook.com', path: '{id}/agent_config/business_info', version: '1.0.0', note: '' },
  { op: 'Create FAQ', method: 'POST', host: 'api.facebook.com', path: '{id}/agent_config/faq', version: '1.0.0', note: 'one Q&A per call' },
  { op: 'Create skill', method: 'POST', host: 'api.facebook.com', path: '{id}/agent_config/skills?agent_id=', version: '2.0.0', note: '' },
  { op: 'Create connector', method: 'POST', host: 'api.facebook.com', path: '{id}/agent_connectors', version: '2.0.0', note: '' },
  { op: 'List connectors', method: 'GET', host: 'api.facebook.com', path: '{id}/agent_connectors', version: '2.0.0', note: '' },
  { op: 'Create tool', method: 'POST', host: 'api.facebook.com', path: '{id}/agent_connectors/{cid}/tools', version: '2.0.0', note: '' },
  { op: 'Delete tool', method: 'DELETE', host: 'api.facebook.com', path: '{id}/agent_connectors/{cid}/tools/{tid}', version: '2.0.0', note: '' },
  { op: 'Run tool', method: 'POST', host: 'api.facebook.com', path: '{id}/agent_connectors/{cid}/tools/{tid}/run', version: '2.0.0', note: 'body {input:"<json string>"}' },
  { op: 'Thread control', method: 'POST', host: 'api.facebook.com', path: 'business/whatsapp/phone_numbers/{id}/thread_control', version: '1.0.0', note: 'takeover / release' },
  { op: 'Eval cases', method: 'GET', host: 'api.facebook.com', path: '{id}/agent-eval/cases', version: '1.0.0', note: '' },
  { op: 'Run eval', method: 'POST', host: 'api.facebook.com', path: '{id}/agent-eval/run?eval_case_ids=', version: '1.0.0', note: '' },
  { op: 'Eval status', method: 'GET', host: 'api.facebook.com', path: '{id}/agent-eval/run?job_id=', version: '2.0.0', note: '' },
] as const;

/** Convert UI tool shape → Meta connector tool definition. */
export function toToolDefinition(t: {
  name: string; description: string; method: string; path: string;
  path_params?: { name: string; type: string; description: string; required: boolean }[];
  query_params?: { name: string; type: string; description: string; required: boolean }[];
  body_params?: { name: string; type: string; description: string; required: boolean }[];
  user_auth_required?: boolean;
}) {
  const dict = (arr?: { name: string; type: string; description: string; required: boolean }[]) =>
    arr && arr.length
      ? Object.fromEntries(arr.map((p) => [p.name, { type: p.type, description: p.description, required: p.required }]))
      : undefined;
  const request_definition: Record<string, unknown> = { method: t.method, path: t.path };
  const q = dict(t.query_params); if (q) request_definition.query_parameters = q;
  const p = dict(t.path_params); if (p) request_definition.path_parameters = p;
  if (t.body_params?.length) {
    request_definition.body = {
      content_type: 'application/json',
      required: t.body_params.filter((x) => x.required).map((x) => x.name),
      params: Object.fromEntries(t.body_params.map((x) => [x.name, { type: x.type, description: x.description, required: x.required }])),
    };
  }
  return { name: t.name, description: t.description, request_definition, user_auth_required: !!t.user_auth_required };
}

/** Documented eligibility pre-flight (mirrors the six published criteria). */
export function eligibilityPreflight(args: {
  category: string; provider: string; wabaStatus: string; country: string;
  verified: boolean; hasOtherAgent: boolean; quality: string;
}) {
  const blockedVerticals = ['FINANCE', 'GOVERNMENT', 'HEALTH', 'ALCOHOL', 'GAMBLING', 'OTC_DRUGS', 'MATRIMONY'];
  const supportedCountries = ['IN', 'AE', 'SA', 'US', 'GB', 'BR', 'MX', 'ID', 'SG', 'ZA', 'AU', 'CA', 'DE', 'FR', 'ES', 'IT', 'NL', 'TR', 'EG', 'NG', 'KE', 'PH', 'TH', 'VN', 'MY', 'CO', 'AR', 'CL', 'PE'];
  return [
    { key: 'vertical', label: 'Supported vertical', ok: !blockedVerticals.includes(args.category.toUpperCase()), detail: `${args.category} category` },
    { key: 'platform', label: 'WhatsApp Business Platform number', ok: args.provider === 'onextel', detail: 'Provisioned through Onextel (Cloud API)' },
    { key: 'standing', label: 'Account in good standing', ok: args.wabaStatus === 'active' && args.quality !== 'red', detail: `WABA ${args.wabaStatus}, quality ${args.quality}` },
    { key: 'country', label: 'Eligible country', ok: supportedCountries.includes(args.country), detail: args.country },
    { key: 'trust', label: 'Business verification', ok: args.verified, detail: args.verified ? 'Verified' : 'Verification pending — upload GST / CIN in Meta Business Suite' },
    { key: 'no_other_agent', label: 'No competing AI agent on number', ok: !args.hasOtherAgent, detail: args.hasOtherAgent ? 'An authorized agent integration is already active' : 'Clear' },
  ];
}
