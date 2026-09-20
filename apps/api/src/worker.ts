import { connectDatabase, disconnectDatabase } from './config/database.js';
import { createMonitorWorker } from './workers/monitorWorker.js';
import { logger } from './utils/logger.js';

/**
 * Standalone monitor worker process. Runs the BullMQ consumers that execute
 * the scheduled HTTP checks. Kept separate from the HTTP server (and from the
 * notification worker) so the three can scale and restart independently.
 */
async function main(): Promise<void> {
  await connectDatabase();

  const worker = createMonitorWorker();
  logger.info('worker_started', { worker: 'monitor-worker', queue: 'monitor-checks' });
  console.log('[monitor-worker] Monitor check worker started');

  const shutdown = async (signal: string) => {
    logger.info('worker_stopping', { worker: 'monitor-worker', signal });
    await worker.close();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('worker_startup_failed', { worker: 'monitor-worker', error: err });
  process.exit(1);
});

