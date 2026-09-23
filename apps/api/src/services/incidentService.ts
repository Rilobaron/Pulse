import { Types } from 'mongoose';
import type { IncidentDTO } from '@pulse/shared';
import { Incident, type IIncident } from '../models/Incident.js';
import { Monitor } from '../models/Monitor.js';
import { NotFoundError } from '../utils/errors.js';
import { enqueueIncidentNotifications } from './notificationService.js';
import { logger, sanitizeError } from '../utils/logger.js';

const INCIDENT_HISTORY_LIMIT = 100;

interface TransitionInput {
  monitorId: string;
  userId: string;
  monitorName: string;
  previousStatus: 'UP' | 'DOWN' | 'UNKNOWN';
  newStatus: 'UP' | 'DOWN' | 'UNKNOWN';
  httpStatus: number | null;
  error: string | null;
}

function toIncidentDTO(incident: IIncident, monitorName?: string): IncidentDTO {
  const end = incident.resolvedAt ?? new Date();
  return {
    id: incident._id.toString(),
    monitorId: incident.monitorId.toString(),
    monitorName,
    startedAt: incident.startedAt.toISOString(),
    resolvedAt: incident.resolvedAt?.toISOString() ?? null,
    status: incident.status,
    cause: incident.cause,
    initialHttpStatus: incident.initialHttpStatus,
    lastHttpStatus: incident.lastHttpStatus,
    durationMs: end.getTime() - incident.startedAt.getTime(),
    createdAt: incident.createdAt.toISOString(),
    updatedAt: incident.updatedAt.toISOString(),
  };
}

function humanizeCause(error: string | null, httpStatus: number | null): string {
  if (error) return error;
  if (httpStatus !== null) return `HTTP ${httpStatus}`;
  return 'Unknown error';
}

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: number }).code === 11000
  );
}

/**
 * Notification fan-out must never break the monitoring pipeline: if the queue
 * or the database hiccups, we log and move on — the check result is already saved.
 */
async function safeEnqueueIncidentNotifications(params: {
  incidentId: string;
  monitorId: string;
  eventType: 'INCIDENT_OPENED' | 'INCIDENT_RESOLVED';
}): Promise<void> {
  try {
    await enqueueIncidentNotifications(params);
  } catch (err) {
    logger.error('notification_enqueue_failed', {
      incidentId: params.incidentId,
      monitorId: params.monitorId,
      eventType: params.eventType,
      error: sanitizeError(err),
    });
  }
}

/**
 * Handles incident lifecycle on a monitor *operational* status transition.
 *
 * Rules (documented and intentional):
 *  - UP|UNKNOWN -> DOWN : open an incident, but only if none is OPEN for this monitor.
 *  - DOWN -> UP         : resolve the currently OPEN incident (if any).
 *  - DOWN -> DOWN       : update lastHttpStatus on the existing OPEN incident.
 *  - any  -> UNKNOWN    : no-op (never opens, never resolves).
 *
 * Notifications are enqueued only for real transitions (opened / resolved) and
 * never for intermediate failures — those are handled by the anti-flapping layer
 * before reaching this function.
 *
 * Concurrency safety:
 *  Opening uses `findOneAndUpdate` with `$setOnInsert` + `upsert`, guarded by the
 *  partial unique index `unique_open_incident_per_monitor`. Two racing workers can
 *  never create two OPEN incidents — the loser's upsert hits the unique index and
 *  throws a duplicate-key error, which we treat as "incident already exists".
 */
export async function handleStatusTransition(input: TransitionInput): Promise<void> {
  const { monitorId, userId, previousStatus, newStatus, httpStatus, error } = input;

  // No transition into/out of DOWN — nothing to do.
  if (previousStatus === newStatus && newStatus !== 'DOWN') return;

  const monitorObjectId = new Types.ObjectId(monitorId);
  const now = new Date();

  // ── Resolve on recovery ────────────────────────────────────────────────
  if (newStatus === 'UP' && previousStatus === 'DOWN') {
    const resolved = await Incident.findOneAndUpdate(
      { monitorId: monitorObjectId, status: 'OPEN' },
      { $set: { status: 'RESOLVED', resolvedAt: now, lastHttpStatus: httpStatus } },
      { new: true },
    );

    if (resolved) {
      logger.info('incident_resolved', {
        incidentId: resolved._id.toString(),
        monitorId,
        monitorName: input.monitorName,
        durationMs: now.getTime() - resolved.startedAt.getTime(),
      });

      await safeEnqueueIncidentNotifications({
        incidentId: resolved._id.toString(),
        monitorId,
        eventType: 'INCIDENT_RESOLVED',
      });
    }
    return;
  }

  // ── Open on failure ────────────────────────────────────────────────────
  if (newStatus === 'DOWN') {
    const cause = humanizeCause(error, httpStatus);
    // Only a real transition opens an incident (and therefore notifies);
    // consecutive DOWN checks just refresh the open incident.
    const isNewOutage = previousStatus !== 'DOWN';

    let incident: IIncident | null;
    try {
      incident = await Incident.findOneAndUpdate(
        { monitorId: monitorObjectId, status: 'OPEN' },
        {
          $setOnInsert: {
            monitorId: monitorObjectId,
            userId: new Types.ObjectId(userId),
            startedAt: now,
            status: 'OPEN',
            cause,
            initialHttpStatus: httpStatus,
          },
          $set: { lastHttpStatus: httpStatus },
        },
        { upsert: true, new: true },
      );
    } catch (err) {
      // A concurrent worker won the race and created the OPEN incident first.
      // This is the expected, safe outcome — just refresh lastHttpStatus.
      if (isDuplicateKeyError(err)) {
        await Incident.findOneAndUpdate(
          { monitorId: monitorObjectId, status: 'OPEN' },
          { $set: { lastHttpStatus: httpStatus } },
        );
        return;
      }
      throw err;
    }

    if (isNewOutage && incident) {
      logger.info('incident_opened', {
        incidentId: incident._id.toString(),
        monitorId,
        monitorName: input.monitorName,
        cause,
        httpStatus,
      });

      await safeEnqueueIncidentNotifications({
        incidentId: incident._id.toString(),
        monitorId,
        eventType: 'INCIDENT_OPENED',
      });
    }
    return;
  }
}

export async function listIncidentsForMonitor(
  userId: string,
  monitorId: string,
): Promise<IncidentDTO[]> {
  const monitor = await Monitor.findOne({ _id: monitorId, userId });
  if (!monitor) throw new NotFoundError('Monitor not found');

  const incidents = await Incident.find({ monitorId: monitor._id })
    .sort({ startedAt: -1 })
    .limit(INCIDENT_HISTORY_LIMIT);

  return incidents.map((incident) => toIncidentDTO(incident, monitor.name));
}

export async function listIncidentsForUser(userId: string): Promise<IncidentDTO[]> {
  const incidents = await Incident.find({ userId })
    .sort({ startedAt: -1 })
    .limit(INCIDENT_HISTORY_LIMIT);

  const monitorIds = [...new Set(incidents.map((i) => i.monitorId.toString()))];
  const monitors = await Monitor.find({ _id: { $in: monitorIds } }).select('name');
  const nameById = new Map(monitors.map((m) => [m._id.toString(), m.name]));

  return incidents.map((incident) =>
    toIncidentDTO(incident, nameById.get(incident.monitorId.toString())),
  );
}
