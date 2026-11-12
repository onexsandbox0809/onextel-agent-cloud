'use client';
import { Card, fmt, Skeleton, useApi } from '@/components/ui';
import type { DashboardData } from '@/lib/types';

export default function Analytics() {
  const { data, loading } = useApi<DashboardData>('/api/dashboard');
  if (loading || !data) return <Skeleton h={460} />;
  const { trend, stats, agents } = data;
  const max = Math.max(...trend.map((t) => t.conversations));
  const spend = trend.slice(-6).map((t) => ({ ...t, cost: Math.round(t.conversations * 0.42) }));
  return (
    <>
      <div className="page-head"><div><h1 className="page-title">Analytics</h1><p className="page-sub">Automation performance, deflection and messaging spend across every agent in scope.</p></div>
        <div className="actions"><span className="chip">Last 14 days</span><button className="btn btn-sm">Export CSV</button></div></div>

      <div className="grid g4">
        {[['Conversations', fmt.num(stats.conversations_30d), '+12.4%'], ['Auto-resolved', `${stats.resolution_rate.toFixed(1)}%`, '+2.1%'], ['Escalated', `${stats.handoff_rate.toFixed(1)}%`, '-1.3%'], ['CSAT', stats.csat.toFixed(2), '+4.2%']].map(([l, v, d]) => (
          <Card key={l} className="card-pad">
            <div className="mono tiny dim">{l.toUpperCase()}</div>
            <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.04em', marginTop: 5 }}>{v}</div>
            <div className={`tiny ${d.startsWith('-') ? 'delta-down' : 'delta-up'}`} style={{ marginTop: 5 }}>{d} vs previous period</div>
          </Card>
        ))}
      </div>

      <div className="split-2" style={{ marginTop: 12 }}>
        <Card>
          <div className="card-head"><div className="card-title">Volume by day</div></div>
          <div style={{ padding: 18 }}>
            <svg viewBox="0 0 560 190" style={{ width: '100%', height: 190 }}>
              {[0, 1, 2, 3].map((i) => <line key={i} x1="0" y1={i * 55 + 10} x2="560" y2={i * 55 + 10} stroke="#1D2420" strokeWidth="1" />)}
              {trend.map((t, i) => {
                const h = (t.conversations / max) * 160;
                return <rect key={t.day} x={i * 40 + 8} y={170 - h} width={26} height={h} rx="4" fill="url(#g)" />;
              })}
              <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent-fill)" /><stop offset="1" stopColor="var(--accent)" stopOpacity=".55" /></linearGradient></defs>
            </svg>
            <div className="row" style={{ justifyContent: 'space-between' }}><span className="tiny dim mono">{trend[0].day}</span><span className="tiny dim mono">{trend[trend.length - 1].day}</span></div>
          </div>
        </Card>
        <Card>
          <div className="card-head"><div className="card-title">Messaging spend</div><span className="badge live" style={{ marginLeft: 'auto' }}>ESTIMATE</span></div>
          <table className="tbl">
            <thead><tr><th>Period</th><th className="right">Conversations</th><th className="right">Cost</th></tr></thead>
            <tbody>{spend.map((s) => <tr key={s.day}><td className="small">{s.day}</td><td className="right mono small">{fmt.num(s.conversations)}</td><td className="right mono small">{fmt.inr(s.cost)}</td></tr>)}</tbody>
          </table>
          <div className="tiny dim" style={{ padding: '10px 16px' }}>Indicative WhatsApp conversation pricing at ₹0.42 per conversation. Reconciled against Meta billing in production.</div>
        </Card>
      </div>

      <div className="section-title">Agent performance</div>
      <Card>
        <table className="tbl">
          <thead><tr><th>Agent</th><th className="right">Conversations</th><th className="right">Resolution</th><th className="right">Handoff</th><th className="right">AHT</th><th className="right">CSAT</th><th style={{ width: 160 }}>Deflection</th></tr></thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id}>
                <td style={{ fontWeight: 550 }}>{a.name}<div className="tiny dim mono">v{a.version} · {a.status}</div></td>
                <td className="right mono small">{fmt.num(a.metrics.conversations)}</td>
                <td className="right mono small">{a.metrics.resolution_rate}%</td>
                <td className="right mono small">{a.metrics.handoff_rate}%</td>
                <td className="right mono small">{a.metrics.avg_handle_sec}s</td>
                <td className="right mono small">{a.metrics.csat || '—'}</td>
                <td><div className="bar"><i style={{ width: `${a.metrics.resolution_rate}%` }} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
