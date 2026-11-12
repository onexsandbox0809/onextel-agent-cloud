'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, Badge, Card, Empty, Field, fmt, Skeleton, Status, useApi, useToast } from '@/components/ui';
import { IconPhone, IconPlus, IconShield, IconBolt, IconCheck, IconX, IconRefresh } from '@/components/icons';
import type { Agent, PhoneNumber, Session } from '@/lib/types';

type Steps = { step: string; ok: boolean; status?: number; error?: string | null; note?: string; data?: unknown }[];

export default function NumbersPage() {
  const { data, loading, reload } = useApi<{ numbers: PhoneNumber[] }>('/api/numbers');
  const agents = useApi<{ agents: Agent[] }>('/api/agents');
  const ses = useApi<Session>('/api/session');
  const { push } = useToast();

  // inline provisioning panel — no modal
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ display: '', country: 'IN', category: 'OTHER', wa_phone_number_id: '', waba_id: '', tenant_id: '' });
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  // inline registration state, keyed by number id
  const [pinFor, setPinFor] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [regBusy, setRegBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; agentId: string | null; mode: string; steps: Steps; error?: string } | null>(null);

  const isAdmin = ses.data?.user.role === 'platform_admin';
  const tenantDefault = ses.data?.tenants[0]?.id || '';

  useEffect(() => {
    if (isAdmin && !form.tenant_id && tenantDefault) setForm((f) => ({ ...f, tenant_id: tenantDefault }));
  }, [isAdmin, tenantDefault]);

  const provision = async () => {
    setFormErr('');
    if (!form.display.trim()) { setFormErr('Enter the WhatsApp display number.'); return; }
    if (isAdmin && !form.tenant_id) { setFormErr('Select the tenant that owns this number.'); return; }
    setSaving(true);
    try {
      const r = await api<{ number: PhoneNumber }>('/api/numbers', 'POST', form);
      push(`Number ${r.number.display} provisioned — now register it with Meta.`);
      setForm({ display: '', country: 'IN', category: 'OTHER', wa_phone_number_id: '', waba_id: '', tenant_id: tenantDefault });
      setShowForm(false);
      reload();
      setPinFor(r.number.id);          // jump straight into registration
      setPin('');
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : 'Could not provision the number.');
    } finally { setSaving(false); }
  };

  const [needsPin, setNeedsPin] = useState<string | null>(null);

  const saveIds = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api(`/api/numbers/${fd.get('id')}`, 'PATCH', { action: 'update', wa_phone_number_id: fd.get('pn'), waba_id: fd.get('waba') });
      push('Number IDs saved.');
      reload();
    } catch (err) {
      const m = err instanceof Error ? err.message : 'Could not save the IDs';
      setFormErr(m); push(m, true);
    }
  };

  const register = async (n: PhoneNumber, withPin?: string) => {
    setFormErr('');
    setRegBusy(n.id);
    setResult(null);
    try {
      const r = await api<any>(`/api/numbers/${n.id}`, 'PATCH', { action: 'onboard', pin: withPin || '' });
      setResult({ id: n.id, agentId: r.agent_id ?? null, mode: r.mode, steps: r.steps ?? [] });
      setNeedsPin(null);
      push(r.agent_id ? `Onboarded — agent ID ${r.agent_id}` : 'Onboarded.');
      reload();
    } catch (e) {
      // the API returns structured diagnostics on 502 — surface them inline
      const msg = e instanceof Error ? e.message : 'Onboarding failed';
      setResult({ id: n.id, agentId: null, mode: 'none', steps: [], error: msg });
      // 428-style: Meta wants the number registered first → reveal the optional PIN
      if (/not registered yet|6-digit two-step PIN/i.test(msg)) { setNeedsPin(n.id); setPinFor(n.id); }
      push(msg, true);
    } finally { setRegBusy(null); }
  };

  const nums = data?.numbers || [];
  const boundAgent = (n: PhoneNumber) => agents.data?.agents.find((a) => a.id === n.agent_id);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Numbers</h1>
          <p className="page-sub">WhatsApp Business numbers on this workspace. Provision, register with Meta, then bind each number to exactly one agent.</p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => { setShowForm((v) => !v); setFormErr(''); }}>
            {showForm ? <><IconX width={14} height={14} /> Close</> : <><IconPlus width={14} height={14} /> Provision number</>}
          </button>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 12 }}>
        {[['Numbers', nums.length], ['Active', nums.filter((n) => n.status === 'active').length], ['Pending registration', nums.filter((n) => n.status !== 'active').length], ['Bound to an agent', nums.filter((n) => n.agent_id).length]].map(([l, v]) => (
          <Card key={l as string} className="card-pad">
            <div className="mono tiny dim">{String(l).toUpperCase()}</div>
            <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{v as number}</div>
          </Card>
        ))}
      </div>

      {/* ── inline provisioning panel ───────────────────────────────── */}
      {showForm && (
        <Card style={{ marginBottom: 12 }}>
          <div className="card-head">
            <div style={{ flex: 1 }}>
              <div className="card-title">Provision a WhatsApp number</div>
              <div className="card-sub">Creates the record here. Registering with Meta is the next step, below.</div>
            </div>
            <span className="badge info">STEP 1 OF 2</span>
          </div>
          <div className="card-pad grid g2">
            {isAdmin && (
              <Field label="Tenant" hint="Which workspace owns this number">
                <select className="select" value={form.tenant_id} onChange={(e) => setForm({ ...form, tenant_id: e.target.value })}>
                  <option value="">Select tenant…</option>
                  {ses.data?.tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
            )}
            <Field label="Display number" hint="The phone number itself, e.g. +91 63600 12345 — display only, never used in the API call">
              <input className="input" autoFocus value={form.display} placeholder="+91 63600 12345"
                onChange={(e) => setForm({ ...form, display: e.target.value })} />
            </Field>
            <Field label="Country">
              <select className="select" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
                {['IN', 'AE', 'SA', 'US', 'GB', 'SG', 'BR', 'MX'].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Business category" hint="Must be a Meta-supported vertical">
              <input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </Field>
            <Field label="Phone number ID (Meta)" hint="From WhatsApp → API Setup — required to register a real number">
              <input className="input mono" value={form.wa_phone_number_id} placeholder="1312665798592137"
                onChange={(e) => setForm({ ...form, wa_phone_number_id: e.target.value })} />
            </Field>
            <Field label="WABA ID" hint="WhatsApp Business Account ID">
              <input className="input mono" value={form.waba_id} placeholder="778899001122334"
                onChange={(e) => setForm({ ...form, waba_id: e.target.value })} />
            </Field>
          </div>
          {formErr && <div style={{ padding: '0 18px 12px' }}><div className="notice err">{formErr}</div></div>}
          <div style={{ padding: '12px 18px', borderTop: '1px solid var(--line)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={provision} disabled={saving || !form.display.trim()}>
              {saving ? 'Provisioning…' : 'Provision number'}
            </button>
            <button className="btn btn-ghost" onClick={() => { setShowForm(false); setFormErr(''); }}>Cancel</button>
            <span className="tiny dim" style={{ marginLeft: 'auto' }}>Registering with Meta happens next, on the row below.</span>
          </div>
        </Card>
      )}

      {/* ── registration result, inline ─────────────────────────────── */}
      {result && (
        <Card style={{ marginBottom: 12, borderColor: result.error ? 'color-mix(in srgb, var(--danger) 35%, var(--line))' : 'var(--accent-line)' }}>
          <div className="card-head">
            <div style={{ flex: 1 }}>
              <div className="card-title">{result.error ? 'Registration failed' : 'Registration complete'}</div>
              <div className="card-sub">{result.steps.length ? `Mode: ${result.mode}` : 'No Meta call made'}</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setResult(null)}><IconX width={13} height={13} /></button>
          </div>
          <div className="card-pad stack">
            {result.agentId && (
              <div className="spread" style={{ padding: '10px 12px', background: 'var(--accent-tint)', border: '1px solid var(--accent-line)', borderRadius: 9 }}>
                <div>
                  <div className="mono tiny dim">AGENT ID (META)</div>
                  <div className="mono" style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{result.agentId}</div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn btn-sm" onClick={() => { navigator.clipboard?.writeText(result.agentId!); push('Agent ID copied.'); }}>Copy</button>
                  <Link href="/agents" className="btn btn-sm btn-primary">Create agent</Link>
                </div>
              </div>
            )}
            {result.error && <div className="notice err">{result.error}</div>}
            {result.steps.length > 0 && (
              <div className="stack" style={{ gap: 6 }}>
                {result.steps.map((s) => (
                  <div key={s.step} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ color: s.ok ? 'var(--ok)' : 'var(--danger)', marginTop: 2 }}>{s.ok ? <IconCheck width={13} height={13} /> : <IconX width={13} height={13} />}</span>
                    <div style={{ flex: 1 }}>
                      <span className="mono small">{s.step}</span>
                      <span className="tiny dim"> {s.status ? `HTTP ${s.status}` : ''}</span>
                      {s.note && <div className="tiny dim">{s.note}</div>}
                      {s.error && <div className="tiny" style={{ color: 'var(--danger)' }}>{s.error}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {result.steps.some((s) => s.data) && (
              <details>
                <summary className="small dim" style={{ cursor: 'pointer' }}>Raw Meta response</summary>
                <pre className="code-block" style={{ marginTop: 8, maxHeight: 220 }}>
                  {JSON.stringify(result.steps.map((s) => ({ step: s.step, data: s.data })), null, 2)}
                </pre>
              </details>
            )}
          </div>
        </Card>
      )}

      {/* ── numbers table ───────────────────────────────────────────── */}
      <Card>
        <div className="card-head">
          <div className="card-title">Connected numbers</div>
          <span className="badge info" style={{ marginLeft: 'auto' }}>PROVIDER · ONEXTEL</span>
        </div>
        {loading ? <div style={{ padding: 16 }}><Skeleton h={140} /></div> : nums.length === 0 ? (
          <Empty
            icon={<IconPhone width={16} height={16} />}
            title="No numbers yet"
            sub="Provision your WhatsApp Business number, then register it with Meta and bind it to an agent."
            action={<button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>Provision number</button>}
          />
        ) : (
          <div>
            {nums.map((n) => {
              const agent = boundAgent(n);
              const open = pinFor === n.id;
              return (
                <div key={n.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <div className="list-row" style={{ alignItems: 'flex-start', gap: 14, padding: '14px 18px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                        <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{n.display}</span>
                        <Status value={n.status} />
                        <Badge kind={n.quality === 'green' ? 'live' : n.quality === 'yellow' ? 'warn' : 'danger'}>{n.quality}</Badge>
                        {n.two_step_pin_set && <span className="badge draft">2-step PIN</span>}
                      </div>
                      <div className="tiny dim mono" style={{ marginTop: 4 }}>
                        PN {n.wa_phone_number_id} · WABA {n.waba_id} · {n.provider_ref}
                        {n.meta_agent_id ? ` · agent ${n.meta_agent_id}` : ''}
                      </div>
                      <div className="row small" style={{ gap: 6, marginTop: 5 }}>
                        <span className="dim">{n.country} · {n.category} · {n.messaging_limit}</span>
                        <span className="dim">·</span>
                        {agent ? <Link href={`/agents/${agent.id}`} style={{ color: 'var(--accent)' }}>{agent.name}</Link> : <span className="dim">unassigned</span>}
                      </div>
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn btn-sm" onClick={() => { setPinFor(open ? null : n.id); setPin(''); setFormErr(''); }}>
                        {open ? 'Cancel' : n.status === 'active' ? 'Re-run' : 'Register agent'}
                      </button>
                    </div>
                  </div>

                  {open && (
                    <div style={{ padding: '0 18px 16px', background: 'var(--panel-2)' }}>
                      <div className="stack" style={{ gap: 10, paddingTop: 12 }}>
                        {!/^\d{10,20}$/.test(n.wa_phone_number_id) && (
                          <div className="notice err" style={{ margin: 0 }}>
                            Stored phone number ID <span className="mono">{n.wa_phone_number_id}</span> is not a numeric Meta ID.
                            Meta will answer “number not found” — fix it before registering.
                          </div>
                        )}
                        <div className="notice info" style={{ margin: 0 }}>
                          Two calls, in order: <span className="mono">POST graph.facebook.com/v25.0/{n.wa_phone_number_id}/register</span>{' '}
                          with the two-step PIN, then <span className="mono">POST api.facebook.com/{n.wa_phone_number_id}/agent_onboarding?channel=whatsapp</span>.{' '}
                          Meta returns the agent ID on the second call.
                        </div>
                        <div className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                          <div style={{ width: 200 }}>
                            <Field label="6-digit two-step PIN">
                              <input className="input mono" inputMode="numeric" maxLength={6} placeholder="123456"
                                value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
                            </Field>
                          </div>
                          <button className="btn btn-primary" disabled={pin.length !== 6 || regBusy === n.id} onClick={() => register(n, pin)}>
                            {regBusy === n.id ? 'Registering…' : n.status === 'active' ? 'Re-run registration' : 'Register number & onboard agent'}
                          </button>
                          {n.meta_agent_id && <span className="mono tiny dim">agent {n.meta_agent_id}</span>}
                        </div>
                        <div className="tiny dim">
                          The PIN is your business’s two-step verification code for this number in WhatsApp Manager — Meta requires it
                          on <span className="mono">/register</span> before the number can be onboarded. Test numbers often use <span className="mono">123456</span>.
                          “Already registered” is treated as success and onboarding continues.
                        </div>
                        <details>
                          <summary className="tiny mono dim" style={{ cursor: 'pointer', padding: '2px 0' }}>Fix IDs (phone number ID / WABA ID)</summary>
                          <form onSubmit={saveIds} className="stack" style={{ gap: 8, paddingTop: 8 }}>
                            <input type="hidden" name="id" value={n.id} />
                            <div className="row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                              <div style={{ width: 230 }}>
                                <Field label="Meta phone number ID">
                                  <input name="pn" className="input mono" inputMode="numeric" placeholder="1312665798592137"
                                    defaultValue={/^\d{10,20}$/.test(n.wa_phone_number_id) ? n.wa_phone_number_id : ''} />
                                </Field>
                              </div>
                              <div style={{ width: 230 }}>
                                <Field label="WABA ID">
                                  <input name="waba" className="input mono" inputMode="numeric" placeholder="1790923784894660" defaultValue={n.waba_id} />
                                </Field>
                              </div>
                              <button className="btn btn-sm" type="submit">Save IDs</button>
                            </div>
                            <div className="tiny dim">WhatsApp Manager → Phone numbers → the numeric <b>Phone number ID</b> (not the phone number).</div>
                          </form>
                        </details>
                        {formErr && <div className="notice err" style={{ margin: 0 }}>{formErr}</div>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="grid g3" style={{ marginTop: 12 }}>
        <Card className="card-pad">
          <div className="row" style={{ gap: 8, color: 'var(--accent)' }}><IconShield width={14} height={14} /><span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>Two-step verification</span></div>
          <div className="small muted" style={{ marginTop: 6 }}>The 6-digit PIN is the number's two-step verification code in WhatsApp Manager. Meta needs it to register the number before onboarding.</div>
        </Card>
        <Card className="card-pad">
          <div className="row" style={{ gap: 8, color: 'var(--accent)' }}><IconBolt width={14} height={14} /><span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>Registration flow</span></div>
          <div className="small muted" style={{ marginTop: 6 }}><span className="mono tiny">POST /register</span> (graph.facebook.com, with PIN) then <span className="mono tiny">POST /agent_onboarding</span> (api.facebook.com, no body).</div>
        </Card>
        <Card className="card-pad">
          <div className="row" style={{ gap: 8, color: 'var(--accent)' }}><IconRefresh width={14} height={14} /><span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>One agent per number</span></div>
          <div className="small muted" style={{ marginTop: 6 }}>Meta blocks a number already running another AI agent — check eligibility before onboarding.</div>
        </Card>
      </div>
    </>
  );
}
