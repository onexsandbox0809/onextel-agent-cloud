export const isDemo = () =>
  process.env.DEMO_MODE === 'on' ||
  (process.env.DEMO_MODE !== 'off' && !process.env.NEXT_PUBLIC_SUPABASE_URL);

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v25.0';
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
