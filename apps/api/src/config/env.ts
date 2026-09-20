import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve the monorepo root .env (apps/api/src/config -> root)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const isProduction = process.env.NODE_ENV === 'production';
const jwtSecret = required('JWT_SECRET', 'pulse-dev-secret-do-not-use-in-production');

if (isProduction && jwtSecret === 'pulse-dev-secret-do-not-use-in-production') {
  throw new Error('JWT_SECRET must be explicitly set in production');
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction,
  port: Number(process.env.PORT ?? 4000),
  mongoUri: required('MONGODB_URI', 'mongodb://localhost:27017/pulse'),
  redisUrl: required('REDIS_URL', 'redis://localhost:6379'),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
} as const;
