export type Role = 'platform_admin' | 'tenant_admin' | 'operator' | 'viewer';
export type AgentStatus = 'draft' | 'in_review' | 'live' | 'paused' | 'failed';
export type NumberStatus = 'provisioning' | 'pending_registration' | 'active' | 'suspended';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: 'growth' | 'scale' | 'enterprise';
  status: 'active' | 'trial' | 'suspended';
  region: string;
  meta_business_id: string;
  billing_email: string;
  created_at: string;
  seats: number;
  accent: string;
}

export interface User {
  id: string;
  tenant_id: string | null;
  name: string;
  email: string;
  role: Role;
  status: 'active' | 'invited' | 'disabled';
  last_active: string;
  avatar_hue: number;
}

export interface PhoneNumber {
  id: string;
  tenant_id: string;
  agent_id: string | null;
  display: string;
  wa_phone_number_id: string;
  waba_id: string;
  provider: 'onextel';
  provider_ref: string;
  status: NumberStatus;
  quality: 'green' | 'yellow' | 'red';
  messaging_limit: string;
  country: string;
  category: string;
  registered_at: string | null;
  two_step_pin_set: boolean;
}

export interface AgentSettings {
  rollout: { enabled: boolean };
  handoff: { enabled: boolean; message: string };
  followup: { enabled: boolean; message: string };
  ai_audience: 'EVERYONE' | 'CUSTOMERS_ONLY';
}

export interface BusinessInfo {
  business_description: string;
  payment_method: string;
  return_policy: string;
  purchase_info: string;
  delivery_and_shipping: string;
  loyalty_program: string;
  contact_info: { email: string; hours_of_operation: string; address: string };
}

export interface Faq { id: string; question: string; answer: string; category: string; updated_at: string }
export interface Skill {
  id: string; title: string; description: string; skill: string; enabled: boolean; updated_at: string;
}
export interface ConnectorTool {
  id: string; connector_id: string; name: string; description: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; path: string;
  path_params: Param[]; query_params: Param[]; body_params: Param[];
  user_auth_required: boolean; enabled: boolean; last_run_at: string | null; last_status: 'ok' | 'error' | null;
  test_input: string;
}
export interface Param { name: string; type: string; description: string; required: boolean }
export interface Connector {
  id: string; agent_id: string; name: string; description: string; base_url: string;
  auth_type: 'NONE' | 'API_KEY' | 'BEARER' | 'BASIC'; requires_certificate: boolean;
  status: 'active' | 'draft' | 'error'; secret_ref: string | null; synced_at: string | null;
  tools: ConnectorTool[];
}

export interface Agent {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  description: string;
  channel: 'whatsapp';
  status: AgentStatus;
  entity_id: string;
  meta_agent_id: string | null;
  phone_number_id: string | null;
  version: number;
  health: number;
  created_at: string;
  published_at: string | null;
  settings: AgentSettings;
  business_info: BusinessInfo;
  faqs: Faq[];
  skills: Skill[];
  connectors: Connector[];
  metrics: { conversations: number; resolution_rate: number; handoff_rate: number; avg_handle_sec: number; csat: number };
}

export interface EvalCase {
  id: string; agent_id: string; name: string; category: string;
  input: string; expected: string; last_result: 'pass' | 'fail' | 'not_run'; last_run_at: string | null;
}
export interface EvalRun {
  id: string; agent_id: string; job_id: string; status: 'queued' | 'running' | 'completed' | 'failed';
  score: number | null; cases_total: number; cases_passed: number; started_at: string;
}

export interface Message { id: string; role: 'customer' | 'agent' | 'human' | 'system'; text: string; at: string; tool?: string }
export interface Conversation {
  id: string; tenant_id: string; agent_id: string; customer: string; handle: string;
  status: 'open' | 'handoff' | 'resolved'; csat: number | null; updated_at: string; unread: number;
  messages: Message[];
}

export interface ApiCredential {
  id: string; tenant_id: string; name: string; kind: 'graph_token' | 'onextel_key' | 'connector_secret' | 'webhook_secret';
  masked: string; environment: 'production' | 'sandbox'; last_rotated: string; status: 'active' | 'expiring' | 'invalid';
}

export interface AuditEvent {
  id: string; tenant_id: string; actor: string; action: string; target: string;
  severity: 'info' | 'warning' | 'critical'; at: string; ip: string;
}

export interface WebhookEvent {
  id: string; tenant_id: string; agent_id: string; type: string; status: 'processed' | 'failed' | 'retrying';
  at: string; latency_ms: number; payload: unknown;
}

export interface Session { user: User; tenant: Tenant | null; tenants: Tenant[]; demo: boolean }

export interface DashboardData {
  session: Session;
  stats: { live_agents: number; numbers: number; conversations_30d: number; resolution_rate: number; handoff_rate: number; csat: number };
  agents: Agent[];
  numbers: PhoneNumber[];
  conversations: Conversation[];
  events: AuditEvent[];
  spend: { label: string; conversations: number; cost: number }[];
  trend: { day: string; conversations: number; resolved: number; handoffs: number }[];
}

export interface AdminOverview {
  tenants: (Tenant & { agents: number; numbers: number; conversations: number; mrr: number; health: number })[];
  totals: { tenants: number; agents: number; numbers: number; conversations: number; mrr: number };
  agents: (Agent & { tenant_name: string })[];
  events: AuditEvent[];
}
