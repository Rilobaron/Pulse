import { Schema, model, type Document, type Types } from 'mongoose';

export interface IMonitorCheck extends Document {
  _id: Types.ObjectId;
  monitorId: Types.ObjectId;
  status: 'UP' | 'DOWN';
  httpStatus: number | null;
  responseTime: number;
  error: string | null;
  checkedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const monitorCheckSchema = new Schema<IMonitorCheck>(
  {
    monitorId: { type: Schema.Types.ObjectId, ref: 'Monitor', required: true, index: true },
    status: { type: String, enum: ['UP', 'DOWN'], required: true },
    httpStatus: { type: Number, default: null },
    responseTime: { type: Number, required: true },
    error: { type: String, default: null, maxlength: 500 },
    checkedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true },
);

// Fast "latest checks per monitor" queries
monitorCheckSchema.index({ monitorId: 1, checkedAt: -1 });
// Automatic retention: keep check history for 30 days
monitorCheckSchema.index({ checkedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const MonitorCheck = model<IMonitorCheck>('MonitorCheck', monitorCheckSchema);
