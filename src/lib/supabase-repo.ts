import type { Agent, AuditEvent, Conversation, EvalCase, PhoneNumber, Tenant, User } from './types';
import { serviceSupabase } from './supabase-server';

/** Supabase-backed repository. Agent configuration is stored as JSONB documents
 *  so a full agent (settings, FAQs, skills, connectors, tools) round-trips atomically. */
export async function sbAgents(tenantId: string | null): Promise<Agent[]> {
  const sb = serviceSupabase();
  let q = sb.from('agents').select('*').order('created_at', { ascending: false });
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).map(rowToAgent);
}

export async function sbAgent(id: string): Promise<Agent | null> {
  const sb = serviceSupabase();
  const { data } = await sb.from('agents').select('*').eq('id', id).maybeSingle();
  return data ? rowToAgent(data) : null;
}

export async function sbUpdateAgent(id: string, patch: Partial<Agent>) {
  const sb = serviceSupabase();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.settings) row.settings = patch.settings;
  if (patch.business_info) row.business_info = patch.business_info;
  if (patch.faqs) row.faqs = patch.faqs;
  if (patch.skills) row.skills = patch.skills;
  if (patch.connectors) row.connectors = patch.connectors;
  if (patch.version !== undefined) row.version = patch.version;
  if (patch.published_at !== undefined) row.published_at = patch.published_at;
  if (patch.meta_agent_id !== undefined) row.meta_agent_id = patch.meta_agent_id;
  const { error } = await sb.from('agents').update(row).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function sbInsertAgent(a: Agent) {
  const sb = serviceSupabase();
  const { error } = await sb.from('agents').insert(agentToRow(a));
  if (error) throw new Error(error.message);
}

export async function sbNumbers(tenantId: string | null): Promise<PhoneNumber[]> {
  const sb = serviceSupabase();
  let q = sb.from('phone_numbers').select('*').order('created_at', { ascending: true });
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { data } = await q;
  return (data || []) as PhoneNumber[];
}

export async function sbConversations(tenantId: string | null): Promise<Conversation[]> {
  const sb = serviceSupabase();
  let q = sb.from('conversations').select('*').order('updated_at', { ascending: false }).limit(50);
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { data } = await q;
  return (data || []) as Conversation[];
}

export async function sbAudit(tenantId: string | null, limit = 30): Promise<AuditEvent[]> {
  const sb = serviceSupabase();
  let q = sb.from('audit_logs').select('*').order('at', { ascending: false }).limit(limit);
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { data } = await q;
  return (data || []) as AuditEvent[];
}

export async function sbTenants(): Promise<Tenant[]> {
  const sb = serviceSupabase();
  const { data } = await sb.from('tenants').select('*').order('name');
  return (data || []) as Tenant[];
}

export async function sbUsers(tenantId: string | null): Promise<User[]> {
  const sb = serviceSupabase();
  let q = sb.from('profiles').select('id,tenant_id,name,email,role,status,last_active,avatar_hue');
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { data } = await q;
  return (data || []) as User[];
}

export async function sbEvals(agentId: string): Promise<EvalCase[]> {
  const sb = serviceSupabase();
  const { data } = await sb.from('eval_cases').select('*').eq('agent_id', agentId);
  return (data || []) as EvalCase[];
}

export async function sbAuditWrite(e: Omit<AuditEvent, 'id' | 'at'>) {
  const sb = serviceSupabase();
  await sb.from('audit_logs').insert({ ...e, at: new Date().toISOString() });
}

function rowToAgent(r: any): Agent {
  return {
    id: r.id, tenant_id: r.tenant_id, name: r.name, slug: r.slug, description: r.description || '',
    channel: 'whatsapp', status: r.status, entity_id: r.entity_id, meta_agent_id: r.meta_agent_id,
    phone_number_id: r.phone_number_id, version: r.version, health: r.health ?? 0,
    created_at: r.created_at, published_at: r.published_at,
    settings: r.settings, business_info: r.business_info, faqs: r.faqs || [],
    skills: r.skills || [], connectors: r.connectors || [],
    metrics: r.metrics || { conversations: 0, resolution_rate: 0, handoff_rate: 0, avg_handle_sec: 0, csat: 0 },
  };
}

function agentToRow(a: Agent) {
  return {
    id: a.id, tenant_id: a.tenant_id, name: a.name, slug: a.slug, description: a.description,
    status: a.status, entity_id: a.entity_id, meta_agent_id: a.meta_agent_id, phone_number_id: a.phone_number_id,
    version: a.version, health: a.health, created_at: a.created_at, published_at: a.published_at,
    settings: a.settings, business_info: a.business_info, faqs: a.faqs, skills: a.skills,
    connectors: a.connectors, metrics: a.metrics,
  };
}
