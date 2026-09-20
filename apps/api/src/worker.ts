import { connectDatabase, disconnectDatabase } from './config/database.js';
import { createMonitorWorker } from './workers/monitorWorker.js';

/**
 * Standalone worker process. Runs the BullMQ consumers that execute
 * the scheduled HTTP checks. Kept separate from the HTTP server so the
 * two can scale and restart independently.
 */
async function main(): Promise<void> {
  await connectDatabase();

  const worker = createMonitorWorker();
  console.log('[worker] Monitor check worker started');

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} received, shutting down...`);
    await worker.close();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[worker] Fatal error during startup:', err);
  process.exit(1);
});
