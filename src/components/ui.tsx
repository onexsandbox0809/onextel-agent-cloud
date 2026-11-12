'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { IconCheck, IconRefresh, IconX } from './icons';

export function Badge({ kind = 'draft', children, dot = true }: { kind?: string; children: ReactNode; dot?: boolean }) {
  return <span className={`badge ${kind}`}>{dot && <span className="dot" />}{children}</span>;
}

export const statusKind: Record<string, string> = {
  live: 'live', active: 'live', processed: 'live', pass: 'live', ok: 'live', completed: 'live', connected: 'live',
  draft: 'draft', disabled: 'draft', not_run: 'draft', queued: 'draft', invited: 'draft',
  in_review: 'review', pending_registration: 'review', retrying: 'review', expiring: 'review', trial: 'review', provisioning: 'review',
  paused: 'warn', suspended: 'danger', failed: 'danger', error: 'danger', invalid: 'danger', fail: 'danger',
  handoff: 'warn', open: 'info', resolved: 'live', running: 'info', warning: 'warn', critical: 'danger', info: 'info',
};

export function Status({ value }: { value: string }) {
  return <Badge kind={statusKind[value] || 'draft'}>{value.replace(/_/g, ' ')}</Badge>;
}

export function Card({ children, className = '', ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`card ${className}`} {...rest}>{children}</div>;
}

export function Stat({ label, value, foot, delta, icon }: { label: string; value: ReactNode; foot?: ReactNode; delta?: number; icon?: ReactNode }) {
  return (
    <div className="card stat">
      <div className="label">{icon}{label}</div>
      <div className="val">{value}</div>
      {foot && <div className="foot">{delta !== undefined && (
        <span className={delta >= 0 ? 'delta-up' : 'delta-down'}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%</span>
      )}{foot}</div>}
    </div>
  );
}

export function Field({ label, hint, children, wide }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="field" style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <label>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" aria-label={label} aria-pressed={on} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />
  );
}

export function Modal({ title, sub, children, footer, onClose, width }: { title: string; sub?: string; children: ReactNode; footer?: ReactNode; onClose: () => void; width?: number }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: width || 560 }} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 15 }}>{title}</h3>
            {sub && <div className="small dim" style={{ marginTop: 3 }}>{sub}</div>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><IconX width={14} height={14} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ── data fetching ───────────────────────────────────── */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      const r = await fetch(url, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Request failed');
      setData(j);
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Request failed'); }
    finally { setLoading(false); }
  }, [url]);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}

export async function api<T = any>(url: string, method: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j as T;
}

/* ── toasts ──────────────────────────────────────────── */
type Toast = { id: number; text: string; error?: boolean };
const ToastCtx = createContext<{ push: (t: string, error?: boolean) => void }>({ push: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastHost({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, error?: boolean) => {
    const id = Date.now() + Math.random();
    setItems((p) => [...p, { id, text, error }]);
    setTimeout(() => setItems((p) => p.filter((x) => x.id !== id)), 4200);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.error ? 'err' : ''}`}>
          <div className="row" style={{ gap: 8 }}>
            {t.error ? <IconX width={14} height={14} style={{ color: 'var(--red)' }} /> : <IconCheck width={14} height={14} style={{ color: 'var(--lime)' }} />}
            <span>{t.text}</span>
          </div>
        </div>
      ))}
    </ToastCtx.Provider>
  );
}

export function Empty({ icon, title, sub, action }: { icon?: ReactNode; title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="icon">{icon || <IconRefresh width={16} height={16} />}</div>
      <div style={{ color: 'var(--text)', fontWeight: 550 }}>{title}</div>
      {sub && <div style={{ marginTop: 4 }}>{sub}</div>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%' }: { h?: number; w?: number | string }) {
  return <div style={{ height: h, width: w, borderRadius: 6, background: 'linear-gradient(90deg,var(--skel-a),var(--skel-b),var(--skel-a))', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />;
}

export function Avatar({ name, hue = 74, size = '' }: { name: string; hue?: number; size?: '' | 'lg' | 'sm' }) {
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return <span className={`avatar ${size}`} style={{ background: `hsl(${hue} 42% 44%)` }}>{initials}</span>;
}

export function Sparkline({ data, color = 'var(--lime)', height = 34 }: { data: number[]; color?: string; height?: number }) {
  const min = Math.min(...data), max = Math.max(...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${height - ((v - min) / (max - min || 1)) * (height - 4) - 2}`).join(' ');
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function CountUp({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [n, setN] = useState(0);
  const ref = useRef<number>(0);
  useEffect(() => {
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 600);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) ref.current = requestAnimationFrame(tick);
    };
    ref.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(ref.current);
  }, [value]);
  return <>{n.toLocaleString('en-IN')}{suffix}</>;
}

export const fmt = {
  num: (n: number) => n.toLocaleString('en-IN'),
  pct: (n: number) => `${n.toFixed(1)}%`,
  inr: (n: number) => `₹${n.toLocaleString('en-IN')}`,
  ago: (iso: string) => {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  },
  date: (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
};

export function ProgressBar({ value, total, label }: { value: number; total: number; label?: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div style={{ marginTop: 8 }}>
      <div className="row spread tiny dim" style={{ marginBottom: 4 }}>
        <span>{label ?? 'Pushing to Meta'}</span>
        <span className="mono">{value}/{total} · {pct}%</span>
      </div>
      <div style={{ height: 6, background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent-fill)', transition: 'width .18s ease' }} />
      </div>
    </div>
  );
}
