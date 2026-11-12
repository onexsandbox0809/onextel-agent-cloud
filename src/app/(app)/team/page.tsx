'use client';
import { useState } from 'react';
import { api, Avatar, Card, Field, fmt, Modal, Skeleton, Status, useApi, useToast } from '@/components/ui';
import { IconPlus, IconUsers } from '@/components/icons';
import type { Session, User } from '@/lib/types';

const roles = ['platform_admin', 'tenant_admin', 'operator', 'viewer'];

export default function Team() {
  const { data, loading, reload } = useApi<{ users: User[] }>('/api/team');
  const ses = useApi<Session>('/api/session');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'operator', tenant_id: '' });
  const { push } = useToast();
  const isAdmin = ses.data?.user.role === 'platform_admin' || ses.data?.user.role === 'tenant_admin';

  const invite = async () => {
    try { await api('/api/team', 'POST', form); push('Invitation sent.'); setOpen(false); reload(); }
    catch (e) { push(e instanceof Error ? e.message : 'Failed', true); }
  };
  const change = async (id: string, role: string) => {
    try { await api('/api/team', 'PATCH', { id, role }); push('Role updated.'); reload(); }
    catch (e) { push(e instanceof Error ? e.message : 'Failed', true); }
  };

  if (loading) return <Skeleton h={320} />;

  return (
    <>
      <div className="page-head">
        <div><h1 className="page-title">Team & roles</h1><p className="page-sub">Role-based access control. Tenant admins manage their own workspace; platform admins can see every tenant.</p></div>
        {isAdmin && <div className="actions"><button className="btn btn-primary" onClick={() => { setForm({ ...form, tenant_id: ses.data?.user.tenant_id || '' }); setOpen(true); }}><IconPlus width={14} height={14} /> Invite member</button></div>}
      </div>

      <div className="grid g4" style={{ marginBottom: 12 }}>
        {[['Members', data?.users.length || 0], ['Active', data?.users.filter((u) => u.status === 'active').length || 0], ['Invited', data?.users.filter((u) => u.status === 'invited').length || 0], ['Seats', ses.data?.tenant?.seats || '—']].map(([l, v]) => (
          <Card key={l as string} className="card-pad"><div className="mono tiny dim">{String(l).toUpperCase()}</div><div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{v as any}</div></Card>
        ))}
      </div>

      <Card>
        <div className="card-head"><div className="card-title">Members</div></div>
        <table className="tbl">
          <thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Last active</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {data?.users.map((u) => (
              <tr key={u.id}>
                <td><div className="row" style={{ gap: 9 }}><Avatar name={u.name} hue={u.avatar_hue} /><div><div style={{ fontSize: 12.5, fontWeight: 550 }}>{u.name}</div><div className="tiny dim mono">{u.email}</div></div></div></td>
                <td>
                  {isAdmin && u.id !== ses.data?.user.id ? (
                    <select className="select" style={{ width: 150, height: 28 }} value={u.role} onChange={(e) => change(u.id, e.target.value)}>
                      {roles.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                    </select>
                  ) : <span className="badge info">{u.role.replace('_', ' ')}</span>}
                </td>
                <td><Status value={u.status} /></td>
                <td className="small muted">{fmt.ago(u.last_active)}</td>
                <td className="right">{u.id === ses.data?.user.id ? <span className="tiny dim">you</span> : <button className="btn btn-ghost btn-sm">Manage</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="section-title">Role matrix</div>
      <Card>
        <table className="tbl">
          <thead><tr><th>Capability</th><th>Platform admin</th><th>Tenant admin</th><th>Operator</th><th>Viewer</th></tr></thead>
          <tbody>
            {[
              ['View all tenants', true, false, false, false],
              ['Configure agents', true, true, false, false],
              ['Manage numbers & credentials', true, true, false, false],
              ['Test & evaluate', true, true, true, false],
              ['Reply in conversations', true, true, true, false],
              ['Read analytics', true, true, true, true],
            ].map((r) => (
              <tr key={r[0] as string}>
                <td className="small">{r[0]}</td>
                {r.slice(1).map((v, i) => <td key={i}><span style={{ color: v ? 'var(--lime)' : 'var(--dim)' }}>{v ? '✓' : '—'}</span></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {open && (
        <Modal title="Invite a member" sub="They receive an email invite and land in your tenant." onClose={() => setOpen(false)}
          footer={<><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={invite} disabled={!form.email}>Send invite</button></>}>
          <div className="stack">
            <Field label="Full name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Work email"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Role"><select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{roles.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}</select></Field>
            {ses.data?.user.role === 'platform_admin' && (
              <Field label="Tenant"><select className="select" value={form.tenant_id} onChange={(e) => setForm({ ...form, tenant_id: e.target.value })}><option value="">Onextel platform</option>{ses.data.tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
