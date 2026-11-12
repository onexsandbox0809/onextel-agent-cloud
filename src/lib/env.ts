export const isDemo = () =>
  process.env.DEMO_MODE === 'on' ||
  (process.env.DEMO_MODE !== 'off' && !process.env.NEXT_PUBLIC_SUPABASE_URL);

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v25.0';
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';


/** Production safety: the Meta token must exist verbatim — no "Bearer " prefix,
 *  no quotes, no trailing whitespace. Vercel env changes require a redeploy. */
export function metaTokenInfo() {
  const raw = process.env.META_SYSTEM_USER_TOKEN ?? '';
  const problems: string[] = [];
  if (!raw) problems.push('META_SYSTEM_USER_TOKEN is not set on this deployment.');
  if (/^\s*bearer\s+/i.test(raw)) problems.push('META_SYSTEM_USER_TOKEN must NOT include the "Bearer " prefix — the app adds it.');
  if (/^["']|["']$/.test(raw.trim())) problems.push('META_SYSTEM_USER_TOKEN must not be wrapped in quotes.');
  if (raw !== raw.trim()) problems.push('META_SYSTEM_USER_TOKEN has leading or trailing whitespace.');
  if (raw && raw.trim().length < 40) problems.push(`Token looks too short (${raw.trim().length} chars) — Meta system user tokens are ~200+ characters.`);
  return { present: !!raw.trim(), length: raw.trim().length, problems, headerValue: raw.trim() ? `Bearer ${raw.trim()}` : null };
}
