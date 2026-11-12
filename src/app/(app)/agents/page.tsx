'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api, Badge, Card, Empty, Field, fmt, Modal, Skeleton, Status, useApi, useToast } from '@/components/ui';
import { IconBot, IconPlus, IconSearch, IconChevron, IconLayers } from '@/components/icons';
import type { Agent, PhoneNumber, Session } from '@/lib/types';

export default function AgentsPage() {
  const { data, loading, reload } = useApi<{ agents: Agent[] }>('/api/agents');
  const nums = useApi<{ numbers: PhoneNumber[] }>('/api/numbers');
  const ses = useApi<Session>('/api/session');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(false);
  const { push } = useToast();
  const router = useRouter();

  useEffect(() => { if (new URLSearchParams(window.location.search).get('new')) setOpen(true); }, []);

  const agents = useMemo(() => (data?.agents || []).filter((a) =>
    (filter === 'all' || a.status === filter) &&
    (a.name + a.description).toLowerCase().includes(q.toLowerCase())), [data, filter, q]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Business agents</h1>
          <p className="page-sub">Each agent is bound to one WhatsApp number and carries its own knowledge, skills, connector tools and rollout state.</p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => setOpen(true)}><IconPlus width={14} height={14} /> New agent</button>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div className="row chip" style={{ height: 30, minWidth: 260 }}>
          <IconSearch width={13} height={13} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search agents…" style={{ background: 'none', border: 0, outline: 'none', width: '100%', fontSize: 12 }} />
        </div>
        {['all', 'live', 'draft', 'in_review', 'paused'].map((f) => (
          <button key={f} className="btn btn-sm" style={{ background: filter === f ? 'var(--accent-tint)' : undefined, borderColor: filter === f ? 'var(--accent-line)' : undefined, color: filter === f ? 'var(--text)' : 'var(--muted)' }} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f.replace('_', ' ')} <span className="mono tiny dim">{f === 'all' ? data?.agents.length : data?.agents.filter((a) => a.status === f).length}</span>
          </button>
        ))}
        <span className="dim small" style={{ marginLeft: 'auto' }}>{agents.length} shown</span>
      </div>

      <Card>
        {loading ? <div style={{ padding: 16 }}><Skeleton h={160} /></div> : agents.length === 0 ? (
          <Empty icon={<IconBot width={16} height={16} />} title="No agents match" sub="Adjust filters or create a new agent." action={<button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>Create agent</button>} />
        ) : (
          <table className="tbl">
            <thead><tr><th>Agent</th><th>Status</th><th>Number</th><th>Knowledge</th><th className="right">Convs · 30d</th><th className="right">Resolution</th><th className="right">Health</th><th /></tr></thead>
            <tbody>
              {agents.map((a) => {
                const n = nums.data?.numbers.find((x) => x.id === a.phone_number_id);
                return (
                  <tr key={a.id} className="clickable" onClick={() => router.push(`/agents/${a.id}`)}>
                    <td>
                      <div className="row" style={{ gap: 9 }}>
                        <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--accent-tint)', border: '1px solid var(--accent-line)', display: 'grid', placeItems: 'center', color: 'var(--lime)' }}><IconBot width={15} height={15} /></span>
                        <div>
                          <div style={{ fontWeight: 550 }}>{a.name}</div>
                          <div className="tiny dim mono">v{a.version} · {a.connectors.reduce((s, c) => s + c.tools.length, 0)} tools</div>
                        </div>
                      </div>
                    </td>
                    <td><Status value={a.status} /></td>
                    <td className="mono small muted">{n?.display || <span className="dim">unassigned</span>}</td>
                    <td className="small muted">{a.faqs.length} FAQs · {a.skills.length} skills</td>
                    <td className="right mono">{fmt.num(a.metrics.conversations)}</td>
                    <td className="right mono">{a.metrics.resolution_rate ? `${a.metrics.resolution_rate}%` : '—'}</td>
                    <td className="right">
                      <div className="row" style={{ justifyContent: 'flex-end', gap: 7 }}>
                        <div className="bar" style={{ width: 42 }}><i style={{ width: `${a.health}%` }} /></div>
                        <span className="mono small">{a.health}</span>
                      </div>
                    </td>
                    <td className="right"><IconChevron width={13} height={13} style={{ color: 'var(--dim)' }} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <div className="grid g3" style={{ marginTop: 12 }}>
        <Card className="card-pad"><div className="mono tiny dim">TOTAL AGENTS</div><div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>{data?.agents.length || 0}</div></Card>
        <Card className="card-pad"><div className="mono tiny dim">CONNECTOR TOOLS</div><div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>{data?.agents.reduce((s, a) => s + a.connectors.reduce((x, c) => x + c.tools.length, 0), 0) || 0}</div></Card>
        <Card className="card-pad"><div className="mono tiny dim">FAQS IN LIBRARY</div><div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>{data?.agents.reduce((s, a) => s + a.faqs.length, 0) || 0}</div></Card>
      </div>

      <CreateAgent open={open} onClose={() => setOpen(false)} numbers={nums.data?.numbers || []} isAdmin={ses.data?.user.role === 'platform_admin'} tenants={ses.data?.tenants || []}
        onCreated={(a) => { setOpen(false); push('Agent created — continue with configuration.'); reload(); router.push(`/agents/${a.id}`); }} />
    </>
  );
}

function CreateAgent({ open, onClose, numbers, isAdmin, tenants, onCreated }: {
  open: boolean; onClose: () => void; numbers: PhoneNumber[]; isAdmin: boolean; tenants: { id: string; name: string }[]; onCreated: (a: Agent) => void;
}) {
  const [form, setForm] = useState({ name: '', description: '', tenant_id: tenants[0]?.id || '', phone_number_id: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!open) return null;
  const submit = async () => {
    setBusy(true); setErr('');
    try { const r = await api<{ agent: Agent }>('/api/agents', 'POST', form); onCreated(r.agent); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="New business agent" sub="Bind a WhatsApp number and start from an empty configuration or clone."
      onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !form.name} onClick={submit}>{busy ? 'Creating…' : 'Create agent'}</button></>}>
      <div className="stack">
        {isAdmin && (
          <Field label="Tenant" hint="Agents are always scoped to a single tenant.">
            <select className="select" value={form.tenant_id} onChange={(e) => setForm({ ...form, tenant_id: e.target.value, phone_number_id: '' })}>
              <option value="">Select tenant…</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Agent name"><input className="input" placeholder="e.g. Support — Hindi" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Description" hint="Shown to operators. Not sent to Meta."><textarea className="textarea" placeholder="What this agent handles…" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label="WhatsApp number" hint="Unassigned numbers can be bound later from the Numbers screen.">
          <select className="select" value={form.phone_number_id} onChange={(e) => setForm({ ...form, phone_number_id: e.target.value })}>
            <option value="">Assign later</option>
            {numbers.filter((n) => !n.agent_id).map((n) => <option key={n.id} value={n.id}>{n.display} · {n.status}</option>)}
          </select>
        </Field>
        {err && <div className="notice err">{err}</div>}
        <div className="notice info">A new agent starts in <b>draft</b> with rollout disabled. Publishing calls <span className="mono">PUT /agent_config/settings</span> with <span className="mono">rollout.enabled = true</span>.</div>
      </div>
    </Modal>
  );
}
