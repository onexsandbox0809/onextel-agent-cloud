import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { canWrite, forbidden, scopeOf } from '@/lib/session-util';
import { db, newId, recordAudit } from '@/lib/demo-db';
import { isDemo } from '@/lib/env';
import { sbInviteUser, sbUpdateUser, sbUser, sbUsers } from '@/lib/supabase-repo';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const scope = scopeOf(session);
  if (!isDemo()) return NextResponse.json({ users: await sbUsers(scope) });
  const users = db().users.filter((u) => (scope ? u.tenant_id === scope : true)).map(({ password, ...u }) => u);
  return NextResponse.json({ users });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canWrite(session)) return forbidden();
  const body = await req.json();
  if (!body.email) return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
  const tenant_id = session.user.role === 'platform_admin' ? body.tenant_id : session.user.tenant_id;
  const user = {
    id: newId('u'), tenant_id, name: body.name || body.email.split('@')[0], email: body.email,
    role: body.role || 'operator', status: 'invited' as const, last_active: new Date().toISOString(),
    avatar_hue: Math.floor(Math.random() * 360), password: 'demo1234',
  };
  if (isDemo()) { db().users.push(user); recordAudit(tenant_id || '', session.user.email, 'team.invite', user.email); }
  else { await sbInviteUser(user); recordAudit(tenant_id || '', session.user.email, 'team.invite', user.email); }
  const { password, ...safe } = user;
  return NextResponse.json({ user: safe }, { status: 201 });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canWrite(session)) return forbidden();
  const body = await req.json();
  const user = isDemo() ? db().users.find((u) => u.id === body.id) : await sbUser(body.id);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (session.user.role !== 'platform_admin' && user.tenant_id !== session.user.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (isDemo()) Object.assign(user, { role: body.role ?? user.role, status: body.status ?? user.status });
  else await sbUpdateUser(user.id, { role: body.role ?? user.role, status: body.status ?? user.status });
  const { password, ...safe } = user as any;
  return NextResponse.json({ user: safe });
}
