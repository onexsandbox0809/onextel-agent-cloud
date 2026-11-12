'use client';
import AppShell from '@/components/AppShell';

/**
 * Client shell: session is resolved in the browser, so every page under
 * (app) prerenders to static HTML and is served from the CDN edge instead
 * of cold-starting a serverless function per navigation.
 * Route protection is enforced by middleware + the API layer.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
