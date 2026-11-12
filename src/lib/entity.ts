import type { Agent, PhoneNumber } from './types';
import { db } from './demo-db';
import { isDemo } from './env';
import { sbAgent, sbAgents, sbNumber, sbNumbers, sbUpdateAgent } from './supabase-repo';

const PN_RE = /^\d{10,20}$/;

/**
 * Resolve the phone number ID to use in every /{phone-number-id}/... call.
 *
 * agent.entity_id is a denormalised copy that goes stale whenever the number's
 * Meta phone number ID is corrected later (the "Fix IDs" flow), or when the
 * agent was created before the number had a real ID. Always prefer the number
 * actually bound to the agent.
 */
export async function resolveEntityId(agent: Agent): Promise<string> {
  const ids: string[] = [];
  if (agent.entity_id && PN_RE.test(agent.entity_id)) ids.push(agent.entity_id);

  let bound: PhoneNumber | undefined | null;
  try {
    if (isDemo()) {
      const all = db().numbers;
      bound = all.find((n) => n.agent_id === agent.id)
        || all.find((n) => n.id === agent.phone_number_id)
        || all.find((n) => n.wa_phone_number_id === agent.entity_id);
    } else {
      if (agent.phone_number_id) bound = await sbNumber(agent.phone_number_id);
      if (!bound?.wa_phone_number_id) {
        const list = await sbNumbers(agent.tenant_id);
        bound = list.find((n) => n.agent_id === agent.id) || list.find((n) => n.wa_phone_number_id === agent.entity_id);
      }
    }
  } catch { /* fall through to the stored value */ }

  if (bound?.wa_phone_number_id && PN_RE.test(bound.wa_phone_number_id)) return bound.wa_phone_number_id;
  return agent.entity_id;
}

/**
 * Resolve the entity id AND say whether it came from a number actually bound to
 * this agent. An unbound agent has no legitimate phone number ID - showing the
 * seed's random value is worse than showing nothing.
 */
export async function resolveEntity(agent: Agent): Promise<{ entityId: string; bound: PhoneNumber | null }> {
  let bound: PhoneNumber | null | undefined;
  try {
    if (isDemo()) {
      const all = db().numbers;
      bound = all.find((n) => n.agent_id === agent.id)
        || all.find((n) => n.id === agent.phone_number_id)
        || all.find((n) => n.wa_phone_number_id === agent.entity_id)
        || null;
    } else {
      if (agent.phone_number_id) bound = await sbNumber(agent.phone_number_id);
      if (!bound?.wa_phone_number_id) {
        const list = await sbNumbers(agent.tenant_id);
        bound = list.find((n) => n.agent_id === agent.id)
          || list.find((n) => n.wa_phone_number_id === agent.entity_id)
          || null;
      }
    }
  } catch { bound = null; }

  const id = bound?.wa_phone_number_id && PN_RE.test(bound.wa_phone_number_id)
    ? bound.wa_phone_number_id
    : agent.entity_id;
  return { entityId: id, bound: bound || null };
}

/** Persist a corrected entity_id so every screen and every later call agrees. */
export async function syncEntityId(agent: Agent, entityId?: string): Promise<string> {
  if (!entityId) {
    const r = await resolveEntity(agent);
    if (!r.bound) return agent.entity_id;          // unbound: nothing trustworthy to sync
    if (r.entityId !== agent.entity_id) {
      agent.entity_id = r.entityId;
      if (isDemo()) Object.assign(agent, { entity_id: r.entityId });
      else await sbUpdateAgent(agent.id, { entity_id: r.entityId } as Partial<Agent>);
    }
    return r.entityId;
  }
  const id = entityId;
  if (id && id !== agent.entity_id) {
    agent.entity_id = id;
    if (isDemo()) Object.assign(agent, { entity_id: id });
    else await sbUpdateAgent(agent.id, { entity_id: id } as Partial<Agent>);
  }
  return id;
}

/** When a number's phone number ID changes, every agent bound to it must follow. */
export async function propagateNumberId(tenantId: string, numberId: string, waPhoneNumberId: string) {
  if (!PN_RE.test(waPhoneNumberId)) return;
  if (isDemo()) {
    const d = db();
    d.agents.filter((a) => a.phone_number_id === numberId || a.entity_id === numberId)
      .forEach((a) => { a.entity_id = waPhoneNumberId; });
    return;
  }
  const agents = await sbAgents(tenantId);
  await Promise.all(
    agents.filter((a) => a.phone_number_id === numberId || a.entity_id === numberId)
      .map((a) => sbUpdateAgent(a.id, { entity_id: waPhoneNumberId } as Partial<Agent>)),
  );
}
