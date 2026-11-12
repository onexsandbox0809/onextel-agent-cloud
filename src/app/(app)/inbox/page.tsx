'use client';
import { useState } from 'react';
import { api, Badge, Card, Empty, fmt, Skeleton, Status, useApi, useToast } from '@/components/ui';
import { IconSend, IconShield, IconBolt } from '@/components/icons';
import type { Conversation } from '@/lib/types';

export default function Inbox() {
  const { data, loading, reload } = useApi<{ conversations: Conversation[] }>('/api/inbox');
  const [sel, setSel] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [filter, setFilter] = useState('all');
  const { push } = useToast();
  const conversations = (data?.conversations || []).filter((c) => filter === 'all' || c.status === filter);
  const active = conversations.find((c) => c.id === sel) || conversations[0];

  const act = async (action: string) => {
    if (!active) return;
    try {
      const r = await api<any>(`/api/inbox/${active.id}`, 'POST', { action, text });
      if (action === 'reply') setText('');
      push(action === 'reply' ? 'Reply sent as human agent.' : action === 'takeover' ? 'Thread taken over — agent paused.' : 'Thread released back to the agent.');
      reload();
    } catch (e) { push(e instanceof Error ? e.message : 'Failed', true); }
  };

  if (loading) return <Skeleton h={500} />;

  return (
    <>
      <div className="page-head">
        <div><h1 className="page-title">Conversations</h1><p className="page-sub">Live WhatsApp threads across your agents. Take over to reply as a human, then release back to the agent.</p></div>
        <div className="actions">
          {['all', 'open', 'handoff', 'resolved'].map((f) => (
            <button key={f} className="btn btn-sm" style={{ background: filter === f ? 'var(--accent-tint)' : undefined, borderColor: filter === f ? 'var(--accent-line)' : undefined, color: filter === f ? 'var(--text)' : 'var(--muted)' }} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '340px minmax(0,1fr)', gap: 12, alignItems: 'start' }}>
        <Card>
          <div className="card-head"><div className="card-title">Inbox</div><span className="badge info" style={{ marginLeft: 'auto' }}>{conversations.length}</span></div>
          <div style={{ maxHeight: 620, overflowY: 'auto' }}>
            {conversations.map((c) => (
              <button key={c.id} onClick={() => setSel(c.id)} style={{ width: '100%', textAlign: 'left', background: active?.id === c.id ? 'var(--accent-tint)' : 'none', border: 0, borderBottom: '1px solid rgba(32,39,35,.6)' }}>
                <div className="list-row">
                  <span className="avatar" style={{ background: 'hsl(150 32% 38%)', color: '#fff' }}>{c.customer.split(' ').map((p) => p[0]).join('')}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="spread"><span style={{ fontSize: 12.5, fontWeight: 550 }}>{c.customer}</span><span className="tiny dim">{fmt.ago(c.updated_at)}</span></div>
                    <div className="tiny muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 210 }}>{c.messages[c.messages.length - 1]?.text}</div>
                    <div className="row" style={{ marginTop: 4, gap: 5 }}><Status value={c.status} />{c.unread > 0 && <span className="badge live" style={{ height: 16 }}>{c.unread} new</span>}</div>
                  </div>
                </div>
              </button>
            ))}
            {conversations.length === 0 && <Empty title="Nothing here" sub="No conversations match this filter." />}
          </div>
        </Card>

        {active ? (
          <Card>
            <div className="card-head">
              <div style={{ flex: 1 }}>
                <div className="row" style={{ gap: 8 }}><span className="card-title">{active.customer}</span><Status value={active.status} /></div>
                <div className="tiny mono dim">{active.handle} · agent {active.agent_id}</div>
              </div>
              <button className="btn btn-sm" onClick={() => act('takeover')}><IconShield width={12} height={12} /> Take over</button>
              <button className="btn btn-sm" onClick={() => act('release')}><IconBolt width={12} height={12} /> Release</button>
            </div>
            <div className="chat" style={{ height: 430, overflowY: 'auto' }}>
              {active.messages.map((m) => (
                <div key={m.id} className={`bubble ${m.role}`}>
                  {m.text}
                  <div className="meta">{m.role} · {fmt.ago(m.at)}{m.tool ? ` · ${m.tool}` : ''}</div>
                </div>
              ))}
            </div>
            <div className="row" style={{ padding: 12, borderTop: '1px solid var(--line)' }}>
              <input className="input" placeholder="Reply as a human agent…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && act('reply')} />
              <button className="btn btn-primary" onClick={() => act('reply')} disabled={!text.trim()}><IconSend width={13} height={13} /> Send</button>
            </div>
          </Card>
        ) : <Card><Empty title="Select a conversation" /></Card>}
      </div>
    </>
  );
}
