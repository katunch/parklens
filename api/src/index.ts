import { createServer } from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { closePool, waitForDatabase } from './db.js';
import { startOverstayJob, stopOverstayJob } from './jobs/overstay.js';
import { log } from './lib/log.js';
import { migrate } from './migrate.js';
import { seedDemoData } from './seed.js';
import { ensureInitialAdmin } from './services/admins.js';
import { closeAllStreams } from './services/events.js';
import { initSettings } from './services/settings.js';
import { stopWebhookRetries, waitForWebhooks } from './services/webhook.js';

async function main(): Promise<void> {
  log.info(`ParkLens API starting (node ${process.version}, timezone ${config.timezone})`);
  if (config.jwtSecret === 'change-me-in-production') {
    log.warn('JWT_SECRET has its default value – set a strong secret outside local development');
  }

  await waitForDatabase();
  await migrate();
  await initSettings();
  await ensureInitialAdmin();
  if (config.seedDemoData) await seedDemoData();

  const server = createServer(createApp());
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, () => {
      server.off('error', reject);
      resolve();
    });
  });
  log.info(`listening on :${config.port}`);

  startOverstayJob();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`${signal} received, shutting down`);
    const force = setTimeout(() => {
      log.error('graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 12_000);
    force.unref();

    stopOverstayJob();
    closeAllStreams();
    stopWebhookRetries();
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    server.closeIdleConnections();
    await closed;
    await waitForWebhooks(6_000);
    await closePool();
    log.info('shutdown complete');
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  log.error('startup failed', err);
  process.exit(1);
});
