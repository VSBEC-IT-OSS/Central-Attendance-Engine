import { useState } from 'react';

// ── Badge ─────────────────────────────────────────────────────────────────────
export function Badge({ label, type = 'neutral' }: { label: string; type?: 'success' | 'error' | 'warn' | 'info' | 'neutral' }) {
  return <span className={`badge badge-${type}`}>{label}</span>;
}

export function ImportStatusBadge({ status }: { status: string }) {
  const map: Record<string, 'success' | 'error' | 'warn' | 'info' | 'neutral'> = {
    SUCCESS: 'success', FAILED: 'error', PARTIAL: 'warn', PROCESSING: 'info', PENDING: 'neutral',
  };
  return <Badge label={status} type={map[status] ?? 'neutral'} />;
}

export function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, 'success' | 'error' | 'warn' | 'info' | 'neutral'> = {
    INFO: 'info', WARN: 'warn', ERROR: 'error', CRITICAL: 'error',
  };
  return <Badge label={severity} type={map[severity] ?? 'neutral'} />;
}

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ animation: 'spin 0.8s linear infinite' }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <circle cx="12" cy="12" r="10" stroke="var(--border2)" strokeWidth="2" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
export function EmptyState({ message = 'No data found' }: { message?: string }) {
  return (
    <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
      <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>⬜</div>
      {message}
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────
export function Pagination({
  page, totalPages, onChange,
}: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex gap-2 items-center" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
      <button className="btn btn-sm" disabled={page === 1} onClick={() => onChange(page - 1)}>← prev</button>
      <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
        {page} / {totalPages}
      </span>
      <button className="btn btn-sm" disabled={page === totalPages} onClick={() => onChange(page + 1)}>next →</button>
    </div>
  );
}

// ── Copy button ───────────────────────────────────────────────────────────────
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn btn-sm"
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
    >
      {copied ? '✓ copied' : 'copy'}
    </button>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
export function StatCard({
  label, value, sub, color,
}: { label: string; value: string | number; sub?: string; color?: 'green' | 'red' | 'amber' | 'accent' }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${color ?? ''}`}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
export function SectionHeader({
  title, sub, action,
}: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="section-header">
      <div>
        <div className="section-title">{title}</div>
        {sub && <div className="section-sub">{sub}</div>}
      </div>
      {action}
    </div>
  );
}

// ── Filters bar ───────────────────────────────────────────────────────────────
export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 items-center flex-wrap" style={{ marginBottom: 16 }}>
      {children}
    </div>
  );
}
