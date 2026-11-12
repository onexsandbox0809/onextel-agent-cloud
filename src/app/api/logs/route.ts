import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { fullLog, logStatus } from '@/lib/meta-log';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const day = url.searchParams.get('day') || undefined;
  const { text, file, storage } = await fullLog(day || undefined);

  // Daily text file the user can keep next to a bug report.
  if (url.searchParams.get('download')) {
    const body = text || 'No Meta API calls have been recorded yet.\n';
    return new NextResponse(`# Onextel Agent Cloud — Meta API request log\n# file: ${file}\n# generated: ${new Date().toISOString()}\n# actor: ${session.user.email}\n\n${body}`, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="meta-api-log-${file.split('/').pop()}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.json({ file, storage, status: logStatus(), text, lines: text ? text.trim().split('\n').length : 0 });
}
