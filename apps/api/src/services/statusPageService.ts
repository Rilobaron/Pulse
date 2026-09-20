import { Types } from 'mongoose';
import type {
  GlobalStatus,
  PublicStatusMonitor,
  PublicStatusPage,
  PublicStatusIncident,
  StatusPageDTO,
  StatusPageInput,
} from '@pulse/shared';
import { StatusPage, type IStatusPage } from '../models/StatusPage.js';
import { Monitor } from '../models/Monitor.js';
import { MonitorCheck } from '../models/MonitorCheck.js';
import { Incident } from '../models/Incident.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const UPTIME_DAYS = 30;
const PUBLIC_INCIDENT_LIMIT = 10;

function toStatusPageDTO(page: IStatusPage): StatusPageDTO {
  return {
    id: page._id.toString(),
    name: page.name,
    slug: page.slug,
    description: page.description,
    monitorIds: page.monitorIds.map((id) => id.toString()),
    isPublished: page.isPublished,
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
  };
}

/** Compute daily uptime buckets for the last N days (oldest first). */
async function getDailyUptime(
  monitorId: Types.ObjectId,
  days: number,
): Promise<Array<{ date: string; uptime: number | null }>> {
  const since = new Date(Date.now() - days * DAY_MS);

  const checks = await MonitorCheck.find({ monitorId, checkedAt: { $gte: since } }).select(
    'status checkedAt',
  );

  const buckets = new Map<string, { up: number; total: number }>();
  for (const check of checks) {
    const day = check.checkedAt.toISOString().slice(0, 10); // YYYY-MM-DD
    const bucket = buckets.get(day) ?? { up: 0, total: 0 };
    bucket.total += 1;
    if (check.status === 'UP') bucket.up += 1;
    buckets.set(day, bucket);
  }

  const result: Array<{ date: string; uptime: number | null }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10);
    const bucket = buckets.get(date);
    result.push({
      date,
      uptime: bucket ? Number(((bucket.up / bucket.total) * 100).toFixed(2)) : null,
    });
  }
  return result;
}

async function getUptimePercentage(
  monitorId: Types.ObjectId,
  windowMs: number,
): Promise<number | null> {
  const since = new Date(Date.now() - windowMs);
  const [result] = await MonitorCheck.aggregate<{ total: number; up: number }>([
    { $match: { monitorId, checkedAt: { $gte: since } } },
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

// ─── Authenticated management ────────────────────────────

export async function getMyStatusPage(userId: string): Promise<StatusPageDTO | null> {
  const page = await StatusPage.findOne({ userId });
  return page ? toStatusPageDTO(page) : null;
}

export async function upsertStatusPage(
  userId: string,
  input: StatusPageInput,
): Promise<StatusPageDTO> {
  // Validate that all referenced monitors belong to the user.
  const monitorObjectIds = input.monitorIds.map((id) => new Types.ObjectId(id));
  if (monitorObjectIds.length > 0) {
    const owned = await Monitor.countDocuments({ _id: { $in: monitorObjectIds }, userId });
    if (owned !== monitorObjectIds.length) {
      throw new NotFoundError('One or more monitors were not found');
    }
  }

  // Slug uniqueness (excluding the user's own existing page).
  const slugTaken = await StatusPage.findOne({ slug: input.slug, userId: { $ne: userId } });
  if (slugTaken) {
    throw new ConflictError('This slug is already taken');
  }

  const page = await StatusPage.findOneAndUpdate(
    { userId },
    {
      $set: {
        name: input.name,
        slug: input.slug,
        description: input.description,
        monitorIds: monitorObjectIds,
        isPublished: input.isPublished,
      },
      $setOnInsert: { userId },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return toStatusPageDTO(page);
}

// ─── Public (no auth) ────────────────────────────────────

export async function getPublicStatusPage(slug: string): Promise<PublicStatusPage> {
  const page = await StatusPage.findOne({ slug: slug.toLowerCase(), isPublished: true });
  if (!page) {
    throw new NotFoundError('Status page not found');
  }

  const monitors = await Monitor.find({ _id: { $in: page.monitorIds } }).select(
    'name status isPaused',
  );

  const publicMonitors: PublicStatusMonitor[] = await Promise.all(
    monitors.map(async (monitor) => {
      const [uptime30d, dailyUptime] = await Promise.all([
        getUptimePercentage(monitor._id, UPTIME_DAYS * DAY_MS),
        getDailyUptime(monitor._id, UPTIME_DAYS),
      ]);
      return {
        id: monitor._id.toString(),
        name: monitor.name,
        status: monitor.status,
        isPaused: monitor.isPaused,
        uptime30d,
        dailyUptime,
      };
    }),
  );

  // Global status: paused monitors never cause an outage.
  const active = publicMonitors.filter((m) => !m.isPaused);
  const downCount = active.filter((m) => m.status === 'DOWN').length;
  let globalStatus: GlobalStatus = 'ALL_OPERATIONAL';
  if (active.length > 0 && downCount === active.length) {
    globalStatus = 'MAJOR_OUTAGE';
  } else if (downCount > 0) {
    globalStatus = 'PARTIAL_OUTAGE';
  }

  // Recent incidents for the monitors on this page (sanitized).
  const incidents = await Incident.find({ monitorId: { $in: page.monitorIds } })
    .sort({ startedAt: -1 })
    .limit(PUBLIC_INCIDENT_LIMIT);

  const nameById = new Map(monitors.map((m) => [m._id.toString(), m.name]));
  const publicIncidents: PublicStatusIncident[] = incidents.map((incident) => {
    const end = incident.resolvedAt ?? new Date();
    return {
      id: incident._id.toString(),
      monitorName: nameById.get(incident.monitorId.toString()) ?? 'Service',
      startedAt: incident.startedAt.toISOString(),
      resolvedAt: incident.resolvedAt?.toISOString() ?? null,
      status: incident.status,
      cause: incident.cause,
      durationMs: end.getTime() - incident.startedAt.getTime(),
    };
  });

  return {
    name: page.name,
    slug: page.slug,
    description: page.description,
    globalStatus,
    monitors: publicMonitors,
    incidents: publicIncidents,
    updatedAt: page.updatedAt.toISOString(),
  };
}
