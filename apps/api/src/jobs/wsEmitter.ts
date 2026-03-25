import type { ImportProgressPayload, WsEventType } from '@attendance-engine/schema';

// ─────────────────────────────────────────────────────────────────────────────
// wsEmitter
//
// A lightweight in-process event bus. The WebSocket route registers a handler;
// the import service calls emitImportEvent without needing a direct reference.
// ─────────────────────────────────────────────────────────────────────────────

type EventHandler = (event: WsEventType, payload: ImportProgressPayload) => void;

let _handler: EventHandler | null = null;

export function registerWsHandler(handler: EventHandler): void {
  _handler = handler;
}

export function emitImportEvent(event: WsEventType, payload: ImportProgressPayload): void {
  if (_handler) {
    try {
      _handler(event, payload);
    } catch {
      // never let ws errors crash the import
    }
  }
}
