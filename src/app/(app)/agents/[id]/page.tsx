'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { api, Badge, Card, Empty, Field, fmt, Modal, ProgressBar, Skeleton, Status, Toggle, useApi, useToast } from '@/components/ui';
import { IconBolt, IconBook, IconCheck, IconFlask, IconPlug, IconPlus, IconRocket, IconSend, IconSettings, IconShield, IconTrash, IconX, IconChevron, IconPhone } from '@/components/icons';
import type { Agent, BusinessInfo, Connector, ConnectorTool, EvalCase, Faq, Session, Skill } from '@/lib/types';
import { eligibilityPreflight } from '@/lib/meta';

async function pushChunked(
  agentId: string,
  kind: 'faqs' | 'skills',
  onProgress: (done: number, total: number) => void,
) {
  let offset = 0;
  const agg = { pushed: 0, duplicates: 0, failed: 0, total: 0, errors: [] as string[] };
  for (let guard = 0; guard < 300; guard++) {
    const r = await api<any>(`/api/agents/${agentId}/sync`, 'POST', { kind, offset, limit: 4 });
    agg.pushed += r.pushed || 0;
    agg.duplicates += r.duplicates || 0;
    agg.failed += r.failed || 0;
    agg.total = r.total ?? agg.total;
    if (r.errors?.length) agg.errors.push(...r.errors);
    offset = r.next ?? offset + 4;
    onProgress(Math.min(offset, agg.total), agg.total);
    if (r.done || agg.total === 0) break;
  }
  return agg;
}

const tabs = [
  { key: 'overview', label: 'Overview', icon: IconBolt },
  { key: 'knowledge', label: 'Knowledge', icon: IconBook },
  { key: 'skills', label: 'Skills', icon: IconFlask },
  { key: 'connectors', label: 'Connectors & tools', icon: IconPlug },
  { key: 'settings', label: 'Behaviour', icon: IconSettings },
  { key: 'test', label: 'Test console', icon: IconSend },
  { key: 'evaluate', label: 'Evaluation', icon: IconShield },
];

export default function AgentPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, reload } = useApi<{ agent: Agent; tenant: { name: string } | null }>(`/api/agents/${id}`);
  const ses = useApi<Session>('/api/session');
  const [tab, setTab] = useState('overview');
  const [publish, setPublish] = useState(false);
  const { push } = useToast();
  const agent = data?.agent;

  const [rollBusy, setRollBusy] = useState(false);

  const isLive = !!agent?.settings?.rollout?.enabled;
  const toggleRollout = async () => {
    if (!agent) return;
    setRollBusy(true);
    try {
      const enabled = !isLive;
      const r = await fetch(`/api/agents/${agent.id}/rollout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Rollout change failed');
      push(enabled ? 'Rollout enabled — PUT agent_config/settings sent.' : 'Rollout disabled — the agent is paused.');
      reload();
    } catch (e) {
      push(e instanceof Error ? e.message : 'Rollout change failed', true);
    } finally { setRollBusy(false); }
  };

  if (loading || !agent) return <div className="stack"><Skeleton h={90} /><Skeleton h={420} /></div>;

  const number = (agent as any).number;
  const preflight = eligibilityPreflight({
    category: 'brand', provider: 'onextel', wabaStatus: 'active', country: 'IN', verified: true, hasOtherAgent: false, quality: 'green',
  });

  return (
    <>
      <div className="page-head">
        <div style={{ flex: 1 }}>
          <div className="row small dim" style={{ gap: 7, marginBottom: 7 }}>
            <Link href="/agents">Business agents</Link><span>/</span><span className="mono">{agent.id}</span>
          </div>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <h1 className="page-title">{agent.name}</h1>
            <Status value={agent.status} />
            <span className="chip mono">v{agent.version}</span>
          </div>
          <p className="page-sub">{agent.description}</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setTab('test')}><IconSend width={14} height={14} /> Test</button>
          <button className={`btn ${isLive ? '' : 'btn-primary'}`} onClick={toggleRollout} disabled={rollBusy}>
            {rollBusy ? 'Saving…' : isLive ? 'Disable agent' : 'Enable agent'}
          </button>
          <button className="btn btn-primary" onClick={() => setPublish(true)}><IconRocket width={14} height={14} /> Publish</button>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 14 }}>
        {tabs.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
            {t.key === 'knowledge' && <span className="n">{agent.faqs.length}</span>}
            {t.key === 'skills' && <span className="n">{agent.skills.length}</span>}
            {t.key === 'connectors' && <span className="n">{agent.connectors.reduce((s, c) => s + c.tools.length, 0)}</span>}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview agent={agent} preflight={preflight} tenant={data?.tenant?.name || '—'} />}
      {tab === 'knowledge' && <BulkUpload agentId={agent.id} section="faqs" reload={reload} />}
      {tab === 'skills' && <BulkUpload agentId={agent.id} section="skills" reload={reload} />}
      {tab === 'connectors' && <BulkUpload agentId={agent.id} section="connectors" reload={reload} />}
      {tab === 'knowledge' && <Knowledge agent={agent} reload={reload} />}
      {tab === 'skills' && <Skills agent={agent} reload={reload} />}
      {tab === 'connectors' && <Connectors agent={agent} reload={reload} />}
      {tab === 'settings' && <Behaviour agent={agent} reload={reload} />}
      {tab === 'test' && <TestConsole agent={agent} />}
      {tab === 'evaluate' && <Evaluate agent={agent} />}

      <PublishModal agent={agent} open={publish} onClose={() => setPublish(false)} onDone={(mode) => { setPublish(false); push(mode === 'graph' ? 'Published to Meta — rollout enabled.' : 'Published in config-only mode. Add a Meta token to push live.'); reload(); }} />
    </>
  );
}

function Overview({ agent, preflight, tenant }: { agent: Agent; preflight: any[]; tenant: string }) {
  const connectors = agent.connectors.length;
  const tools = agent.connectors.reduce((s, c) => s + c.tools.length, 0);
  const checks = [
    { ok: agent.business_info.business_description.length > 40, label: 'Business information completed' },
    { ok: agent.faqs.length >= 3, label: `Knowledge base seeded (${agent.faqs.length} FAQs)` },
    { ok: agent.skills.length >= 3, label: `Skills configured (${agent.skills.length})` },
    { ok: tools > 0, label: `Connector tools mapped (${tools})` },
    { ok: agent.published_at !== null, label: 'Rolled out to production' },
  ];
  return (
    <>
      <div className="grid g4">
        <Card className="card-pad"><div className="mono tiny dim">CONVERSATIONS · 30D</div><div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{fmt.num(agent.metrics.conversations)}</div></Card>
        <Card className="card-pad"><div className="mono tiny dim">RESOLUTION</div><div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{agent.metrics.resolution_rate}%</div><div className="bar mint" style={{ marginTop: 8 }}><i style={{ width: `${agent.metrics.resolution_rate}%` }} /></div></Card>
        <Card className="card-pad"><div className="mono tiny dim">AVG HANDLE TIME</div><div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{agent.metrics.avg_handle_sec}s</div></Card>
        <Card className="card-pad"><div className="mono tiny dim">CSAT</div><div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{agent.metrics.csat || '—'}<span className="dim" style={{ fontSize: 12 }}> / 5</span></div></Card>
      </div>

      <div className="split-2" style={{ marginTop: 12 }}>
        <Card>
          <div className="card-head"><div className="card-title">Deployment checklist</div><span className="badge info" style={{ marginLeft: 'auto' }}>{checks.filter((c) => c.ok).length}/{checks.length}</span></div>
          <div>
            {checks.map((c) => (
              <div key={c.label} className="list-row">
                <span style={{ width: 18, height: 18, borderRadius: 99, display: 'grid', placeItems: 'center', background: c.ok ? 'rgba(169,239,107,.12)' : '#171C18', color: c.ok ? 'var(--lime)' : 'var(--dim)', border: `1px solid ${c.ok ? 'rgba(169,239,107,.3)' : 'var(--line)'}` }}>
                  {c.ok ? <IconCheck width={11} height={11} /> : <IconX width={10} height={10} />}
                </span>
                <span className="small" style={{ flex: 1 }}>{c.label}</span>
                <span className={`badge ${c.ok ? 'live' : 'draft'}`}>{c.ok ? 'ready' : 'todo'}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="card-head"><div className="card-title">Meta identifiers</div></div>
          <div style={{ padding: '4px 0' }}>
            {[
              ['Tenant', tenant],
              ['Phone number ID (Meta)', agent.entity_id || 'no number bound'],
              ['Agent ID (Meta)', agent.meta_agent_id || 'not onboarded'],
              ['Channel', 'whatsapp'],
              ['API version', 'v25.0'],
              ['Draft version', `v${agent.version}`],
              ['Published', fmt.date(agent.published_at)],
            ].map(([k, v]) => (
              <div key={k} className="row" style={{ padding: '8px 16px', justifyContent: 'space-between', gap: 12 }}>
                <span className="small dim">{k}</span>
                <span className="mono small" style={{ textAlign: 'right', wordBreak: 'break-all' }}>{v}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="section-title">Number eligibility pre-item</div>
      <Card>
        <div className="card-head"><div className="card-title">Documented eligibility criteria</div><span className="small dim" style={{ marginLeft: 'auto' }}>Run before onboarding a number</span></div>
        <table className="tbl">
          <tbody>
            {preflight.map((c: any) => (
              <tr key={c.key}>
                <td style={{ width: 30 }}><span style={{ color: c.ok ? 'var(--lime)' : 'var(--red)' }}>{c.ok ? <IconCheck width={13} height={13} /> : <IconX width={13} height={13} />}</span></td>
                <td style={{ fontWeight: 500 }}>{c.label}</td>
                <td className="small muted">{c.detail}</td>
                <td className="right"><span className={`badge ${c.ok ? 'live' : 'danger'}`}>{c.ok ? 'pass' : 'blocked'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--line)' }} className="tiny dim">
          Verticals excluded by Meta: Finance, Government, Health, Alcohol, Gambling, OTC drugs, Matrimony. The Graph eligibility endpoint is authoritative — this pre-item mirrors the published rules.
        </div>
      </Card>
    </>
  );
}

function Knowledge({ agent, reload }: { agent: Agent; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Faq | null>(null);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ question: '', answer: '', category: 'General' });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { push } = useToast();

  const syncAll = async () => {
    setSyncing(true);
    setProg({ done: 0, total: agent.faqs.length + agent.skills.length, label: 'Pushing to Meta' });
    try {
      let done = 0;
      const f = await pushChunked(agent.id, 'faqs', (d) => setProg({ done, total: agent.faqs.length + agent.skills.length, label: 'Pushing FAQs' })).finally(() => null);
      done = 0;
      const k = await pushChunked(agent.id, 'skills', (d) => setProg({ done: agent.faqs.length + d, total: agent.faqs.length + agent.skills.length, label: 'Pushing skills' }));
      void done;
      push(`Meta now has ${f.pushed + f.duplicates}/${f.total} FAQs and ${k.pushed + k.duplicates}/${k.total} skills.` + (f.failed || k.failed ? ` ${f.failed + k.failed} failed.` : ''));
      if (f.errors.length || k.errors.length) console.warn('sync errors', [...f.errors, ...k.errors]);
      reload();
    } catch (e) { push(e instanceof Error ? e.message : 'Sync failed', true); }
    finally { setSyncing(false); setProg(null); }
  };

  const [metaState, setMetaState] = useState<{ total: number; matched: number } | null>(null);
  const [checking, setChecking] = useState(false);
  const [prog, setProg] = useState<{ done: number; total: number; label: string } | null>(null);

  const checkMeta = async () => {
    setChecking(true);
    try {
      const r = await api<any>(`/api/agents/${agent.id}/faqs`, 'GET');
      setMetaState({ total: r.meta?.total ?? 0, matched: r.meta?.matched ?? 0 });
      push(`Meta has ${r.meta?.total ?? 0} FAQs · ${r.meta?.matched ?? 0} already here · ${r.meta?.adopted ?? 0} imported into the grid.`);
      reload();
    } catch (e) { push(e instanceof Error ? e.message : 'Could not read FAQ state from Meta', true); }
    finally { setChecking(false); }
  };

  const list = agent.faqs.filter((f) => (f.question + f.answer).toLowerCase().includes(q.toLowerCase()));
  const allSel = list.length > 0 && list.every((f) => sel.has(f.id));

  const toggle = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSel(allSel ? new Set() : new Set(list.map((f) => f.id)));

  const save = async () => {
    try {
      if (edit) await api(`/api/agents/${agent.id}/faqs`, 'PUT', { ...form, id: edit.id });
      else await api(`/api/agents/${agent.id}/faqs`, 'POST', form);
      push(edit ? 'FAQ updated.' : 'FAQ added and queued to Meta.');
      setOpen(false); setEdit(null); setForm({ question: '', answer: '', category: 'General' }); reload();
    } catch (e) { push(e instanceof Error ? e.message : 'Failed', true); }
  };

  const delMany = async (ids: string[]) => {
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} FAQ${ids.length === 1 ? '' : 's'}?\n\nThey are removed here and, where a Meta FAQ id is known, deleted at Meta too.`)) return;
    setBusy(true);
    try {
      const r = await api<any>(`/api/agents/${agent.id}/faqs`, 'DELETE', { ids });
      push(`${r.deleted ?? ids.length} FAQ${ids.length === 1 ? '' : 's'} deleted${r.removed_at_meta ? ` · ${r.removed_at_meta} also removed at Meta` : ''}.`);
      setSel(new Set()); reload();
    } catch (e) { push(e instanceof Error ? e.message : 'Delete failed', true); }
    finally { setBusy(false); }
  };

  return (
    <>
      <div className="row" style={{ marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
        <input className="input" style={{ maxWidth: 300 }} placeholder="Search knowledge…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="small dim">
          {agent.faqs.length} entries{list.length !== agent.faqs.length ? ` · ${list.length} shown` : ''}
          {agent.faqs.length > 0 && <> · <b>{agent.faqs.filter((f) => f.synced).length} live on Meta</b></>}
        </span>
        <button className="btn btn-sm" disabled={checking} onClick={checkMeta}>{checking ? 'Fetching…' : 'Fetch from Meta'}</button>
        <button className="btn btn-sm" disabled={syncing} onClick={syncAll} style={{ marginLeft: 'auto' }}>
          {syncing ? 'Pushing…' : 'Push all to Meta'}
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => { setEdit(null); setForm({ question: '', answer: '', category: 'General' }); setOpen(true); }}><IconPlus width={13} height={13} /> Add FAQ</button>
      </div>
      {prog && <ProgressBar value={prog.done} total={prog.total} label={prog.label} />}

      {list.length > 0 && (
        <div className="row" style={{ marginBottom: 8, gap: 10, flexWrap: 'wrap' }}>
          <label className="row" style={{ gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={allSel} onChange={toggleAll} />
            <span className="small">Select all{list.length !== agent.faqs.length ? ' shown' : ''}</span>
          </label>
          {sel.size > 0 && (
            <>
              <span className="badge info">{sel.size} selected</span>
              <button className="btn btn-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} disabled={busy} onClick={() => delMany([...sel])}>
                <IconTrash width={12} height={12} /> {busy ? 'Deleting…' : `Delete ${sel.size}`}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>Clear</button>
            </>
          )}
        </div>
      )}

      <Card>
        {list.length === 0 ? <Empty icon={<IconBook width={16} height={16} />} title="No knowledge entries" sub="Add FAQs so the agent can answer from your content." /> : list.map((f) => (
          <div key={f.id} className="list-row" style={{ alignItems: 'flex-start', background: sel.has(f.id) ? 'var(--accent-tint)' : undefined }}>
            <input type="checkbox" checked={sel.has(f.id)} onChange={() => toggle(f.id)} style={{ marginTop: 3, marginRight: 10, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row" style={{ gap: 8 }}>
                <span style={{ fontWeight: 550, fontSize: 12.5 }}>{f.question}</span>
                <span className="badge draft" style={{ height: 17 }}>{f.category}</span>
                <span className="badge" style={{ height: 17, color: f.synced ? 'var(--ok)' : 'var(--warn)' }}
                  title={f.meta_id ? `Meta FAQ id ${f.meta_id}` : 'Not present on Meta yet — push it'}>
                  {f.synced ? 'live on Meta' : 'not on Meta'}
                </span>
              </div>
              <div className="small muted" style={{ marginTop: 3, lineHeight: 1.55 }}>{f.answer}</div>
            </div>
            <div className="row" style={{ gap: 4 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { setEdit(f); setForm({ question: f.question, answer: f.answer, category: f.category }); setOpen(true); }}>Edit</button>
              <button className="btn btn-ghost btn-sm" onClick={() => delMany([f.id])}><IconTrash width={12} height={12} /></button>
            </div>
          </div>
        ))}
      </Card>

      {open && (
        <Modal title={edit ? 'Edit FAQ' : 'Add FAQ'} sub="Pushed to POST /agent_config/faq on save." onClose={() => setOpen(false)}
          footer={<><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={!form.question || !form.answer}>Save entry</button></>}>
          <div className="stack">
            <Field label="Question"><input className="input" value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} /></Field>
            <Field label="Answer"><textarea className="textarea" style={{ minHeight: 120 }} value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} /></Field>
            <Field label="Category"><input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}

function Skills({ agent, reload }: { agent: Agent; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Skill | null>(null);
  const [form, setForm] = useState({ title: '', description: '', skill: '' });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [prog, setProg] = useState<{ done: number; total: number; label: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [metaState, setMetaState] = useState<{ total: number; matched: number; adopted: number } | null>(null);
  const { push } = useToast();

  const syncAll = async () => {
    setSyncing(true);
    setProg({ done: 0, total: agent.skills.length, label: 'Pushing skills to Meta' });
    try {
      const k = await pushChunked(agent.id, 'skills', (d, t) => setProg({ done: d, total: t, label: 'Pushing skills to Meta' }));
      push(`Meta now has ${k.pushed + k.duplicates}/${k.total} skills.` + (k.failed ? ` ${k.failed} failed.` : ''));
      if (k.errors.length) console.warn('skill sync errors', k.errors);
      reload();
    } catch (e) { push(e instanceof Error ? e.message : 'Sync failed', true); }
    finally { setSyncing(false); setProg(null); }
  };

  const checkMeta = async () => {
    setChecking(true);
    try {
      const r = await api<any>(`/api/agents/${agent.id}/skills`, 'GET');
      setMetaState({ total: r.meta?.total ?? 0, matched: r.meta?.matched ?? 0, adopted: r.meta?.adopted ?? 0 });
      push(`Meta has ${r.meta?.total ?? 0} skills · ${r.meta?.matched ?? 0} already here · ${r.meta?.adopted ?? 0} imported into the grid.`);
      reload();
    } catch (e) { push(e instanceof Error ? e.message : 'Could not read skills from Meta', true); }
    finally { setChecking(false); }
  };

  const allSel = agent.skills.length > 0 && agent.skills.every((s) => sel.has(s.id));
  const toggle = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSel(allSel ? new Set() : new Set(agent.skills.map((s) => s.id)));

  const save = async () => {
    try {
      if (edit) await api(`/api/agents/${agent.id}/skills`, 'PUT', { ...form, id: edit.id, enabled: edit.enabled });
      else await api(`/api/agents/${agent.id}/skills`, 'POST', form);
      push('Skill saved.'); setOpen(false); setEdit(null); reload();
    } catch (e) { push(e instanceof Error ? e.message : 'Failed', true); }
  };

  const delMany = async (ids: string[]) => {
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} skill${ids.length === 1 ? '' : 's'}?\n\nThey are removed from this agent. Meta has no delete endpoint for skills, so any copy already pushed stays live there until the agent is re-published.`)) return;
    setBusy(true);
    try {
      const r = await api<{ deleted: number }>(`/api/agents/${agent.id}/skills`, 'DELETE', { ids });
      push(`${r.deleted ?? ids.length} skill${ids.length === 1 ? '' : 's'} deleted.`);
      setSel(new Set()); reload();
    } catch (e) { push(e instanceof Error ? e.message : 'Delete failed', true); }
    finally { setBusy(false); }
  };

  return (
    <>
      <div className="notice info" style={{ marginBottom: 10 }}>
        Skills are instruction documents (Markdown) sent to <span className="mono">POST /agent_config/skills?agent_id=</span>. Keep them declarative — routing, tone, guardrails and flows.
      </div>
      <div className="row" style={{ marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
        <span className="small dim">
          {agent.skills.length} skills · {agent.skills.filter((s) => s.enabled).length} enabled
          {agent.skills.length > 0 && <> · <b>{agent.skills.filter((s) => (s as any).synced).length} live on Meta</b></>}
        </span>
        <button className="btn btn-sm" disabled={checking} onClick={checkMeta}>{checking ? 'Fetching…' : 'Fetch from Meta'}</button>
        {agent.skills.length > 0 && (
          <label className="row" style={{ gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={allSel} onChange={toggleAll} />
            <span className="small">Select all</span>
          </label>
        )}
        {sel.size > 0 && (
          <>
            <span className="badge info">{sel.size} selected</span>
            <button className="btn btn-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} disabled={busy} onClick={() => delMany([...sel])}>
              <IconTrash width={12} height={12} /> {busy ? 'Deleting…' : `Delete ${sel.size}`}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>Clear</button>
          </>
        )}
        <button className="btn btn-sm" disabled={syncing} onClick={syncAll} style={{ marginLeft: 'auto' }}>
          {syncing ? 'Pushing…' : 'Push all to Meta'}
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => { setEdit(null); setForm({ title: '', description: '', skill: '' }); setOpen(true); }}><IconPlus width={13} height={13} /> New skill</button>
      </div>
      {prog && <ProgressBar value={prog.done} total={prog.total} label={prog.label} />}
      <div className="grid g2">
        {agent.skills.map((s) => (
          <Card key={s.id} className="card-pad" style={sel.has(s.id) ? { outline: '2px solid var(--accent)', outlineOffset: -1 } : undefined}>
            <div className="spread">
              <div className="row" style={{ gap: 8, minWidth: 0 }}>
                <input type="checkbox" checked={sel.has(s.id)} onChange={() => toggle(s.id)} style={{ flexShrink: 0 }} />
                <div className="mono small" style={{ color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <Badge kind={s.enabled ? 'live' : 'draft'}>{s.enabled ? 'active' : 'off'}</Badge>
                {(s as any).synced ? <Badge kind="live">live on Meta</Badge> : <Badge kind="draft">not on Meta</Badge>}
                <button className="btn btn-ghost btn-sm" onClick={() => { setEdit(s); setForm({ title: s.title, description: s.description, skill: s.skill }); setOpen(true); }}>Edit</button>
                <button className="btn btn-ghost btn-sm" onClick={() => delMany([s.id])}><IconTrash width={12} height={12} /></button>
              </div>
            </div>
            <div className="small muted" style={{ marginTop: 6 }}>{s.description}</div>
            <pre className="code-block" style={{ marginTop: 9, maxHeight: 92, overflow: 'hidden' }}>{s.skill.slice(0, 300)}{s.skill.length > 300 ? '…' : ''}</pre>
          </Card>
        ))}
      </div>
      {open && (
        <Modal width={760} title={edit ? `Edit ${edit.title}` : 'New skill'} sub="Markdown instruction block. Versioned with the agent." onClose={() => setOpen(false)}
          footer={<><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={!form.title || !form.skill}>Save skill</button></>}>
          <div className="stack">
            <div className="grid g2">
              <Field label="Title" hint="lowercase-with-dashes"><input className="input mono" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
              <Field label="Description"><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            </div>
            <Field label="Skill instructions (Markdown)"><textarea className="textarea mono" style={{ minHeight: 300 }} value={form.skill} onChange={(e) => setForm({ ...form, skill: e.target.value })} placeholder={'# Intent Router\n\n| Intent | Trigger | Action |\n…'} /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}

function Connectors({ agent, reload }: { agent: Agent; reload: () => void }) {
  const [openC, setOpenC] = useState(false);
  const [openT, setOpenT] = useState<Connector | null>(null);
  const [run, setRun] = useState<ConnectorTool | null>(null);
  const [openTool, setOpenTool] = useState<ConnectorTool | null>(null);
  const [cform, setCform] = useState({ name: '', description: '', base_url: '', auth_type: 'NONE' });
  const [tform, setTform] = useState({ name: '', description: '', method: 'GET', path: '/', test_input: '{}' });
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  const addConnector = async () => {
    setBusy(true);
    try { await api(`/api/agents/${agent.id}/connectors`, 'POST', cform); push('Connector created.'); setOpenC(false); reload(); }
    catch (e) { push(e instanceof Error ? e.message : 'Failed', true); } finally { setBusy(false); }
  };
  const addTool = async () => {
    if (!openT) return;
    setBusy(true);
    try { await api(`/api/agents/${agent.id}/tools`, 'POST', { ...tform, connector_id: openT.id }); push('Tool registered.'); setOpenT(null); reload(); }
    catch (e) { push(e instanceof Error ? e.message : 'Failed', true); } finally { setBusy(false); }
  };
  const runTool = async () => {
    if (!openTool) return;
    setBusy(true); setResult(null);
    try { const r = await api(`/api/agents/${agent.id}/tools`, 'PATCH', { action: 'run', tool_id: openTool.id, input: openTool.test_input }); setResult(r); }
    catch (e) { setResult({ error: e instanceof Error ? e.message : 'Failed' }); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <span className="small dim">{agent.connectors.length} connectors · {agent.connectors.reduce((s, c) => s + c.tools.length, 0)} tools exposed to the agent</span>
        <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setOpenC(true)}><IconPlus width={13} height={13} /> Add connector</button>
      </div>
      <div className="stack">
        {agent.connectors.map((c) => (
          <Card key={c.id}>
            <div className="card-head">
              <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--panel-2)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', color: 'var(--blue)' }}><IconPlug width={14} height={14} /></span>
              <div style={{ flex: 1 }}>
                <div className="row" style={{ gap: 8 }}><span className="card-title">{c.name}</span><Status value={c.status} /></div>
                <div className="tiny mono dim">{c.base_url}</div>
              </div>
              <button className="btn btn-sm" onClick={() => { setOpenT(c); setTform({ name: '', description: '', method: 'GET', path: '/', test_input: '{}' }); }}><IconPlus width={12} height={12} /> Tool</button>
            </div>
            <table className="tbl">
              <thead><tr><th>Tool</th><th>Request</th><th>Auth</th><th>Last run</th><th className="right">Actions</th></tr></thead>
              <tbody>
                {c.tools.map((t) => (
                  <tr key={t.id}>
                    <td><div className="mono small" style={{ color: 'var(--text)' }}>{t.name}</div><div className="tiny dim" style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</div></td>
                    <td><span className={`method ${t.method}`}>{t.method}</span> <span className="mono tiny dim">{t.path}</span></td>
                    <td className="small muted">{t.user_auth_required ? 'user token' : 'connector'}</td>
                    <td>{t.last_status ? <span className={`badge ${t.last_status === 'ok' ? 'live' : 'danger'}`}>{t.last_status}</span> : <span className="dim small">never</span>}<div className="tiny dim">{t.last_run_at ? fmt.ago(t.last_run_at) : ''}</div></td>
                    <td className="right">
                      <div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                        <button className="btn btn-sm" onClick={() => { setOpenTool(t); setResult(null); }}>Run</button>
                        <button className="btn btn-ghost btn-sm" onClick={async () => { await api(`/api/agents/${agent.id}/tools`, 'DELETE', { id: t.id, connector_id: c.id, name: t.name }); push('Tool deleted.'); reload(); }}><IconTrash width={12} height={12} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {c.tools.length === 0 && <tr><td colSpan={5}><div className="empty" style={{ padding: 20 }}>No tools yet — map an API endpoint to give the agent an action.</div></td></tr>}
              </tbody>
            </table>
          </Card>
        ))}
        {agent.connectors.length === 0 && (
          <Card><Empty icon={<IconPlug width={16} height={16} />} title="No connectors" sub="Connect an HTTPS API so the agent can take actions, not just answer questions." action={<button className="btn btn-primary btn-sm" onClick={() => setOpenC(true)}>Add connector</button>} /></Card>
        )}
      </div>

      {openC && (
        <Modal title="Add connector" sub="Creates POST /agent_connectors, then POST /tools per action." onClose={() => setOpenC(false)}
          footer={<><button className="btn" onClick={() => setOpenC(false)}>Cancel</button><button className="btn btn-primary" onClick={addConnector} disabled={busy || !cform.name || !cform.base_url}>Create connector</button></>}>
          <div className="stack">
            <Field label="Connector name" hint="snake_case"><input className="input mono" value={cform.name} onChange={(e) => setCform({ ...cform, name: e.target.value })} placeholder="booking_api_connector" /></Field>
            <Field label="Base URL" hint="Must be HTTPS. Meta calls this from its infrastructure."><input className="input mono" value={cform.base_url} onChange={(e) => setCform({ ...cform, base_url: e.target.value })} placeholder="https://api.yourdomain.com" /></Field>
            <Field label="Description"><textarea className="textarea" value={cform.description} onChange={(e) => setCform({ ...cform, description: e.target.value })} /></Field>
            <Field label="Auth type"><select className="select" value={cform.auth_type} onChange={(e) => setCform({ ...cform, auth_type: e.target.value })}>
              {['NONE', 'API_KEY', 'BEARER', 'BASIC'].map((a) => <option key={a}>{a}</option>)}
            </select></Field>
          </div>
        </Modal>
      )}

      {openT && (
        <Modal width={640} title={`New tool · ${openT.name}`} sub="Define the request Meta should make. Params can be path, query or JSON body." onClose={() => setOpenT(null)}
          footer={<><button className="btn" onClick={() => setOpenT(null)}>Cancel</button><button className="btn btn-primary" onClick={addTool} disabled={busy || !tform.name}>Register tool</button></>}>
          <div className="stack">
            <div className="grid g2">
              <Field label="Tool name" hint="snake_case, unique"><input className="input mono" value={tform.name} onChange={(e) => setTform({ ...tform, name: e.target.value })} /></Field>
              <Field label="Method"><select className="select" value={tform.method} onChange={(e) => setTform({ ...tform, method: e.target.value })}>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => <option key={m}>{m}</option>)}</select></Field>
            </div>
            <Field label="Path" hint="Use {param} placeholders, e.g. /api/bookings/{order id}"><input className="input mono" value={tform.path} onChange={(e) => setTform({ ...tform, path: e.target.value })} /></Field>
            <Field label="Description for the model" hint="When should the agent call this tool? What does it return?"><textarea className="textarea" value={tform.description} onChange={(e) => setTform({ ...tform, description: e.target.value })} /></Field>
            <Field label="Sample input (JSON)"><input className="input mono" value={tform.test_input} onChange={(e) => setTform({ ...tform, test_input: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {openTool && (
        <Modal width={720} title={`Run ${openTool.name}`} sub="Executes POST /agent_connectors/{id}/tools/{toolId}/run" onClose={() => setOpenTool(null)}
          footer={<><button className="btn" onClick={() => setOpenTool(null)}>Close</button><button className="btn btn-primary" onClick={runTool} disabled={busy}>{busy ? 'Running…' : 'Run tool'}</button></>}>
          <div className="stack">
            <Field label="Input (JSON)"><textarea className="textarea mono" style={{ minHeight: 90 }} value={openTool.test_input} onChange={(e) => setOpenTool({ ...openTool, test_input: e.target.value })} /></Field>
            {result && <pre className="code-block" style={{ maxHeight: 260 }}>{JSON.stringify(result, null, 2)}</pre>}
          </div>
        </Modal>
      )}
    </>
  );
}

function Behaviour({ agent, reload }: { agent: Agent; reload: () => void }) {
  const [settings, setSettings] = useState(agent.settings);
  const [info, setInfo] = useState<BusinessInfo>(agent.business_info);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const save = async () => {
    setBusy(true);
    try { await api(`/api/agents/${agent.id}`, 'PATCH', { settings, business_info: info }); push('Configuration saved and pushed to Meta.'); reload(); }
    catch (e) { push(e instanceof Error ? e.message : 'Failed', true); } finally { setBusy(false); }
  };
  return (
    <div className="split-2">
      <div className="stack">
        <Card>
          <div className="card-head"><div className="card-title">Business information</div><span className="badge info" style={{ marginLeft: 'auto' }}>PUT /agent_config/business_info</span></div>
          <div className="card-pad grid g2">
            <Field wide label="Business description"><textarea className="textarea" value={info.business_description} onChange={(e) => setInfo({ ...info, business_description: e.target.value })} /></Field>
            <Field label="Payment method"><textarea className="textarea" value={info.payment_method} onChange={(e) => setInfo({ ...info, payment_method: e.target.value })} /></Field>
            <Field label="Return / refund policy"><textarea className="textarea" value={info.return_policy} onChange={(e) => setInfo({ ...info, return_policy: e.target.value })} /></Field>
            <Field label="Purchase information"><textarea className="textarea" value={info.purchase_info} onChange={(e) => setInfo({ ...info, purchase_info: e.target.value })} /></Field>
            <Field label="Delivery & shipping"><textarea className="textarea" value={info.delivery_and_shipping} onChange={(e) => setInfo({ ...info, delivery_and_shipping: e.target.value })} /></Field>
            <Field wide label="Loyalty programme"><textarea className="textarea" value={info.loyalty_program} onChange={(e) => setInfo({ ...info, loyalty_program: e.target.value })} /></Field>
            <Field label="Support email"><input className="input" value={info.contact_info.email} onChange={(e) => setInfo({ ...info, contact_info: { ...info.contact_info, email: e.target.value } })} /></Field>
            <Field label="Hours of operation"><input className="input" value={info.contact_info.hours_of_operation} onChange={(e) => setInfo({ ...info, contact_info: { ...info.contact_info, hours_of_operation: e.target.value } })} /></Field>
            <Field wide label="Address / support links"><input className="input" value={info.contact_info.address} onChange={(e) => setInfo({ ...info, contact_info: { ...info.contact_info, address: e.target.value } })} /></Field>
          </div>
        </Card>
        <button className="btn btn-primary" onClick={save} disabled={busy} style={{ alignSelf: 'flex-start' }}>{busy ? 'Saving…' : 'Save & push configuration'}</button>
      </div>

      <div className="stack">
        <Card>
          <div className="card-head"><div className="card-title">Runtime settings</div></div>
          <div className="card-pad stack">
            <div className="spread"><div><div className="small" style={{ fontWeight: 550 }}>Rollout</div><div className="tiny dim">Serve live WhatsApp traffic</div></div><Toggle on={settings.rollout.enabled} onChange={(v) => setSettings({ ...settings, rollout: { enabled: v } })} /></div>
            <hr className="hr" />
            <div className="spread"><div><div className="small" style={{ fontWeight: 550 }}>Human handoff</div><div className="tiny dim">Release thread to your inbox team</div></div><Toggle on={settings.handoff.enabled} onChange={(v) => setSettings({ ...settings, handoff: { ...settings.handoff, enabled: v } })} /></div>
            {settings.handoff.enabled && <textarea className="textarea" value={settings.handoff.message} onChange={(e) => setSettings({ ...settings, handoff: { ...settings.handoff, message: e.target.value } })} />}
            <hr className="hr" />
            <div className="spread"><div><div className="small" style={{ fontWeight: 550 }}>Follow-up nudge</div><div className="tiny dim">Re-engage idle conversations</div></div><Toggle on={settings.followup.enabled} onChange={(v) => setSettings({ ...settings, followup: { ...settings.followup, enabled: v } })} /></div>
            {settings.followup.enabled && <textarea className="textarea" style={{ minHeight: 60 }} value={settings.followup.message} onChange={(e) => setSettings({ ...settings, followup: { ...settings.followup, message: e.target.value } })} />}
            <hr className="hr" />
            <Field label="AI audience"><select className="select" value={settings.ai_audience} onChange={(e) => setSettings({ ...settings, ai_audience: e.target.value as any })}>
              <option value="EVERYONE">Everyone</option><option value="CUSTOMERS_ONLY">Existing customers only</option>
            </select></Field>
          </div>
        </Card>
        <Card className="card-pad">
          <div className="mono tiny dim">GRAPH CALLS ON SAVE</div>
          <div className="code-block" style={{ marginTop: 8, fontSize: 10 }}>{`PUT /${agent.entity_id}/agent_config/settings
  ?agent_id=${agent.meta_agent_id || '{agent_id}'}
X-API-Version: 2.0.0`}</div>
        </Card>
      </div>
    </div>
  );
}

function TestConsole({ agent }: { agent: Agent }) {
  const [msgs, setMsgs] = useState<{ role: string; text: string; tool?: string; latency?: number; skills?: string[] }[]>([
    { role: 'agent', text: `Hi, I'm the ${agent.name} sandbox. Ask me something a customer would.` },
  ]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!text.trim()) return;
    const mine = text;
    setMsgs((m) => [...m, { role: 'customer', text: mine }]);
    setText(''); setBusy(true);
    try {
      const r = await api<any>(`/api/agents/${agent.id}/test`, 'POST', { message: mine });
      setMsgs((m) => [...m, { role: 'agent', text: r.reply, tool: r.tool, latency: r.latency_ms, skills: r.matched_skills }]);
    } catch (e) { setMsgs((m) => [...m, { role: 'agent', text: e instanceof Error ? e.message : 'Failed' }]); }
    finally { setBusy(false); }
  };
  return (
    <div className="split-side">
      <Card>
        <div className="card-head"><div className="card-title">Test console</div><Badge kind="info">SANDBOX</Badge><span className="small dim" style={{ marginLeft: 'auto' }}>{agent.skills.length} skills · {agent.connectors.reduce((s, c) => s + c.tools.length, 0)} tools</span></div>
        <div className="chat" style={{ height: 420, overflowY: 'auto' }}>
          {msgs.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`}>
              {m.text}
              {m.tool && <div style={{ marginTop: 6 }}><span className="tool-tag">↳ {m.tool}</span></div>}
              {(m.latency || m.skills) && <div className="meta">{m.latency}ms · {m.skills?.join(' + ')}</div>}
            </div>
          ))}
          {busy && <div className="bubble agent typing"><i /><i /><i /></div>}
        </div>
        <div className="row" style={{ padding: 12, borderTop: '1px solid var(--line)' }}>
          <input className="input" placeholder="Type a customer message…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
          <button className="btn btn-primary" onClick={send} disabled={busy}><IconSend width={13} height={13} /></button>
        </div>
      </Card>
      <div className="stack">
        <Card className="card-pad">
          <div className="mono tiny dim">TRY THESE</div>
          {['What is my baggage allowance?', 'Check the status of order ID AIXQ7T2M', 'Cancel my booking and refund me', 'I want to speak to a human'].map((s) => (
            <button key={s} className="chip" style={{ width: '100%', justifyContent: 'flex-start', marginTop: 7, height: 30 }} onClick={() => setText(s)}>{s}</button>
          ))}
        </Card>
        <div className="notice">Sandbox replies are generated from your configured skills and tools. Live behaviour is orchestrated by Meta once rollout is enabled.</div>
      </div>
    </div>
  );
}

function Evaluate({ agent }: { agent: Agent }) {
  const [run, setRun] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const cases: EvalCase[] = [
    { id: 'ev_1', agent_id: agent.id, name: 'Create an order end to end', category: 'Orders', input: 'Order 2 large blue t-shirts to pin 560001', expected: 'create_order with items and address, returns an order ID', last_result: 'pass', last_run_at: new Date().toISOString() },
    { id: 'ev_2', agent_id: agent.id, name: 'order ID retrieval requires order ID', category: 'Safety', input: 'Show me my booking', expected: 'Asks for the order ID, never guesses', last_result: 'pass', last_run_at: new Date().toISOString() },
    { id: 'ev_3', agent_id: agent.id, name: 'Refund rules for non-refundable fare', category: 'Cancellation', input: 'Cancel and refund now', expected: 'Explains fare rules, no refund promise', last_result: 'fail', last_run_at: new Date().toISOString() },
    { id: 'ev_4', agent_id: agent.id, name: 'Handoff on human request', category: 'Handoff', input: 'Get me a human', expected: 'thread_control release + handoff message', last_result: 'pass', last_run_at: new Date().toISOString() },
    { id: 'ev_5', agent_id: agent.id, name: 'Never quote price without a tool call', category: 'Pricing', input: 'How much is the blue t-shirt?', expected: 'Calls the catalog tool before quoting a price', last_result: 'not_run', last_run_at: null },
  ];
  const start = async () => {
    setBusy(true);
    try { const r = await api<any>(`/api/agents/${agent.id}/evaluate`, 'POST', { case_ids: cases.map((c) => c.id) }); setRun(r.run); push(`Evaluation complete — ${r.run.score}% pass.`); }
    catch (e) { push(e instanceof Error ? e.message : 'Failed', true); } finally { setBusy(false); }
  };
  const passed = cases.filter((c) => c.last_result === 'pass').length;
  return (
    <>
      <div className="grid g4" style={{ marginBottom: 12 }}>
        <Card className="card-pad"><div className="mono tiny dim">CASES</div><div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{cases.length}</div></Card>
        <Card className="card-pad"><div className="mono tiny dim">PASS RATE</div><div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{Math.round((passed / cases.length) * 100)}%</div></Card>
        <Card className="card-pad"><div className="mono tiny dim">LAST RUN</div><div style={{ fontSize: 14, fontWeight: 600, marginTop: 8 }}>{run ? 'just now' : '2 days ago'}</div></Card>
        <Card className="card-pad" style={{ display: 'grid', placeItems: 'center' }}><button className="btn btn-primary" onClick={start} disabled={busy} style={{ width: '100%' }}>{busy ? 'Running…' : 'Run all cases'}</button></Card>
      </div>
      <Card>
        <div className="card-head"><div className="card-title">Evaluation suite</div><span className="small dim" style={{ marginLeft: 'auto' }}>POST /agent-eval/run?eval_case_ids=</span></div>
        <table className="tbl">
          <thead><tr><th>Case</th><th>Input</th><th>Expected behaviour</th><th className="right">Result</th></tr></thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.id}>
                <td><div style={{ fontWeight: 550, fontSize: 12 }}>{c.name}</div><div className="tiny dim">{c.category}</div></td>
                <td className="small muted" style={{ maxWidth: 240 }}>{c.input}</td>
                <td className="small muted" style={{ maxWidth: 260 }}>{c.expected}</td>
                <td className="right"><span className={`badge ${c.last_result === 'pass' ? 'live' : c.last_result === 'fail' ? 'danger' : 'draft'}`}>{c.last_result.replace('_', ' ')}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {run && (
        <div className="notice ok" style={{ marginTop: 10 }}>
          Run <span className="mono">{run.job_id}</span> completed · score {run.score}% · {run.cases_passed}/{run.cases_total} cases passed.
        </div>
      )}
    </>
  );
}

function PublishModal({ agent, open, onClose, onDone }: { agent: Agent; open: boolean; onClose: () => void; onDone: (mode: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!open) return null;
  const go = async () => {
    setBusy(true); setErr('');
    try { const r = await api<any>(`/api/agents/${agent.id}/publish`, 'POST', {}); onDone(r.mode); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Publish failed'); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Publish ${agent.name}`} sub={`Draft v${agent.version} → v${agent.version + 1}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={go} disabled={busy}>{busy ? 'Publishing…' : 'Enable rollout'}</button></>}>
      <div className="stack">
        <div className="grid g2">
          {[['FAQs', agent.faqs.length], ['Skills', agent.skills.length], ['Connectors', agent.connectors.length], ['Tools', agent.connectors.reduce((s, c) => s + c.tools.length, 0)]].map(([k, v]) => (
            <div key={k as string} className="card" style={{ padding: 11 }}><div className="mono tiny dim">{String(k).toUpperCase()}</div><div style={{ fontSize: 17, fontWeight: 600 }}>{v as number}</div></div>
          ))}
        </div>
        <div className="notice info">Publishing sends <span className="mono">PUT /{agent.entity_id}/agent_config/settings?agent_id=…</span> with <span className="mono">rollout.enabled = true</span>. Without a tenant Meta token the platform publishes in config-only mode and records the change in the audit log.</div>
        {err && <div className="notice err">{err}</div>}
      </div>
    </Modal>
  );
}


function BulkUpload({ agentId, section, reload }: { agentId: string; section: 'faqs' | 'skills' | 'connectors'; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState('');
  const [prog, setProg] = useState<{ done: number; total: number; label: string } | null>(null);

  const meta = {
    faqs: { title: 'Bulk upload FAQs', sub: 'Spreadsheet columns: question, answer, category (optional).', file: 'faqs-import.xlsx', csv: 'faqs-import.csv' },
    skills: { title: 'Bulk upload skills', sub: 'Spreadsheet columns: title, description, skill (the full markdown instructions).', file: 'skills-import.xlsx', csv: 'skills-import.csv' },
    connectors: { title: 'Bulk upload connectors', sub: 'Two sheets — Connectors (name, base_url, auth_type) and Tools (connector_name, tool_name, method, path, params).', file: 'connectors-import.xlsx', csv: '' },
  }[section];

  const upload = async (file: File) => {
    setBusy(true); setErr(''); setRes(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch(`/api/agents/${agentId}/${section}`, { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Import failed (${r.status})`);
      setRes(d);
      reload();
      // Rows are already in the database — now show the Meta push as it happens.
      if (section !== 'connectors' && (d.imported ?? 0) > 0) {
        setProg({ done: 0, total: d.imported, label: `Uploading ${section === 'faqs' ? 'FAQs' : 'skills'} to Meta` });
        try {
          await pushChunked(agentId, section, (done, total) => setProg({ done, total, label: `Uploading ${section === 'faqs' ? 'FAQs' : 'skills'} to Meta` }));
        } catch { /* import already succeeded locally; push can be retried */ }
        finally { setProg(null); reload(); }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Import failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="row" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div>
          <div className="small"><b>{meta.title}</b></div>
          <div className="tiny dim" style={{ marginTop: 2 }}>{meta.sub}</div>
          <div className="tiny" style={{ marginTop: 6 }}>
            <a className="link" href={`/templates/${meta.file}`} download>Download Excel template</a>
            {meta.csv && <> · <a className="link" href={`/templates/${meta.csv}`} download>CSV</a></>}
            <span className="dim"> · max 300 rows per file</span>
          </div>
        </div>
        <label className={`btn ${busy ? '' : 'btn-primary'}`} style={{ cursor: busy ? 'default' : 'pointer' }}>
          {busy ? 'Importing…' : 'Upload .xlsx / .csv'}
          <input type="file" accept=".xlsx,.xls,.csv,text/csv" hidden disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.currentTarget.value = ''; }} />
        </label>
      </div>

      {prog && <ProgressBar value={prog.done} total={prog.total} label={prog.label} />}
      {err && <div className="notice err" style={{ marginTop: 12 }}>{err}</div>}

      {res && (
        <div className="stack" style={{ gap: 8, marginTop: 12 }}>
          <div className="notice ok" style={{ margin: 0 }}>
            <b>{res.imported} imported</b>{res.skipped ? ` · ${res.skipped} duplicates skipped` : ''}
            {res.errors?.length ? ` · ${res.errors.length} row${res.errors.length === 1 ? '' : 's'} rejected` : ''}
          </div>
          {!!res.created?.length && (
            <div className="tiny dim">Added: {res.created.join(' · ')}{res.imported > res.created.length ? ` +${res.imported - res.created.length} more` : ''}</div>
          )}
          {!!res.warnings?.length && (
            <details>
              <summary className="tiny" style={{ cursor: 'pointer' }}>{res.warnings.length} warning{res.warnings.length === 1 ? '' : 's'}</summary>
              <ul className="tiny dim" style={{ margin: '6px 0 0 16px', padding: 0 }}>
                {res.warnings.slice(0, 12).map((w: string, i: number) => <li key={i}>{w}</li>)}
              </ul>
            </details>
          )}
          {!!res.errors?.length && (
            <details open>
              <summary className="tiny" style={{ cursor: 'pointer' }}>{res.errors.length} row error{res.errors.length === 1 ? '' : 's'}</summary>
              <ul className="tiny" style={{ margin: '6px 0 0 16px', padding: 0 }}>
                {res.errors.slice(0, 12).map((e: any, i: number) => <li key={i}><span className="mono">row {e.row}</span> — {e.error}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
