'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApi, Card, Stat, Status, Badge, fmt, Empty, Skeleton } from '@/components/ui';
import { IconBot, IconPhone, IconInbox, IconPlus, IconRocket, IconShield, IconPlug, IconChevron, IconBolt } from '@/components/icons';
import type { DashboardData } from '@/lib/types';

export default function Dashboard() {
  const { data, loading } = useApi<DashboardData>('/api/dashboard');
  const router = useRouter();
  if (loading || !data) return <div className="stack">{[1, 2, 3].map((i) => <Skeleton key={i} h={110} />)}</div>;

  const { stats, agents, numbers, conversations, events, trend, session } = data;
  const max = Math.max(...trend.map((t) => t.conversations));
  const openConvs = conversations.filter((c) => c.status !== 'resolved');

  return (
    <>
      <div className="page-head">
        <div>
          <div className="mono tiny dim" style={{ letterSpacing: '.16em' }}>{session.tenant?.name.toUpperCase() || 'PLATFORM'} · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h1 className="page-title" style={{ marginTop: 6 }}>Good morning, {session.user.name.split(' ')[0]}.</h1>
          <p className="page-sub">
            {stats.live_agents} agents live across {stats.numbers} WhatsApp numbers — {fmt.num(stats.conversations_30d)} conversations handled in the last 30 days.
          </p>
        </div>
        <div className="actions">
          <Link href="/agents" className="btn"><IconBot width={14} height={14} /> All agents</Link>
          <Link href="/agents?new=1" className="btn btn-primary"><IconPlus width={14} height={14} /> New agent</Link>
        </div>
      </div>

      <div className="grid g5">
        <Stat label="Live agents" value={stats.live_agents} foot="of all configured" icon={<IconBot width={13} height={13} />} />
        <Stat label="Conversations · 30d" value={fmt.num(stats.conversations_30d)} delta={12.4} foot="vs previous" icon={<IconInbox width={13} height={13} />} />
        <Stat label="Resolution rate" value={`${stats.resolution_rate.toFixed(1)}%`} delta={2.1} foot="auto-resolved" icon={<IconBolt width={13} height={13} />} />
        <Stat label="Handoff rate" value={`${stats.handoff_rate.toFixed(1)}%`} delta={-1.3} foot="to human" icon={<IconShield width={13} height={13} />} />
        <Stat label="CSAT" value={stats.csat.toFixed(2)} delta={4.2} foot="out of 5.00" icon={<IconRocket width={13} height={13} />} />
      </div>

      <div className="split-2" style={{ marginTop: 12 }}>
        <Card>
          <div className="card-head">
            <div style={{ flex: 1 }}>
              <div className="card-title">Conversation volume</div>
              <div className="card-sub">Automated vs handed off · last 14 days</div>
            </div>
            <div className="row small">
              <span className="row" style={{ gap: 5 }}><i style={{ width: 7, height: 7, borderRadius: 2, background: 'var(--lime)' }} /> resolved</span>
              <span className="row" style={{ gap: 5 }}><i style={{ width: 7, height: 7, borderRadius: 2, background: 'var(--line-2)' }} /> handoff</span>
            </div>
          </div>
          <div style={{ padding: '18px 18px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 148 }}>
              {trend.map((t) => (
                <div key={t.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }} title={`${t.day}: ${t.conversations}`}>
                  <div style={{ height: Math.max(3, (t.handoffs / max) * 132), background: 'var(--line-2)', borderRadius: 3 }} />
                  <div style={{ height: Math.max(3, (t.resolved / max) * 132), background: 'linear-gradient(180deg,var(--accent-fill),color-mix(in srgb, var(--accent-fill) 52%, var(--accent)))', borderRadius: 3 }} />
                </div>
              ))}
            </div>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
              {trend.map((t, i) => (i % 3 === 0 || i === trend.length - 1) ? <span key={t.day} className="tiny dim mono">{t.day}</span> : null)}
            </div>
          </div>
        </Card>

        <Card>
          <div className="card-head"><div className="card-title">Number health</div><span className="badge live" style={{ marginLeft: 'auto' }}>META QUALITY</span></div>
          <div>
            {numbers.slice(0, 4).map((n) => (
              <div key={n.id} className="list-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="mono" style={{ fontSize: 12 }}>{n.display}</div>
                  <div className="tiny dim">{n.category} · {n.messaging_limit}</div>
                </div>
                <div style={{ width: 52, textAlign: 'right' }}>
                  <span className={`badge ${n.quality === 'green' ? 'live' : n.quality === 'yellow' ? 'warn' : 'danger'}`}>{n.quality}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: 12 }}><Link href="/numbers" className="btn btn-sm" style={{ width: '100%' }}>Manage numbers <IconChevron width={12} height={12} /></Link></div>
        </Card>
      </div>

      <div className="split-side" style={{ marginTop: 12 }}>
        <Card>
          <div className="card-head">
            <div style={{ flex: 1 }}><div className="card-title">Business agents</div><div className="card-sub">Tenant-scoped configuration and rollout state</div></div>
            <Link href="/agents" className="btn btn-sm">View all</Link>
          </div>
          <table className="tbl">
            <thead><tr><th>Agent</th><th>Status</th><th>Number</th><th className="right">Convs</th><th className="right">Health</th><th /></tr></thead>
            <tbody>
              {agents.map((a) => {
                const n = numbers.find((x) => x.id === a.phone_number_id);
                return (
                  <tr key={a.id} className="clickable" onClick={() => router.push(`/agents/${a.id}`)}>
                    <td>
                      <div style={{ fontWeight: 550 }}>{a.name}</div>
                      <div className="tiny dim mono">v{a.version} · {a.channel}</div>
                    </td>
                    <td><Status value={a.status} /></td>
                    <td className="mono small muted">{n?.display || '—'}</td>
                    <td className="right mono">{fmt.num(a.metrics.conversations)}</td>
                    <td className="right">
                      <div className="row" style={{ justifyContent: 'flex-end', gap: 7 }}>
                        <div className="bar" style={{ width: 46 }}><i style={{ width: `${a.health}%` }} /></div>
                        <span className="mono small">{a.health}</span>
                      </div>
                    </td>
                    <td className="right"><IconChevron width={13} height={13} style={{ color: 'var(--dim)' }} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <div className="stack">
          <Card>
            <div className="card-head"><div className="card-title">Needs attention</div><span className="badge warn">{openConvs.length} open</span></div>
            {openConvs.slice(0, 3).map((c) => (
              <div key={c.id} className="list-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5 }}>{c.customer}</div>
                  <div className="tiny dim" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 190 }}>{c.messages[c.messages.length - 1]?.text}</div>
                </div>
                <Status value={c.status} />
              </div>
            ))}
            <div style={{ padding: 12 }}><Link href="/inbox" className="btn btn-sm" style={{ width: '100%' }}>Open inbox</Link></div>
          </Card>
          <Card>
            <div className="card-head"><div className="card-title">Platform activity</div></div>
            <div style={{ padding: '6px 0' }}>
              {events.slice(0, 5).map((e) => (
                <div key={e.id} className="row" style={{ padding: '7px 16px', alignItems: 'flex-start', gap: 9 }}>
                  <span style={{ width: 5, height: 5, borderRadius: 9, background: e.severity === 'critical' ? 'var(--red)' : e.severity === 'warning' ? 'var(--amber)' : 'var(--lime)', marginTop: 6 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5 }}><span className="mono small" style={{ color: 'var(--muted)' }}>{e.action}</span> · {e.target}</div>
                    <div className="tiny dim">{e.actor} · {fmt.ago(e.at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="section-title">Platform building blocks</div>
      <div className="grid g4">
        {[
          { icon: <IconPhone width={15} height={15} />, t: 'Numbers & onboarding', s: `${numbers.length} numbers connected through Onextel`, href: '/numbers' },
          { icon: <IconPlug width={15} height={15} />, t: 'Connector tools', s: `${agents.reduce((s, a) => s + a.connectors.reduce((x, c) => x + c.tools.length, 0), 0)} tools mapped to your APIs`, href: '/agents' },
          { icon: <IconRocket width={15} height={15} />, t: 'Evaluation', s: 'Regression-test before every rollout', href: '/agents' },
          { icon: <IconShield width={15} height={15} />, t: 'Governance', s: 'RBAC, audit trail, tenant isolation', href: '/audit' },
        ].map((b) => (
          <Link key={b.t} href={b.href} className="card" style={{ padding: 15 }}>
            <div style={{ color: 'var(--lime)' }}>{b.icon}</div>
            <div style={{ fontWeight: 600, fontSize: 12.5, marginTop: 9 }}>{b.t}</div>
            <div className="tiny dim" style={{ marginTop: 3 }}>{b.s}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
