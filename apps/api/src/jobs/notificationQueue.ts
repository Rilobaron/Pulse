import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';
import { env } from '../config/env.js';

export const NOTIFICATION_QUEUE_NAME = 'notifications';

export interface NotificationJobData {
  deliveryId: string;
}

/** Dedicated connection for the notification producer. */
const notificationRedisConnection = createRedisConnection();

export const notificationQueue = new Queue<NotificationJobData>(NOTIFICATION_QUEUE_NAME, {
  connection: notificationRedisConnection,
  defaultJobOptions: {
    // Finite retries with exponential backoff: 1s, 2s, 4s, 8s... (base = env).
    attempts: env.notification.maxAttempts,
    backoff: { type: 'exponential', delay: env.notification.backoffMs },
    removeOnComplete: 200,
    removeOnFail: 500,
  },
});

/**
 * Enqueues one delivery. The job id is derived from the delivery's dedupe key,
 * so a re-enqueue of the same (incident, event, channel) triple cannot create a
 * second pending job while the first one still exists.
 */
export async function enqueueDelivery(deliveryId: string, dedupeKey: string): Promise<void> {
  await notificationQueue.add(
    'deliver',
    { deliveryId },
    { jobId: `delivery:${dedupeKey}` },
  );
}

export async function closeNotificationQueue(): Promise<void> {
  await notificationQueue.close();
  notificationRedisConnection.disconnect();
}
