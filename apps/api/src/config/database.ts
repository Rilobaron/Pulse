import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDatabase(): Promise<void> {
  mongoose.set('strictQuery', true);

  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 10_000,
  });

  console.log(`[db] Connected to MongoDB`);
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
