import { Types } from 'mongoose';
import type {
  CreateMonitorInput,
  MonitorDTO,
  UpdateMonitorInput,
} from '@pulse/shared';
import { DEFAULT_FAILURE_THRESHOLD, DEFAULT_RECOVERY_THRESHOLD } from '@pulse/shared';
import { Monitor, type IMonitor } from '../models/Monitor.js';
import { MonitorCheck } from '../models/MonitorCheck.js';
import { Incident } from '../models/Incident.js';
import { NotFoundError } from '../utils/errors.js';
import { assertSafeMonitorUrl } from '../utils/urlSafety.js';
import { removeMonitorSchedule, scheduleMonitor } from '../jobs/monitorQueue.js';
import { assertOwnedChannelIds } from './notificationService.js';

const DAY_MS = 24 * 60 * 60 * 1000;

async function getUptimePercentage(monitorId: string, windowMs: number): Promise<number | null> {
  const since = new Date(Date.now() - windowMs);

  const [result] = await MonitorCheck.aggregate<{
    total: number;
    up: number;
  }>([
    { $match: { monitorId: new Types.ObjectId(monitorId), checkedAt: { $gte: since } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        up: { $sum: { $cond: [{ $eq: ['$status', 'UP'] }, 1, 0] } },
      },
    },
  ]);

  if (!result || result.total === 0) return null;
  return Number(((result.up / result.total) * 100).toFixed(2));
}

async function toMonitorDTO(monitor: IMonitor): Promise<MonitorDTO> {
  const id = monitor._id.toString();
  const [uptime24h, uptime30d] = await Promise.all([
    getUptimePercentage(id, DAY_MS),
    getUptimePercentage(id, 30 * DAY_MS),
  ]);
  return {
    id,
    name: monitor.name,
    url: monitor.url,
    method: monitor.method,
    interval: monitor.interval,
    timeout: monitor.timeout,
    status: monitor.status,
    isPaused: monitor.isPaused,
    // Fallbacks keep documents created before Phase 3 fully valid.
    consecutiveFailures: monitor.consecutiveFailures ?? 0,
    consecutiveSuccesses: monitor.consecutiveSuccesses ?? 0,
    failureThreshold: monitor.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD,
    recoveryThreshold: monitor.recoveryThreshold ?? DEFAULT_RECOVERY_THRESHOLD,
    notificationChannelIds: (monitor.notificationChannelIds ?? []).map((channelId) => channelId.toString()),
    lastCheckedAt: monitor.lastCheckedAt?.toISOString() ?? null,
    lastResponseTime: monitor.lastResponseTime,
    uptime24h,
    uptime30d,
    createdAt: monitor.createdAt.toISOString(),
    updatedAt: monitor.updatedAt.toISOString(),
  };
}

async function findOwnedMonitor(userId: string, monitorId: string): Promise<IMonitor> {
  const monitor = await Monitor.findOne({ _id: monitorId, userId });
  if (!monitor) {
    throw new NotFoundError('Monitor not found');
  }
  return monitor;
}

export async function listMonitors(userId: string): Promise<MonitorDTO[]> {
  const monitors = await Monitor.find({ userId }).sort({ createdAt: -1 });
  return Promise.all(monitors.map(toMonitorDTO));
}

export async function getMonitor(userId: string, monitorId: string): Promise<MonitorDTO> {
  const monitor = await findOwnedMonitor(userId, monitorId);
  return toMonitorDTO(monitor);
}

export async function createMonitor(
  userId: string,
  input: CreateMonitorInput,
): Promise<MonitorDTO> {
  await assertSafeMonitorUrl(input.url);
  const channelIds = input.notificationChannelIds ?? [];
  await assertOwnedChannelIds(userId, channelIds);

  const monitor = await Monitor.create({
    userId,
    name: input.name,
    url: input.url,
    method: input.method,
    interval: input.interval,
    timeout: input.timeout,
    failureThreshold: input.failureThreshold,
    recoveryThreshold: input.recoveryThreshold,
    notificationChannelIds: channelIds,
  });

  await scheduleMonitor(monitor._id.toString(), monitor.interval);
  return toMonitorDTO(monitor);
}

export async function updateMonitor(
  userId: string,
  monitorId: string,
  input: UpdateMonitorInput,
): Promise<MonitorDTO> {
  const monitor = await findOwnedMonitor(userId, monitorId);

  const urlChanged = input.url !== undefined && input.url !== monitor.url;

  if (input.url) {
    // Re-validate SSRF whenever the target URL changes.
    await assertSafeMonitorUrl(input.url);
  }

  if (input.name !== undefined) monitor.name = input.name;
  if (input.url !== undefined) monitor.url = input.url;
  if (input.method !== undefined) monitor.method = input.method;
  if (input.interval !== undefined) monitor.interval = input.interval;
  if (input.timeout !== undefined) monitor.timeout = input.timeout;
  if (input.failureThreshold !== undefined) monitor.failureThreshold = input.failureThreshold;
  if (input.recoveryThreshold !== undefined) monitor.recoveryThreshold = input.recoveryThreshold;

  if (input.notificationChannelIds !== undefined) {
    await assertOwnedChannelIds(userId, input.notificationChannelIds);
    monitor.notificationChannelIds = input.notificationChannelIds.map(
      (channelId) => new Types.ObjectId(channelId),
    );
  }

  // A new URL is a different target: previous results must not determine the
  // new endpoint's state. Reset the operational snapshot (and counters) and
  // resolve any open incident tied to the old target.
  if (urlChanged) {
    monitor.status = 'UNKNOWN';
    monitor.consecutiveFailures = 0;
    monitor.consecutiveSuccesses = 0;
    monitor.lastCheckedAt = null;
    monitor.lastResponseTime = null;
    await Incident.updateMany(
      { monitorId: monitor._id, status: 'OPEN' },
      { $set: { status: 'RESOLVED', resolvedAt: new Date() } },
    );
  }

  await monitor.save();

  // Reschedule so the new interval takes effect (unless paused).
  if (!monitor.isPaused) {
    await scheduleMonitor(monitor._id.toString(), monitor.interval);
  }
  return toMonitorDTO(monitor);
}

export async function pauseMonitor(userId: string, monitorId: string): Promise<MonitorDTO> {
  const monitor = await findOwnedMonitor(userId, monitorId);

  if (!monitor.isPaused) {
    monitor.isPaused = true;
    await monitor.save();
    // Stop automatic checks. History and last status are preserved.
    await removeMonitorSchedule(monitor._id.toString());
  }
  // Idempotent: pausing an already-paused monitor is a no-op.
  return toMonitorDTO(monitor);
}

export async function resumeMonitor(userId: string, monitorId: string): Promise<MonitorDTO> {
  const monitor = await findOwnedMonitor(userId, monitorId);

  if (monitor.isPaused) {
    monitor.isPaused = false;
    await monitor.save();
  }
  // Idempotent + no duplicate schedulers: upsertJobScheduler recreates/updates.
  await scheduleMonitor(monitor._id.toString(), monitor.interval);
  return toMonitorDTO(monitor);
}

export async function deleteMonitor(userId: string, monitorId: string): Promise<void> {
  const monitor = await findOwnedMonitor(userId, monitorId);

  await Promise.all([
    MonitorCheck.deleteMany({ monitorId: monitor._id }),
    Incident.deleteMany({ monitorId: monitor._id }),
    monitor.deleteOne(),
    removeMonitorSchedule(monitor._id.toString()),
  ]);
}
