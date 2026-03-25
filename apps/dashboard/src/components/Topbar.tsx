import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

const PAGE_TITLES: Record<string, string> = {
  '/overview': 'System Overview',
  '/imports': 'Import Logs',
  '/parse-errors': 'Parse Errors',
  '/api-keys': 'API Key Management',
  '/events': 'System Events',
};

export function Topbar() {
  const { pathname } = useLocation();
  const [wsState, setWsState] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => setWsState('open');
      ws.onclose = () => {
        setWsState('closed');
        setTimeout(connect, 5000); // reconnect
      };
      ws.onerror = () => setWsState('closed');
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.event !== 'CONNECTED') {
            setLastEvent(`${data.event} — ${data.payload?.filename ?? ''}`);
          }
        } catch {}
      };
    };
    connect();
    return () => wsRef.current?.close();
  }, []);

  const title = Object.entries(PAGE_TITLES).find(([k]) => pathname.startsWith(k))?.[1] ?? 'Dashboard';
  const now = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="topbar">
      <span className="topbar-title">{title}</span>
      <div className="flex gap-3 items-center">
        {lastEvent && (
          <span className="topbar-meta truncate" style={{ maxWidth: 300 }}>{lastEvent}</span>
        )}
        <div className="ws-pill">
          <span
            className={`status-dot ${wsState === 'open' ? 'dot-green' : wsState === 'connecting' ? 'dot-amber' : 'dot-red'}`}
          />
          {wsState === 'open' ? 'live' : wsState === 'connecting' ? 'connecting' : 'disconnected'}
        </div>
        <span className="topbar-meta">{now}</span>
      </div>
    </div>
  );
}
