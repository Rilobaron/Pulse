import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { runCheckForMonitor } from '../services/monitorCheckService.js';
import type { MonitorCheckJobData } from '../jobs/monitorQueue.js';
import { MONITOR_QUEUE_NAME } from '../jobs/monitorQueue.js';
import { logger, sanitizeError } from '../utils/logger.js';

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

  // Per-check results are already emitted as the structured `check_evaluated`
  // event inside monitorCheckService — no plain-text twin here.
  worker.on('failed', (job, err) => {
    logger.error('monitor_job_failed', {
      jobId: job?.id ?? 'unknown',
      error: sanitizeError(err),
    });
  });

  return worker;
}
