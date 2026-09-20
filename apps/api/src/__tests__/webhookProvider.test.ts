import { beforeEach, describe, expect, it, vi } from 'vitest';

// SSRF validation must NOT perform network requests in these tests — the host
// literals and well-known private ranges are classified locally, so no mock
// of `dns.lookup` is required. The redirect-to-private case is exercised through
// a stubbed global fetch below.
vi.mock('../config/env.js', () => ({
  env: {
    notification: { maxAttempts: 5, backoffMs: 1000, webhookTimeoutMs: 5000 },
  },
}));

import { webhookProvider } from '../providers/webhookProvider.js';
import { signWebhookPayload, verifyWebhookSignature } from '../utils/webhookSignature.js';

describe('HMAC webhook signature', () => {
  it('produces a deterministic, verifiable sha256 signature', () => {
    const secret = 'test-secret-123';
    const body = '{"version":"1","event":"incident.opened"}';

    const signature = signWebhookPayload(secret, body);

    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(signature).toBe(signWebhookPayload(secret, body)); // deterministic
    expect(verifyWebhookSignature(secret, body, signature)).toBe(true);
  });

  it('rejects tampered bodies and wrong secrets', () => {
    const secret = 'test-secret-123';
    const body = '{"version":"1"}';
    const signature = signWebhookPayload(secret, body);

    expect(verifyWebhookSignature(secret, '{"version":"2"}', signature)).toBe(false);
    expect(verifyWebhookSignature('other-secret', body, signature)).toBe(false);
    expect(verifyWebhookSignature(secret, body, 'sha256=deadbeef')).toBe(false);
  });
});

const target = (url: string) => ({
  channelId: 'ch1',
  channelName: 'ch',
  type: 'WEBHOOK' as const,
  url,
  secret: 'secret-1',
});

const message = {
  event: 'INCIDENT_OPENED' as const,
  monitor: { id: 'm1', name: 'API' },
  timestamp: '2026-01-01T00:00:00.000Z',
};

describe('generic webhook SSRF protection', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['http://localhost/x', 'localhost'],
    ['http://localhost.:8080/x', 'localhost with trailing dot'],
    ['http://127.0.0.1/x', 'IPv4 loopback'],
    ['http://[::1]/x', 'IPv6 loopback'],
    ['http://10.1.2.3/x', '10/8'],
    ['http://172.16.9.9/x', '172.16/12'],
    ['http://172.31.255.1/x', '172.16/12 upper edge'],
    ['http://192.168.1.1/x', '192.168/16'],
    ['http://169.254.169.254/latest/meta-data', 'cloud metadata'],
    ['http://0.0.0.0/x', 'unspecified'],
  ])('blocks %s (%s)', async (url) => {
    await expect(webhookProvider.send(target(url), message)).rejects.toThrow(
      /destination rejected/i,
    );
  });

  it('never sends when the endpoint redirects to a private address', async () => {
    // A public URL that "redirects" internally: the provider uses
    // redirect: 'manual', so a 3xx response is delivered as-is and never
    // followed. The stub asserts no second request is issued.
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ status: 302, arrayBuffer: async () => new ArrayBuffer(0) });

    vi.stubGlobal('fetch', fetchMock);
    // Use a public IP literal (TEST-NET-1 is blocked by the guard — use a public one).
    // 93.184.216.34 is example.com; guard allows it, redirect is not followed.
    await expect(
      webhookProvider.send(target('https://93.184.216.34/redirect'), message),
    ).rejects.toThrow(/HTTP 302/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends the versioned JSON payload with the HMAC signature header', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ status: 200, arrayBuffer: async () => new ArrayBuffer(0) });
    vi.stubGlobal('fetch', fetchMock);

    await webhookProvider.send(target('https://93.184.216.34/hooks'), message);

    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('https://93.184.216.34/hooks');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-pulse-event']).toBe('INCIDENT_OPENED');

    const payload = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(payload).toMatchObject({ version: '1', event: 'incident.opened' });
    expect(headers['x-pulse-signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
  });
});
