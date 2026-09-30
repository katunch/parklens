import express, { type Express } from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { requireAdmin } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLog } from './middleware/requestLog.js';
import { adminsRouter } from './routes/admins.js';
import { alarmsRouter } from './routes/alarms.js';
import { authRouter } from './routes/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { gateRouter } from './routes/gate.js';
import { healthRouter } from './routes/health.js';
import { permitsRouter } from './routes/permits.js';
import { publicRouter } from './routes/public.js';
import { gateEventsRouter, sessionsRouter } from './routes/sessions.js';
import { settingsRouter } from './routes/settings.js';
import { streamRouter } from './routes/stream.js';

/** Builds the Express app (no listening, no background jobs) — used by index.ts and tests. */
export function createApp(): Express {
  const app = express();
  // Number of reverse proxies in front of the API (nginx; nginx + load balancer in Kubernetes). The client IP
  // is the X-Forwarded-For entry that many hops from the right, so rate limits apply per client.
  app.set('trust proxy', config.trustProxyHops);
  app.set('etag', false);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(requestLog);
  app.use(express.json({ limit: '100kb' }));

  const api = express.Router();
  api.use(healthRouter());
  api.use(streamRouter());
  api.use('/public', publicRouter());
  api.use('/auth', authRouter());
  api.use('/gate', gateRouter());
  api.use('/dashboard', requireAdmin, dashboardRouter());
  api.use('/permits', requireAdmin, permitsRouter());
  api.use('/sessions', requireAdmin, sessionsRouter());
  api.use('/gate-events', requireAdmin, gateEventsRouter());
  api.use('/alarms', requireAdmin, alarmsRouter());
  api.use('/settings', requireAdmin, settingsRouter());
  api.use('/admins', requireAdmin, adminsRouter());
  api.use(notFoundHandler);

  app.use('/api', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
