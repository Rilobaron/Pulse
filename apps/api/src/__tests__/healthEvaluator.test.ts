import { describe, expect, it } from 'vitest';
import { evaluateHealth, type HealthSnapshot } from '../services/healthEvaluator.js';

function snapshot(overrides: Partial<HealthSnapshot> = {}): HealthSnapshot {
  return {
    status: 'UP',
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    failureThreshold: 3,
    recoveryThreshold: 2,
    ...overrides,
  };
}

/** Applies one evaluation and carries the resulting counters forward. */
function next(state: HealthSnapshot, check: 'UP' | 'DOWN'): HealthSnapshot {
  const r = evaluateHealth(state, check);
  return {
    ...state,
    status: r.status,
    consecutiveFailures: r.consecutiveFailures,
    consecutiveSuccesses: r.consecutiveSuccesses,
  };
}

describe('anti-flapping — failureThreshold = 3', () => {
  it('fail 1 and 2 keep the monitor UP (no incident, no transition)', () => {
    let state = snapshot();

    const first = evaluateHealth(state, 'DOWN');
    expect(first.status).toBe('UP');
    expect(first.transitioned).toBe(false);
    expect(first.opensIncident).toBe(false);
    expect(first.consecutiveFailures).toBe(1);
    expect(first.failuresRequired).toBe(2);

    state = next(state, 'DOWN');
    const second = evaluateHealth(state, 'DOWN');
    expect(second.status).toBe('UP');
    expect(second.transitioned).toBe(false);
    expect(second.consecutiveFailures).toBe(2);
    expect(second.failuresRequired).toBe(1);
  });

  it('fail 3 flips the monitor to DOWN and opens an incident', () => {
    const state = snapshot({ status: 'UP', consecutiveFailures: 2 });
    const result = evaluateHealth(state, 'DOWN');

    expect(result.status).toBe('DOWN');
    expect(result.transitioned).toBe(true);
    expect(result.opensIncident).toBe(true);
    expect(result.resolvesIncident).toBe(false);
    expect(result.failuresRequired).toBe(0);
  });

  it('a single failure does not flap (fail -> success resets failures)', () => {
    let state = snapshot();

    state = next(state, 'DOWN');
    expect(state.status).toBe('UP');
    expect(state.consecutiveFailures).toBe(1);

    state = next(state, 'UP');
    expect(state.status).toBe('UP');
    expect(state.consecutiveFailures).toBe(0);
    expect(state.consecutiveSuccesses).toBe(1);
  });

  it('fail, success, fail does not accumulate failures incorrectly', () => {
    let state = snapshot();

    state = next(state, 'DOWN');
    state = next(state, 'UP');
    // After one success, the failure run restarts at 1 — not 3.
    state = next(state, 'DOWN');
    expect(state.consecutiveFailures).toBe(1);
    expect(state.status).toBe('UP');
  });
});

describe('anti-flapping — recoveryThreshold = 2', () => {
  it('success 1 keeps the monitor DOWN (no resolution yet)', () => {
    const state = snapshot({ status: 'DOWN', consecutiveSuccesses: 0 });

    const first = evaluateHealth(state, 'UP');
    expect(first.status).toBe('DOWN');
    expect(first.transitioned).toBe(false);
    expect(first.resolvesIncident).toBe(false);
    expect(first.consecutiveSuccesses).toBe(1);
    expect(first.successesRequired).toBe(1);
  });

  it('success 2 flips the monitor back to UP and resolves the incident', () => {
    const state = snapshot({ status: 'DOWN', consecutiveSuccesses: 1 });

    const result = evaluateHealth(state, 'UP');
    expect(result.status).toBe('UP');
    expect(result.transitioned).toBe(true);
    expect(result.resolvesIncident).toBe(true);
    expect(result.opensIncident).toBe(false);
    expect(result.consecutiveFailures).toBe(0);
  });

  it('a failure during recovery restarts the recovery run', () => {
    const state = snapshot({ status: 'DOWN', consecutiveSuccesses: 1 });

    const blip = evaluateHealth(state, 'DOWN');
    expect(blip.status).toBe('DOWN');
    expect(blip.transitioned).toBe(false);
    expect(blip.consecutiveSuccesses).toBe(0);
    expect(blip.consecutiveFailures).toBe(1);
  });
});

describe('UNKNOWN semantics', () => {
  it('a single success leaves UNKNOWN and becomes UP', () => {
    const state = snapshot({ status: 'UNKNOWN' });
    const result = evaluateHealth(state, 'UP');

    expect(result.status).toBe('UP');
    expect(result.transitioned).toBe(true);
    expect(result.resolvesIncident).toBe(false);
    expect(result.opensIncident).toBe(false);
  });

  it('single failures do NOT mark a new monitor DOWN (full threshold applies)', () => {
    const state = snapshot({ status: 'UNKNOWN' });
    const result = evaluateHealth(state, 'DOWN');

    expect(result.status).toBe('UNKNOWN');
    expect(result.transitioned).toBe(false);
    expect(result.consecutiveFailures).toBe(1);
  });

  it('three consecutive failures move UNKNOWN -> DOWN and open an incident', () => {
    const state = snapshot({ status: 'UNKNOWN', consecutiveFailures: 2 });
    const result = evaluateHealth(state, 'DOWN');

    expect(result.status).toBe('DOWN');
    expect(result.transitioned).toBe(true);
    expect(result.opensIncident).toBe(true);
  });

  it('staying DOWN never re-opens, staying UP never resolves', () => {
    expect(evaluateHealth(snapshot({ status: 'DOWN' }), 'DOWN').opensIncident).toBe(false);
    expect(evaluateHealth(snapshot({ status: 'UP' }), 'UP').transitioned).toBe(false);
  });
});
