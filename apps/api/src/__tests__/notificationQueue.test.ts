import { beforeEach, describe, expect, it, vi } from 'vitest';

// BullMQ's Queue would open a real Redis connection at import time; capture
// `add` calls instead so the job-id contract can be asserted without Redis.
const addMock = vi.hoisted(() => vi.fn());
const closeMock = vi.hoisted(() => vi.fn());

vi.mock('bullmq', () => ({
  Queue: class {
    add = addMock;
    close = closeMock;
  },
}));

vi.mock('../config/redis.js', () => ({
  createRedisConnection: () => ({ disconnect: vi.fn() }),
}));

import { enqueueDelivery } from '../jobs/notificationQueue.js';

describe('enqueueDelivery job id', () => {
  beforeEach(() => {
    addMock.mockReset();
  });

  // Regression: BullMQ rejects custom job ids containing ':' — a previous
  // `delivery:${dedupeKey}` id made EVERY notification enqueue throw
  // ("Custom Id cannot contain :") in production while unit tests passed
  // because they mock this module.
  it('never contains a colon, for test-style dedupe keys', async () => {
    await enqueueDelivery('d1', 'test:65671234567890abcdef1234:65671234567890abcdef5678');

    expect(addMock).toHaveBeenCalledTimes(1);
    const jobId = addMock.mock.calls[0][2].jobId as string;
    expect(jobId).not.toContain(':');
  });

  it('never contains a colon, for incident-style dedupe keys', async () => {
    await enqueueDelivery('d2', 'incident:65671234567890abcdef1234:INCIDENT_OPENED:65671234567890abcdef5678');

    const jobId = addMock.mock.calls[0][2].jobId as string;
    expect(jobId).not.toContain(':');
  });

  it('stays unique per (incident, event, channel) triple and stable on re-enqueue', async () => {
    const key = 'incident:aaa:INCIDENT_OPENED:bbb';
    await enqueueDelivery('d3', key);
    const first = addMock.mock.calls[0][2].jobId;

    // Same triple re-enqueued → identical job id (BullMQ dedupes it away).
    await enqueueDelivery('d3', key);
    const again = addMock.mock.calls[1][2].jobId;
    expect(again).toBe(first);

    // Different channel → different job id.
    await enqueueDelivery('d4', 'incident:aaa:INCIDENT_OPENED:ccc');
    const other = addMock.mock.calls[2][2].jobId;
    expect(other).not.toBe(first);
  });

  it('passes the deliveryId as job data', async () => {
    await enqueueDelivery('delivery-123', 'test:chan:nonce');
    expect(addMock.mock.calls[0]).toEqual(['deliver', { deliveryId: 'delivery-123' }, expect.any(Object)]);
  });
});
