import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis.js';

export const MONITOR_QUEUE_NAME = 'monitor-checks';

export interface MonitorCheckJobData {
  monitorId: string;
}

export const monitorQueue = new Queue<MonitorCheckJobData>(MONITOR_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 200,
    attempts: 1, // Retries are handled by the schedule itself; a failed check is a valid DOWN signal.
  },
});

const schedulerIdFor = (monitorId: string) => `monitor-${monitorId}`;

/**
 * Creates (or updates) the repeatable job for a monitor using BullMQ Job
 * Schedulers. Upsert semantics make PATCH operations idempotent.
 */
export async function scheduleMonitor(monitorId: string, intervalMs: number): Promise<void> {
  await monitorQueue.upsertJobScheduler(
    schedulerIdFor(monitorId),
    { every: intervalMs },
    {
      name: 'check',
      data: { monitorId },
    },
  );
}

export async function removeMonitorSchedule(monitorId: string): Promise<void> {
  await monitorQueue.removeJobScheduler(schedulerIdFor(monitorId));
}

export async function closeMonitorQueue(): Promise<void> {
  await monitorQueue.close();
}
