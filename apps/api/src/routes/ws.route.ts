import { FastifyInstance } from 'fastify';
import { registerWsHandler } from '../jobs/wsEmitter';
import type { WsEventType, ImportProgressPayload } from '@attendance-engine/schema';

// ─────────────────────────────────────────────────────────────────────────────
// WebSocket  /ws
//
// Dashboard connects here to receive real-time import progress events.
// Multiple connections are supported — all receive the same broadcast.
// ─────────────────────────────────────────────────────────────────────────────

export async function wsRoutes(app: FastifyInstance): Promise<void> {
  const clients = new Set<any>();

  // Register the emitter handler once
  registerWsHandler((event: WsEventType, payload: ImportProgressPayload) => {
    const message = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
    for (const client of clients) {
      try {
        if (client.readyState === 1 /* OPEN */) {
          client.send(message);
        }
      } catch {
        clients.delete(client);
      }
    }
  });

  app.get('/ws', { websocket: true }, (socket) => {
    clients.add(socket);

    // Send a welcome ping
    socket.send(JSON.stringify({
      event: 'CONNECTED',
      payload: { message: 'AttendanceEngine WebSocket connected' },
      timestamp: new Date().toISOString(),
    }));

    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => clients.delete(socket));
  });
}
