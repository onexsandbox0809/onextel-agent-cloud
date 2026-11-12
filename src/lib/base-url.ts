import type { NextRequest } from 'next/server';

/** Public origin behind the sandbox/proxy: prefer forwarded headers over the
 *  internal host, so redirects never point at localhost. */
export function publicUrl(req: Request, path = '/'): URL {
  const h = req.headers;
  const proto = h.get('x-forwarded-proto') || 'https';
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000';
  return new URL(path, `${proto}://${host}`);
}
