import type { MonitorCheckDTO } from '@pulse/shared';
import { Monitor, type IMonitor } from '../models/Monitor.js';
import { MonitorCheck, type IMonitorCheck } from '../models/MonitorCheck.js';
import { NotFoundError } from '../utils/errors.js';
import { assertSafeMonitorUrl } from '../utils/urlSafety.js';
import { handleStatusTransition } from './incidentService.js';

const CHECK_HISTORY_LIMIT = 100;

interface RawCheckResult {
  status: 'UP' | 'DOWN';
  httpStatus: number | null;
  responseTime: number;
  error: string | null;
}

function toCheckDTO(check: IMonitorCheck): MonitorCheckDTO {
  return {
    id: check._id.toString(),
    monitorId: check.monitorId.toString(),
    status: check.status,
    httpStatus: check.httpStatus,
    responseTime: check.responseTime,
    error: check.error,
    checkedAt: check.checkedAt.toISOString(),
  };
}

/**
 * Executes a single HTTP probe against the monitor target.
 *
 * - Redirects are NOT followed, so the SSRF validation performed here
 *   cannot be bypassed by a redirect to an internal address.
 * - The response body is discarded — it is never stored or read into memory
 *   beyond what the runtime needs to consume the stream.
 * - Status semantics: 2xx/3xx (and manual redirects) => UP.
 *   4xx/5xx => DOWN: the endpoint answered, but it is not serving correctly.
 *   Network errors, timeouts and DNS failures => DOWN.
 */
async function executeHttpCheck(monitor: IMonitor): Promise<RawCheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), monitor.timeout);
  const startedAt = performance.now();

  try {
    // Re-validate at execution time: protects against DNS rebinding after creation.
    await assertSafeMonitorUrl(monitor.url);

    const response = await fetch(monitor.url, {
      method: monitor.method,
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'user-agent': 'Pulse-Monitor/0.1 (+uptime-check)',
        accept: '*/*',
      },
    });

    // Drain the body so the socket can be released, without keeping the payload.
    await response.arrayBuffer().catch(() => undefined);

    const responseTime = Math.round(performance.now() - startedAt);
    const healthy = response.status < 400;

    return {
      status: healthy ? 'UP' : 'DOWN',
      httpStatus: response.status,
      responseTime,
      error: healthy ? null : `HTTP ${response.status}`,
    };
  } catch (err) {
    const responseTime = Math.round(performance.now() - startedAt);

    // Safety validation failures should not mark the monitor DOWN with a
    // misleading network error — but they still mean "not reachable as configured".
    const message =
      err instanceof Error
        ? err.name === 'AbortError'
          ? `Request timed out after ${monitor.timeout} ms`
          : err.message.slice(0, 300)
        : 'Unknown error';

    return { status: 'DOWN', httpStatus: null, responseTime, error: message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Runs a check for the given monitor, persists the result, updates the
 * monitor's status snapshot and drives the incident lifecycle on transitions.
 * Single entry point used by both the BullMQ worker and the manual check endpoint.
 *
 * @param opts.skipPaused - scheduled (automatic) checks skip paused monitors;
 *                          manual checks are still allowed to run.
 */
export async function runCheckForMonitor(
  monitorId: string,
  opts: { skipPaused?: boolean } = {},
): Promise<MonitorCheckDTO | null> {
  const monitor = await Monitor.findById(monitorId);
  if (!monitor) {
    throw new NotFoundError('Monitor not found');
  }

  // Paused monitors do not get automatic checks. Preserve last status & history.
  if (monitor.isPaused && opts.skipPaused) {
    return null;
  }

  const previousStatus = monitor.status;
  const result = await executeHttpCheck(monitor);

  const check = await MonitorCheck.create({
    monitorId: monitor._id,
    status: result.status,
    httpStatus: result.httpStatus,
    responseTime: result.responseTime,
    error: result.error,
    checkedAt: new Date(),
  });

  await Monitor.updateOne(
    { _id: monitor._id },
    {
      $set: {
        status: result.status,
        lastCheckedAt: check.checkedAt,
        lastResponseTime: result.responseTime,
      },
    },
  );

  // Drive incident lifecycle on status transitions (never for paused monitors).
  if (!monitor.isPaused && previousStatus !== result.status) {
    await handleStatusTransition({
      monitorId: monitor._id.toString(),
      userId: monitor.userId.toString(),
      previousStatus,
      newStatus: result.status,
      httpStatus: result.httpStatus,
      error: result.error,
    });
  } else if (!monitor.isPaused && result.status === 'DOWN') {
    // Consecutive DOWN: refresh lastHttpStatus on the open incident (no new incident).
    await handleStatusTransition({
      monitorId: monitor._id.toString(),
      userId: monitor.userId.toString(),
      previousStatus: 'DOWN',
      newStatus: 'DOWN',
      httpStatus: result.httpStatus,
      error: result.error,
    });
  }

  return toCheckDTO(check);
}

/**
 * Manual check triggered by an authenticated user — verifies ownership first.
 * Manual checks run even when the monitor is paused (user explicitly asked).
 */
export async function runManualCheck(
  userId: string,
  monitorId: string,
): Promise<MonitorCheckDTO | null> {
  const monitor = await Monitor.findOne({ _id: monitorId, userId });
  if (!monitor) {
    throw new NotFoundError('Monitor not found');
  }
  return runCheckForMonitor(monitorId, { skipPaused: false });
}

export async function listChecks(userId: string, monitorId: string): Promise<MonitorCheckDTO[]> {
  const monitor = await Monitor.findOne({ _id: monitorId, userId });
  if (!monitor) {
    throw new NotFoundError('Monitor not found');
  }

  const checks = await MonitorCheck.find({ monitorId: monitor._id })
    .sort({ checkedAt: -1 })
    .limit(CHECK_HISTORY_LIMIT);

  return checks.map(toCheckDTO);
}
