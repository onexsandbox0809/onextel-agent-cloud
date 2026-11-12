import { cookies } from 'next/headers';
import { findUser } from './demo-db';
import { isDemo } from './env';
import type { Session, User } from './types';
import { db } from './demo-db';

export const SESSION_COOKIE = 'mba_session';

export async function getSession(): Promise<Session | null> {
  if (isDemo()) {
    const jar = await cookies();
    const id = jar.get(SESSION_COOKIE)?.value;
    if (!id) return null;
    const u = findUser(id);
    if (!u) return null;
    const { password, ...user } = u;
    const tenants = db().tenants;
    return { user, tenant: user.tenant_id ? tenants.find((t) => t.id === user.tenant_id) || null : null, tenants, demo: true };
  }
  return supabaseSession();
}

export async function supabaseSession(): Promise<Session | null> {
  const { createServerSupabase } = await import('./supabase-server');
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (!profile) return null;
  const { data: tenants } = await supabase.from('tenants').select('*').order('name');
  const tenantList = (tenants || []) as Session['tenants'];
  const u: User = {
    id: user.id, tenant_id: profile.tenant_id, name: profile.name || user.email || 'User',
    email: user.email || '', role: profile.role, status: 'active', last_active: new Date().toISOString(), avatar_hue: profile.avatar_hue ?? 74,
  };
  return { user: u, tenant: tenantList.find((t) => t.id === u.tenant_id) || null, tenants: tenantList, demo: false };
}

export function canManageConfig(role: User['role']) {
  return role === 'platform_admin' || role === 'tenant_admin';
}
export function canOperate(role: User['role']) {
  return role !== 'viewer';
}
