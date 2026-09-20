import type { NotificationEventType } from '@pulse/shared';
import { Incident } from '../models/Incident.js';
import { Monitor } from '../models/Monitor.js';
import { NotificationChannel, type INotificationChannel } from '../models/NotificationChannel.js';
import { NotificationDelivery } from '../models/NotificationDelivery.js';
import {
  NotificationProviderError,
  sendToChannel,
  type NotificationMessage,
  type NotificationTarget,
} from '../providers/index.js';
import { logger, sanitizeError } from '../utils/logger.js';

export interface ProcessOptions {
  /** 1-based attempt number for this delivery. */
  attempt: number;
  maxAttempts: number;
}

export interface ProcessResult {
  status: 'SENT' | 'PENDING' | 'FAILED';
  attempts: number;
  error: string | null;
}

export function buildTarget(channel: INotificationChannel): NotificationTarget {
  return {
    channelId: channel._id.toString(),
    channelName: channel.name,
    type: channel.type,
    url: channel.config?.url,
    secret: channel.config?.secret,
    email: channel.config?.email,
  };
}

function buildMessage(
  eventType: NotificationEventType,
  monitor: { _id: unknown; name: string },
  incident: { _id: unknown; status: string; cause: string; startedAt: Date; resolvedAt: Date | null } | null,
): NotificationMessage {
  const durationMs =
    incident && incident.resolvedAt
      ? incident.resolvedAt.getTime() - incident.startedAt.getTime()
      : null;

  return {
    event: eventType,
    monitor: { id: String(monitor._id), name: monitor.name },
    ...(incident
      ? {
          incident: {
            id: String(incident._id),
            status: incident.status as 'OPEN' | 'RESOLVED',
            cause: incident.cause,
            startedAt: incident.startedAt.toISOString(),
            resolvedAt: incident.resolvedAt?.toISOString() ?? null,
            durationMs,
          },
        }
      : {}),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Executes one delivery attempt and persists its outcome.
 *
 * Terminal-state ownership (single source of truth):
 *  - success                                   → SENT
 *  - transient error, attempts remaining       → PENDING + rethrow (BullMQ retries)
 *  - permanent error OR attempts exhausted     → FAILED (no rethrow)
 */
export async function processDelivery(
  deliveryId: string,
  opts: ProcessOptions,
): Promise<ProcessResult> {
  const delivery = await NotificationDelivery.findById(deliveryId);
  if (!delivery) {
    throw new Error(`Delivery ${deliveryId} not found`);
  }

  logger.info('notification_job_started', {
    deliveryId,
    channelId: delivery.channelId.toString(),
    eventType: delivery.eventType,
    attempt: opts.attempt,
  });

  const channel = await NotificationChannel.findById(delivery.channelId).select('+config.secret');

  const failTerminal = async (message: string): Promise<ProcessResult> => {
    await NotificationDelivery.updateOne(
      { _id: delivery._id },
      { $set: { status: 'FAILED', attempts: opts.attempt, lastError: message } },
    );
    logger.error('notification_failed', {
      deliveryId,
      channelId: delivery.channelId.toString(),
      eventType: delivery.eventType,
      attempts: opts.attempt,
      error: message,
    });
    return { status: 'FAILED', attempts: opts.attempt, error: message };
  };

  if (!channel) {
    return failTerminal('Notification channel no longer exists');
  }

  if (!channel.enabled) {
    return failTerminal('Notification channel is disabled');
  }

  const monitor = await Monitor.findById(delivery.monitorId).select('name');
  if (!monitor) {
    return failTerminal('Monitor no longer exists');
  }

  const incident = delivery.incidentId
    ? await Incident.findById(delivery.incidentId).select('status cause startedAt resolvedAt')
    : null;

  const message = buildMessage(
    delivery.eventType,
    monitor,
    incident
      ? {
          _id: incident._id,
          status: incident.status,
          cause: incident.cause,
          startedAt: incident.startedAt,
          resolvedAt: incident.resolvedAt,
        }
      : null,
  );

  try {
    await sendToChannel(buildTarget(channel), message);

    await NotificationDelivery.updateOne(
      { _id: delivery._id },
      { $set: { status: 'SENT', attempts: opts.attempt, lastError: null, sentAt: new Date() } },
    );

    logger.info('notification_sent', {
      deliveryId,
      channelId: channel._id.toString(),
      channelType: channel.type,
      eventType: delivery.eventType,
      attempts: opts.attempt,
    });

    return { status: 'SENT', attempts: opts.attempt, error: null };
  } catch (err) {
    const retryable = err instanceof NotificationProviderError ? err.retryable : true;
    const errorMessage = sanitizeError(err);
    const attemptsRemaining = opts.attempt < opts.maxAttempts;

    if (retryable && attemptsRemaining) {
      // Stay PENDING and let BullMQ apply the exponential backoff.
      await NotificationDelivery.updateOne(
        { _id: delivery._id },
        { $set: { status: 'PENDING', attempts: opts.attempt, lastError: errorMessage } },
      );

      logger.warn('notification_retry', {
        deliveryId,
        channelId: channel._id.toString(),
        eventType: delivery.eventType,
        attempt: opts.attempt,
        maxAttempts: opts.maxAttempts,
        error: errorMessage,
      });

      throw err;
    }

    const reason = retryable ? errorMessage : `${errorMessage} (not retryable)`;
    return failTerminal(reason.slice(0, 500));
  }
}

/** Safety net used when a job dies for a non-provider reason (e.g. DB hiccup). */
export async function markDeliveryFailed(deliveryId: string, error: unknown): Promise<void> {
  await NotificationDelivery.updateOne(
    { _id: deliveryId, status: { $ne: 'SENT' } },
    { $set: { status: 'FAILED', lastError: sanitizeError(error) } },
  );
}
