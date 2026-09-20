import { Schema, model, type Document, type Types } from 'mongoose';
import type { IncidentStatus } from '@pulse/shared';

export interface IIncident extends Document {
  _id: Types.ObjectId;
  monitorId: Types.ObjectId;
  userId: Types.ObjectId;
  startedAt: Date;
  resolvedAt: Date | null;
  status: IncidentStatus;
  cause: string;
  initialHttpStatus: number | null;
  lastHttpStatus: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const incidentSchema = new Schema<IIncident>(
  {
    monitorId: { type: Schema.Types.ObjectId, ref: 'Monitor', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    startedAt: { type: Date, required: true, default: () => new Date() },
    resolvedAt: { type: Date, default: null },
    status: { type: String, enum: ['OPEN', 'RESOLVED'], default: 'OPEN', index: true },
    cause: { type: String, required: true, maxlength: 300 },
    initialHttpStatus: { type: Number, default: null },
    lastHttpStatus: { type: Number, default: null },
  },
  { timestamps: true },
);

// Fast "incidents for a monitor, newest first" queries
incidentSchema.index({ monitorId: 1, startedAt: -1 });
incidentSchema.index({ userId: 1, startedAt: -1 });

/**
 * Guarantees at most ONE open incident per monitor, even under concurrent
 * workers. The partial unique index only applies to OPEN documents, so any
 * number of RESOLVED incidents can coexist. Concurrent inserts race on this
 * index — the loser gets a duplicate-key error which the service converts
 * into "an open incident already exists".
 */
incidentSchema.index(
  { monitorId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'OPEN' },
    name: 'unique_open_incident_per_monitor',
  },
);

export const Incident = model<IIncident>('Incident', incidentSchema);
