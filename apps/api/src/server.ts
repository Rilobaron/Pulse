import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { closeMonitorQueue } from './jobs/monitorQueue.js';
import { redisConnection } from './config/redis.js';

async function main(): Promise<void> {
  await connectDatabase();

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`[api] Pulse API listening on http://localhost:${env.port}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[api] ${signal} received, shutting down...`);
    server.close(async () => {
      await closeMonitorQueue();
      redisConnection.disconnect();
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[api] Fatal error during startup:', err);
  process.exit(1);
});
