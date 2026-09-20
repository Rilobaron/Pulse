import { env } from '../config/env.js';
import { assertSafeMonitorUrl } from '../utils/urlSafety.js';
import {
  NotificationProviderError,
  describeEvent,
  type NotificationMessage,
  type NotificationProvider,
  type NotificationTarget,
} from './types.js';

const ALLOWED_DISCORD_HOSTS = new Set([
  'discord.com',
  'discordapp.com',
  'ptb.discord.com',
  'canary.discord.com',
]);

const COLOR_DANGER = 0xef4444;
const COLOR_SUCCESS = 0x10b981;
const COLOR_NEUTRAL = 0x6366f1;

/**
 * Validates that a Discord channel points at a real Discord webhook endpoint.
 * This is stricter than SSRF validation alone and prevents using Pulse as a
 * generic HTTP client through the "Discord" channel type.
 */
export function assertValidDiscordWebhookUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new NotificationProviderError('Invalid Discord webhook URL', false);
  }

  if (url.protocol !== 'https:') {
    throw new NotificationProviderError('Discord webhook URL must use https', false);
  }

  if (!ALLOWED_DISCORD_HOSTS.has(url.hostname.toLowerCase())) {
    throw new NotificationProviderError(
      `Discord webhook URL must point to ${[...ALLOWED_DISCORD_HOSTS].join(', ')}`,
      false,
    );
  }

  if (!url.pathname.startsWith('/api/webhooks/')) {
    throw new NotificationProviderError('Discord webhook URL must contain /api/webhooks/', false);
  }

  return url;
}

function buildDiscordPayload(message: NotificationMessage): Record<string, unknown> {
  const { title, bodyLines } = describeEvent(message);

  const color =
    message.event === 'INCIDENT_OPENED'
      ? COLOR_DANGER
      : message.event === 'INCIDENT_RESOLVED'
        ? COLOR_SUCCESS
        : COLOR_NEUTRAL;

  const emoji =
    message.event === 'INCIDENT_OPENED' ? '🔴' : message.event === 'INCIDENT_RESOLVED' ? '🟢' : '🔵';

  const fields: Array<{ name: string; value: string; inline: boolean }> = [];

  if (message.incident) {
    fields.push({ name: 'Cause', value: message.incident.cause, inline: true });
    if (message.event === 'INCIDENT_RESOLVED') {
      fields.push({
        name: 'Downtime',
        value: formatDuration(message.incident.durationMs),
        inline: true,
      });
    } else {
      fields.push({ name: 'Started', value: new Date(message.incident.startedAt).toUTCString(), inline: true });
    }
  }

  return {
    // Plain text fallback (kept short and free of private data)
    content: `${emoji} **${title}**`,
    embeds: [
      {
        title: `${emoji} ${title}`,
        description: bodyLines.filter(Boolean).join('\n').slice(0, 3500),
        color,
        fields,
        footer: { text: 'Pulse' },
        timestamp: message.timestamp,
      },
    ],
  };
}

function formatDuration(durationMs: number | null): string {
  if (durationMs == null) return 'unknown';
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export const discordProvider: NotificationProvider = {
  async send(target: NotificationTarget, message: NotificationMessage): Promise<void> {
    if (!target.url) {
      throw new NotificationProviderError('Discord channel has no webhook URL', false);
    }

    const url = assertValidDiscordWebhookUrl(target.url);
    // Defence in depth: the same centralized destination validation used for monitors.
    await assertSafeMonitorUrl(url.toString());

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.notification.webhookTimeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        // Never follow redirects — a redirect could point at an internal address.
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Pulse-Notifier/0.1 (+discord)',
        },
        body: JSON.stringify(buildDiscordPayload(message)),
      });

      // Drain and discard the body.
      await response.arrayBuffer().catch(() => undefined);

      if (response.status >= 200 && response.status < 300) return;

      const retryable = response.status === 429 || response.status >= 500;
      throw new NotificationProviderError(
        `Discord responded with HTTP ${response.status}`,
        retryable,
      );
    } catch (err) {
      if (err instanceof NotificationProviderError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new NotificationProviderError(
          `Discord request timed out after ${env.notification.webhookTimeoutMs} ms`,
          true,
        );
      }
      throw new NotificationProviderError(
        err instanceof Error ? err.message : 'Discord request failed',
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  },
};
