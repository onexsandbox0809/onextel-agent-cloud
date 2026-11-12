'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api, Badge, Card, Empty, Field, fmt, Modal, Skeleton, Status, useApi, useToast } from '@/components/ui';
import { IconPhone, IconPlus, IconShield, IconBolt } from '@/components/icons';
import type { Agent, PhoneNumber, Session } from '@/lib/types';

export default function NumbersPage() {
  const { data, loading, reload } = useApi<{ numbers: PhoneNumber[] }>('/api/numbers');
  const agents = useApi<{ agents: Agent[] }>('/api/agents');
  const ses = useApi<Session>('/api/session');
  const [add, setAdd] = useState(false);
  const [reg, setReg] = useState<PhoneNumber | null>(null);
  const [pin, setPin] = useState('123456');
  const [form, setForm] = useState({ display: '', country: 'IN', category: 'OTHER', wa_phone_number_id: '', waba_id: '', tenant_id: '' });
  const { push } = useToast();
  const isAdmin = ses.data?.user.role === 'platform_admin';

  const register = async () => {
    if (!reg) return;
    try {
      const r = await api<any>(`/api/numbers/${reg.id}`, 'PATCH', { action: 'register', pin });
      push(r.mode === 'graph' ? 'Number registered with Meta and onboarded.' : 'Registered in simulated mode — add a Meta token to call Graph.');
      setReg(null); reload();
    } catch (e) { push(e instanceof Error ? e.message : 'Failed', true); }
  };
  const create = async () => {
    try { await api('/api/numbers', 'POST', form); push('Number provisioned through Onextel — register it next.'); setAdd(false); reload(); }
    catch (e) { push(e instanceof Error ? e.message : 'Failed', true); }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Numbers</h1>
          <p className="page-sub">WhatsApp Business numbers provisioned through Onextel. Register a number with Meta, then bind it to exactly one agent.</p>
        </div>
        <div className="actions"><button className="btn btn-primary" onClick={() => setAdd(true)}><IconPlus width={14} height={14} /> Provision number</button></div>
      </div>

      <div className="grid g4" style={{ marginBottom: 12 }}>
        {[
          ['Numbers', data?.numbers.length || 0],
          ['Active', data?.numbers.filter((n) => n.status === 'active').length || 0],
          ['Pending registration', data?.numbers.filter((n) => n.status !== 'active').length || 0],
          ['Green quality', data?.numbers.filter((n) => n.quality === 'green').length || 0],
        ].map(([l, v]) => (
          <Card key={l as string} className="card-pad"><div className="mono tiny dim">{String(l).toUpperCase()}</div><div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{v as number}</div></Card>
        ))}
      </div>

      <Card>
        <div className="card-head"><div className="card-title">Connected numbers</div><span className="badge info" style={{ marginLeft: 'auto' }}>PROVIDER · ONEXTEL</span></div>
        {loading ? <div style={{ padding: 16 }}><Skeleton h={140} /></div> : (
          <table className="tbl">
            <thead><tr><th>Number</th><th>Status</th><th>Quality</th><th>Bound agent</th><th>Meta IDs</th><th>Provider ref</th><th className="right">Actions</th></tr></thead>
            <tbody>
              {data?.numbers.map((n) => {
                const agent = agents.data?.agents.find((a) => a.id === n.agent_id);
                return (
                  <tr key={n.id}>
                    <td><div className="mono" style={{ fontSize: 12.5 }}>{n.display}</div><div className="tiny dim">{n.country} · {n.category} · {n.messaging_limit}</div></td>
                    <td><Status value={n.status} /></td>
                    <td><Badge kind={n.quality === 'green' ? 'live' : n.quality === 'yellow' ? 'warn' : 'danger'}>{n.quality}</Badge></td>
                    <td>{agent ? <Link href={`/agents/${agent.id}`} style={{ fontSize: 12.5 }}>{agent.name}</Link> : <span className="dim small">unassigned</span>}</td>
                    <td className="mono tiny dim"><div>PN: {n.wa_phone_number_id}</div><div>WABA: {n.waba_id}</div></td>
                    <td className="mono small muted">{n.provider_ref}</td>
                    <td className="right">
                      <button className="btn btn-sm" onClick={() => setReg(n)}>{n.status === 'active' ? 'Re-register' : 'Register'}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <div className="grid g3" style={{ marginTop: 12 }}>
        <Card className="card-pad"><div className="row" style={{ gap: 8, color: 'var(--lime)' }}><IconShield width={14} height={14} /><span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>Two-step verification</span></div><div className="small muted" style={{ marginTop: 6 }}>Every live number needs a 6-digit PIN. Rotation is logged in the audit trail.</div></Card>
        <Card className="card-pad"><div className="row" style={{ gap: 8, color: 'var(--lime)' }}><IconBolt width={14} height={14} /><span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>Registration flow</span></div><div className="small muted" style={{ marginTop: 6 }}><span className="mono tiny">POST /{'{entity}'}/register</span> then <span className="mono tiny">POST /agent_onboarding?channel=whatsapp</span>.</div></Card>
        <Card className="card-pad"><div className="row" style={{ gap: 8, color: 'var(--lime)' }}><IconPhone width={14} height={14} /><span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>One agent per number</span></div><div className="small muted" style={{ marginTop: 6 }}>Meta blocks a number that already runs another AI agent — check eligibility before onboarding.</div></Card>
      </div>

      <Modal title="Provision a WhatsApp number" sub="Provisioned through Onextel, then registered with Meta." onClose={() => setAdd(false)}
        footer={<><button className="btn" onClick={() => setAdd(false)}>Cancel</button><button className="btn btn-primary" onClick={create} disabled={!form.display}>Provision</button></>}>
        <div className="stack">
          {isAdmin && <Field label="Tenant"><select className="select" value={form.tenant_id} onChange={(e) => setForm({ ...form, tenant_id: e.target.value })}><option value="">Select tenant…</option>{ses.data?.tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>}
          <Field label="Display number"><input className="input" placeholder="+91 63600 12345" value={form.display} onChange={(e) => setForm({ ...form, display: e.target.value })} /></Field>
          <div className="grid g2">
            <Field label="Country"><select className="select" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>{['IN', 'AE', 'SA', 'US', 'GB', 'SG'].map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Business category"><input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
          </div>
          <Field label="Phone number ID (Meta)" hint="Optional — generated if blank"><input className="input mono" value={form.wa_phone_number_id} onChange={(e) => setForm({ ...form, wa_phone_number_id: e.target.value })} /></Field>
          <Field label="WABA ID" hint="Optional — generated if blank"><input className="input mono" value={form.waba_id} onChange={(e) => setForm({ ...form, waba_id: e.target.value })} /></Field>
        </div>
      </Modal>

      {reg && (
        <Modal title={`Register ${reg.display}`} sub="Sets the two-step PIN and runs agent onboarding." onClose={() => setReg(null)}
          footer={<><button className="btn" onClick={() => setReg(null)}>Cancel</button><button className="btn btn-primary" onClick={register}>Register number</button></>}>
          <div className="stack">
            <Field label="6-digit two-step PIN"><input className="input mono" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} /></Field>
            <div className="code-block">{`POST /v25.0/${reg.wa_phone_number_id}/register
{ "messaging_product": "whatsapp", "pin": "${pin}" }

POST /${reg.wa_phone_number_id}/agent_onboarding?channel=whatsapp`}</div>
            <div className="notice">Registration is irreversible from this screen. Keep the PIN in your password manager.</div>
          </div>
        </Modal>
      )}
    </>
  );
}
