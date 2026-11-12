import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = ['/login', '/signup', '/api/auth', '/api/webhook', '/api/health'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  const hasSession = req.cookies.has('mba_session') ||
    req.cookies.getAll().some((c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'));
  if (!hasSession && !pathname.startsWith('/api/')) {
    const proto = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '') || 'https';
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host;
    const url = new URL(`${proto}://${host}/login`);
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  if (!hasSession && pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'] };
