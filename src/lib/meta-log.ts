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
const IST_OFFSET_MIN = 330; // +05:30

/** India Standard Time, ISO-8601 with an explicit +05:30 offset. */
export function istIso(d: Date = new Date()): string {
  const t = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return `${t.toISOString().slice(0, 23)}+05:30`;
}

const istDay = (d: Date = new Date()) =>
  new Date(d.getTime() + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10);

const DAY = () => istDay();
const FILE = () => `meta-logs/${DAY()}.txt`;
const CHANNEL_FILE = (c: string) => `meta-logs/${DAY()}-${c}.txt`;

export type Channel = 'register' | 'onboarding' | 'faq' | 'skills' | 'connectors' | 'rollout' | 'eval' | 'thread' | 'other';

/** Classify a call by its Graph path — that's what the operator wants to see separated. */
export function channelOf(url: string): Channel {
  const u = url.toLowerCase();
  if (/agent_config\/faq/.test(u)) return 'faq';
  if (/agent_config\/skills/.test(u)) return 'skills';
  if (/agent_connectors/.test(u)) return 'connectors';
  if (/agent_config\/settings/.test(u)) return 'rollout';
  if (/agent_config\/business_info/.test(u)) return 'other';
  if (/agent-eval/.test(u)) return 'eval';
  if (/thread_control/.test(u)) return 'thread';
  if (/agent_onboarding/.test(u)) return 'onboarding';
  if (/\/register/.test(u)) return 'register';
  return 'other';
}

export const CHANNELS: Channel[] = ['register', 'onboarding', 'faq', 'skills', 'connectors', 'rollout', 'eval', 'thread', 'other'];

type Entry = {
  at: string;
  channel?: Channel;
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
  const ch = e.channel || channelOf(e.url);
  L.push(`[${ch}] ${e.at}  ${e.method} ${e.url}`);
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

const buf = g.__mba_meta_log as any;
if (!buf.channelLines) buf.channelLines = {} as Record<string, string[]>;
const channelBuffers = buf.channelLines as Record<string, string[]>;

function push(text: string, channel?: Channel, raw?: string) {
  if (store.day !== DAY()) { store.day = DAY(); store.lines = []; store.synced = 0; }
  store.lines.push(text);
  if (store.lines.length > MAX_MEMORY_LINES) store.lines.splice(0, store.lines.length - MAX_MEMORY_LINES);
  const ch = channel || 'other';
  (channelBuffers[ch] ||= []).push(raw || text);
  if (channelBuffers[ch].length > 2000) channelBuffers[ch].splice(0, channelBuffers[ch].length - 2000);
  void syncToStorage(ch);
}

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Append the in-memory day buffer to Storage. Best-effort: never throws at the caller. */
async function syncToStorage(channel?: Channel) {
  if (store.syncing) return;
  const sb = client();
  if (!sb) { store.lastError = 'Supabase not configured — log kept in memory for this instance only.'; return; }
  store.syncing = true;
  try {
    const ch = channel || 'other';
    const path = CHANNEL_FILE(ch);
    let existing = '';
    const dl = await sb.storage.from(LOG_BUCKET).download(path);
    if (dl.data) existing = await dl.data.text();
    // Append only entries this instance has not written yet — never re-send the buffer.
    const pending = (channelBuffers[ch] || []);
    channelBuffers[ch] = [];
    if (!pending.length) { store.syncing = false; return; }
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

export function logMetaCall(e: Omit<Entry, 'at'> & { at?: string; channel?: Channel }) {
  const entry = { ...e, at: e.at || istIso() };
  const ch = e.channel || channelOf(e.url);
  push(formatEntry({ ...entry, channel: ch }), ch, formatEntry({ ...entry, channel: ch }));
}

export function memoryLog(): string {
  return store.lines.join('\n');
}

export function channelMemory(channel: Channel): string {
  return (channelBuffers[channel] || []).join('\n');
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
export async function channelLog(channel: Channel, day?: string): Promise<{ text: string; file: string; storage: string }> {
  const sb = client();
  const path = `meta-logs/${day || DAY()}-${channel}.txt`;
  let stored = '';
  let state = 'not configured';
  if (sb) {
    const dl = await sb.storage.from(LOG_BUCKET).download(path);
    if (dl.data) { stored = await dl.data.text(); state = 'ok'; }
    else state = dl.error?.message || 'no file yet';
  }
  const mem = day && day !== DAY() ? '' : channelMemory(channel);
  const text = [stored.trim(), mem.trim()].filter(Boolean).join('\n');
  return { text, file: path, storage: state };
}

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
