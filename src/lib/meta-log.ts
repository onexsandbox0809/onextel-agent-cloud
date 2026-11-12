import { createClient } from '@supabase/supabase-js';

/**
 * Meta API request log.
 *
 * Every call this app makes to Meta (graph.facebook.com or api.facebook.com) is
 * recorded here: method, full URL, headers (Authorization redacted), request
 * payload, response status, duration and response body. The same text is:
 *   1. kept in a process-local ring buffer (visible immediately in the UI), and
 *   2. appended to a daily .txt file in the Supabase Storage bucket `logs`,
 *      under meta-logs/YYYY-MM-DD.txt, so it survives serverless recycles.
 *
 * Tokens and PINs are redacted before they touch the log.
 */

export const LOG_BUCKET = 'logs';
const MAX_MEMORY_LINES = 4000;
const DAY = () => new Date().toISOString().slice(0, 10);
const FILE = () => `meta-logs/${DAY()}.txt`;

type Entry = {
  at: string;
  method: string;
  url: string;
  apiVersion?: string | null;
  reqHeaders: Record<string, string>;
  payload?: unknown;
  status?: number;
  ok?: boolean;
  ms?: number;
  response?: unknown;
  error?: string;
  context?: Record<string, unknown>;
};

const g = globalThis as any;
if (!g.__mba_meta_log) g.__mba_meta_log = { lines: [] as string[], day: DAY(), synced: 0, syncing: false, lastError: '' as string };
const store = g.__mba_meta_log as { lines: string[]; day: string; synced: number; syncing: boolean; lastError: string };

const redactValue = (k: string, v: unknown) => {
  const key = k.toLowerCase();
  if (/pin/.test(key)) return '******';
  if (/(token|secret|key|password|authorization)/.test(key)) return `****${String(v).slice(-4)}`;
  return v;
};

function redact(input: unknown, depth = 0): unknown {
  if (depth > 6 || input === null || input === undefined) return input;
  if (Array.isArray(input)) return input.slice(0, 50).map((x) => redact(x, depth + 1));
  if (typeof input === 'string') {
    return input.length > 1200 ? `${input.slice(0, 1200)}… (${input.length} chars)` : input;
  }
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) out[k] = redactValue(k, redact(v, depth + 1));
    return out;
  }
  return input;
}

const oneLine = (v: unknown, max = 900) => {
  let s: string;
  try { s = typeof v === 'string' ? v : JSON.stringify(v); } catch { s = String(v); }
  if (!s) return '(empty)';
  return s.length > max ? `${s.slice(0, max)}… [${s.length} chars]` : s;
}

export function formatEntry(e: Entry): string {
  const L: string[] = [];
  L.push(`${e.at}  ${e.method} ${e.url}`);
  if (e.context && Object.keys(e.context).length) {
    L.push(`  context: ${oneLine(redact(e.context), 400)}`);
  }
  const hdrs = Object.entries(e.reqHeaders || {}).map(([k, v]) => `${k}: ${v}`).join(' | ');
  if (hdrs) L.push(`  headers: ${hdrs}`);
  if (e.payload !== undefined) L.push(`  payload: ${oneLine(redact(e.payload))}`);
  if (e.status !== undefined) L.push(`  -> HTTP ${e.status} in ${e.ms ?? '?'}ms  ${e.ok ? 'OK' : 'FAIL'}${e.error ? ` — ${e.error}` : ''}`);
  else if (e.error) L.push(`  -> NOT SENT — ${e.error}`);
  if (e.response !== undefined) L.push(`  response: ${oneLine(redact(e.response), 1400)}`);
  L.push('');
  return L.join('\n');
}

function push(text: string) {
  if (store.day !== DAY()) { store.day = DAY(); store.lines = []; store.synced = 0; }
  store.lines.push(text);
  if (store.lines.length > MAX_MEMORY_LINES) store.lines.splice(0, store.lines.length - MAX_MEMORY_LINES);
  void syncToStorage();
}

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Append the in-memory day buffer to Storage. Best-effort: never throws at the caller. */
async function syncToStorage() {
  if (store.syncing) return;
  const sb = client();
  if (!sb) { store.lastError = 'Supabase not configured — log kept in memory for this instance only.'; return; }
  store.syncing = true;
  try {
    const path = FILE();
    let existing = '';
    const dl = await sb.storage.from(LOG_BUCKET).download(path);
    if (dl.data) existing = await dl.data.text();
    // Append only entries this instance has not written yet — never re-send the buffer.
    const pending = store.lines.slice(store.synced);
    if (!pending.length && existing) { store.syncing = false; return; }
    const body = `${existing}${existing && !existing.endsWith('\n') ? '\n' : ''}${pending.join('\n')}`.slice(-2_000_000);
    const up = await sb.storage.from(LOG_BUCKET).upload(path, new Blob([body], { type: 'text/plain' }), { upsert: true, contentType: 'text/plain' });
    if (up.error) {
      if (/not found|Bucket/i.test(up.error.message)) {
        await sb.storage.createBucket(LOG_BUCKET, { public: false }).catch(() => {});
        const retry = await sb.storage.from(LOG_BUCKET).upload(path, new Blob([body], { type: 'text/plain' }), { upsert: true, contentType: 'text/plain' });
        store.lastError = retry.error?.message || '';
        if (!retry.error) store.synced = store.lines.length;
      } else store.lastError = up.error.message;
    } else { store.lastError = ''; store.synced = store.lines.length; }
  } catch (e) {
    store.lastError = e instanceof Error ? e.message : String(e);
  } finally {
    store.syncing = false;
  }
}

export function logMetaCall(e: Omit<Entry, 'at'> & { at?: string }) {
  push(formatEntry({ ...e, at: e.at || new Date().toISOString() }));
}

export function memoryLog(): string {
  return store.lines.join('\n');
}

export function logStatus() {
  return {
    bucket: LOG_BUCKET,
    file: FILE(),
    entries: store.lines.length,
    storage: client() ? (store.lastError ? `error: ${store.lastError}` : 'ok') : 'not configured',
    lastError: store.lastError || null,
  };
}

/** Full log text: Storage copy (survives recycles) + anything newer in memory. */
export async function fullLog(day?: string): Promise<{ text: string; file: string; storage: string }> {
  const sb = client();
  const path = `meta-logs/${day || DAY()}.txt`;
  let stored = '';
  let state = 'not configured';
  if (sb) {
    const dl = await sb.storage.from(LOG_BUCKET).download(path);
    if (dl.data) { stored = await dl.data.text(); state = 'ok'; }
    else state = dl.error?.message || 'no file yet';
  }
  const mem = day && day !== DAY() ? '' : memoryLog();
  const text = [stored.trim(), mem.trim()].filter(Boolean).join('\n');
  return { text: text || '', file: path, storage: state };
}
