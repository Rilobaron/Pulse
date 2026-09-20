import { env } from '../config/env.js';
import { assertSafeMonitorUrl } from '../utils/urlSafety.js';
import { SIGNATURE_HEADER, signWebhookPayload } from '../utils/webhookSignature.js';
import type { NotificationMessage, NotificationTarget } from './types.js';
import { NotificationProviderError, type NotificationProvider } from './types.js';

export const WEBHOOK_PAYLOAD_VERSION = '1';

/**
 * Versioned, provider-neutral webhook payload (documented in the README).
 * Only public-safe fields are included: no internal ids beyond monitor/incident,
 * no userId, no credentials, no response bodies.
 */
export function buildWebhookPayload(message: NotificationMessage): Record<string, unknown> {
  const isResolved = message.event === 'INCIDENT_RESOLVED';

  return {
    version: WEBHOOK_PAYLOAD_VERSION,
    event: isResolved ? 'incident.resolved' : message.event === 'MONITOR_TEST' ? 'monitor.test' : 'incident.opened',
    timestamp: message.timestamp,
    monitor: {
      id: message.monitor.id,
      name: message.monitor.name,
    },
    ...(message.incident
      ? {
          incident: {
            id: message.incident.id,
            status: message.incident.status,
            cause: message.incident.cause,
            startedAt: message.incident.startedAt,
            resolvedAt: message.incident.resolvedAt,
            durationMs: message.incident.durationMs,
          },
        }
      : {}),
    ...(message.event === 'MONITOR_TEST'
      ? { message: 'This is a test notification from Pulse.' }
      : {}),
  };
}

/**
 * Generic webhook delivery.
 *
 * Security:
 *  - destination validated with the shared SSRF guard (`assertSafeMonitorUrl`)
 *  - redirects are NOT followed (a redirect could bypass the IP validation)
 *  - the body is signed with HMAC-SHA256 and sent as `X-Pulse-Signature: sha256=<hex>`
 */
export const webhookProvider: NotificationProvider = {
  async send(target: NotificationTarget, message: NotificationMessage): Promise<void> {
    if (!target.url) {
      throw new NotificationProviderError('Webhook channel has no URL', false);
    }

    // Throws BadRequestError (mapped to a non-retryable provider error) when the
    // target resolves to a private/reserved address.
    try {
      await assertSafeMonitorUrl(target.url);
    } catch (err) {
      throw new NotificationProviderError(
        err instanceof Error ? `Webhook destination rejected: ${err.message}` : 'Webhook destination rejected',
        false,
      );
    }

    const rawBody = JSON.stringify(buildWebhookPayload(message));

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'user-agent': 'Pulse-Notifier/0.1 (+webhook)',
      'x-pulse-event': message.event,
      'x-pulse-delivery-version': WEBHOOK_PAYLOAD_VERSION,
    };

    if (target.secret) {
      headers[SIGNATURE_HEADER] = signWebhookPayload(target.secret, rawBody);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.notification.webhookTimeoutMs);

    try {
      const response = await fetch(target.url, {
        method: 'POST',
        redirect: 'manual',
        signal: controller.signal,
        headers,
        body: rawBody,
      });

      await response.arrayBuffer().catch(() => undefined);

      if (response.status >= 200 && response.status < 300) return;

      const retryable = response.status === 429 || response.status >= 500;
      throw new NotificationProviderError(
        `Webhook responded with HTTP ${response.status}`,
        retryable,
      );
    } catch (err) {
      if (err instanceof NotificationProviderError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new NotificationProviderError(
          `Webhook request timed out after ${env.notification.webhookTimeoutMs} ms`,
          true,
        );
      }
      throw new NotificationProviderError(
        err instanceof Error ? err.message : 'Webhook request failed',
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  },
};
