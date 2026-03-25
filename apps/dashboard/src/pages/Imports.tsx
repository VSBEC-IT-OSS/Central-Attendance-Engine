import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { ImportStatusBadge, SectionHeader, FilterBar, Pagination, Spinner, EmptyState } from '../components/ui';
import { format } from 'date-fns';

export function ImportsPage() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '20' };
      if (status) params.status = status;
      const res = await api.admin.imports(params);
      setLogs(Array.isArray(res) ? res : res.data ?? []);
      setMeta(res.meta ?? null);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const token = localStorage.getItem('ae_token');
      const res = await fetch('/api/v1/ingest/upload', {
        method: 'POST',
        headers: {
          'X-Ingest-Secret': prompt('Enter ingest secret:') ?? '',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });
      const json = await res.json();
      if (json.success) {
        setUploadMsg({ type: 'ok', text: `Queued: ${file.name} (job ${json.data.jobId})` });
        setTimeout(load, 2000);
      } else {
        setUploadMsg({ type: 'err', text: json.error?.message ?? 'Upload failed' });
      }
    } catch (err: any) {
      setUploadMsg({ type: 'err', text: err.message });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const fmtDate = (s: string) => format(new Date(s), 'dd MMM yyyy, HH:mm:ss');

  return (
    <div>
      <SectionHeader
        title="Import Logs"
        sub="Every xlsx ingest attempt — click a row for row-level details"
        action={
          <div className="flex gap-2 items-center">
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleUpload} />
            <button className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Spinner size={14} /> : '↑'} manual upload
            </button>
            <button className="btn btn-sm" onClick={load}>↻</button>
          </div>
        }
      />

      {uploadMsg && (
        <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 6, fontSize: 13, background: uploadMsg.type === 'ok' ? 'var(--green2)' : 'var(--red2)', color: uploadMsg.type === 'ok' ? 'var(--green)' : 'var(--red)' }}>
          {uploadMsg.text}
        </div>
      )}

      <FilterBar>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={{ width: 160 }}>
          <option value="">All statuses</option>
          <option value="SUCCESS">SUCCESS</option>
          <option value="PARTIAL">PARTIAL</option>
          <option value="FAILED">FAILED</option>
          <option value="PROCESSING">PROCESSING</option>
          <option value="PENDING">PENDING</option>
        </select>
      </FilterBar>

      <div className="card">
        {loading ? (
          <div style={{ padding: 32, display: 'flex', gap: 12, alignItems: 'center', color: 'var(--text3)' }}><Spinner /> loading...</div>
        ) : logs.length === 0 ? (
          <EmptyState message="No import logs yet. Drop an xlsx file or upload manually." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Parsed</th>
                  <th>Skipped</th>
                  <th>Errors</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>Trigger</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const duration = log.completedAt
                    ? `${((new Date(log.completedAt).getTime() - new Date(log.startedAt).getTime()) / 1000).toFixed(1)}s`
                    : '—';
                  return (
                    <tr
                      key={log.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/imports/${log.id}`)}
                    >
                      <td>
                        <span style={{ color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 12 }}>{log.filename}</span>
                      </td>
                      <td><ImportStatusBadge status={log.status} /></td>
                      <td><code>{log.totalRows}</code></td>
                      <td><code style={{ color: 'var(--green)' }}>{log.parsedRows}</code></td>
                      <td><code style={{ color: 'var(--text3)' }}>{log.skippedRows}</code></td>
                      <td>
                        <code style={{ color: log.errorRows > 0 ? 'var(--red)' : 'var(--text3)' }}>
                          {log.errorRows}
                        </code>
                      </td>
                      <td><span style={{ fontSize: 12 }}>{fmtDate(log.startedAt)}</span></td>
                      <td><code style={{ fontSize: 11 }}>{duration}</code></td>
                      <td><span style={{ fontSize: 11, color: 'var(--text3)' }}>{log.triggeredBy}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalPages={meta?.totalPages ?? 1} onChange={setPage} />
      </div>
    </div>
  );
}
