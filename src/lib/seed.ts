import raw from './seed-airindia.json';
import type {
  Agent, ApiCredential, AuditEvent, Connector, ConnectorTool, Conversation, EvalCase,
  PhoneNumber, Tenant, User, WebhookEvent,
} from './types';

const now = new Date('2026-11-06T09:00:00Z');
const iso = (daysAgo: number, hours = 0) =>
  new Date(now.getTime() - daysAgo * 864e5 - hours * 36e5).toISOString();

export const tenants: Tenant[] = [
  { id: 't_aix', name: 'Northwind Retail', slug: 'air-india-express', plan: 'enterprise', status: 'active', region: 'IN', meta_business_id: '102938475610293', billing_email: 'finops@northwind.example', created_at: iso(420), seats: 25, accent: '#E4572E' },
  { id: 't_bm', name: 'Brightmart Retail', slug: 'brightmart', plan: 'scale', status: 'active', region: 'IN', meta_business_id: '208374651029384', billing_email: 'ap@brightmart.example', created_at: iso(310), seats: 12, accent: '#7C8CF8' },
  { id: 't_nt', name: 'Contoso Travel Group', slug: 'nexa-travel', plan: 'growth', status: 'trial', region: 'AE', meta_business_id: '301928374650192', billing_email: 'ops@contoso.example', created_at: iso(96), seats: 6, accent: '#3FBF8F' },
  { id: 't_hm', name: 'HealthMart Clinics', slug: 'healthmart', plan: 'growth', status: 'suspended', region: 'IN', meta_business_id: '409182736450192', billing_email: 'it@healthmart.in', created_at: iso(210), seats: 4, accent: '#D97757' },
];

export const users: (User & { password: string })[] = [
  { id: 'u_admin', tenant_id: null, name: 'Aditya Rao', email: 'admin@onextel.io', role: 'platform_admin', status: 'active', last_active: iso(0, 1), avatar_hue: 74, password: 'demo1234' },
  { id: 'u_ops', tenant_id: null, name: 'Meera Iyer', email: 'ops@onextel.io', role: 'platform_admin', status: 'active', last_active: iso(0, 3), avatar_hue: 210, password: 'demo1234' },
  { id: 'u_aix', tenant_id: 't_aix', name: 'Priya Menon', email: 'priya@northwind.example', role: 'tenant_admin', status: 'active', last_active: iso(0, 2), avatar_hue: 18, password: 'demo1234' },
  { id: 'u_aix2', tenant_id: 't_aix', name: 'Rahul Bhargava', email: 'rahul@northwind.example', role: 'operator', status: 'active', last_active: iso(1, 4), avatar_hue: 280, password: 'demo1234' },
  { id: 'u_aix3', tenant_id: 't_aix', name: 'Sana Qureshi', email: 'sana@northwind.example', role: 'viewer', status: 'invited', last_active: iso(9), avatar_hue: 140, password: 'demo1234' },
  { id: 'u_bm', tenant_id: 't_bm', name: 'Vikram Shah', email: 'vikram@brightmart.example', role: 'tenant_admin', status: 'active', last_active: iso(0, 6), avatar_hue: 250, password: 'demo1234' },
  { id: 'u_nt', tenant_id: 't_nt', name: 'Layla Hassan', email: 'layla@contoso.example', role: 'tenant_admin', status: 'active', last_active: iso(2), avatar_hue: 160, password: 'demo1234' },
];

const faqCategories = ['Booking', 'Booking', 'Booking', 'Manage', 'Manage', 'Manage', 'Booking', 'Cancellation', 'Offers', 'Pricing', 'Loyalty', 'Loyalty', 'Loyalty', 'Check-in', 'Check-in', 'Check-in', 'Travel', 'Baggage', 'Manage', 'Support'];

export function makeAirIndiaAgent(): Agent {
  const connectorDef: any = raw.connector;
  const tools: ConnectorTool[] = (raw.tools as any[]).map((t, i) => {
    const rd = t.request_definition || {};
    const qp = rd.query_parameters ? Object.entries(rd.query_parameters).map(([name, v]: any) => ({ name, type: v.type || 'string', description: v.description || '', required: !!v.required })) : [];
    const pp = rd.path_parameters ? Object.entries(rd.path_parameters).map(([name, v]: any) => ({ name, type: v.type || 'string', description: v.description || '', required: !!v.required })) : [];
    const bp = rd.body?.params ? Object.entries(rd.body.params).map(([name, v]: any) => ({ name, type: v.type || 'string', description: v.description || '', required: !!v.required })) : [];
    return {
      id: `tool_aix_${i}`,
      connector_id: 'con_aix',
      name: t.name,
      description: t.description,
      method: rd.method || 'GET',
      path: (rd.path || '/').replace('{flight_id}', '{flight_id}').replace('{pnr}', '{pnr}'),
      path_params: pp, query_params: qp, body_params: bp,
      user_auth_required: !!t.user_auth_required,
      enabled: true,
      last_run_at: iso(i % 4, i),
      last_status: i === 8 ? 'error' : 'ok',
      test_input: i === 0 ? '{}' : i === 3 ? '{"pnr":"AIXQ7T2M","lastName":"Bhargava"}' : '{"origin":"DEL","destination":"CCM","departureDate":"2026-12-14"}',
    };
  });

  const connector: Connector = {
    id: 'con_aix', agent_id: 'a_aix', name: connectorDef?.name || 'orders_api_connector',
    description: connectorDef?.description || '', base_url: connectorDef?.base_url || 'https://orders-api.example.com',
    auth_type: (connectorDef?.auth_type as any) || 'NONE', requires_certificate: false, status: 'active',
    secret_ref: null, synced_at: iso(0, 5), tools,
  };

  return {
    id: 'a_aix', tenant_id: 't_aix', name: 'Northwind Retail Concierge', slug: 'aix-concierge',
    description: 'Order lookup, delivery tracking, returns, cancellations and loyalty balance on WhatsApp.',
    channel: 'whatsapp', status: 'live', entity_id: '109876543210987', meta_agent_id: '771209384756102',
    phone_number_id: 'pn_aix_1', version: 7, health: 94, created_at: iso(180), published_at: iso(2),
    settings: raw.settings as any || { rollout: { enabled: true }, handoff: { enabled: true, message: '' }, followup: { enabled: true, message: '' }, ai_audience: 'EVERYONE' },
    business_info: raw.business_info as any,
    faqs: (raw.faqs as any[]).map((f, i) => ({ id: `faq_${i}`, question: f.question, answer: f.answer, category: faqCategories[i] || 'General', updated_at: iso(14 - (i % 9)) })),
    skills: (raw.skills as any[]).map((s, i) => ({ id: `sk_${i}`, title: s.title, description: s.description, skill: s.skill, enabled: true, updated_at: iso(10 - (i % 7)) })),
    connectors: [connector],
    metrics: { conversations: 18432, resolution_rate: 86.4, handoff_rate: 13.6, avg_handle_sec: 74, csat: 4.6 },
  };
}

export const agents: Agent[] = [
  makeAirIndiaAgent(),
  {
    ...makeAirIndiaAgent(),
    id: 'a_aix_hi', tenant_id: 't_aix', name: 'Support — Hindi', slug: 'aix-hindi',
    description: 'Hindi-first support agent for orders, delivery status and returns. Awaiting evaluation sign-off.',
    status: 'in_review', entity_id: '109876543210988', meta_agent_id: '771209384756188',
    phone_number_id: 'pn_aix_2', version: 2, health: 81, created_at: iso(42), published_at: iso(8),
    settings: { ...makeAirIndiaAgent().settings, rollout: { enabled: false } },
    metrics: { conversations: 1240, resolution_rate: 78.2, handoff_rate: 21.8, avg_handle_sec: 96, csat: 4.2 },
  },
  {
    ...makeAirIndiaAgent(),
    id: 'a_bm', tenant_id: 't_bm', name: 'Brightmart Order Desk', slug: 'brightmart-orders',
    description: 'Order status, returns, exchange and store-locator agent for Brightmart Retail.',
    status: 'live', entity_id: '209384756102938', meta_agent_id: '771209384756233',
    phone_number_id: 'pn_bm_1', version: 4, health: 89, created_at: iso(140), published_at: iso(6),
    metrics: { conversations: 7310, resolution_rate: 91.1, handoff_rate: 8.9, avg_handle_sec: 61, csat: 4.5 },
    faqs: makeAirIndiaAgent().faqs.slice(0, 6).map((f, i) => ({ ...f, id: `bm_faq_${i}`, question: ['Where is my order?', 'How do I return an item?', 'What is the exchange window?', 'Do you deliver on Sundays?', 'How do I use a coupon?', 'Where is my nearest store?'][i], answer: 'Live answer sourced from the Brightmart order API and knowledge base.', category: 'Orders' })),
    skills: makeAirIndiaAgent().skills.slice(0, 5).map((s, i) => ({ ...s, id: `bm_sk_${i}` })),
  },
  {
    ...makeAirIndiaAgent(),
    id: 'a_nt', tenant_id: 't_nt', name: 'Nexa Visa Assistant', slug: 'nexa-visa',
    description: 'Visa requirement lookup and appointment booking for UAE outbound travellers. Draft.',
    status: 'draft', entity_id: '309182736450192', meta_agent_id: null,
    phone_number_id: 'pn_nt_1', version: 1, health: 62, created_at: iso(21), published_at: null,
    settings: { ...makeAirIndiaAgent().settings, rollout: { enabled: false } },
    metrics: { conversations: 0, resolution_rate: 0, handoff_rate: 0, avg_handle_sec: 0, csat: 0 },
  },
];

export const numbers: PhoneNumber[] = [
  { id: 'pn_aix_1', tenant_id: 't_aix', agent_id: 'a_aix', display: '+91 63600 12345', wa_phone_number_id: '109876543210987', waba_id: '778899001122334', provider: 'onextel', provider_ref: 'ONX-WA-88121', status: 'active', quality: 'green', messaging_limit: '100K / 24h', country: 'IN', category: 'AIRLINE', registered_at: iso(178), two_step_pin_set: true },
  { id: 'pn_aix_2', tenant_id: 't_aix', agent_id: 'a_aix_hi', display: '+91 63600 12346', wa_phone_number_id: '109876543210988', waba_id: '778899001122334', provider: 'onextel', provider_ref: 'ONX-WA-88122', status: 'active', quality: 'yellow', messaging_limit: '10K / 24h', country: 'IN', category: 'AIRLINE', registered_at: iso(40), two_step_pin_set: true },
  { id: 'pn_bm_1', tenant_id: 't_bm', agent_id: 'a_bm', display: '+91 80471 00220', wa_phone_number_id: '209384756102938', waba_id: '889900112233445', provider: 'onextel', provider_ref: 'ONX-WA-90233', status: 'active', quality: 'green', messaging_limit: '100K / 24h', country: 'IN', category: 'RETAIL', registered_at: iso(138), two_step_pin_set: true },
  { id: 'pn_nt_1', tenant_id: 't_nt', agent_id: 'a_nt', display: '+971 4 555 0192', wa_phone_number_id: '309182736450192', waba_id: '990011223344556', provider: 'onextel', provider_ref: 'ONX-WA-91555', status: 'pending_registration', quality: 'green', messaging_limit: '1K / 24h', country: 'AE', category: 'TRAVEL', registered_at: null, two_step_pin_set: false },
];

const cust = ['Aarav Sharma', 'Fatima Noor', 'Rohit Verma', 'Ananya Das', 'Karan Mehta', 'Zoya Khan', 'Dev Patel', 'Ishita Bose'];
export const conversations: Conversation[] = cust.map((c, i) => ({
  id: `cv_${i}`, tenant_id: i > 4 ? 't_bm' : 't_aix', agent_id: i > 4 ? 'a_bm' : 'a_aix',
  customer: c, handle: `+91 9${(800000000 + i * 137911).toString().slice(0, 9)}`,
  status: (['open', 'handoff', 'resolved', 'resolved', 'open', 'resolved', 'handoff', 'resolved'] as const)[i],
  csat: i % 3 === 0 ? null : 4 + (i % 2),
  updated_at: iso(0, i * 2), unread: i < 2 ? i + 1 : 0,
  messages: [
    { id: `m${i}a`, role: 'customer', text: 'Hi, I want to check the status of my booking AIXQ7T2M', at: iso(0, i * 2 + 4) },
    { id: `m${i}b`, role: 'agent', text: 'Happy to help. Let me pull that booking up for you.', at: iso(0, i * 2 + 4), tool: 'get_booking_by_pnr' },
    { id: `m${i}c`, role: 'agent', text: 'Your booking AIXQ7T2M is confirmed — DEL → CCU on 14 Dec, 1 adult, total ₹6,428. Web check-in opens 14 days before departure.', at: iso(0, i * 2 + 4) },
    ...(i === 1 || i === 6 ? [{ id: `m${i}d`, role: 'system' as const, text: 'Thread handed off to human agent — customer asked for a refund exception.', at: iso(0, i * 2 + 3) }] : []),
  ],
}));

export const credentials: ApiCredential[] = [
  { id: 'cr_1', tenant_id: 't_aix', name: 'Meta system user token', kind: 'graph_token', masked: 'EAAG••••••••••••4bZ', environment: 'production', last_rotated: iso(26), status: 'active' },
  { id: 'cr_2', tenant_id: 't_aix', name: 'Onextel provisioning key', kind: 'onextel_key', masked: 'onx_live_••••••••9f2', environment: 'production', last_rotated: iso(61), status: 'expiring' },
  { id: 'cr_3', tenant_id: 't_aix', name: 'Booking API bearer', kind: 'connector_secret', masked: 'brk_••••••••1a7', environment: 'production', last_rotated: iso(12), status: 'active' },
  { id: 'cr_4', tenant_id: 't_bm', name: 'Meta system user token', kind: 'graph_token', masked: 'EAAG••••••••••••9kL', environment: 'production', last_rotated: iso(9), status: 'active' },
];

export const audit: AuditEvent[] = [
  { id: 'au_1', tenant_id: 't_aix', actor: 'priya@northwind.example', action: 'agent.publish', target: 'Northwind Retail Concierge v7', severity: 'critical', at: iso(0, 2), ip: '103.21.58.14' },
  { id: 'au_2', tenant_id: 't_aix', actor: 'rahul@northwind.example', action: 'faq.update', target: 'What is my baggage allowance?', severity: 'info', at: iso(0, 4), ip: '103.21.58.22' },
  { id: 'au_3', tenant_id: 't_bm', actor: 'vikram@brightmart.example', action: 'credential.rotate', target: 'Meta system user token', severity: 'warning', at: iso(1, 3), ip: '49.36.180.7' },
  { id: 'au_4', tenant_id: 't_nt', actor: 'system', action: 'number.registration_failed', target: '+971 4 555 0192', severity: 'critical', at: iso(1, 6), ip: '—' },
  { id: 'au_5', tenant_id: 't_aix', actor: 'admin@onextel.io', action: 'tenant.impersonate', target: 'Northwind Retail', severity: 'warning', at: iso(2, 1), ip: '157.48.22.90' },
  { id: 'au_6', tenant_id: 't_aix', actor: 'priya@northwind.example', action: 'connector.tool.run', target: 'cancel_booking', severity: 'info', at: iso(2, 5), ip: '103.21.58.14' },
];

export const evals: EvalCase[] = [
  { id: 'ev_1', agent_id: 'a_aix', name: 'Create an order with delivery details', category: 'Booking', input: 'Order 2 large blue t-shirts to pin 560001', expected: 'create_order with items and address, returns an order ID', last_result: 'pass', last_run_at: iso(1) },
  { id: 'ev_2', agent_id: 'a_aix', name: 'Order lookup requires an order ID', category: 'Safety', input: 'Show me my order', expected: 'Agent asks for the order ID instead of guessing', last_result: 'pass', last_run_at: iso(1) },
  { id: 'ev_3', agent_id: 'a_aix', name: 'Refund eligibility for non-refundable fare', category: 'Cancellation', input: 'Cancel AIXQ7T2M and refund my money now', expected: 'Explains fare rules and offers cancellation, no refund promise', last_result: 'fail', last_run_at: iso(1) },
  { id: 'ev_4', agent_id: 'a_aix', name: 'Handoff on abusive language', category: 'Handoff', input: 'This is ridiculous, get me a human', expected: 'Thread control release + handoff message', last_result: 'pass', last_run_at: iso(1) },
  { id: 'ev_5', agent_id: 'a_aix', name: 'Web check-in outside window', category: 'Check-in', input: 'Check me in for tomorrow 6am flight', expected: 'Explains check-in window and offers airport counter', last_result: 'not_run', last_run_at: null },
  { id: 'ev_6', agent_id: 'a_aix', name: 'Never quote fare without tool', category: 'Pricing', input: 'How much is Delhi to Goa next Friday?', expected: 'Calls search_flights before quoting a fare', last_result: 'pass', last_run_at: iso(1) },
];

export const webhooks: WebhookEvent[] = [
  { id: 'wh_1', tenant_id: 't_aix', agent_id: 'a_aix', type: 'messages', status: 'processed', at: iso(0, 0), latency_ms: 212, payload: {} },
  { id: 'wh_2', tenant_id: 't_aix', agent_id: 'a_aix', type: 'message_template_status_update', status: 'processed', at: iso(0, 1), latency_ms: 188, payload: {} },
  { id: 'wh_3', tenant_id: 't_nt', agent_id: 'a_nt', type: 'phone_number_quality_update', status: 'retrying', at: iso(0, 2), latency_ms: 3021, payload: {} },
  { id: 'wh_4', tenant_id: 't_bm', agent_id: 'a_bm', type: 'messages', status: 'failed', at: iso(1), latency_ms: 0, payload: {} },
];

export const trend = Array.from({ length: 14 }).map((_, i) => {
  const d = new Date(now.getTime() - (13 - i) * 864e5);
  const base = 620 + Math.round(Math.sin(i / 2) * 90) + i * 14;
  return {
    day: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' }),
    conversations: base,
    resolved: Math.round(base * 0.86),
    handoffs: Math.round(base * 0.14),
  };
});
