import { connectDatabase, disconnectDatabase } from './config/database.js';
import { createNotificationWorker } from './workers/notificationWorker.js';
import { logger } from './utils/logger.js';

/**
 * Standalone notification worker process.
 * Consumes the `notifications` queue and delivers incident events to the
 * configured channels (Discord / generic webhook / email).
 */
async function main(): Promise<void> {
  await connectDatabase();

  const worker = createNotificationWorker();
  logger.info('worker_started', { worker: 'notification-worker', queue: 'notifications' });

  const shutdown = async (signal: string) => {
    logger.info('worker_stopping', { worker: 'notification-worker', signal });
    await worker.close();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('worker_startup_failed', { worker: 'notification-worker', error: err });
  process.exit(1);
});
