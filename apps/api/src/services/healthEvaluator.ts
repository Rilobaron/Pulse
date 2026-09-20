import type { MonitorStatus } from '@pulse/shared';

export type CheckResult = 'UP' | 'DOWN';

export interface HealthSnapshot {
  /** Current *operational* status (already evaluated, not the raw last check). */
  status: MonitorStatus;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  failureThreshold: number;
  recoveryThreshold: number;
}

export interface HealthEvaluation {
  /** Operational status after applying the thresholds. */
  status: MonitorStatus;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  /** True when the operational status changed (drives incident lifecycle + notifications). */
  transitioned: boolean;
  /** Status the monitor had before this evaluation. */
  previousStatus: MonitorStatus;
  /** True when an incident must be opened / resolved. */
  opensIncident: boolean;
  resolvesIncident: boolean;
  /** Counter shown in the UI, e.g. "2 / 3 failed checks". */
  failuresRequired: number;
  successesRequired: number;
}

/**
 * Anti-flapping / health evaluation.
 *
 * This is the only place where the *operational* status is decided. The raw
 * result of every check is always persisted in `MonitorCheck` — a single failed
 * check does NOT make the monitor DOWN until `failureThreshold` consecutive
 * failures are reached.
 *
 * Rules
 * ─────
 * Healthy path (check = UP)
 *   - `consecutiveFailures` resets to 0.
 *   - From `DOWN`:  becomes `UP` after `recoveryThreshold` consecutive successes.
 *   - From `UNKNOWN`: becomes `UP` after a single success (documented decision:
 *     there is no outage to be cautious about — we simply do not yet know the
 *     state, and one successful probe is enough to call it healthy).
 *   - From `UP`: stays `UP`.
 *
 * Failing path (check = DOWN)
 *   - `consecutiveSuccesses` resets to 0.
 *   - From `UP` or `UNKNOWN`: becomes `DOWN` after `failureThreshold` consecutive
 *     failures. UNKNOWN also requires the full threshold, so a brand-new monitor
 *     is never marked DOWN on a single blip.
 *   - From `DOWN`: stays `DOWN`.
 */
export function evaluateHealth(snapshot: HealthSnapshot, checkResult: CheckResult): HealthEvaluation {
  const previousStatus = snapshot.status;
  const failureThreshold = Math.max(1, snapshot.failureThreshold);
  const recoveryThreshold = Math.max(1, snapshot.recoveryThreshold);

  let consecutiveFailures = snapshot.consecutiveFailures;
  let consecutiveSuccesses = snapshot.consecutiveSuccesses;
  let status: MonitorStatus = previousStatus;

  if (checkResult === 'UP') {
    consecutiveFailures = 0;
    consecutiveSuccesses += 1;

    if (previousStatus === 'UNKNOWN') {
      // One success is enough to leave the unknown state.
      if (consecutiveSuccesses >= 1) status = 'UP';
    } else if (previousStatus === 'DOWN') {
      if (consecutiveSuccesses >= recoveryThreshold) status = 'UP';
    }
  } else {
    consecutiveSuccesses = 0;
    consecutiveFailures += 1;

    if (previousStatus !== 'DOWN' && consecutiveFailures >= failureThreshold) {
      status = 'DOWN';
    }
  }

  const transitioned = status !== previousStatus;

  return {
    status,
    consecutiveFailures,
    consecutiveSuccesses,
    transitioned,
    previousStatus,
    opensIncident: transitioned && status === 'DOWN',
    resolvesIncident: transitioned && status === 'UP' && previousStatus === 'DOWN',
    failuresRequired: Math.max(0, failureThreshold - consecutiveFailures),
    successesRequired: Math.max(0, recoveryThreshold - consecutiveSuccesses),
  };
}
