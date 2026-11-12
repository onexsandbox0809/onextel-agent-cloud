import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { CHANNELS, channelLog, fullLog, istIso, logStatus, type Channel } from '@/lib/meta-log';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const day = url.searchParams.get('day') || undefined;
  const chan = url.searchParams.get('channel');
  const isChannel = chan && CHANNELS.includes(chan as Channel);
  const { text, file, storage } = isChannel
    ? await channelLog(chan as Channel, day || undefined)
    : await fullLog(day || undefined);

  // Daily text file the user can keep next to a bug report.
  if (url.searchParams.get('download')) {
    const body = text || 'No Meta API calls have been recorded yet.\n';
    const fname = file.split('/').pop() || 'log.txt';
    return new NextResponse(`# Onextel Agent Cloud — Meta API request log\n# file: ${file}\n# generated: ${istIso()} (IST)\n# actor: ${session.user.email}\n\n${body}`, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="meta-api-log-${fname.replace('.txt', '')}-IST.txt"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const perChannel: Record<string, number> = {};
  if (!isChannel) {
    for (const c of CHANNELS) {
      const r = await channelLog(c, day || undefined);
      perChannel[c] = r.text ? r.text.trim().split('\n').filter((l) => l.startsWith('[')).length : 0;
    }
  }
  return NextResponse.json({
    file, storage, channel: isChannel ? chan : 'all', channels: CHANNELS, perChannel,
    status: logStatus(), tz: 'IST (UTC+05:30)', text,
    lines: text ? text.trim().split('\n').length : 0,
  });
}
