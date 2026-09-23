import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Supervisor that runs both queue workers in a single container (e.g. one
 * Northflank service). Each worker stays its own bundle/process and keeps its
 * own queue: `monitor-checks` (worker.cjs) and `notifications`
 * (notificationWorker.cjs). This file only spawns and supervises them.
 *
 * - SIGTERM / SIGINT are forwarded to both children (graceful shutdown).
 * - If either child exits on its own, the other is stopped and the launcher
 *   exits non-zero so the platform restarts the whole service.
 */

const distDir = path.dirname(fileURLToPath(import.meta.url));
const SHUTDOWN_TIMEOUT_MS = 15_000;

const WORKERS = [
  { name: 'monitor-worker', file: 'worker.cjs' },
  { name: 'notification-worker', file: 'notificationWorker.cjs' },
] as const;

const children = new Map<string, ChildProcess>();
let stopping = false;
let exitCode = 0;

function log(message: string): void {
  console.log(`[workers-runner] ${message}`);
}

function stopAll(signal: NodeJS.Signals): void {
  if (stopping) return;
  stopping = true;

  for (const child of children.values()) {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  }

  setTimeout(() => {
    for (const [name, child] of children) {
      if (child.exitCode === null && child.signalCode === null) {
        log(`${name} did not stop within ${SHUTDOWN_TIMEOUT_MS}ms, sending SIGKILL`);
        child.kill('SIGKILL');
      }
    }
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

function fail(): void {
  exitCode = 1;
  stopAll('SIGTERM');
}

for (const { name, file } of WORKERS) {
  const child = spawn(process.execPath, [path.join(distDir, file)], { stdio: 'inherit' });
  children.set(name, child);
  log(`started ${name} (pid ${child.pid})`);

  child.on('error', (err) => {
    log(`${name} failed to spawn: ${err.message}`);
    fail();
  });

  child.on('exit', (code, signal) => {
    if (!stopping) {
      log(`${name} exited unexpectedly (code=${code}, signal=${signal}); stopping the others`);
      fail();
    } else {
      log(`${name} stopped (code=${code}, signal=${signal})`);
    }

    const allDone = [...children.values()].every(
      (c) => c.exitCode !== null || c.signalCode !== null || c.pid === undefined,
    );
    if (allDone) process.exit(exitCode);
  });
}

process.on('SIGTERM', () => {
  log('received SIGTERM, shutting down');
  stopAll('SIGTERM');
});
process.on('SIGINT', () => {
  log('received SIGINT, shutting down');
  stopAll('SIGINT');
});
