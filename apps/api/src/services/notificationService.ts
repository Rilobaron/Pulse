import { Types } from 'mongoose';
import net from 'node:net';
import type {
  EmailProviderStatus,
  NotificationChannelDTO,
  NotificationChannelInput,
  NotificationChannelType,
  NotificationDeliveryDTO,
  NotificationEventType,
  UpdateNotificationChannelInput,
} from '@pulse/shared';
import { Monitor } from '../models/Monitor.js';
import { NotificationChannel, type INotificationChannel } from '../models/NotificationChannel.js';
import { NotificationDelivery } from '../models/NotificationDelivery.js';
import { enqueueDelivery } from '../jobs/notificationQueue.js';
import { generateWebhookSecret } from '../utils/webhookSignature.js';
import { isPrivateIp } from '../utils/urlSafety.js';
import { ConflictError, NotFoundError, BadRequestError } from '../utils/errors.js';
import { isSmtpConfigured } from '../providers/email/emailProvider.js';
import { assertValidDiscordWebhookUrl } from '../providers/discordProvider.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const DELIVERY_HISTORY_LIMIT = 100;

export interface ChannelMutationResult {
  channel: NotificationChannelDTO;
  /** Present only on creation or explicit secret rotation. */
  webhookSecret?: string;
}

// ─── Masking ─────────────────────────────────────────────

/**
 * Never expose a full webhook target. Keeps the origin and the first two path
 * segments (enough to identify the integration) and masks the rest:
 *   https://discord.com/api/webhooks/123/abc → https://discord.com/api/webhooks/***
 */
export function maskTarget(raw: string): string {
  try {
    const url = new URL(raw);
    const segments = url.pathname.split('/').filter(Boolean).slice(0, 2);
    return segments.length > 0 ? `${url.origin}/${segments.join('/')}/***` : `${url.origin}/***`;
  } catch {
    return '***';
  }
}

export function toChannelDTO(channel: INotificationChannel): NotificationChannelDTO {
  const rawTarget = channel.config?.url ?? channel.config?.email ?? '';

  return {
    id: channel._id.toString(),
    name: channel.name,
    type: channel.type,
    enabled: channel.enabled,
    // Email destinations are not secrets, so they are returned as-is.
    maskedTarget: channel.type === 'EMAIL' ? rawTarget : maskTarget(rawTarget),
    hasSecret: Boolean(channel.config?.secret),
    createdAt: channel.createdAt.toISOString(),
    updatedAt: channel.updatedAt.toISOString(),
  };
}

function toDeliveryDTO(
  delivery: {
    _id: Types.ObjectId;
    channelId: Types.ObjectId;
    monitorId: Types.ObjectId;
    incidentId: Types.ObjectId | null;
    eventType: NotificationEventType;
    status: 'PENDING' | 'SENT' | 'FAILED';
    attempts: number;
    lastError: string | null;
    sentAt: Date | null;
    createdAt: Date;
  },
  names: { channelName: string; channelType: NotificationChannelDTO['type']; monitorName: string },
): NotificationDeliveryDTO {
  return {
    id: delivery._id.toString(),
    channelId: delivery.channelId.toString(),
    channelName: names.channelName,
    channelType: names.channelType,
    monitorId: delivery.monitorId.toString(),
    monitorName: names.monitorName,
    incidentId: delivery.incidentId?.toString() ?? null,
    eventType: delivery.eventType,
    status: delivery.status,
    attempts: delivery.attempts,
    lastError: delivery.lastError,
    sentAt: delivery.sentAt?.toISOString() ?? null,
    createdAt: delivery.createdAt.toISOString(),
  };
}

// ─── Channel CRUD ────────────────────────────────────────

export async function listChannels(userId: string): Promise<NotificationChannelDTO[]> {
  const channels = await NotificationChannel.find({ userId })
    .select('+config.secret')
    .sort({ createdAt: -1 });
  return channels.map(toChannelDTO);
}

/**
 * Definitive server-side target validation, resolved against the *final*
 * channel type (important for PATCH, where type and target change separately).
 *
 *  - EMAIL:   address format only.
 *  - DISCORD: must be a real https Discord webhook endpoint.
 *  - WEBHOOK: must be http(s) and must NOT point at internal/private
 *             destinations (SSRF — hostname blocklist + IP-literal check; the
 *             full check including DNS resolution is enforced again at send time).
 */
function assertValidTarget(type: NotificationChannelType, target: string): void {
  const value = target.trim();

  if (type === 'EMAIL') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new BadRequestError('Invalid email address');
    }
    return;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestError('Must be a valid URL (including http:// or https://)');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestError('Only http:// and https:// URLs are supported');
  }

  if (type === 'DISCORD') {
    assertValidDiscordWebhookUrl(value);
    return;
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.localhost')
  ) {
    throw new BadRequestError(`Hostname "${hostname}" is not allowed`);
  }

  const ipLiteral = hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(ipLiteral) !== 0 && isPrivateIp(ipLiteral)) {
    throw new BadRequestError('Private, loopback and link-local IP addresses are not allowed');
  }
}

export async function createChannel(
  userId: string,
  input: NotificationChannelInput,
): Promise<ChannelMutationResult> {
  assertValidTarget(input.type, input.target);

  const channel = new NotificationChannel({
    userId,
    name: input.name,
    type: input.type,
    enabled: input.enabled,
    config: buildConfig(input),
  });

  const generatedSecret = channel.type === 'WEBHOOK' ? generateWebhookSecret() : undefined;
  if (generatedSecret) channel.config.secret = generatedSecret;

  await channel.save();

  return {
    channel: toChannelDTO(channel),
    ...(generatedSecret ? { webhookSecret: generatedSecret } : {}),
  };
}

export async function updateChannel(
  userId: string,
  channelId: string,
  input: UpdateNotificationChannelInput,
): Promise<ChannelMutationResult> {
  const channel = await NotificationChannel.findOne({ _id: channelId, userId }).select(
    '+config.secret',
  );
  if (!channel) throw new NotFoundError('Notification channel not found');

  if (input.name !== undefined) channel.name = input.name;
  if (input.enabled !== undefined) channel.enabled = input.enabled;

  const type = input.type ?? channel.type;
  if (input.type !== undefined && input.type !== channel.type) {
    channel.type = input.type;
    // Switching type drops the previous target so no stale secret survives.
    channel.config = {};
  }

  if (input.target !== undefined) {
    // Validate against the *final* type — critical for PATCH.
    assertValidTarget(type, input.target);

    const rebuilt = buildConfig({ ...input, type } as NotificationChannelInput);
    channel.config.url = rebuilt.url;
    channel.config.email = rebuilt.email;
    if (type === 'WEBHOOK' && !channel.config.secret) {
      channel.config.secret = generateWebhookSecret();
    }
    if (type !== 'WEBHOOK') {
      channel.config.secret = undefined;
    }
  }

  let rotatedSecret: string | undefined;
  if (type === 'WEBHOOK' && input.regenerateSecret) {
    rotatedSecret = generateWebhookSecret();
    channel.config.secret = rotatedSecret;
  }

  channel.markModified('config');
  await channel.save();

  return {
    channel: toChannelDTO(channel),
    ...(rotatedSecret ? { webhookSecret: rotatedSecret } : {}),
  };
}

export async function deleteChannel(userId: string, channelId: string): Promise<void> {
  const channel = await NotificationChannel.findOneAndDelete({ _id: channelId, userId });
  if (!channel) throw new NotFoundError('Notification channel not found');

  // Detach from monitors so no monitor keeps a dangling reference.
  await Monitor.updateMany(
    { userId, notificationChannelIds: channel._id },
    { $pull: { notificationChannelIds: channel._id } },
  );
}

/** Asserts every provided channel id belongs to the user. */
export async function assertOwnedChannelIds(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const count = await NotificationChannel.countDocuments({ _id: { $in: ids }, userId });
  if (count !== ids.length) {
    throw new NotFoundError('One or more notification channels were not found');
  }
}

export function getEmailStatus(): EmailProviderStatus {
  return { configured: isSmtpConfigured(), from: isSmtpConfigured() ? env.smtp.from : null };
}

function buildConfig(input: NotificationChannelInput): { url?: string; email?: string } {
  if (input.type === 'EMAIL') return { email: input.target };
  return { url: input.target };
}

// ─── Delivery orchestration ──────────────────────────────

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && 'code' in err && (err as { code?: number }).code === 11000
  );
}

/**
 * Creates the delivery rows for an incident event (idempotent) and enqueues them.
 *
 * Idempotency is guaranteed at two levels:
 *  1. `NotificationDelivery.dedupeKey` has a unique index, so the same
 *     (incident, event, channel) triple can only exist once.
 *  2. The BullMQ job id is derived from the same key.
 *
 * A monitor with no channels (or only disabled channels) produces zero jobs.
 */
export async function enqueueIncidentNotifications(params: {
  incidentId: string;
  monitorId: string;
  eventType: Extract<NotificationEventType, 'INCIDENT_OPENED' | 'INCIDENT_RESOLVED'>;
}): Promise<number> {
  const monitor = await Monitor.findById(params.monitorId).select('userId name notificationChannelIds');
  if (!monitor || monitor.notificationChannelIds.length === 0) return 0;

  const channels = await NotificationChannel.find({
    _id: { $in: monitor.notificationChannelIds },
    enabled: true,
  });
  if (channels.length === 0) return 0;

  const incidentObjectId = new Types.ObjectId(params.incidentId);
  let enqueued = 0;

  for (const channel of channels) {
    const dedupeKey = `incident:${params.incidentId}:${params.eventType}:${channel._id.toString()}`;

    let delivery;
    try {
      delivery = await NotificationDelivery.findOneAndUpdate(
        { dedupeKey },
        {
          $setOnInsert: {
            dedupeKey,
            userId: monitor.userId,
            monitorId: monitor._id,
            channelId: channel._id,
            incidentId: incidentObjectId,
            eventType: params.eventType,
            status: 'PENDING',
            attempts: 0,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        logger.info('notification_duplicate_skipped', {
          monitorId: params.monitorId,
          incidentId: params.incidentId,
          eventType: params.eventType,
          channelId: channel._id.toString(),
        });
        continue;
      }
      throw err;
    }

    // Already delivered — never send the same incident event twice.
    if (delivery.status === 'SENT') continue;

    await enqueueDelivery(delivery._id.toString(), dedupeKey);
    enqueued += 1;
  }

  logger.info('incident_notifications_enqueued', {
    incidentId: params.incidentId,
    monitorId: params.monitorId,
    eventType: params.eventType,
    enqueued,
  });

  return enqueued;
}

/** Test notification — goes through the very same queue and delivery pipeline. */
export async function createTestDelivery(
  userId: string,
  channelId: string,
): Promise<NotificationDeliveryDTO> {
  const channel = await NotificationChannel.findOne({ _id: channelId, userId });
  if (!channel) throw new NotFoundError('Notification channel not found');

  // The monitor reference is required for the delivery shape; tests use the most
  // recent monitor of the user (or any monitor) purely as context.
  const monitor = await Monitor.findOne({ userId }).select('name');
  if (!monitor) {
    throw new ConflictError('Create a monitor before testing notification channels');
  }

  const dedupeKey = `test:${channelId}:${new Types.ObjectId().toString()}`;

  const delivery = await NotificationDelivery.create({
    dedupeKey,
    userId,
    monitorId: monitor._id,
    channelId: channel._id,
    incidentId: null,
    eventType: 'MONITOR_TEST',
    status: 'PENDING',
    attempts: 0,
  });

  await enqueueDelivery(delivery._id.toString(), dedupeKey);

  return toDeliveryDTO(delivery, {
    channelName: channel.name,
    channelType: channel.type,
    monitorName: monitor.name,
  });
}

export async function listDeliveries(
  userId: string,
  filters: { monitorId?: string; status?: 'PENDING' | 'SENT' | 'FAILED'; limit?: number } = {},
): Promise<NotificationDeliveryDTO[]> {
  const query: Record<string, unknown> = { userId };
  if (filters.monitorId) query.monitorId = filters.monitorId;
  if (filters.status) query.status = filters.status;

  const deliveries = await NotificationDelivery.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(filters.limit ?? DELIVERY_HISTORY_LIMIT, DELIVERY_HISTORY_LIMIT));

  const channelIds = [...new Set(deliveries.map((d) => d.channelId.toString()))];
  const monitorIds = [...new Set(deliveries.map((d) => d.monitorId.toString()))];

  const [channels, monitors] = await Promise.all([
    NotificationChannel.find({ _id: { $in: channelIds } }).select('name type'),
    Monitor.find({ _id: { $in: monitorIds } }).select('name'),
  ]);

  const channelById = new Map(channels.map((c) => [c._id.toString(), c]));
  const monitorById = new Map(monitors.map((m) => [m._id.toString(), m]));

  return deliveries.map((delivery) =>
    toDeliveryDTO(delivery, {
      channelName: channelById.get(delivery.channelId.toString())?.name ?? 'Deleted channel',
      channelType: channelById.get(delivery.channelId.toString())?.type ?? 'WEBHOOK',
      monitorName: monitorById.get(delivery.monitorId.toString())?.name ?? 'Deleted monitor',
    }),
  );
}

/** Used by the dashboard to surface failing integrations. */
export async function countRecentFailures(userId: string, windowMs = 24 * 60 * 60 * 1000): Promise<number> {
  return NotificationDelivery.countDocuments({
    userId,
    status: 'FAILED',
    createdAt: { $gte: new Date(Date.now() - windowMs) },
  });
}


