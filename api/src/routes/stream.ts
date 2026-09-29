import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { registerStream, subscribe, unregisterStream, type LiveEvent } from '../services/events.js';

export const HEARTBEAT_MS = 25_000;

/** GET /api/stream?token=<jwt> — Server-Sent Events for admins. */
export function streamRouter(): Router {
  const r = Router();

  r.get('/stream', async (req, res) => {
    const token = typeof req.query['token'] === 'string' ? req.query['token'] : undefined;
    await authenticateToken(token);

    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    req.socket.setNoDelay(true);
    req.socket.setKeepAlive(true);
    res.write('retry: 5000\n: connected\n\n');

    const send = (e: LiveEvent) => {
      res.write(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`);
    };
    const unsubscribe = subscribe(send);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      clearInterval(heartbeat);
      unsubscribe();
      unregisterStream(res);
    };
    registerStream(res, cleanup);
    req.on('close', cleanup);
  });

  return r;
}
