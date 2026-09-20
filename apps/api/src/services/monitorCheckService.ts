import type { MonitorCheckDTO } from '@pulse/shared';
import { Monitor, type IMonitor } from '../models/Monitor.js';
import { MonitorCheck, type IMonitorCheck } from '../models/MonitorCheck.js';
import { NotFoundError } from '../utils/errors.js';
import { assertSafeMonitorUrl } from '../utils/urlSafety.js';
import { handleStatusTransition } from './incidentService.js';
import { evaluateHealth } from './healthEvaluator.js';
import { logger } from '../utils/logger.js';

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
 * Runs a check for the given monitor.
 *
 * Pipeline: persist raw check → evaluate health (anti-flapping) → update the
 * operational snapshot → drive the incident lifecycle.
 *
 * IMPORTANT — check status vs operational status:
 *  - `MonitorCheck.status` is the RAW result of that single probe and is always
 *    persisted, even while the monitor is still considered UP.
 *  - `Monitor.status` is the EVALUATED operational state, which only changes once
 *    the configured thresholds are reached (see `evaluateHealth`).
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

  const result = await executeHttpCheck(monitor);

  // ── 1. Always persist the real result of this probe ──────────────────
  const check = await MonitorCheck.create({
    monitorId: monitor._id,
    status: result.status,
    httpStatus: result.httpStatus,
    responseTime: result.responseTime,
    error: result.error,
    checkedAt: new Date(),
  });

  // ── 2. Evaluate the operational status against the anti-flapping rules ──
  const evaluation = evaluateHealth(
    {
      status: monitor.status,
      consecutiveFailures: monitor.consecutiveFailures ?? 0,
      consecutiveSuccesses: monitor.consecutiveSuccesses ?? 0,
      failureThreshold: monitor.failureThreshold,
      recoveryThreshold: monitor.recoveryThreshold,
    },
    result.status,
  );

  // ── 3. Persist the evaluated snapshot (never the raw result) ──────────
  await Monitor.updateOne(
    { _id: monitor._id },
    {
      $set: {
        status: evaluation.status,
        consecutiveFailures: evaluation.consecutiveFailures,
        consecutiveSuccesses: evaluation.consecutiveSuccesses,
        lastCheckedAt: check.checkedAt,
        lastResponseTime: result.responseTime,
      },
    },
  );

  logger.info('check_evaluated', {
    monitorId: monitor._id.toString(),
    monitorName: monitor.name,
    checkStatus: result.status,
    operationalStatus: evaluation.status,
    transitioned: evaluation.transitioned,
    consecutiveFailures: evaluation.consecutiveFailures,
    consecutiveSuccesses: evaluation.consecutiveSuccesses,
    failureThreshold: monitor.failureThreshold,
    responseTime: result.responseTime,
  });

  // ── 4. Incidents only on real operational transitions ────────────────
  if (!monitor.isPaused) {
    if (evaluation.transitioned) {
      await handleStatusTransition({
        monitorId: monitor._id.toString(),
        userId: monitor.userId.toString(),
        monitorName: monitor.name,
        previousStatus: evaluation.previousStatus,
        newStatus: evaluation.status,
        httpStatus: result.httpStatus,
        error: result.error,
      });
    } else if (evaluation.status === 'DOWN') {
      // Still DOWN after the threshold: refresh lastHttpStatus, no new incident.
      await handleStatusTransition({
        monitorId: monitor._id.toString(),
        userId: monitor.userId.toString(),
        monitorName: monitor.name,
        previousStatus: 'DOWN',
        newStatus: 'DOWN',
        httpStatus: result.httpStatus,
        error: result.error,
      });
    }
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
