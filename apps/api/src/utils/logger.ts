/**
 * Minimal structured logger.
 *
 * Emits one JSON object per line so logs can be filtered by `event`:
 *   notification_job_started | notification_sent | notification_failed
 *   notification_retry | incident_opened | incident_resolved | worker_started
 *
 * Sensitive values are redacted by key name — webhook secrets, Discord tokens,
 * SMTP credentials, Authorization headers and JWTs must never reach the logs.
 */

const SENSITIVE_KEY_PATTERN = /(secret|token|password|passwd|authorization|apikey|api_key|jwt)/i;

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = Record<string, unknown>;

function redact(value: unknown, key = ''): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) return '[redacted]';

  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }

  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      out[childKey] = redact(childValue, childKey);
    }
    return out;
  }

  // Mask anything that looks like a credential-bearing URL (e.g. Discord webhooks)
  if (typeof value === 'string' && /https?:\/\/[^\s]*\/(webhooks|hooks)\//i.test(value)) {
    return '[redacted-url]';
  }

  return value;
}

function write(level: LogLevel, event: string, context: LogContext = {}): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...(redact(context) as LogContext),
  };

  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (event: string, context?: LogContext) => write('debug', event, context),
  info: (event: string, context?: LogContext) => write('info', event, context),
  warn: (event: string, context?: LogContext) => write('warn', event, context),
  error: (event: string, context?: LogContext) => write('error', event, context),
};

/** Truncates provider errors before persisting/logging them. */
export function sanitizeError(err: unknown, maxLength = 300): string {
  const raw = err instanceof Error ? err.message : String(err);
  const cleaned = raw.replace(/https?:\/\/[^\s"']+/gi, '[url]');
  return cleaned.slice(0, maxLength);
}
