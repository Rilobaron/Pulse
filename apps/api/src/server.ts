import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { closeMonitorQueue } from './jobs/monitorQueue.js';
import { closeNotificationQueue } from './jobs/notificationQueue.js';
import { redisConnection } from './config/redis.js';
import { logger, sanitizeError } from './utils/logger.js';

async function main(): Promise<void> {
  await connectDatabase();

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info('api_listening', { port: env.port });
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info('api_stopping', { signal });
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await Promise.all([closeMonitorQueue(), closeNotificationQueue()]);
    redisConnection.disconnect();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  // sanitizeError strips any URLs (e.g. a MONGODB_URI embedded in a
  // connection error) before the message reaches the logs.
  logger.error('api_startup_failed', { message: sanitizeError(err) });
  process.exit(1);
});
