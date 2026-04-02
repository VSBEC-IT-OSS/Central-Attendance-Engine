import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { ImportStatusBadge, SectionHeader, Spinner, EmptyState } from '../components/ui';
import { format } from 'date-fns';

export function ImportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [log, setLog] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.admin.importById(id)
      .then(setLog)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!id) return;
    const confirmed = window.confirm(
      "Are you sure? This will permanently delete this import log and ALL associated attendance records from the database. This cannot be undone."
    );

    if (confirmed) {
      setDeleting(true);
      try {
        // This calls the DELETE /api/v1/admin/imports/:id endpoint we just created
        await api.admin.deleteImport(id); 
        navigate('/imports'); // Send user back to the list after deletion
      } catch (err) {
        alert("Failed to delete import. Check console for details.");
        console.error(err);
      } finally {
        setDeleting(false);
      }
    }
  };

  if (loading) return <div style={{ padding: 40, display: 'flex', gap: 12, alignItems: 'center', color: 'var(--text3)' }}><Spinner /> loading...</div>;
  if (!log) return <div style={{ padding: 40, color: 'var(--red)' }}>Import not found</div>;

  const fmtDate = (s?: string) => s ? format(new Date(s), 'dd MMM yyyy, HH:mm:ss') : '—';
  const duration = log.completedAt
    ? `${((new Date(log.completedAt).getTime() - new Date(log.startedAt).getTime()) / 1000).toFixed(2)}s`
    : 'in progress';

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ cursor: 'pointer', color: 'var(--text3)', fontSize: 13 }} onClick={() => navigate('/imports')}>
          ← Import Logs
        </span>
      </div>

      <SectionHeader title={log.filename} sub={`Import ID: ${log.id}`} />

      {/* Summary cards */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)', marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Status</div>
          <div style={{ marginTop: 4 }}><ImportStatusBadge status={log.status} /></div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Rows</div>
          <div className="stat-value">{log.totalRows}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Parsed</div>
          <div className="stat-value green">{log.parsedRows}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Skipped (dedup)</div>
          <div className="stat-value">{log.skippedRows}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Errors</div>
          <div className={`stat-value ${log.errorRows > 0 ? 'red' : ''}`}>{log.errorRows}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Duration</div>
          <div className="stat-value accent" style={{ fontSize: 18 }}>{duration}</div>
        </div>
      </div>

      {/* Metadata & Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, marginBottom: 24 }}>
        <div className="card" style={{ fontSize: 13 }}>
          <div className="card-title">Import Metadata</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            {[
              ['Started', fmtDate(log.startedAt)],
              ['Completed', fmtDate(log.completedAt)],
              ['Triggered By', log.triggeredBy],
              ['Adapter Used', log.notes ?? '—'],
              ['File Hash', log.fileHash],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 12 }}>
                <span style={{ color: 'var(--text3)', minWidth: 120 }}>{k}</span>
                <code style={{ fontSize: 12, color: 'var(--text)', wordBreak: 'break-all' }}>{v}</code>
              </div>
            ))}
          </div>
        </div>

        {/* Danger Zone / Delete Action */}
        <div className="card" style={{ border: '1px solid var(--red-muted)', background: 'var(--bg2)' }}>
          <div className="card-title" style={{ color: 'var(--red)' }}>Danger Zone</div>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
            Use this to undo a problematic upload. This will wipe all attendance data linked to this file.
          </p>
          <button 
            className="btn btn-error" 
            onClick={handleDelete}
            disabled={deleting}
            style={{ width: '100%', padding: '10px', background: 'var(--red)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            {deleting ? 'Purging Data...' : 'Delete This Import'}
          </button>
        </div>
      </div>

      {/* Parse errors */}
      <SectionHeader
        title="Parse Errors"
        sub={`${log.parseErrors?.length ?? 0} rows failed to parse`}
      />
      <div className="card">
        {!log.parseErrors || log.parseErrors.length === 0 ? (
          <EmptyState message="No parse errors — all rows processed cleanly" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Row #</th>
                  <th>Error Code</th>
                  <th>Message</th>
                  <th>Raw Data</th>
                </tr>
              </thead>
              <tbody>
                {log.parseErrors.map((err: any) => (
                  <tr key={err.id}>
                    <td><code>{err.rowNumber}</code></td>
                    <td>
                      <span className="badge badge-error">{err.errorCode}</span>
                    </td>
                    <td style={{ color: 'var(--text)', maxWidth: 300 }}>{err.errorMessage}</td>
                    <td>
                      <details>
                        <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text3)' }}>view raw</summary>
                        <pre style={{ marginTop: 8, fontSize: 11, color: 'var(--text2)', background: 'var(--bg3)', padding: 10, borderRadius: 4, overflowX: 'auto' }}>
                          {JSON.stringify(JSON.parse(err.rawData || '{}'), null, 2)}
                        </pre>
                      </details>
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