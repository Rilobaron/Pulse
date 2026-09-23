import { Redis } from 'ioredis';
import { env } from './env.js';
import { logger, sanitizeError } from '../utils/logger.js';

/**
 * BullMQ requires `maxRetriesPerRequest: null` on blocking commands.
 * This connection is shared by the queue producers; workers create their own.
 */
export const redisConnection = new Redis(env.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

redisConnection.on('error', (err) => {
  logger.error('redis_connection_error', { message: sanitizeError(err) });
});

/** Creates a dedicated connection (one per queue producer / worker). */
export function createRedisConnection(): Redis {
  return new Redis(env.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

/** Lightweight liveness probe used by the health endpoint. */
export async function pingRedis(): Promise<boolean> {
  try {
    const result = await redisConnection.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}

