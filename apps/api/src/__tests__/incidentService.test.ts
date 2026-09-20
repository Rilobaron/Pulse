import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock the models before importing the service ──
vi.mock('../models/Incident.js', () => ({
  Incident: {
    findOneAndUpdate: vi.fn(),
    find: vi.fn(),
    countDocuments: vi.fn(),
    updateMany: vi.fn(),
  },
}));
vi.mock('../models/Monitor.js', () => ({ Monitor: { findOne: vi.fn() } }));

import { Incident } from '../models/Incident.js';
import { handleStatusTransition } from '../services/incidentService.js';

const findOneAndUpdate = vi.mocked(Incident.findOneAndUpdate);

const base = {
  monitorId: '64b2f0000000000000000001',
  userId: '64b2f0000000000000000002',
  error: 'Connection timeout',
  httpStatus: null,
};

describe('incident lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('UP -> DOWN opens exactly one incident (upsert with $setOnInsert)', async () => {
    findOneAndUpdate.mockResolvedValue({} as never);

    await handleStatusTransition({ ...base, previousStatus: 'UP', newStatus: 'DOWN' });

    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, update, options] = findOneAndUpdate.mock.calls[0] as [
      Record<string, unknown>,
      { $setOnInsert: Record<string, unknown> },
      Record<string, unknown>,
    ];
    expect(filter).toMatchObject({ status: 'OPEN' });
    expect(update.$setOnInsert.status).toBe('OPEN');
    expect(update.$setOnInsert.cause).toBe('Connection timeout');
    expect(options).toMatchObject({ upsert: true });
  });

  it('UNKNOWN -> DOWN opens an incident (first real DOWN opens)', async () => {
    findOneAndUpdate.mockResolvedValue({} as never);
    await handleStatusTransition({ ...base, previousStatus: 'UNKNOWN', newStatus: 'DOWN' });
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    const update = findOneAndUpdate.mock.calls[0][1] as { $setOnInsert: { status: string } };
    expect(update.$setOnInsert.status).toBe('OPEN');
  });

  it('DOWN -> DOWN does NOT create another incident (only refreshes lastHttpStatus)', async () => {
    findOneAndUpdate.mockResolvedValue({} as never);
    await handleStatusTransition({
      ...base,
      previousStatus: 'DOWN',
      newStatus: 'DOWN',
      httpStatus: 500,
    });
    const [, update, options] = findOneAndUpdate.mock.calls[0] as [
      unknown,
      { $set: Record<string, unknown> },
      Record<string, unknown>,
    ];
    // Still an upsert on the OPEN filter — a second insert is prevented by the
    // partial unique index. $setOnInsert only applies when creating.
    expect(update.$set).toEqual({ lastHttpStatus: 500 });
    expect(options).toMatchObject({ upsert: true });
  });

  it('concurrent duplicate-key error is swallowed (no second incident)', async () => {
    const dupErr = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    findOneAndUpdate.mockRejectedValueOnce(dupErr).mockResolvedValueOnce({} as never);

    await expect(
      handleStatusTransition({ ...base, previousStatus: 'UP', newStatus: 'DOWN' }),
    ).resolves.toBeUndefined();

    // First call attempted the upsert, second call refreshed lastHttpStatus.
    expect(findOneAndUpdate).toHaveBeenCalledTimes(2);
  });

  it('DOWN -> UP resolves the open incident', async () => {
    findOneAndUpdate.mockResolvedValue({} as never);
    await handleStatusTransition({ ...base, previousStatus: 'DOWN', newStatus: 'UP' });

    const [filter, update] = findOneAndUpdate.mock.calls[0] as [
      Record<string, unknown>,
      { $set: { status: string; resolvedAt: Date } },
    ];
    expect(filter).toMatchObject({ status: 'OPEN' });
    expect(update.$set.status).toBe('RESOLVED');
    expect(update.$set.resolvedAt).toBeInstanceOf(Date);
  });

  it('no transition (UP -> UP) does nothing', async () => {
    await handleStatusTransition({ ...base, previousStatus: 'UP', newStatus: 'UP' });
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('transitions into UNKNOWN never open incidents', async () => {
    await handleStatusTransition({ ...base, previousStatus: 'DOWN', newStatus: 'UNKNOWN' });
    await handleStatusTransition({ ...base, previousStatus: 'UP', newStatus: 'UNKNOWN' });
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });
});
