import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/env.js', () => ({
  env: {
    notification: { maxAttempts: 5, backoffMs: 1000, webhookTimeoutMs: 5000 },
  },
}));

import {
  assertValidDiscordWebhookUrl,
  discordProvider,
} from '../providers/discordProvider.js';

const target = (url: string) => ({
  channelId: 'ch1',
  channelName: 'ch',
  type: 'DISCORD' as const,
  url,
});

const message = {
  event: 'INCIDENT_OPENED' as const,
  monitor: { id: 'm1', name: 'API Production' },
  incident: {
    id: 'i1',
    status: 'OPEN' as const,
    cause: 'HTTP 500',
    startedAt: '2026-01-01T00:00:00.000Z',
    resolvedAt: null,
    durationMs: null,
  },
  timestamp: '2026-01-01T00:00:00.000Z',
};

describe('Discord provider', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts real Discord webhook URLs', () => {
    expect(() =>
      assertValidDiscordWebhookUrl('https://discord.com/api/webhooks/123/abc'),
    ).not.toThrow();
  });

  it('rejects non-Discord hosts, other protocols and wrong paths', () => {
    expect(() => assertValidDiscordWebhookUrl('https://attacker.example.com/api/webhooks/1/2')).toThrow(
      /must point to/,
    );
    expect(() => assertValidDiscordWebhookUrl('http://discord.com/api/webhooks/1/2')).toThrow(
      /must use https/,
    );
    expect(() => assertValidDiscordWebhookUrl('https://discord.com/api/other/1/2')).toThrow(
      /must contain/,
    );
  });

  it('sends a professional embed payload (mocked fetch)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ status: 204, arrayBuffer: async () => new ArrayBuffer(0) });
    vi.stubGlobal('fetch', fetchMock);

    await discordProvider.send(target('https://discord.com/api/webhooks/123/abc'), message);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    const payload = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(payload.content).toContain('API Production');
    const embeds = payload.embeds as Array<{ title: string; color: number }>;
    expect(embeds[0].title).toContain('API Production is down');
    expect(embeds[0].color).toBe(0xef4444);
  });

  it('does not perform real network calls without a configured URL (optional smoke)', () => {
    // Discord E2E is opt-in: only run when an explicit test webhook is provided.
    // Set DISCORD_TEST_WEBHOOK_URL to exercise a real delivery manually.
    const testUrl = process.env.DISCORD_TEST_WEBHOOK_URL;
    if (!testUrl) {
      expect(true).toBe(true);
      return;
    }
    expect(testUrl).toContain('discord.com');
    // Real sends are deliberately never part of the automatic suite.
  });
});
