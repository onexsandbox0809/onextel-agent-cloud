'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { IconBolt, IconCheck, IconPlug, IconRocket, IconShield } from '@/components/icons';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Sign-in failed');
      router.push(j.redirect || '/dashboard');
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Sign-in failed'); }
    finally { setBusy(false); }
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

        <div style={{ marginTop: 'auto', position: 'relative', zIndex: 2, maxWidth: 520 }}>
          <div className="mono tiny" style={{ color: 'var(--accent)', letterSpacing: '.18em' }}>WHATSAPP · META BUSINESS AGENT</div>
          <h1 style={{ fontSize: 40, lineHeight: 1.08, letterSpacing: '-.04em', marginTop: 14 }}>
            One control plane<br />for every agent,<br /><span style={{ color: 'var(--accent)' }}>every tenant.</span>
          </h1>
          <p className="muted" style={{ marginTop: 16, fontSize: 13.5, maxWidth: 430 }}>
            Provision numbers, compose knowledge and skills, wire your APIs as agent tools, evaluate,
            then roll out — with tenant isolation, audit trails and approvals built in.
          </p>

          <div className="flow-line" style={{ marginTop: 26, flexWrap: 'wrap' }}>
            <span className="flow-node on">Number</span><span>→</span>
            <span className="flow-node">Onboarding</span><span>→</span>
            <span className="flow-node">Knowledge</span><span>→</span>
            <span className="flow-node">Connectors</span><span>→</span>
            <span className="flow-node">Eval</span><span>→</span>
            <span className="flow-node">Rollout</span>
          </div>

          <div className="grid g3" style={{ marginTop: 34, gap: 10 }}>
            {[
              { icon: <IconCheck width={14} height={14} />, t: 'Multi-agent', s: 'Per number, per tenant' },
              { icon: <IconPlug width={14} height={14} />, t: 'API tools', s: 'OpenAPI-style mapping' },
              { icon: <IconShield width={14} height={14} />, t: 'Governed', s: 'RBAC + audit' },
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
          <h2 style={{ fontSize: 22, letterSpacing: '-.03em' }}>Sign in to your workspace</h2>
          <p className="muted small" style={{ marginTop: 5 }}>Use the credentials your admin created, or your own if you registered.</p>

          <form onSubmit={submit} className="stack" style={{ marginTop: 22, gap: 12 }}>
            <div className="field">
              <label>Work email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" required />
            </div>
            <div className="field">
              <label>Password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
            </div>
            {error && <div className="notice err">{error}</div>}
            <button className="btn btn-primary btn-lg" type="submit" disabled={busy} style={{ width: '100%', marginTop: 4 }}>
              {busy ? 'Signing in…' : 'Continue'} <IconBolt width={14} height={14} />
            </button>
          </form>

          <div className="row" style={{ margin: '24px 0 14px', gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            <span className="mono tiny dim">NEW HERE</span>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          </div>

          <Link href="/signup" className="btn" style={{ width: '100%' }}>
            <IconRocket width={13} height={13} /> Create a workspace
          </Link>

          <p className="tiny dim" style={{ marginTop: 18, lineHeight: 1.6 }}>
            Creating a workspace makes you its tenant admin. You can configure numbers, agents, knowledge,
            connectors and rollout yourself — no platform access required.
          </p>
        </div>
      </section>
    </div>
  );
}
