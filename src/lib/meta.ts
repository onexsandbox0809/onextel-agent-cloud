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
 * X-API-Version: 2.0.0 is sent on config/connector calls, 1.0.0 on
 * onboarding / business_info / eval / thread_control, matching Meta's samples.
 */

const BASE = 'https://graph.facebook.com';

export interface GraphResult<T = any> { ok: boolean; status: number; data?: T; error?: string; skipped?: boolean }

export function metaToken(tenantToken?: string | null) {
  return tenantToken || process.env.META_SYSTEM_USER_TOKEN || '';
}

export async function graph<T = any>(
  path: string,
  opts: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; token?: string | null; apiVersion?: string } = {},
): Promise<GraphResult<T>> {
  const token = metaToken(opts.token);
  if (!token) {
    return { ok: false, status: 0, skipped: true, error: 'No Meta access token configured for this tenant. Add one under Settings → API credentials.' };
  }
  const url = `${BASE}/${GRAPH_VERSION}/${path.replace(/^\//, '')}`;
  try {
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-API-Version': opts.apiVersion || '2.0.0',
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
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
  registerNumber: (entityId: string, pin: string, token?: string | null) =>
    graph(`${entityId}/register`, { method: 'POST', body: { messaging_product: 'whatsapp', pin }, token }),

  onboarding: (entityId: string, token?: string | null) =>
    graph(`${entityId}/agent_onboarding?channel=whatsapp`, { method: 'POST', body: {}, token, apiVersion: '1.0.0' }),

  putSettings: (entityId: string, agentId: string, settings: unknown, token?: string | null) =>
    graph(`${entityId}/agent_config/settings?agent_id=${encodeURIComponent(agentId)}`, { method: 'PUT', body: settings, token }),

  putBusinessInfo: (entityId: string, info: unknown, token?: string | null) =>
    graph(`${entityId}/agent_config/business_info`, { method: 'PUT', body: info, token, apiVersion: '1.0.0' }),

  createFaq: (entityId: string, faq: { question: string; answer: string }, token?: string | null) =>
    graph(`${entityId}/agent_config/faq`, { method: 'POST', body: faq, token, apiVersion: '1.0.0' }),

  createSkill: (entityId: string, agentId: string, skill: unknown, token?: string | null) =>
    graph(`${entityId}/agent_config/skills?agent_id=${encodeURIComponent(agentId)}`, { method: 'POST', body: skill, token }),

  createConnector: (entityId: string, connector: unknown, token?: string | null) =>
    graph(`${entityId}/agent_connectors`, { method: 'POST', body: connector, token }),

  createTool: (entityId: string, connectorId: string, tool: unknown, token?: string | null) =>
    graph(`${entityId}/agent_connectors/${connectorId}/tools`, { method: 'POST', body: tool, token }),

  listTools: (entityId: string, connectorId: string, token?: string | null) =>
    graph(`${entityId}/agent_connectors/${connectorId}/tools`, { token }),

  deleteTool: (entityId: string, connectorId: string, toolId: string, token?: string | null) =>
    graph(`${entityId}/agent_connectors/${connectorId}/tools/${toolId}`, { method: 'DELETE', token }),

  runTool: (entityId: string, connectorId: string, toolId: string, input: string, token?: string | null) =>
    graph(`${entityId}/agent_connectors/${connectorId}/tools/${toolId}/run`, { method: 'POST', body: { input }, token }),

  listConnectors: (entityId: string, token?: string | null) =>
    graph(`${entityId}/agent_connectors`, { token }),

  threadControl: (entityId: string, action: 'takeover' | 'release', to: string, token?: string | null) =>
    graph(`business/whatsapp/phone_numbers/${entityId}/thread_control`, {
      method: 'POST', body: { messaging_product: 'whatsapp', action, to }, token, apiVersion: '1.0.0',
    }),

  evalCases: (entityId: string, token?: string | null) =>
    graph(`${entityId}/agent-eval/cases`, { token, apiVersion: '1.0.0' }),

  runEval: (entityId: string, caseIds: string[], token?: string | null) =>
    graph(`${entityId}/agent-eval/run?eval_case_ids=${caseIds.join(',')}`, { method: 'POST', body: {}, token, apiVersion: '1.0.0' }),

  evalStatus: (entityId: string, jobId: string, token?: string | null) =>
    graph(`${entityId}/agent-eval/run?job_id=${jobId}`, { token }),
};

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
