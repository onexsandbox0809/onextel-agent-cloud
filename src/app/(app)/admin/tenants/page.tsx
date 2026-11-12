'use client';
import Link from 'next/link';
import { Card, fmt, Skeleton, Status, useApi } from '@/components/ui';
import { IconBuilding, IconBot, IconPhone, IconInbox, IconRocket } from '@/components/icons';
import type { AdminOverview } from '@/lib/types';

export default function Tenants() {
  const { data, loading } = useApi<AdminOverview>('/api/admin');
  if (loading || !data) return <Skeleton h={460} />;
  const { totals, tenants } = data;
  return (
    <>
      <div className="page-head">
        <div><h1 className="page-title">Tenants</h1><p className="page-sub">Every workspace on Onextel Agent Cloud, with agent count, number footprint and platform health.</p></div>
        <div className="actions"><span className="chip">MRR · {fmt.inr(totals.mrr)}</span></div>
      </div>

      <div className="grid g5">
        {[['Tenants', totals.tenants, IconBuilding], ['Agents', totals.agents, IconBot], ['Numbers', totals.numbers, IconPhone], ['Conversations', totals.conversations, IconInbox], ['MRR', totals.mrr, IconRocket]].map(([l, v, I]: any) => (
          <Card key={l} className="card-pad">
            <div className="row" style={{ gap: 6, color: 'var(--dim)' }}><I width={12} height={12} /><span className="mono tiny">{l.toUpperCase()}</span></div>
            <div style={{ fontSize: 22, fontWeight: 600, marginTop: 5, letterSpacing: '-.04em' }}>{l === 'MRR' ? fmt.inr(v) : fmt.num(v)}</div>
          </Card>
        ))}
      </div>

      <div className="section-title">Workspaces</div>
      <div className="grid g2">
        {tenants.map((t) => (
          <Card key={t.id} className="card-pad">
            <div className="spread">
              <div className="row" style={{ gap: 10 }}>
                <span style={{ width: 34, height: 34, borderRadius: 9, background: `color-mix(in srgb, ${t.accent} 14%, var(--panel))`, border: `1px solid color-mix(in srgb, ${t.accent} 34%, transparent)`, color: `color-mix(in srgb, ${t.accent} 62%, var(--text))`, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 12 }}>{t.name.slice(0, 2).toUpperCase()}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</div>
                  <div className="tiny dim mono">{t.slug} · {t.region} · {t.plan}</div>
                </div>
              </div>
              <Status value={t.status} />
            </div>
            <div className="grid g4" style={{ marginTop: 14, gap: 8 }}>
              {[['Agents', t.agents], ['Numbers', t.numbers], ['Convs', fmt.num(t.conversations)], ['Health', t.health]].map(([k, v]) => (
                <div key={k as string}><div className="mono tiny dim">{k}</div><div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{v}</div></div>
              ))}
            </div>
            <div className="bar" style={{ marginTop: 12 }}><i style={{ width: `${t.health}%`, background: t.accent }} /></div>
            <div className="spread" style={{ marginTop: 12 }}>
              <span className="tiny dim">Business ID {t.meta_business_id}</span>
              <Link href={`/admin/agents?tenant=${t.id}`} className="btn btn-sm">View agents</Link>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
