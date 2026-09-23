import { z } from 'zod';
import {
  DEFAULT_FAILURE_THRESHOLD,
  DEFAULT_RECOVERY_THRESHOLD,
  DEFAULT_TIMEOUT_MS,
  HTTP_METHODS,
  MAX_INTERVAL_MS,
  MAX_THRESHOLD,
  MAX_TIMEOUT_MS,
  MIN_INTERVAL_MS,
  MIN_THRESHOLD,
  MIN_TIMEOUT_MS,
} from '@pulse/shared';

// Form-level schema: coerces numeric fields coming from <select>/<input> and
// mirrors the shared createMonitorSchema rules (single source of truth on the API).
export const monitorFormSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  url: z.string().trim().url('Must be a valid URL (including http:// or https://)').max(2048),
  method: z.enum(HTTP_METHODS),
  interval: z.coerce
    .number()
    .int()
    .min(MIN_INTERVAL_MS, 'Interval must be at least 30 seconds')
    .max(MAX_INTERVAL_MS, 'Interval must be at most 10 minutes'),
  timeout: z.coerce
    .number()
    .int()
    .min(MIN_TIMEOUT_MS, 'Timeout must be at least 1 second')
    .max(MAX_TIMEOUT_MS, 'Timeout must be at most 30 seconds'),
  failureThreshold: z.coerce
    .number()
    .int()
    .min(MIN_THRESHOLD, 'Failure threshold must be at least 1')
    .max(MAX_THRESHOLD, 'Failure threshold must be at most 10'),
  recoveryThreshold: z.coerce
    .number()
    .int()
    .min(MIN_THRESHOLD, 'Recovery threshold must be at least 1')
    .max(MAX_THRESHOLD, 'Recovery threshold must be at most 10'),
  notificationChannelIds: z.array(z.string()).default([]),
});

export type MonitorFormValues = z.infer<typeof monitorFormSchema>;

/** Defaults used when creating a new monitor. */
export const monitorFormDefaults: MonitorFormValues = {
  name: '',
  url: '',
  method: 'GET',
  interval: 60_000,
  timeout: DEFAULT_TIMEOUT_MS,
  failureThreshold: DEFAULT_FAILURE_THRESHOLD,
  recoveryThreshold: DEFAULT_RECOVERY_THRESHOLD,
  notificationChannelIds: [],
};
