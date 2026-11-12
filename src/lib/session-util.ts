import { NextResponse } from 'next/server';
import { getSession } from './auth';
import type { Session } from './types';

export async function requireSession(): Promise<{ session: Session } | { error: NextResponse }> {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  return { session };
}

export function forbidden() {
  return NextResponse.json({ error: 'Your role cannot perform this action.' }, { status: 403 });
}

export function scopeOf(session: Session): string | null {
  return session.user.role === 'platform_admin' ? null : session.user.tenant_id;
}

export function canWrite(session: Session) {
  return session.user.role !== 'viewer';
}
