import { useEffect, useState, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '../lib/api';
import { StatCard, SectionHeader, Spinner, EmptyState } from '../components/ui';
import { ImportStatusBadge } from '../components/ui';

export function OverviewPage() {
  const [health, setHealth] = useState<any>(null);
  const [overview, setOverview] = useState<any>(null);
  const [deptData, setDeptData] = useState<any[]>([]);
  const [trend, setTrend] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [h, o, d, t] = await Promise.all([
        api.admin.health(),
        api.summary.overview(),
        api.summary.department(),
        api.summary.trend(14),
      ]);
      setHealth(h); setOverview(o); setDeptData(d); setTrend(t);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); const id = setInterval(load, 30000); return () => clearInterval(id); }, [load]);

  if (loading) return <div style={{ padding: 40, display: 'flex', gap: 12, alignItems: 'center', color: 'var(--text3)' }}><Spinner /> loading...</div>;

  const trendFormatted = trend.map((t) => ({
    ...t,
    date: t.date ? t.date.slice(5) : '',
  }));

  return (
    <div>
      {/* System health */}
      <SectionHeader
        title="System Status"
        sub={`uptime ${Math.floor((health?.uptime ?? 0) / 3600)}h ${Math.floor(((health?.uptime ?? 0) % 3600) / 60)}m`}
        action={<button className="btn btn-sm" onClick={load}>↻ refresh</button>}
      />
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <StatCard
          label="API Server"
          value={health?.status === 'healthy' ? '● online' : '○ degraded'}
          color={health?.status === 'healthy' ? 'green' : 'red'}
          sub={`v${health?.version ?? '—'}`}
        />
        <StatCard
          label="Database"
          value={health?.database === 'connected' ? '● ok' : '○ error'}
          color={health?.database === 'connected' ? 'green' : 'red'}
          sub="PostgreSQL"
        />
        <StatCard
          label="Cache"
          value={health?.redis === 'connected' ? '● ok' : '○ error'}
          color={health?.redis === 'connected' ? 'green' : 'red'}
          sub="Redis"
        />
        <StatCard
          label="Queue Depth"
          value={health?.queueDepth ?? 0}
          color={health?.queueDepth > 5 ? 'amber' : undefined}
          sub="pending jobs"
        />
      </div>

      <hr className="divider" />

      {/* Today's attendance */}
      <SectionHeader
        title={`Today's Attendance — ${overview?.date ?? '—'}`}
        sub={`${overview?.departmentsReported ?? 0} departments reported`}
      />
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
        <StatCard label="Total" value={overview?.total ?? 0} />
        <StatCard label="Present" value={overview?.PRESENT ?? 0} color="green" />
        <StatCard label="Absent" value={overview?.ABSENT ?? 0} color="red" />
        <StatCard label="Late" value={overview?.LATE ?? 0} color="amber" />
        <StatCard label="Half Day" value={overview?.HALF_DAY ?? 0} />
        <StatCard
          label="Attendance %"
          value={`${overview?.attendancePercent ?? 0}%`}
          color={overview?.attendancePercent >= 75 ? 'green' : overview?.attendancePercent >= 60 ? 'amber' : 'red'}
        />
      </div>

      <hr className="divider" />

      {/* 14-day trend */}
      <SectionHeader title="14-Day Attendance Trend" />
      <div className="card" style={{ marginBottom: 24 }}>
        {trendFormatted.length === 0 ? (
          <EmptyState message="No trend data yet — import some attendance files to see the chart" />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendFormatted} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid stroke="#1e1e22" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: '#55555f', fontSize: 11, fontFamily: 'var(--mono)' }} />
              <YAxis tick={{ fill: '#55555f', fontSize: 11, fontFamily: 'var(--mono)' }} />
              <Tooltip
                contentStyle={{ background: '#141416', border: '1px solid #2a2a2e', borderRadius: 6, fontSize: 12, fontFamily: 'var(--mono)' }}
                labelStyle={{ color: '#8888a0' }}
              />
              <Line type="monotone" dataKey="PRESENT" stroke="#2ecc71" strokeWidth={2} dot={false} name="Present" />
              <Line type="monotone" dataKey="ABSENT" stroke="#e74c3c" strokeWidth={2} dot={false} name="Absent" />
              <Line type="monotone" dataKey="LATE" stroke="#f0a500" strokeWidth={1.5} dot={false} name="Late" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Department breakdown */}
      <SectionHeader title="Department Breakdown" sub="today" />
      <div className="card">
        {deptData.length === 0 ? (
          <EmptyState message="No department data for today" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Total</th>
                  <th>Present</th>
                  <th>Absent</th>
                  <th>Late</th>
                  <th>Attendance %</th>
                </tr>
              </thead>
              <tbody>
                {deptData.map((d) => (
                  <tr key={d.department}>
                    <td><strong style={{ color: 'var(--text)' }}>{d.department}</strong></td>
                    <td><code>{d.total}</code></td>
                    <td style={{ color: 'var(--green)' }}>{d.PRESENT}</td>
                    <td style={{ color: 'var(--red)' }}>{d.ABSENT}</td>
                    <td style={{ color: 'var(--amber)' }}>{d.LATE}</td>
                    <td>
                      <div className="flex gap-2 items-center">
                        <div className="progress-bar" style={{ width: 80 }}>
                          <div
                            className={`progress-fill ${d.attendancePercent >= 75 ? 'green' : 'red'}`}
                            style={{ width: `${d.attendancePercent}%` }}
                          />
                        </div>
                        <code style={{ fontSize: 11, color: d.attendancePercent >= 75 ? 'var(--green)' : 'var(--red)' }}>
                          {d.attendancePercent}%
                        </code>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Last import */}
      {overview?.lastImport && (
        <div className="card mt-6" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span className="text-muted text-sm">Last import:</span>
          <ImportStatusBadge status={overview.lastImport.status} />
          <code style={{ fontSize: 12 }}>{new Date(overview.lastImport.startedAt).toLocaleString('en-IN')}</code>
          <span className="text-muted text-sm">{overview.lastImport.parsedRows} rows · {overview.lastImport.errorRows} errors</span>
        </div>
      )}
    </div>
  );
}
