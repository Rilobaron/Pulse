import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { runCheckForMonitor } from '../services/monitorCheckService.js';
import type { MonitorCheckJobData } from '../jobs/monitorQueue.js';
import { MONITOR_QUEUE_NAME } from '../jobs/monitorQueue.js';

/**
 * The worker owns a dedicated Redis connection (BullMQ blocking commands).
 */
export function createMonitorWorker(): Worker<MonitorCheckJobData> {
  const connection = new Redis(env.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  const worker = new Worker<MonitorCheckJobData>(
    MONITOR_QUEUE_NAME,
    async (job: Job<MonitorCheckJobData>) => {
      const { monitorId } = job.data;
      // skipPaused: scheduled jobs never run against paused monitors.
      const result = await runCheckForMonitor(monitorId, { skipPaused: true });
      if (result === null) {
        return { status: 'SKIPPED_PAUSED', responseTime: 0 };
      }
      return { status: result.status, responseTime: result.responseTime };
    },
    {
      connection,
      concurrency: 10,
    },
  );

  worker.on('completed', (job, result: { status: string; responseTime: number }) => {
    if (result.status === 'SKIPPED_PAUSED') {
      console.log(`[worker] Monitor ${job.data.monitorId} is paused — check skipped`);
      return;
    }
    console.log(
      `[worker] Check for monitor ${job.data.monitorId}: ${result.status} (${result.responseTime} ms)`,
    );
  });

  worker.on('failed', (job, err) => {
    console.error(`[worker] Job ${job?.id ?? '?'} failed: ${err.message}`);
  });

  return worker;
}
