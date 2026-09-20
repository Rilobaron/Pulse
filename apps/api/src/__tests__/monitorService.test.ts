import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────
vi.mock('../models/Monitor.js', () => ({ Monitor: { findOne: vi.fn() } }));
vi.mock('../models/MonitorCheck.js', () => ({ MonitorCheck: { aggregate: vi.fn() } }));
vi.mock('../models/Incident.js', () => ({ Incident: { updateMany: vi.fn() } }));
vi.mock('../jobs/monitorQueue.js', () => ({
  scheduleMonitor: vi.fn(),
  removeMonitorSchedule: vi.fn(),
}));
vi.mock('../utils/urlSafety.js', () => ({
  assertSafeMonitorUrl: vi.fn().mockResolvedValue(new URL('https://example.com')),
}));

import { Monitor } from '../models/Monitor.js';
import { MonitorCheck } from '../models/MonitorCheck.js';
import { scheduleMonitor, removeMonitorSchedule } from '../jobs/monitorQueue.js';
import { pauseMonitor, resumeMonitor } from '../services/monitorService.js';

const findOne = vi.mocked(Monitor.findOne);
const schedule = vi.mocked(scheduleMonitor);
const removeSchedule = vi.mocked(removeMonitorSchedule);

interface FakeMonitor {
  _id: { toString: () => string };
  isPaused: boolean;
  interval: number;
  save: ReturnType<typeof vi.fn>;
  [key: string]: unknown;
}

function fakeMonitor(overrides: Record<string, unknown> = {}): FakeMonitor {
  return {
    _id: { toString: () => '64b2f0000000000000000001' },
    userId: '64b2f0000000000000000002',
    name: 'API',
    url: 'https://example.com',
    method: 'GET',
    interval: 60_000,
    timeout: 10_000,
    status: 'UP',
    isPaused: false,
    lastCheckedAt: new Date(),
    lastResponseTime: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('pause / resume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Silence the uptime aggregation (returns no data)
    vi.mocked(MonitorCheck.aggregate).mockResolvedValue([] as never);
  });

  it('pause sets isPaused, saves and removes the scheduler', async () => {
    const monitor = fakeMonitor({ isPaused: false });
    findOne.mockResolvedValue(monitor as never);

    await pauseMonitor('user', '64b2f0000000000000000001');

    expect(monitor.isPaused).toBe(true);
    expect(monitor.save).toHaveBeenCalled();
    expect(removeSchedule).toHaveBeenCalledWith('64b2f0000000000000000001');
  });

  it('pause is idempotent (already paused -> no scheduler removal again)', async () => {
    const monitor = fakeMonitor({ isPaused: true });
    findOne.mockResolvedValue(monitor as never);

    await pauseMonitor('user', '64b2f0000000000000000001');

    expect(removeSchedule).not.toHaveBeenCalled();
  });

  it('resume clears isPaused and re-creates the scheduler (no duplicates)', async () => {
    const monitor = fakeMonitor({ isPaused: true });
    findOne.mockResolvedValue(monitor as never);

    await resumeMonitor('user', '64b2f0000000000000000001');

    expect(monitor.isPaused).toBe(false);
    expect(schedule).toHaveBeenCalledWith('64b2f0000000000000000001', 60_000);
  });
});
