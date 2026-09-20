import { Redis } from 'ioredis';
import { env } from './env.js';

/**
 * BullMQ requires `maxRetriesPerRequest: null` on blocking commands.
 * This connection is shared by the queue producers; the worker creates its own.
 */
export const redisConnection = new Redis(env.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

redisConnection.on('error', (err) => {
  console.error('[redis] Connection error:', err.message);
});
