import { Schema, model, type Document, type Types } from 'mongoose';
import type { HttpMethod, MonitorStatus } from '@pulse/shared';
import { DEFAULT_FAILURE_THRESHOLD, DEFAULT_RECOVERY_THRESHOLD } from '@pulse/shared';

export interface IMonitor extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  url: string;
  method: HttpMethod;
  interval: number;
  timeout: number;
  /**
   * Operational status — the *evaluated* health after anti-flapping thresholds.
   * This is NOT the same as the raw result of the latest check (see MonitorCheck).
   */
  status: MonitorStatus;
  isPaused: boolean;
  /** Anti-flapping counters fed by every check. */
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  failureThreshold: number;
  recoveryThreshold: number;
  notificationChannelIds: Types.ObjectId[];
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
    // Safe defaults keep pre-existing documents valid without a migration.
    consecutiveFailures: { type: Number, default: 0, min: 0 },
    consecutiveSuccesses: { type: Number, default: 0, min: 0 },
    failureThreshold: { type: Number, default: DEFAULT_FAILURE_THRESHOLD, min: 1, max: 10 },
    recoveryThreshold: { type: Number, default: DEFAULT_RECOVERY_THRESHOLD, min: 1, max: 10 },
    notificationChannelIds: [{ type: Schema.Types.ObjectId, ref: 'NotificationChannel' }],
    lastCheckedAt: { type: Date, default: null },
    lastResponseTime: { type: Number, default: null },
  },
  { timestamps: true },
);

export const Monitor = model<IMonitor>('Monitor', monitorSchema);

