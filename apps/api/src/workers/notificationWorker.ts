import { Worker, type Job } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';
import { env } from '../config/env.js';
import { NOTIFICATION_QUEUE_NAME, type NotificationJobData } from '../jobs/notificationQueue.js';
import {
  markDeliveryFailed,
  processDelivery,
  type ProcessResult,
} from '../services/notificationDeliveryService.js';
import { logger, sanitizeError } from '../utils/logger.js';

/**
 * Notification worker — completely decoupled from the monitoring worker so that
 * the availability of Discord / webhooks / SMTP never affects check execution.
 */
export function createNotificationWorker(): Worker<NotificationJobData> {
  const connection = createRedisConnection();

  const worker = new Worker<NotificationJobData>(
    NOTIFICATION_QUEUE_NAME,
    async (job: Job<NotificationJobData>) => {
      const attempt = job.attemptsMade + 1;
      const maxAttempts = job.opts.attempts ?? env.notification.maxAttempts;
      return processDelivery(job.data.deliveryId, { attempt, maxAttempts });
    },
    { connection, concurrency: 5 },
  );

  worker.on('completed', (job, result: ProcessResult) => {
    if (result?.status === 'FAILED') {
      logger.error('notification_failed', {
        deliveryId: job.data.deliveryId,
        attempts: result.attempts,
        error: result.error,
      });
      return;
    }
    logger.info('notification_sent', { deliveryId: job.data.deliveryId });
  });

  // Named async handler + explicit `void`: EventEmitter listeners must stay
  // synchronous (no-misused-promises) while the body still awaits markDeliveryFailed.
  const onFailed = async (
    job: Job<NotificationJobData> | undefined,
    err: Error,
  ): Promise<void> => {
    if (!job) {
      logger.error('notification_job_failed', { error: sanitizeError(err) });
      return;
    }

    const attempts = job.opts.attempts ?? env.notification.maxAttempts;
    const exhausted = job.attemptsMade >= attempts;

    // Safety net for failures that never reached the provider (e.g. DB errors),
    // so a delivery cannot stay PENDING forever.
    if (exhausted) {
      await markDeliveryFailed(job.data.deliveryId, err).catch(() => undefined);
      logger.error('notification_failed', {
        deliveryId: job.data.deliveryId,
        attempts: job.attemptsMade,
        error: sanitizeError(err),
      });
    } else {
      logger.warn('notification_retry_scheduled', {
        deliveryId: job.data.deliveryId,
        attempt: job.attemptsMade,
        maxAttempts: attempts,
        error: sanitizeError(err),
      });
    }
  };

  worker.on('failed', (job, err) => {
    void onFailed(job, err);
  });

  return worker;
}
