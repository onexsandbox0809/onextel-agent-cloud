'use client';
import { useState } from 'react';
import { Card, fmt, Skeleton, Status, useApi, Badge } from '@/components/ui';
import { IconShield } from '@/components/icons';
import type { AdminOverview } from '@/lib/types';

export default function Audit() {
  const { data, loading } = useApi<AdminOverview>('/api/admin');
  const [q, setQ] = useState('');
  const [sev, setSev] = useState('all');
  if (loading || !data) return <Skeleton h={420} />;
  const events = (data.events || []).filter((e) => (sev === 'all' || e.severity === sev) && (e.actor + e.action + e.target).toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="page-head">
        <div><h1 className="page-title">Audit log</h1><p className="page-sub">Every privileged action is append-only: configuration changes, publishes, credential rotations and thread takeovers.</p></div>
        <div className="actions"><span className="chip">Retention · 400 days</span></div>
      </div>

      <div className="row" style={{ marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
        <input className="input" style={{ maxWidth: 320 }} placeholder="Search actor, action or target…" value={q} onChange={(e) => setQ(e.target.value)} />
        {['all', 'critical', 'warning', 'info'].map((s) => (
          <button key={s} className="btn btn-sm" style={{ background: sev === s ? 'var(--accent-tint)' : undefined, borderColor: sev === s ? 'var(--accent-line)' : undefined, color: sev === s ? 'var(--text)' : 'var(--muted)' }} onClick={() => setSev(s)}>{s}</button>
        ))}
        <span className="small dim" style={{ marginLeft: 'auto' }}>{events.length} events</span>
      </div>

      <Card>
        <table className="tbl">
          <thead><tr><th>Severity</th><th>Action</th><th>Target</th><th>Actor</th><th>IP</th><th className="right">When</th></tr></thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td><Badge kind={e.severity === 'critical' ? 'danger' : e.severity === 'warning' ? 'warn' : 'info'}>{e.severity}</Badge></td>
                <td className="mono small">{e.action}</td>
                <td className="small">{e.target}</td>
                <td className="small muted">{e.actor}</td>
                <td className="mono tiny dim">{e.ip}</td>
                <td className="right small muted">{fmt.ago(e.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="notice ok" style={{ marginTop: 12 }}><IconShield width={13} height={13} style={{ verticalAlign: -2, marginRight: 6 }} />Postgres row-level security enforces tenant isolation; this log is written by the API layer with the acting user and request IP.</div>
    </>
  );
}
