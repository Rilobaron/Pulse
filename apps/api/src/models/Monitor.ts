import { Schema, model, type Document, type Types } from 'mongoose';
import type { HttpMethod, MonitorStatus } from '@pulse/shared';

export interface IMonitor extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  url: string;
  method: HttpMethod;
  interval: number;
  timeout: number;
  status: MonitorStatus;
  isPaused: boolean;
  lastCheckedAt: Date | null;
  lastResponseTime: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const monitorSchema = new Schema<IMonitor>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    url: { type: String, required: true, trim: true, maxlength: 2048 },
    method: { type: String, enum: ['GET', 'HEAD'], default: 'GET' },
    interval: { type: Number, required: true, min: 30_000, max: 600_000 },
    timeout: { type: Number, required: true, min: 1_000, max: 30_000, default: 10_000 },
    status: { type: String, enum: ['UP', 'DOWN', 'UNKNOWN'], default: 'UNKNOWN', index: true },
    isPaused: { type: Boolean, default: false, index: true },
    lastCheckedAt: { type: Date, default: null },
    lastResponseTime: { type: Number, default: null },
  },
  { timestamps: true },
);

export const Monitor = model<IMonitor>('Monitor', monitorSchema);
