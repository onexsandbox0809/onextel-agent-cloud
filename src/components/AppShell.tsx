'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Session } from '@/lib/types';
import { Avatar } from './ui';
import {
  IconBell, IconBot, IconBuilding, IconChart, IconGrid, IconInbox, IconLayers, IconLogout,
  IconPhone, IconSearch, IconSettings, IconShield, IconUsers, IconChevron, IconSun, IconMoon,
} from './icons';

const nav = [
  { group: 'Workspace', items: [
    { href: '/dashboard', label: 'Overview', icon: IconGrid },
    { href: '/agents', label: 'Business agents', icon: IconBot },
    { href: '/numbers', label: 'Numbers', icon: IconPhone },
    { href: '/inbox', label: 'Conversations', icon: IconInbox },
    { href: '/analytics', label: 'Analytics', icon: IconChart },
  ]},
  { group: 'Organisation', items: [
    { href: '/team', label: 'Team & roles', icon: IconUsers },
    { href: '/settings', label: 'Settings & API keys', icon: IconSettings },
    { href: '/audit', label: 'Audit log', icon: IconShield },
  ]},
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [session, setSession] = useState<Session | null>(null);
  const [denied, setDenied] = useState(false);
  const isAdmin = session?.user.role === 'platform_admin';

  useEffect(() => {
    let alive = true;
    fetch('/api/session', { cache: 'force-cache' })
      .then(async (r) => {
        if (r.status === 401) { if (alive) setDenied(true); return null; }
        return r.json();
      })
      .then((d) => { if (alive && d) setSession(d); })
      .catch(() => { if (alive) setDenied(true); });
    return () => { alive = false; };
  }, []);

  useEffect(() => { if (denied) router.replace('/login'); }, [denied, router]);

  useEffect(() => {
    const current = (document.documentElement.dataset.theme as 'light' | 'dark') || 'light';
    setTheme(current);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('mba_theme', next); } catch {}
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="app">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">OX</div>
          <div>
            <div className="brand-name">Onextel Agent Cloud</div>
            <div className="brand-sub">Meta Business Agent</div>
          </div>
        </div>
        <nav className="nav">
          {nav.map((g) => (
            <div key={g.group}>
              <div className="nav-label">{g.group}</div>
              {g.items.map((it) => {
                const active = path === it.href || (it.href !== '/dashboard' && path.startsWith(it.href));
                return (
                  <Link key={it.href} href={it.href} className={`nav-item ${active ? 'active' : ''}`} onClick={() => setOpen(false)}>
                    <it.icon /> {it.label}
                  </Link>
                );
              })}
            </div>
          ))}
          {isAdmin && (
            <div>
              <div className="nav-label">Platform control</div>
              <Link href="/admin/tenants" className={`nav-item ${path.startsWith('/admin/tenants') ? 'active' : ''}`}>
                <IconBuilding /> Tenants
              </Link>
              <Link href="/admin/agents" className={`nav-item ${path.startsWith('/admin/agents') ? 'active' : ''}`}>
                <IconLayers /> All agents
              </Link>
            </div>
          )}
        </nav>
        <div className="sidebar-foot">
          <div className="plan-card">
            <div className="pc-top">
              <span className="mono tiny dim">CURRENT WORKSPACE</span>
              <span className={`badge ${session?.demo ? 'review' : 'live'}`} style={{ height: 17 }}>{session?.demo ? 'DEMO' : 'LIVE'}</span>
            </div>
            <div style={{ fontWeight: 600, fontSize: 12.5, marginTop: 6 }}>{session?.tenant?.name || 'Onextel Platform'}</div>
            <div className="tiny dim mono" style={{ marginTop: 2 }}>{session?.tenant ? `${session.tenant.plan.toUpperCase()} · ${session.tenant.region}` : 'ALL TENANTS'}</div>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost btn-sm" style={{ display: 'none' }} onClick={() => setOpen(!open)}>☰</button>
          <div className="crumb">
            <span className="dim">{isAdmin ? 'Platform' : session?.tenant?.name || 'Workspace'}</span>
            <span className="sep">/</span>
            <b>{nav.flatMap((g) => g.items).concat([{ href: '/admin/tenants', label: 'Tenants' }, { href: '/admin/agents', label: 'All agents' }] as any).find((i) => path.startsWith(i.href))?.label || 'Overview'}</b>
          </div>
          <div className="topbar-right">
            <div className="row chip" style={{ height: 28, paddingRight: 6 }}>
              <IconSearch width={13} height={13} />
              <span className="small dim">Search agents, numbers, PNR…</span>
              <span className="kbd">⌘K</span>
            </div>
            <button className="theme-btn" onClick={toggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>
              {theme === 'light' ? <IconMoon width={14} height={14} /> : <IconSun width={14} height={14} />}
            </button>
            <button className="btn btn-ghost btn-sm" aria-label="Notifications" style={{ position: 'relative' }}>
              <IconBell width={15} height={15} />
              <span style={{ position: 'absolute', top: 4, right: 5, width: 5, height: 5, borderRadius: 9, background: 'var(--lime)' }} />
            </button>
            <div style={{ position: 'relative' }}>
              <button className="row" style={{ background: 'none', border: 'none', padding: 0 }} onClick={() => setMenu(!menu)}>
                <Avatar name={session?.user.name || '··'} hue={session?.user.avatar_hue ?? 74} />
              </button>
              {menu && (
                <div className="card" style={{ position: 'absolute', right: 0, top: 36, width: 224, padding: 8, zIndex: 50 }}>
                  <div style={{ padding: '6px 8px 8px', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{session?.user.name}</div>
                    <div className="tiny dim mono">{session?.user.email}</div>
                    <div className="badge info" style={{ marginTop: 6 }}>{session?.user.role.replace(/_/g, ' ')}</div>
                  </div>
                  <Link href="/settings" className="nav-item" style={{ marginTop: 6 }}><IconSettings width={14} height={14} /> Settings</Link>
                  <Link href="/team" className="nav-item"><IconUsers width={14} height={14} /> Team</Link>
                  <button className="nav-item" style={{ width: '100%', background: 'none', border: 0 }} onClick={logout}>
                    <IconLogout width={14} height={14} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="content">
          {session ? children : (
            <div className="stack" style={{ gap: 14 }}>
              <div style={{ width: 240, height: 26, borderRadius: 7, background: 'var(--skel-a)' }} />
              <div className="grid g4">{[0, 1, 2, 3].map((i) => <div key={i} className="card" style={{ height: 92 }} />)}</div>
              <div className="card" style={{ height: 320 }} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
