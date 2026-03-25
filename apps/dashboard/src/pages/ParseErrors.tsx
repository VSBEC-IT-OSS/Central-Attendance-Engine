import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { SectionHeader, FilterBar, Pagination, Spinner, EmptyState, CopyButton, SeverityBadge } from '../components/ui';
import { format } from 'date-fns';

// ─────────────────────────────────────────────────────────────────────────────
// Parse Errors Page
// ─────────────────────────────────────────────────────────────────────────────
export function ParseErrorsPage() {
  const [errors, setErrors] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.admin.parseErrors({ page: String(page), limit: '30' });
      setErrors(Array.isArray(res) ? res : res.data ?? []);
      setMeta(res.meta ?? null);
    } finally { setLoading(false); }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <SectionHeader
        title="Parse Errors"
        sub="Row-level failures across all imports"
        action={<button className="btn btn-sm" onClick={load}>↻</button>}
      />
      <div className="card">
        {loading ? (
          <div style={{ padding: 32, display: 'flex', gap: 12, alignItems: 'center', color: 'var(--text3)' }}><Spinner /> loading...</div>
        ) : errors.length === 0 ? (
          <EmptyState message="No parse errors — system is healthy" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Row #</th>
                  <th>Code</th>
                  <th>Message</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((e: any) => (
                  <tr key={e.id}>
                    <td><code style={{ fontSize: 11 }}>{e.importLog?.filename ?? '—'}</code></td>
                    <td><code>{e.rowNumber}</code></td>
                    <td><span className="badge badge-error">{e.errorCode}</span></td>
                    <td style={{ maxWidth: 380, color: 'var(--text)' }}>{e.errorMessage}</td>
                    <td><span style={{ fontSize: 11, color: 'var(--text3)' }}>{format(new Date(e.createdAt), 'dd MMM, HH:mm')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalPages={meta?.totalPages ?? 1} onChange={setPage} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// API Keys Page
// ─────────────────────────────────────────────────────────────────────────────
export function ApiKeysPage() {
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPerms, setNewPerms] = useState('attendance:read,summary:read');
  const [createdKey, setCreatedKey] = useState<{ name: string; key: string } | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setKeys(await api.admin.apiKeys()); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const perms = newPerms.split(',').map((s) => s.trim()).filter(Boolean);
      const result = await api.admin.createApiKey(newName.trim(), perms);
      setCreatedKey({ name: result.name, key: result.key });
      setNewName(''); setShowForm(false);
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally { setCreating(false); }
  };

  const handleRevoke = async (id: string, name: string) => {
    if (!confirm(`Revoke API key "${name}"? This cannot be undone.`)) return;
    await api.admin.revokeApiKey(id);
    await load();
  };

  return (
    <div>
      <SectionHeader
        title="API Keys"
        sub="Consumer apps use these keys with the X-API-Key header"
        action={<button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>+ new key</button>}
      />

      {/* One-time reveal */}
      {createdKey && (
        <div style={{ padding: 16, marginBottom: 20, background: 'var(--green2)', border: '1px solid var(--green)', borderRadius: 6 }}>
          <div style={{ color: 'var(--green)', fontWeight: 500, marginBottom: 8 }}>✓ Key created: {createdKey.name}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{ fontSize: 12, color: 'var(--text)', wordBreak: 'break-all', flex: 1 }}>{createdKey.key}</code>
            <CopyButton text={createdKey.key} />
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text3)' }}>
            ⚠ This key will NOT be shown again. Store it securely now.
          </div>
          <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => setCreatedKey(null)}>dismiss</button>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title">New API Key</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label className="field-label">Name (unique identifier)</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. whatsapp-bot" style={{ width: 220 }} />
            </div>
            <div>
              <label className="field-label">Permissions (comma-separated)</label>
              <input value={newPerms} onChange={(e) => setNewPerms(e.target.value)} style={{ width: 320 }} />
            </div>
            <button className="btn btn-primary" onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? <Spinner size={14} /> : 'generate key'}
            </button>
            <button className="btn" onClick={() => setShowForm(false)}>cancel</button>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text3)' }}>
            Available permissions: <code>attendance:read</code> · <code>summary:read</code> · <code>*</code> (all)
          </div>
        </div>
      )}

      <div className="card">
        {loading ? (
          <div style={{ padding: 32, display: 'flex', gap: 12, alignItems: 'center', color: 'var(--text3)' }}><Spinner /></div>
        ) : keys.length === 0 ? (
          <EmptyState message="No API keys yet. Create one to connect a consumer app." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Prefix</th>
                  <th>Permissions</th>
                  <th>Last Used</th>
                  <th>Created</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k: any) => (
                  <tr key={k.id}>
                    <td><strong style={{ color: 'var(--text)' }}>{k.name}</strong></td>
                    <td><code>{k.keyPrefix}…</code></td>
                    <td>
                      <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                        {k.permissions.map((p: string) => (
                          <span key={p} className="badge badge-info">{p}</span>
                        ))}
                      </div>
                    </td>
                    <td><span style={{ fontSize: 12, color: 'var(--text3)' }}>{k.lastUsedAt ? format(new Date(k.lastUsedAt), 'dd MMM, HH:mm') : 'never'}</span></td>
                    <td><span style={{ fontSize: 12, color: 'var(--text3)' }}>{format(new Date(k.createdAt), 'dd MMM yyyy')}</span></td>
                    <td>
                      <span className={`status-dot ${k.isActive ? 'dot-green' : 'dot-gray'}`} style={{ marginRight: 6 }} />
                      <span style={{ fontSize: 12 }}>{k.isActive ? 'active' : 'revoked'}</span>
                    </td>
                    <td>
                      {k.isActive && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleRevoke(k.id, k.name)}>revoke</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// System Events Page
// ─────────────────────────────────────────────────────────────────────────────
export function SystemEventsPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [severity, setSeverity] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '30' };
      if (severity) params.severity = severity;
      const res = await api.admin.events(params);
      setEvents(Array.isArray(res) ? res : res.data ?? []);
      setMeta(res.meta ?? null);
    } finally { setLoading(false); }
  }, [page, severity]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <SectionHeader
        title="System Events"
        sub="Audit trail of all system actions and alerts"
        action={<button className="btn btn-sm" onClick={load}>↻</button>}
      />
      <FilterBar>
        <select value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1); }} style={{ width: 160 }}>
          <option value="">All severities</option>
          <option value="INFO">INFO</option>
          <option value="WARN">WARN</option>
          <option value="ERROR">ERROR</option>
          <option value="CRITICAL">CRITICAL</option>
        </select>
      </FilterBar>
      <div className="card">
        {loading ? (
          <div style={{ padding: 32, display: 'flex', gap: 12, alignItems: 'center', color: 'var(--text3)' }}><Spinner /></div>
        ) : events.length === 0 ? (
          <EmptyState message="No system events" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Severity</th>
                  <th>Type</th>
                  <th>Message</th>
                  <th>Metadata</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e: any) => (
                  <tr key={e.id}>
                    <td><code style={{ fontSize: 11 }}>{format(new Date(e.createdAt), 'dd MMM, HH:mm:ss')}</code></td>
                    <td><SeverityBadge severity={e.severity} /></td>
                    <td><span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{e.type}</span></td>
                    <td style={{ color: 'var(--text)' }}>{e.message}</td>
                    <td>
                      {e.metadata && (
                        <details>
                          <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text3)' }}>details</summary>
                          <pre style={{ marginTop: 6, fontSize: 11, color: 'var(--text2)', background: 'var(--bg3)', padding: 8, borderRadius: 4, overflowX: 'auto' }}>
                            {JSON.stringify(e.metadata, null, 2)}
                          </pre>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalPages={meta?.totalPages ?? 1} onChange={setPage} />
      </div>
    </div>
  );
}
