import type { NotificationChannelType, NotificationEventType } from '@pulse/shared';

export interface NotificationMonitorInfo {
  id: string;
  name: string;
}

export interface NotificationIncidentInfo {
  id: string;
  status: 'OPEN' | 'RESOLVED';
  cause: string;
  startedAt: string;
  resolvedAt: string | null;
  durationMs: number | null;
}

/**
 * Provider-agnostic notification payload. Every provider renders this into its
 * own format (Discord embed, versioned JSON webhook, email HTML/text).
 */
export interface NotificationMessage {
  event: NotificationEventType;
  monitor: NotificationMonitorInfo;
  incident?: NotificationIncidentInfo;
  timestamp: string;
}

export interface NotificationTarget {
  channelId: string;
  channelName: string;
  type: NotificationChannelType;
  /** DISCORD / WEBHOOK */
  url?: string;
  /** WEBHOOK only — HMAC signing secret. */
  secret?: string;
  /** EMAIL only */
  email?: string;
}

export interface NotificationProvider {
  send(target: NotificationTarget, message: NotificationMessage): Promise<void>;
}

/**
 * Wraps provider failures so the worker can decide whether BullMQ should retry.
 *  - `retryable: true`  → transient (network, 429, 5xx): retry with backoff.
 *  - `retryable: false` → permanent (bad URL, 4xx, missing config): fail fast.
 */
export class NotificationProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean = true,
  ) {
    super(message);
    this.name = 'NotificationProviderError';
  }
}

export function describeEvent(message: NotificationMessage): {
  title: string;
  subject: string;
  bodyLines: string[];
} {
  const { monitor, incident, event } = message;

  if (event === 'MONITOR_TEST') {
    return {
      title: 'Test notification',
      subject: 'Pulse test notification',
      bodyLines: ['This is a test notification from Pulse.', `Channel: ${monitor.name}`],
    };
  }

  if (event === 'INCIDENT_OPENED') {
    return {
      title: `${monitor.name} is down`,
      subject: `[Pulse] ${monitor.name} is DOWN`,
      bodyLines: [
        `${monitor.name} is DOWN`,
        '',
        'Cause:',
        incident?.cause ?? 'Unknown error',
        '',
        'Started:',
        incident?.startedAt ?? message.timestamp,
      ],
    };
  }

  return {
    title: `${monitor.name} recovered`,
    subject: `[Pulse] ${monitor.name} recovered`,
    bodyLines: [
      `${monitor.name} is operational again`,
      '',
      'Downtime:',
      incident?.durationMs != null ? `${Math.round(incident.durationMs / 1000)} seconds` : 'unknown',
    ],
  };
}
