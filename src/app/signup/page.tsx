'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { IconBolt, IconBot, IconCheck, IconPlug, IconRocket, IconShield } from '@/components/icons';

const strength = (p: string) => {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(s, 4);
};

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ company: '', person: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const score = strength(form.password);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not create your workspace.');
      router.push(j.redirect || '/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your workspace.');
    } finally { setBusy(false); }
  };

  return (
    <div className="login-wrap">
      <section className="login-art">
        <Link href="/login" className="row" style={{ gap: 10, position: 'relative', zIndex: 2 }}>
          <div className="brand-mark">OX</div>
          <div>
            <div className="brand-name">Onextel Agent Cloud</div>
            <div className="brand-sub">Meta Business Agent control plane</div>
          </div>
        </Link>

        <div style={{ marginLeft: 'auto', marginRight: 'auto', marginTop: 'auto', position: 'relative', zIndex: 2, maxWidth: 520 }}>
          <div className="mono tiny" style={{ color: 'var(--accent)', letterSpacing: '.18em' }}>START IN MINUTES</div>
          <h1 style={{ fontSize: 38, lineHeight: 1.08, letterSpacing: '-.04em', marginTop: 14 }}>
            Your workspace,<br />your WhatsApp agents.
          </h1>
          <p className="muted" style={{ marginTop: 16, fontSize: 13.5, maxWidth: 430 }}>
            Create a workspace to provision numbers, build knowledge and skills, connect your APIs as agent tools,
            and roll out — all under your own tenant.
          </p>
          <div className="grid g2" style={{ marginTop: 26, gap: 10 }}>
            {[
              { icon: <IconBot width={14} height={14} />, t: 'Multiple agents', s: 'One per number' },
              { icon: <IconPlug width={14} height={14} />, t: 'Your APIs', s: 'Mapped as tools' },
              { icon: <IconShield width={14} height={14} />, t: 'Isolated tenant', s: 'RBAC + audit' },
              { icon: <IconRocket width={14} height={14} />, t: 'Governed rollout', s: 'Test then publish' },
            ].map((f) => (
              <div key={f.t} className="card" style={{ padding: 11, background: 'var(--panel-2)' }}>
                <div style={{ color: 'var(--accent)' }}>{f.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 600, marginTop: 7 }}>{f.t}</div>
                <div className="tiny dim">{f.s}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="login-quote" style={{ marginTop: 34 }}>
          <div className="tiny dim mono">BUILT ON · NEXT.JS · SUPABASE · VERCEL · GRAPH API v25.0</div>
        </div>
      </section>

      <section className="login-form">
        <div className="login-box">
          <h2 style={{ fontSize: 22, letterSpacing: '-.03em' }}>Create your workspace</h2>
          <p className="muted small" style={{ marginTop: 5 }}>You become the tenant admin — free to configure everything from day one.</p>

          <form onSubmit={submit} className="stack" style={{ marginTop: 22, gap: 12 }}>
            <div className="field">
              <label>Company name</label>
              <input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Onextel" required minLength={2} />
            </div>
            <div className="field">
              <label>Your name</label>
              <input className="input" value={form.person} onChange={(e) => setForm({ ...form, person: e.target.value })} placeholder="Puneet Bhargava" required minLength={2} />
            </div>
            <div className="field">
              <label>Work email</label>
              <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" autoComplete="email" required />
            </div>
            <div className="field">
              <label>Password</label>
              <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" autoComplete="new-password" required minLength={8} />
              <div className="row" style={{ gap: 4, marginTop: 3 }}>
                {[1, 2, 3, 4].map((i) => (
                  <span key={i} style={{ height: 3, flex: 1, borderRadius: 99, background: score >= i ? (score <= 2 ? 'var(--warn)' : 'var(--ok)') : 'var(--line-2)' }} />
                ))}
                <span className="tiny dim" style={{ marginLeft: 6 }}>{['weak', 'fair', 'good', 'strong'][Math.max(0, score - 1)] || ''}</span>
              </div>
            </div>

            {error && <div className="notice err">{error}</div>}

            <button className="btn btn-primary btn-lg" type="submit" disabled={busy} style={{ width: '100%', marginTop: 4 }}>
              {busy ? 'Creating workspace…' : 'Create workspace'} <IconBolt width={14} height={14} />
            </button>
          </form>

          <div className="row" style={{ margin: '22px 0 12px', gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            <span className="mono tiny dim">ALREADY HAVE AN ACCOUNT</span>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          </div>

          <Link href="/login" className="btn" style={{ width: '100%' }}>
            <IconCheck width={13} height={13} /> Sign in instead
          </Link>

          <p className="tiny dim" style={{ marginTop: 18, lineHeight: 1.6 }}>
            Your workspace is the isolation boundary — its agents, numbers and credentials are never visible to
            other tenants. A platform admin can also provision your workspace and hand you the credentials.
          </p>
        </div>
      </section>
    </div>
  );
}
