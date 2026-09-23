import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────
vi.mock('../models/Monitor.js', () => ({
  Monitor: { findById: vi.fn(), findOne: vi.fn(), find: vi.fn(), updateMany: vi.fn() },
}));
vi.mock('../models/NotificationChannel.js', () => ({ NotificationChannel: { find: vi.fn() } }));
vi.mock('../models/NotificationDelivery.js', () => ({
  NotificationDelivery: { findOneAndUpdate: vi.fn() },
}));
vi.mock('../jobs/notificationQueue.js', () => ({ enqueueDelivery: vi.fn() }));
vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  sanitizeError: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

import { Monitor } from '../models/Monitor.js';
import { NotificationChannel } from '../models/NotificationChannel.js';
import { NotificationDelivery } from '../models/NotificationDelivery.js';
import { enqueueDelivery } from '../jobs/notificationQueue.js';
import { enqueueIncidentNotifications } from '../services/notificationService.js';

const findMonitorById = vi.mocked(Monitor.findById);
const findChannels = vi.mocked(NotificationChannel.find);
const findOneAndUpdateDelivery = vi.mocked(NotificationDelivery.findOneAndUpdate);
const enqueue = vi.mocked(enqueueDelivery);

function monitor(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => '64b2f0000000000000000001' },
    userId: { toString: () => '64b2f0000000000000000002' },
    name: 'API',
    notificationChannelIds: [
      { toString: () => '64b2f0000000000000000011' },
      { toString: () => '64b2f0000000000000000012' },
    ],
    ...overrides,
  } as never;
}

/**
 * `Model.findById(...)` returns a Mongoose Query: thenable *and* chainable with
 * `.select(...)`. Resolving the value directly would not model that contract.
 */
function selectableQuery(result: unknown) {
  return { select: vi.fn().mockResolvedValue(result) } as never;
}

function channel(id: string) {
  return { _id: { toString: () => id }, name: 'ch', type: 'WEBHOOK', enabled: true } as never;
}

function delivery(status: 'PENDING' | 'SENT') {
  return { _id: { toString: () => 'del1' }, status } as never;
}

const params = {
  incidentId: '64b2f0000000000000000099',
  monitorId: '64b2f0000000000000000001',
  eventType: 'INCIDENT_OPENED' as const,
};

describe('incident notification fan-out', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates one delivery + job per enabled channel', async () => {
    findMonitorById.mockReturnValue(selectableQuery(monitor()));
    findChannels.mockResolvedValue([channel('c1'), channel('c2')]);
    findOneAndUpdateDelivery.mockResolvedValue(delivery('PENDING'));

    const enqueued = await enqueueIncidentNotifications(params);

    expect(enqueued).toBe(2);
    expect(findOneAndUpdateDelivery).toHaveBeenCalledTimes(2);
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it('a monitor with no channels produces zero jobs', async () => {
    findMonitorById.mockReturnValue(selectableQuery(monitor({ notificationChannelIds: [] })));

    const enqueued = await enqueueIncidentNotifications(params);

    expect(enqueued).toBe(0);
    expect(findChannels).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('disabled channels produce no deliveries', async () => {
    findMonitorById.mockReturnValue(selectableQuery(monitor()));
    findChannels.mockResolvedValue([
      { _id: { toString: () => 'c1' }, name: 'on', type: 'WEBHOOK', enabled: true },
      { _id: { toString: () => 'c2' }, name: 'off', type: 'DISCORD', enabled: false },
    ] as never);

    // The service filters enabled:true at the query level — the mock returns both,
    // but find() is called with the enabled filter.
    findOneAndUpdateDelivery.mockResolvedValue(delivery('PENDING'));

    await enqueueIncidentNotifications(params);

    expect(findChannels).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
    );
  });

  it('processing the same incident event twice creates no second job (SENT skipped)', async () => {
    findMonitorById.mockReturnValue(selectableQuery(monitor()));
    findChannels.mockResolvedValue([channel('c1')]);
    // Delivery already SENT from the first run.
    findOneAndUpdateDelivery.mockResolvedValue(delivery('SENT'));

    const enqueued = await enqueueIncidentNotifications(params);

    expect(enqueued).toBe(0);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('a racing duplicate-key insert is skipped instead of duplicated', async () => {
    findMonitorById.mockReturnValue(selectableQuery(monitor()));
    findChannels.mockResolvedValue([channel('c1')]);
    const dupErr = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    findOneAndUpdateDelivery.mockRejectedValue(dupErr);

    const enqueued = await enqueueIncidentNotifications(params);

    expect(enqueued).toBe(0);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
