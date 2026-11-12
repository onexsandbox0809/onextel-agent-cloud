import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { metaTokenInfo } from '@/lib/env';

/** Proves the token works against Meta instead of guessing. Calls GET /me. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ti = metaTokenInfo();
  const out: any = {
    token: { present: ti.present, length: ti.length, problems: ti.problems },
    graph: null,
    onboardingHost: process.env.META_API_BASE || 'https://api.facebook.com',
    graphHost: process.env.META_GRAPH_BASE || 'https://graph.facebook.com',
    appId: !!process.env.META_APP_ID,
    appSecret: !!process.env.META_APP_SECRET,
    verifyToken: !!process.env.META_VERIFY_TOKEN,
    deployHint: 'Vercel env changes only take effect on a NEW deployment — redeploy after editing.',
  };
  if (!ti.present || ti.problems.length) return NextResponse.json(out);

  const v = process.env.META_GRAPH_VERSION || 'v25.0';
  const started = Date.now();
  try {
    const res = await fetch(`${out.graphHost}/${v}/me?fields=id,name`, {
      headers: { Authorization: `Bearer ${ti.headerValue!.replace(/^Bearer\s+/i, '')}` },
      cache: 'no-store',
    });
    const body = await res.json().catch(() => null);
    out.graph = {
      ok: res.ok, status: res.status, ms: Date.now() - started,
      id: body?.id || null, name: body?.name || null,
      error: body?.error ? `${body.error.message} (code ${body.error.code})` : null,
    };
  } catch (e) {
    out.graph = { ok: false, status: 0, error: e instanceof Error ? e.message : 'network error' };
  }
  return NextResponse.json(out);
}
