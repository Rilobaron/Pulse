import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────
vi.mock('../models/NotificationDelivery.js', () => ({
  NotificationDelivery: { findById: vi.fn(), updateOne: vi.fn() },
}));
vi.mock('../models/NotificationChannel.js', () => ({ NotificationChannel: { findById: vi.fn() } }));
vi.mock('../models/Monitor.js', () => ({ Monitor: { findById: vi.fn() } }));
vi.mock('../models/Incident.js', () => ({ Incident: { findById: vi.fn() } }));
vi.mock('../providers/index.js', () => ({ sendToChannel: vi.fn() }));
vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  sanitizeError: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

import { NotificationDelivery } from '../models/NotificationDelivery.js';
import { NotificationChannel } from '../models/NotificationChannel.js';
import { Monitor } from '../models/Monitor.js';
import { Incident } from '../models/Incident.js';
import { sendToChannel } from '../providers/index.js';
import { NotificationProviderError } from '../providers/types.js';
import { processDelivery } from '../services/notificationDeliveryService.js';

const findDelivery = vi.mocked(NotificationDelivery.findById);
const updateDelivery = vi.mocked(NotificationDelivery.updateOne);
const findChannel = vi.mocked(NotificationChannel.findById);
const findMonitor = vi.mocked(Monitor.findById);
const findIncident = vi.mocked(Incident.findById);
const send = vi.mocked(sendToChannel);

function deliveryDoc() {
  return {
    _id: { toString: () => 'del1' },
    channelId: { toString: () => 'ch1' },
    monitorId: { toString: () => 'm1' },
    incidentId: { toString: () => 'i1' },
    eventType: 'INCIDENT_OPENED',
  } as never;
}

function channelDoc(enabled = true) {
  return {
    _id: { toString: () => 'ch1' },
    name: 'ch',
    type: 'WEBHOOK',
    enabled,
    config: { url: 'https://hooks.example.com/pulse' },
  } as never;
}

function arrangeSuccess() {
  findDelivery.mockResolvedValue(deliveryDoc());
  findChannel.mockReturnValue({ select: vi.fn().mockResolvedValue(channelDoc()) } as never);
  findMonitor.mockReturnValue({ select: vi.fn().mockResolvedValue({ _id: 'm1', name: 'API' }) } as never);
  findIncident.mockReturnValue({
    select: vi.fn().mockResolvedValue({
      _id: 'i1',
      status: 'OPEN',
      cause: 'HTTP 500',
      startedAt: new Date('2026-01-01T00:00:00Z'),
      resolvedAt: null,
    }),
  } as never);
}

describe('delivery processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('successful send marks the delivery SENT', async () => {
    arrangeSuccess();
    send.mockResolvedValue(undefined);

    const result = await processDelivery('del1', { attempt: 1, maxAttempts: 5 });

    expect(result).toMatchObject({ status: 'SENT', attempts: 1 });
    expect(updateDelivery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ $set: expect.objectContaining({ status: 'SENT' }) }),
    );
  });

  it('transient provider error keeps PENDING and rethrows for BullMQ retry', async () => {
    arrangeSuccess();
    send.mockRejectedValue(new NotificationProviderError('boom', true));

    await expect(processDelivery('del1', { attempt: 2, maxAttempts: 5 })).rejects.toThrow('boom');

    expect(updateDelivery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ $set: expect.objectContaining({ status: 'PENDING', attempts: 2 }) }),
    );
  });

  it('exhausted attempts mark the delivery FAILED instead of retrying', async () => {
    arrangeSuccess();
    send.mockRejectedValue(new NotificationProviderError('boom', true));

    const result = await processDelivery('del1', { attempt: 5, maxAttempts: 5 });

    expect(result).toMatchObject({ status: 'FAILED', attempts: 5 });
    expect(updateDelivery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ $set: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });

  it('non-retryable provider error fails immediately without retries', async () => {
    arrangeSuccess();
    send.mockRejectedValue(new NotificationProviderError('bad url', false));

    const result = await processDelivery('del1', { attempt: 1, maxAttempts: 5 });

    expect(result.status).toBe('FAILED');
    expect(result.error).toContain('not retryable');
  });

  it('a disabled channel fails the delivery without touching the provider', async () => {
    arrangeSuccess();
    // Override the channel for this case (disabled).
    findChannel.mockReturnValue({ select: vi.fn().mockResolvedValue(channelDoc(false)) } as never);

    const result = await processDelivery('del1', { attempt: 1, maxAttempts: 5 });

    expect(result.status).toBe('FAILED');
    expect(send).not.toHaveBeenCalled();
  });
});
