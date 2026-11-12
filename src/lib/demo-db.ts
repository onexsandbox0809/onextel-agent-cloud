import { agents as seedAgents, audit, conversations, credentials, evals, numbers, tenants, users, webhooks, trend } from './seed';
import type { Agent, ApiCredential, AuditEvent, Conversation, EvalCase, PhoneNumber, Tenant, User, WebhookEvent } from './types';

type Store = {
  agents: Agent[]; tenants: Tenant[]; numbers: PhoneNumber[]; conversations: Conversation[];
  users: (User & { password: string })[]; credentials: ApiCredential[]; audit: AuditEvent[];
  evals: EvalCase[]; webhooks: WebhookEvent[];
};

const g = globalThis as unknown as { __mba?: Store };

export function db(): Store {
  if (!g.__mba) {
    g.__mba = {
      agents: structuredClone(seedAgents),
      tenants: structuredClone(tenants),
      numbers: structuredClone(numbers),
      conversations: structuredClone(conversations),
      users: structuredClone(users),
      credentials: structuredClone(credentials),
      audit: structuredClone(audit),
      evals: structuredClone(evals),
      webhooks: structuredClone(webhooks),
    };
  }
  return g.__mba;
}

export const trendData = trend;
export const newId = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
export const nowIso = () => new Date().toISOString();

export function recordAudit(tenant_id: string, actor: string, action: string, target: string, severity: AuditEvent['severity'] = 'info') {
  db().audit.unshift({ id: newId('au'), tenant_id, actor, action, target, severity, at: nowIso(), ip: '103.21.58.14' });
}

export function scopedAgents(tenantId: string | null) {
  const d = db();
  return tenantId ? d.agents.filter((a) => a.tenant_id === tenantId) : d.agents;
}

export function getAgent(id: string): Agent | undefined {
  return db().agents.find((a) => a.id === id);
}

export function findUserByEmail(email: string) {
  return db().users.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

export function findUser(id: string) {
  return db().users.find((u) => u.id === id);
}

export function blendAgent(body: Partial<Agent> & { name: string; tenant_id: string }): Agent {
  const base: Agent = {
    id: newId('a'), tenant_id: body.tenant_id, name: body.name, slug: body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40),
    description: body.description || '', channel: 'whatsapp', status: 'draft',
    entity_id: String(Math.floor(1e14 + Math.random() * 8e14)), meta_agent_id: null, phone_number_id: body.phone_number_id || null,
    version: 1, health: 0, created_at: nowIso(), published_at: null,
    settings: {
      rollout: { enabled: false },
      handoff: { enabled: true, message: 'Let me connect you with a human specialist who can help further.' },
      followup: { enabled: true, message: 'Still here whenever you need anything else.' },
      ai_audience: 'EVERYONE',
    },
    business_info: {
      business_description: body.business_info?.business_description || '',
      payment_method: '', return_policy: '', purchase_info: '', delivery_and_shipping: '', loyalty_program: '',
      contact_info: { email: '', hours_of_operation: '', address: '' },
    },
    faqs: [], skills: [], connectors: [],
    metrics: { conversations: 0, resolution_rate: 0, handoff_rate: 0, avg_handle_sec: 0, csat: 0 },
  };
  return { ...base, ...body, settings: { ...base.settings, ...(body.settings || {}) } } as Agent;
}
