import { describe, expect, it, vi, afterEach } from 'vitest';

// SMTP configuration is read from `env` at call time; keep it mutable so the
// "not configured" tests and the injected-transport test can both be honest.
const smtp = vi.hoisted(() => ({
  host: '',
  port: 587,
  user: '',
  password: '',
  from: '',
  secure: false,
}));

vi.mock('../../config/env.js', () => ({
  env: {
    smtp,
    notification: { maxAttempts: 5, backoffMs: 1000, webhookTimeoutMs: 5000 },
  },
}));

import { createSmtpEmailProvider } from '../../providers/email/smtpEmailProvider.js';
import { renderIncidentEmail } from '../../providers/email/emailProvider.js';

describe('email provider (mocked transport — no real emails)', () => {
  afterEach(() => {
    smtp.host = '';
    smtp.from = '';
  });

  it('reports itself as not configured when SMTP is missing', () => {
    const provider = createSmtpEmailProvider();
    expect(provider.isConfigured()).toBe(false);
  });

  it('refuses to send without configuration (non-retryable)', async () => {
    const provider = createSmtpEmailProvider();
    await expect(
      provider.send({ to: 'ops@example.com', subject: 't', text: 't', html: '<p>t</p>' }),
    ).rejects.toMatchObject({ name: 'NotificationProviderError' });
  });

  it('delivers through the injected transport (json stream, no network)', async () => {
    // Configured SMTP — this case must exercise the transport, not the guard.
    smtp.host = 'smtp.example.com';
    smtp.from = 'Pulse <alerts@example.com>';

    const sent: Array<Record<string, unknown>> = [];
    const fakeTransport = {
      sendMail: vi.fn(async (mail: unknown) => {
        sent.push(mail as Record<string, unknown>);
        return { messageId: 'test-1' };
      }),
    };

    const provider = createSmtpEmailProvider(fakeTransport);
    await provider.send({
      to: 'ops@example.com',
      subject: 'Pulse Alert',
      text: 'API is DOWN',
      html: '<p>API is DOWN</p>',
    });

    expect(fakeTransport.sendMail).toHaveBeenCalledTimes(1);
    expect(sent[0]).toMatchObject({ to: 'ops@example.com', subject: 'Pulse Alert' });
  });
});

describe('email templates', () => {
  it('renders an opened incident with cause and start', () => {
    const email = renderIncidentEmail({
      event: 'INCIDENT_OPENED',
      monitor: { id: 'm1', name: 'API Production' },
      incident: {
        id: 'i1',
        status: 'OPEN',
        cause: 'HTTP 500',
        startedAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: null,
        durationMs: null,
      },
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    expect(email.subject).toContain('API Production');
    expect(email.subject).toContain('DOWN');
    expect(email.text).toContain('HTTP 500');
    expect(email.html).toContain('API Production');
    expect(email.html).not.toContain('<script');
  });

  it('renders recovery with the downtime in minutes', () => {
    const email = renderIncidentEmail({
      event: 'INCIDENT_RESOLVED',
      monitor: { id: 'm1', name: 'API Production' },
      incident: {
        id: 'i1',
        status: 'RESOLVED',
        cause: 'HTTP 500',
        startedAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: '2026-01-01T00:04:18.000Z',
        durationMs: 258_000,
      },
      timestamp: '2026-01-01T00:04:18.000Z',
    });

    // The recovery subject reads "Pulse Recovery — <name> is operational".
    expect(email.subject).toContain('Recovery');
    expect(email.subject).toContain('API Production');
    expect(email.text).toContain('4 minutes');
  });

  it('renders a clearly-labeled test notification', () => {
    const email = renderIncidentEmail({
      event: 'MONITOR_TEST',
      monitor: { id: 'm1', name: 'Test' },
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    expect(email.text).toContain('This is a test notification from Pulse.');
  });
});
