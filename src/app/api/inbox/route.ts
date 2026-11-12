import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { scopeOf } from '@/lib/session-util';
import { db } from '@/lib/demo-db';
import { isDemo } from '@/lib/env';
import { sbConversations } from '@/lib/supabase-repo';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const scope = scopeOf(session);
  const conversations = isDemo() ? (scope ? db().conversations.filter((c) => c.tenant_id === scope) : db().conversations) : await sbConversations(scope);
  return NextResponse.json({ conversations });
}
