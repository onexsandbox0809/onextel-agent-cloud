'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Card, fmt, Skeleton, Status, useApi } from '@/components/ui';
import { IconChevron, IconLayers } from '@/components/icons';
import type { AdminOverview } from '@/lib/types';

export default function AllAgents() {
  const { data, loading } = useApi<AdminOverview>('/api/admin');
  const [q, setQ] = useState('');
  if (loading || !data) return <Skeleton h={440} />;
  const agents = data.agents.filter((a) => (a.name + a.tenant_name).toLowerCase().includes(q.toLowerCase()));
  const totalTools = agents.reduce((s, a) => s + a.connectors.reduce((x, c) => x + c.tools.length, 0), 0);

  return (
    <>
      <div className="page-head">
        <div><h1 className="page-title">All business agents</h1><p className="page-sub">Cross-tenant view for platform operations. Open any agent to inspect its configuration read-only or act as platform admin.</p></div>
        <div className="actions"><span className="chip">{agents.length} agents · {totalTools} tools</span></div>
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <input className="input" style={{ maxWidth: 320 }} placeholder="Search agent or tenant…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Card>
        <table className="tbl">
          <thead><tr><th>Agent</th><th>Tenant</th><th>Status</th><th>Channel</th><th>Knowledge</th><th className="right">Convs</th><th className="right">Health</th><th /></tr></thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id}>
                <td><Link href={`/agents/${a.id}`} style={{ fontWeight: 550, fontSize: 12.5 }}>{a.name}</Link><div className="tiny dim mono">v{a.version} · {a.entity_id}</div></td>
                <td className="small muted">{a.tenant_name}</td>
                <td><Status value={a.status} /></td>
                <td><span className="badge info">whatsapp</span></td>
                <td className="small muted">{a.faqs.length} FAQs · {a.skills.length} skills</td>
                <td className="right mono small">{fmt.num(a.metrics.conversations)}</td>
                <td className="right"><div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}><div className="bar" style={{ width: 40 }}><i style={{ width: `${a.health}%` }} /></div><span className="mono small">{a.health}</span></div></td>
                <td className="right"><Link href={`/agents/${a.id}`}><IconChevron width={13} height={13} style={{ color: 'var(--dim)' }} /></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="notice info" style={{ marginTop: 12 }}><IconLayers width={13} height={13} style={{ verticalAlign: -2, marginRight: 6 }} />Platform admins see every tenant’s agent. Tenant admins only ever see their own — enforced in the API layer and by Postgres RLS.</div>
    </>
  );
}
