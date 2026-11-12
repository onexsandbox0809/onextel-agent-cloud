'use client';
import { useState } from 'react';
import { api, Badge, Card, Field, fmt, Modal, Skeleton, Status, useApi, useToast } from '@/components/ui';
import { IconKey, IconPlus, IconShield, IconTrash, IconPlug } from '@/components/icons';
import type { ApiCredential, Session } from '@/lib/types';

export default function Settings() {
  const ses = useApi<Session>('/api/session');
  const creds = useApi<{ credentials: ApiCredential[]; graphConfigured: boolean }>('/api/credentials');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', kind: 'graph_token', value: '', environment: 'production', tenant_id: '' });
  const { push } = useToast();
  const logs = useApi<{ file: string; storage: string; text: string; status: any; lines: number }>('/api/logs');
  if (ses.loading || !ses.data) return <Skeleton h={420} />;
  const t = ses.data.tenant;

  const add = async () => {
    try { await api('/api/credentials', 'POST', { ...form, tenant_id: form.tenant_id || ses.data?.user.tenant_id }); push('Credential stored. It is never shown again.'); setOpen(false); creds.reload(); }
    catch (e) { push(e instanceof Error ? e.message : 'Failed', true); }
  };
  const del = async (id: string) => {
    await api(`/api/credentials?id=${id}`, 'DELETE'); push('Credential revoked.'); creds.reload();
  };

  return (
    <>
      <div className="page-head"><div><h1 className="page-title">Settings & API keys</h1><p className="page-sub">Workspace identity, Meta app wiring, credential vault and webhook configuration.</p></div></div>

      <div className="split-2">
        <div className="stack">
          <Card>
            <div className="card-head">
              <div className="card-title">Meta API request log</div>
              <span className="badge info" style={{ marginLeft: 'auto' }}>{logs.data?.storage === 'ok' ? 'STORAGE · logs' : 'MEMORY ONLY'}</span>
            </div>
            <div style={{ padding: '0 18px 14px' }}>
              <div className="small muted">
                Every call to <span className="mono tiny">graph.facebook.com</span> / <span className="mono tiny">api.facebook.com</span> is recorded with its exact URL,
                headers (token redacted), payload, status and response. Stored as a daily <span className="mono tiny">.txt</span> in the Supabase Storage
                bucket <span className="mono tiny">logs</span> so it survives restarts.
              </div>
              <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <a className="btn btn-primary btn-sm" href="/api/logs?download=1" download>Download log (.txt)</a>
                <button className="btn btn-sm" onClick={() => logs.reload()}>Refresh</button>
                <span className="mono tiny dim">{logs.data?.file || '—'} · {logs.data?.lines || 0} lines</span>
              </div>
              {logs.data?.text ? (
                <pre className="mono" style={{ marginTop: 10, maxHeight: 320, overflow: 'auto', background: 'var(--panel-2)', border: '1px solid var(--line)', padding: 10, fontSize: 11, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
{logs.data.text.trim().split('\n').slice(-60).join('\n')}
                </pre>
              ) : (
                <div className="tiny dim" style={{ marginTop: 10 }}>No Meta calls recorded yet. Register a number and this fills in.</div>
              )}
            </div>
          </Card>
          <Card>
            <div className="card-head"><div className="card-title">Workspace</div><span className="badge info" style={{ marginLeft: 'auto' }}>{t?.plan.toUpperCase() || 'PLATFORM'}</span></div>
            <div className="card-pad grid g2">
              <Field label="Workspace name"><input className="input" defaultValue={t?.name || 'Onextel Platform'} /></Field>
              <Field label="Region"><input className="input" defaultValue={t?.region || 'Global'} /></Field>
              <Field label="Meta Business ID"><input className="input mono" defaultValue={t?.meta_business_id || ''} /></Field>
              <Field label="Billing email"><input className="input" defaultValue={t?.billing_email || ''} /></Field>
              <Field label="Plan"><input className="input" defaultValue={t?.plan || 'enterprise'} disabled /></Field>
              <Field label="Seats"><input className="input" defaultValue={t?.seats || 25} disabled /></Field>
            </div>
            <div style={{ padding: '0 18px 16px' }}><button className="btn">Save workspace</button></div>
          </Card>

          <Card>
            <div className="card-head"><div className="card-title">Credential vault</div><span className="small dim" style={{ marginLeft: 'auto' }}>encrypted at rest · never logged</span></div>
            <table className="tbl">
              <thead><tr><th>Name</th><th>Kind</th><th>Value</th><th>Environment</th><th>Rotated</th><th className="right" /></tr></thead>
              <tbody>
                {creds.data?.credentials.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontSize: 12.5 }}>{c.name}</td>
                    <td><span className="badge purple">{c.kind.replace('_', ' ')}</span></td>
                    <td className="mono small dim">{c.masked}</td>
                    <td><Status value={c.status} /></td>
                    <td className="small muted">{fmt.ago(c.last_rotated)}</td>
                    <td className="right"><button className="btn btn-ghost btn-sm" onClick={() => del(c.id)}><IconTrash width={12} height={12} /></button></td>
                  </tr>
                ))}
                {creds.data?.credentials.length === 0 && <tr><td colSpan={6} className="empty">No credentials stored for this workspace.</td></tr>}
              </tbody>
            </table>
            <div style={{ padding: 12 }}><button className="btn btn-sm" onClick={() => setOpen(true)}><IconPlus width={12} height={12} /> Add credential</button></div>
          </Card>

          <Card>
            <div className="card-head"><div className="card-title">Webhook endpoint</div><Badge kind={creds.data?.graphConfigured ? 'live' : 'warn'}>{creds.data?.graphConfigured ? 'GRAPH TOKEN DETECTED' : 'NO PLATFORM TOKEN'}</Badge></div>
            <div className="card-pad stack">
              <Field label="Callback URL" hint="Add this in Meta App Dashboard → WhatsApp → Configuration"><input className="input mono" readOnly value="https://your-app.vercel.app/api/webhook" /></Field>
              <Field label="Verify token" hint="Must match META_VERIFY_TOKEN in Vercel"><input className="input mono" readOnly value="change-me-webhook-verify-token" /></Field>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {['messages', 'message_template_status_update', 'phone_number_quality_update', 'account_update'].map((f) => <span key={f} className="chip mono">{f}</span>)}
              </div>
              <div className="notice info">The handler verifies <span className="mono">hub.challenge</span>, persists every event and maps it to the owning agent by phone number ID.</div>
            </div>
          </Card>
        </div>

        <div className="stack">
          <Card className="card-pad">
            <div className="row" style={{ gap: 8, color: 'var(--lime)' }}><IconKey width={14} height={14} /><span style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--text)' }}>Meta app wiring</span></div>
            <div className="stack" style={{ marginTop: 10, gap: 8 }}>
              {[['App ID', process.env.NEXT_PUBLIC_META_APP_ID || 'not set'], ['Graph version', 'v25.0'], ['Permissions', 'whatsapp_business_messaging'], ['Business verification', 'verified']].map(([k, v]) => (
                <div key={k} className="spread"><span className="small dim">{k}</span><span className="mono tiny">{v}</span></div>
              ))}
            </div>
          </Card>
          <Card className="card-pad">
            <div className="row" style={{ gap: 8, color: 'var(--lime)' }}><IconPlug width={14} height={14} /><span style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--text)' }}>Onextel provisioning</span></div>
            <p className="small muted" style={{ marginTop: 8, lineHeight: 1.6 }}>Numbers are provisioned through Onextel and registered with Meta Cloud API. Store the Onextel key above; it is used only for provisioning calls, never for messaging.</p>
            <div className="badge live" style={{ marginTop: 8 }}>CONNECTED</div>
          </Card>
          <Card className="card-pad">
            <div className="row" style={{ gap: 8, color: 'var(--red)' }}><IconShield width={14} height={14} /><span style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--text)' }}>Danger zone</span></div>
            <p className="small muted" style={{ marginTop: 8 }}>Suspending a workspace immediately disables rollout on all of its agents and revokes API keys.</p>
            <button className="btn btn-danger btn-sm" style={{ marginTop: 10 }}>Suspend workspace</button>
          </Card>
          <div className="notice">Rotate the Meta token every 60 days. Expiring credentials appear on the dashboard’s attention list.</div>
        </div>
      </div>

      {open && (
        <Modal title="Add credential" sub="Write-only. The value is encrypted and never returned by the API." onClose={() => setOpen(false)}
          footer={<><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={add} disabled={!form.value || !form.name}>Store securely</button></>}>
          <div className="stack">
            <Field label="Name"><input className="input" placeholder="Meta system user token" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Kind"><select className="select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="graph_token">Meta Graph token</option><option value="onextel_key">Onextel key</option><option value="connector_secret">Connector secret</option><option value="webhook_secret">Webhook secret</option>
            </select></Field>
            <Field label="Secret value"><input className="input mono" type="password" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></Field>
            <Field label="Environment"><select className="select" value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value })}><option>production</option><option>sandbox</option></select></Field>
            {ses.data.user.role === 'platform_admin' && <Field label="Tenant"><select className="select" value={form.tenant_id} onChange={(e) => setForm({ ...form, tenant_id: e.target.value })}><option value="">Platform</option>{ses.data.tenants.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>}
          </div>
        </Modal>
      )}
    </>
  );
}
