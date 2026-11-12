'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api, Card, Field, fmt, Modal, Skeleton, Status, useApi, useToast } from '@/components/ui';
import { IconBuilding, IconBot, IconPhone, IconInbox, IconRocket, IconPlus } from '@/components/icons';
import type { AdminOverview, Tenant } from '@/lib/types';

const accents = ['#C9F45B', '#5BE3A6', '#7C9CF8', '#B49CF8', '#F0B45A', '#E4572E', '#3FBF8F', '#D97757'];

export default function Tenants() {
  const { data, loading, reload } = useApi<AdminOverview>('/api/admin');
  const [open, setOpen] = useState(false);
  const { push } = useToast();

  if (loading || !data) return <Skeleton h={460} />;
  const { totals, tenants } = data;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Tenants</h1>
          <p className="page-sub">Every workspace on Onextel Agent Cloud, with agent count, number footprint and platform health. Each tenant is isolated — its admins only ever see their own agents.</p>
        </div>
        <div className="actions">
          <span className="chip">MRR · {fmt.inr(totals.mrr)}</span>
          <button className="btn btn-primary" onClick={() => setOpen(true)}>
            <IconPlus width={14} height={14} /> New tenant
          </button>
        </div>
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
      {tenants.length === 0 ? (
        <Card>
          <div className="empty">
            <div className="icon"><IconBuilding width={16} height={16} /></div>
            <div style={{ color: 'var(--text)', fontWeight: 550 }}>No tenants yet</div>
            <div style={{ marginTop: 4 }}>Create your first workspace to start provisioning numbers and agents.</div>
            <div style={{ marginTop: 12 }}><button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>Create tenant</button></div>
          </div>
        </Card>
      ) : (
        <div className="grid g2">
          {tenants.map((t) => (
            <Card key={t.id} className="card-pad">
              <div className="spread">
                <div className="row" style={{ gap: 10 }}>
                  <span style={{ width: 34, height: 34, borderRadius: 9, background: `color-mix(in srgb, ${t.accent} 16%, var(--panel))`, border: `1px solid color-mix(in srgb, ${t.accent} 36%, transparent)`, color: `color-mix(in srgb, ${t.accent} 58%, var(--text))`, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 12 }}>
                    {t.name.slice(0, 2).toUpperCase()}
                  </span>
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
                <span className="tiny dim">{t.meta_business_id ? `Business ID ${t.meta_business_id}` : 'No Meta business linked'}</span>
                <Link href={`/admin/agents?tenant=${t.id}`} className="btn btn-sm">View agents</Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      {open && (
        <CreateTenant
          onClose={() => setOpen(false)}
          onCreated={(t, adminEmail) => {
            setOpen(false);
            push(`Tenant "${t.name}" created — ${adminEmail} can sign in now.`);
            reload();
          }}
        />
      )}
    </>
  );
}

function CreateTenant({ onClose, onCreated }: { onClose: () => void; onCreated: (t: Tenant, adminEmail: string) => void }) {
  const [form, setForm] = useState({
    name: '', slug: '', plan: 'growth', region: 'IN', seats: 5,
    meta_business_id: '', billing_email: '', accent: '#C9F45B', status: 'active',
    admin_name: '', admin_email: '', admin_password: '',
  });
  const [touchedSlug, setTouchedSlug] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const autoSlug = form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  const slug = touchedSlug ? form.slug : autoSlug;

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      if (!form.admin_email.trim()) throw new Error('Enter the email the tenant admin will sign in with.');
      if (form.admin_password.length < 8) throw new Error('Admin password must be at least 8 characters.');
      const r = await api<{ tenant: Tenant; admin: { email: string } }>('/api/admin', 'POST', { ...form, slug });
      onCreated(r.tenant, r.admin?.email || form.admin_email);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create tenant');
    } finally { setBusy(false); }
  };

  return (
    <Modal
      width={620}
      title="Create tenant"
      sub="A workspace is the isolation boundary — agents, numbers and credentials never cross it."
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy || form.name.trim().length < 2 || !form.admin_email.trim() || form.admin_password.length < 8}>
          {busy ? 'Creating…' : 'Create tenant'}
        </button>
      </>}
    >
      <div className="stack">
        <div className="grid g2">
          <Field label="Tenant name" hint="Customer-facing name">
            <input className="input" autoFocus value={form.name} placeholder="e.g. Onextel"
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Slug" hint="Lowercase, used in URLs and IDs">
            <input className="input mono" value={slug} placeholder="onextel"
              onChange={(e) => { setTouchedSlug(true); setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }); }} />
          </Field>
        </div>

        <div className="grid g3">
          <Field label="Plan">
            <select className="select" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
              <option value="growth">growth</option>
              <option value="scale">scale</option>
              <option value="enterprise">enterprise</option>
            </select>
          </Field>
          <Field label="Region" hint="ISO country code">
            <select className="select" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}>
              {['IN', 'AE', 'SA', 'US', 'GB', 'SG', 'BR', 'MX'].map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Seats">
            <input className="input" type="number" min={1} max={500} value={form.seats}
              onChange={(e) => setForm({ ...form, seats: Number(e.target.value) })} />
          </Field>
        </div>

        <div className="grid g2">
          <Field label="Meta Business ID" hint="Business Suite → Business settings">
            <input className="input mono" value={form.meta_business_id} placeholder="102938475610293"
              onChange={(e) => setForm({ ...form, meta_business_id: e.target.value })} />
          </Field>
          <Field label="Billing email">
            <input className="input" type="email" value={form.billing_email} placeholder="ap@company.com"
              onChange={(e) => setForm({ ...form, billing_email: e.target.value })} />
          </Field>
        </div>

        <Field label="Status">
          <select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="active">active</option>
            <option value="trial">trial</option>
          </select>
        </Field>

        <div className="section-title" style={{ margin: '6px 0 0' }}>Tenant admin login</div>
        <div className="grid g2">
          <Field label="Admin name">
            <input className="input" value={form.admin_name} placeholder="Puneet Bhargava"
              onChange={(e) => setForm({ ...form, admin_name: e.target.value })} />
          </Field>
          <Field label="Admin email" hint="Their sign-in username">
            <input className="input" type="email" value={form.admin_email} placeholder="owner@company.com"
              onChange={(e) => setForm({ ...form, admin_email: e.target.value })} />
          </Field>
        </div>
        <Field label="Admin password" hint="Minimum 8 characters — share it securely with the tenant">
          <input className="input" value={form.admin_password} placeholder="Welcome@123"
            onChange={(e) => setForm({ ...form, admin_password: e.target.value })} />
        </Field>

        <Field label="Accent colour" hint="Used for this tenant's chip and health bar">
          <div className="row" style={{ gap: 7, flexWrap: 'wrap' }}>
            {accents.map((c) => (
              <button key={c} type="button" aria-label={c} onClick={() => setForm({ ...form, accent: c })}
                style={{
                  width: 26, height: 26, borderRadius: 7, background: c,
                  border: form.accent === c ? '2px solid var(--text)' : '1px solid var(--line-2)',
                  boxShadow: form.accent === c ? '0 0 0 2px var(--panel) inset' : 'none',
                }} />
            ))}
          </div>
        </Field>

        {err && <div className="notice err">{err}</div>}
        <div className="notice info">
          The admin account is created with real sign-in credentials — the tenant can log in at <b>/login</b> immediately and configure
          their own numbers, agents and connectors. Provision a number under <b>Numbers</b> next; numbers require a tenant first.
        </div>
      </div>
    </Modal>
  );
}
