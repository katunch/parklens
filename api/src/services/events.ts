import { EventEmitter } from 'node:events';
import type { Response } from 'express';

export type LiveEventName = 'alarm.created' | 'alarm.updated' | 'gate.event' | 'permit.changed' | 'request.created';

export interface LiveEvent {
  event: LiveEventName;
  data: unknown;
}

/** In-process event bus broadcasting to all connected SSE clients. */
const bus = new EventEmitter();
bus.setMaxListeners(0);

export function publish(event: LiveEventName, data: unknown): void {
  bus.emit('event', { event, data } satisfies LiveEvent);
}

export function subscribe(listener: (e: LiveEvent) => void): () => void {
  bus.on('event', listener);
  return () => bus.off('event', listener);
}

export function hasSubscribers(): boolean {
  return bus.listenerCount('event') > 0;
}

// ---- SSE connection registry (for graceful shutdown) -----------------------

const streams = new Map<Response, () => void>();

export function registerStream(res: Response, cleanup: () => void): void {
  streams.set(res, cleanup);
}

export function unregisterStream(res: Response): void {
  streams.delete(res);
}

export function streamCount(): number {
  return streams.size;
}

export function closeAllStreams(): void {
  for (const [res, cleanup] of streams) {
    cleanup();
    res.end();
  }
  streams.clear();
}
