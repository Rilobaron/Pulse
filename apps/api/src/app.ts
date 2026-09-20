import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import morgan from 'morgan';
import { env } from './config/env.js';
import { pingRedis } from './config/redis.js';
import { apiRoutes } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';

const startedAt = Date.now();

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  if (!env.isProduction) {
    app.use(morgan('dev'));
  }

  app.get('/health', (_req, res) => {
    void checkHealth().then((health) => {
      res.status(health.status === 'ok' ? 200 : 503).json(health);
    });
  });

  app.use('/api', apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

/**
 * Liveness + dependency status. Lightweight by design: one readyState read and
 * one Redis PING with an internal timeout. Exposes no credentials or internals.
 */
export async function checkHealth(): Promise<{
  status: 'ok' | 'degraded';
  service: string;
  mongo: 'up' | 'down';
  redis: 'up' | 'down';
  uptime: number;
}> {
  const mongo = mongoose.connection.readyState === 1 ? 'up' : 'down';

  // Bound the Redis probe so a hanging connection cannot stall the endpoint.
  let redis: 'up' | 'down';
  try {
    const ok = await Promise.race([
      pingRedis(),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1500)),
    ]);
    redis = ok ? 'up' : 'down';
  } catch {
    redis = 'down';
  }

  return {
    status: mongo === 'up' && redis === 'up' ? 'ok' : 'degraded',
    service: 'pulse-api',
    mongo,
    redis,
    uptime: Math.floor((Date.now() - startedAt) / 1000),
  };
}

