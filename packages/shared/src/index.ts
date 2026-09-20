import { z } from 'zod';

// ─────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────

export const MONITOR_STATUSES = ['UP', 'DOWN', 'UNKNOWN'] as const;
export type MonitorStatus = (typeof MONITOR_STATUSES)[number];

export const HTTP_METHODS = ['GET', 'HEAD'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

/** Check intervals in milliseconds. */
export const CHECK_INTERVALS = [
  { label: '30 seconds', value: 30_000 },
  { label: '1 minute', value: 60_000 },
  { label: '5 minutes', value: 300_000 },
  { label: '10 minutes', value: 600_000 },
] as const;

export const MIN_INTERVAL_MS = 30_000;
export const MAX_INTERVAL_MS = 600_000;
export const MIN_TIMEOUT_MS = 1_000;
export const MAX_TIMEOUT_MS = 30_000;
export const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Anti-flapping thresholds: how many consecutive results are required before the
 * operational status changes. See `evaluateHealth` on the API for the full rules.
 */
export const MIN_THRESHOLD = 1;
export const MAX_THRESHOLD = 10;
export const DEFAULT_FAILURE_THRESHOLD = 3;
export const DEFAULT_RECOVERY_THRESHOLD = 2;

// ─────────────────────────────────────────────────────────
// Auth schemas
// ─────────────────────────────────────────────────────────

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().email('Invalid email address').max(255),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters'),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

// ─────────────────────────────────────────────────────────
// Monitor schemas
// ─────────────────────────────────────────────────────────

export const createMonitorSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  url: z.string().trim().url('Must be a valid URL (including http:// or https://)').max(2048),
  method: z.enum(HTTP_METHODS).default('GET'),
  interval: z
    .number()
    .int()
    .min(MIN_INTERVAL_MS, 'Interval must be at least 30 seconds')
    .max(MAX_INTERVAL_MS, 'Interval must be at most 10 minutes'),
  timeout: z
    .number()
    .int()
    .min(MIN_TIMEOUT_MS, 'Timeout must be at least 1 second')
    .max(MAX_TIMEOUT_MS, 'Timeout must be at most 30 seconds')
    .default(DEFAULT_TIMEOUT_MS),
  failureThreshold: z
    .number()
    .int()
    .min(MIN_THRESHOLD, 'Failure threshold must be at least 1')
    .max(MAX_THRESHOLD, 'Failure threshold must be at most 10')
    .default(DEFAULT_FAILURE_THRESHOLD),
  recoveryThreshold: z
    .number()
    .int()
    .min(MIN_THRESHOLD, 'Recovery threshold must be at least 1')
    .max(MAX_THRESHOLD, 'Recovery threshold must be at most 10')
    .default(DEFAULT_RECOVERY_THRESHOLD),
  notificationChannelIds: z.array(z.string().min(1)).max(50).default([]),
});
export type CreateMonitorInput = z.infer<typeof createMonitorSchema>;

export const updateMonitorSchema = createMonitorSchema.partial();
export type UpdateMonitorInput = z.infer<typeof updateMonitorSchema>;

// ─────────────────────────────────────────────────────────
// Notification schemas
// ─────────────────────────────────────────────────────────

export const NOTIFICATION_CHANNEL_TYPES = ['DISCORD', 'WEBHOOK', 'EMAIL'] as const;
export type NotificationChannelType = (typeof NOTIFICATION_CHANNEL_TYPES)[number];

export const notificationChannelSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  type: z.enum(NOTIFICATION_CHANNEL_TYPES),
  enabled: z.boolean().default(true),
  // Channel-specific target: URL for DISCORD/WEBHOOK, email address for EMAIL.
  // Format is validated per type by the service (the definitive check) and again
  // by the frontend for a better UX.
  target: z.string().trim().min(1, 'Target is required').max(2048),
  /** Generic webhooks only: rotate the signing secret (new secret returned once). */
  regenerateSecret: z.boolean().optional(),
});
export type NotificationChannelInput = z.infer<typeof notificationChannelSchema>;

export const updateNotificationChannelSchema = notificationChannelSchema.partial();
export type UpdateNotificationChannelInput = z.infer<typeof updateNotificationChannelSchema>;

// ─────────────────────────────────────────────────────────
// Status Page schemas
// ─────────────────────────────────────────────────────────

export const statusPageSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Slug must be at least 3 characters')
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug may only contain lowercase letters, numbers and hyphens'),
  description: z.string().trim().max(300).optional().default(''),
  monitorIds: z.array(z.string().min(1)).max(100).default([]),
  isPublished: z.boolean().default(false),
});
export type StatusPageInput = z.infer<typeof statusPageSchema>;

// ─────────────────────────────────────────────────────────
// API DTOs (never include sensitive fields such as passwordHash)
// ─────────────────────────────────────────────────────────

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: UserDTO;
}

export interface MonitorDTO {
  id: string;
  name: string;
  url: string;
  method: HttpMethod;
  interval: number;
  timeout: number;
  status: MonitorStatus;
  isPaused: boolean;
  /** Consecutive failed checks so far (anti-flapping counter). */
  consecutiveFailures: number;
  /** Consecutive successful checks so far (anti-flapping counter). */
  consecutiveSuccesses: number;
  failureThreshold: number;
  recoveryThreshold: number;
  notificationChannelIds: string[];
  lastCheckedAt: string | null;
  lastResponseTime: number | null;
  /** Uptime percentage over the last 24 hours (null when there are no checks yet). */
  uptime24h: number | null;
  /** Uptime percentage over the last 30 days (null when there are no checks yet). */
  uptime30d: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface MonitorCheckDTO {
  id: string;
  monitorId: string;
  status: 'UP' | 'DOWN';
  httpStatus: number | null;
  responseTime: number;
  error: string | null;
  checkedAt: string;
}

export interface DashboardStats {
  total: number;
  up: number;
  down: number;
  unknown: number;
  paused: number;
  activeIncidents: number;
  /** Failed notification deliveries in the last 24 hours. */
  failedNotifications: number;
  /** Average response time (ms) across checks from the last 24 hours. */
  avgResponseTime: number | null;
}

// ─────────────────────────────────────────────────────────
// Incident DTOs
// ─────────────────────────────────────────────────────────

export type IncidentStatus = 'OPEN' | 'RESOLVED';

export interface IncidentDTO {
  id: string;
  monitorId: string;
  monitorName?: string;
  startedAt: string;
  resolvedAt: string | null;
  status: IncidentStatus;
  cause: string;
  initialHttpStatus: number | null;
  lastHttpStatus: number | null;
  /** Duration in milliseconds (ongoing incidents compute against now). */
  durationMs: number;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────
// Status Page DTOs
// ─────────────────────────────────────────────────────────

export type GlobalStatus = 'ALL_OPERATIONAL' | 'PARTIAL_OUTAGE' | 'MAJOR_OUTAGE';

export interface PublicStatusMonitor {
  id: string;
  name: string;
  status: MonitorStatus;
  isPaused: boolean;
  uptime30d: number | null;
  /** Daily uptime buckets (oldest first). status: up/down/partial/no-data */
  dailyUptime: Array<{ date: string; uptime: number | null }>;
}

export interface PublicStatusIncident {
  id: string;
  monitorName: string;
  startedAt: string;
  resolvedAt: string | null;
  status: IncidentStatus;
  cause: string;
  durationMs: number;
}

export interface PublicStatusPage {
  name: string;
  slug: string;
  description: string;
  globalStatus: GlobalStatus;
  monitors: PublicStatusMonitor[];
  incidents: PublicStatusIncident[];
  updatedAt: string;
}

export interface StatusPageDTO {
  id: string;
  name: string;
  slug: string;
  description: string;
  monitorIds: string[];
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiErrorResponse {
  message: string;
}

// ─────────────────────────────────────────────────────────
// Notification DTOs
// ─────────────────────────────────────────────────────────

export type NotificationEventType = 'INCIDENT_OPENED' | 'INCIDENT_RESOLVED' | 'MONITOR_TEST';
export type NotificationDeliveryStatus = 'PENDING' | 'SENT' | 'FAILED';

/**
 * Channel as exposed by the API. Secrets (webhook URLs, Discord webhook URLs,
 * HMAC secrets) are NEVER returned after creation — only a masked preview.
 */
export interface NotificationChannelDTO {
  id: string;
  name: string;
  type: NotificationChannelType;
  enabled: boolean;
  /** Masked target, e.g. `https://discord.com/api/webhooks/***` or `ops@example.com`. */
  maskedTarget: string;
  /** True when the channel has a stored HMAC secret (generic webhooks only). */
  hasSecret: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Returned only once, immediately after creating/rotating a generic webhook. */
export interface NotificationChannelSecretResponse {
  channel: NotificationChannelDTO;
  webhookSecret: string;
}

export interface NotificationDeliveryDTO {
  id: string;
  channelId: string;
  channelName: string;
  channelType: NotificationChannelType;
  monitorId: string;
  monitorName: string;
  incidentId: string | null;
  eventType: NotificationEventType;
  status: NotificationDeliveryStatus;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface EmailProviderStatus {
  configured: boolean;
  from: string | null;
}
