import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { canWrite, forbidden, scopeOf } from '@/lib/session-util';
import { db, newId, nowIso, recordAudit } from '@/lib/demo-db';
import { isDemo, metaTokenInfo } from '@/lib/env';
import { sbCredentials, sbDeleteCredential, sbInsertCredential } from '@/lib/supabase-repo';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const scope = scopeOf(session);
  const list = isDemo()
    ? db().credentials.filter((c) => (scope ? c.tenant_id === scope : true))
    : await sbCredentials(scope);
  return NextResponse.json({ credentials: list, graphConfigured: metaTokenInfo().present });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canWrite(session)) return forbidden();
  const body = await req.json();
  if (!body.value) return NextResponse.json({ error: 'Secret value is required.' }, { status: 400 });
  const tenant_id = session.user.role === 'platform_admin' ? body.tenant_id : session.user.tenant_id;
  const secret = String(body.value);
  const cred = {
    id: newId('cr'), tenant_id, name: body.name || 'Untitled credential', kind: body.kind || 'graph_token',
    masked: `${secret.slice(0, 6)}${'•'.repeat(10)}${secret.slice(-3)}`, environment: body.environment || 'production',
    last_rotated: nowIso(), status: 'active' as const,
  };
  if (isDemo()) { db().credentials.push(cred); recordAudit(tenant_id || '', session.user.email, 'credential.create', cred.name, 'warning'); }
  else { await sbInsertCredential(cred); recordAudit(tenant_id || '', session.user.email, 'credential.create', cred.name, 'warning'); }
  return NextResponse.json({ credential: cred, note: 'Stored encrypted at rest in Supabase Vault in production. Never logged.' }, { status: 201 });
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canWrite(session)) return forbidden();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (isDemo()) {
    const d = db();
    d.credentials = d.credentials.filter((c) => c.id !== id);
  } else if (id) {
    await sbDeleteCredential(id);
  }
  return NextResponse.json({ ok: true });
}
