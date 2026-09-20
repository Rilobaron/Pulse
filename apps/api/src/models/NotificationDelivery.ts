import { Schema, model, type Document, type Types } from 'mongoose';
import type { NotificationDeliveryStatus, NotificationEventType } from '@pulse/shared';

export interface INotificationDelivery extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  monitorId: Types.ObjectId;
  channelId: Types.ObjectId;
  incidentId: Types.ObjectId | null;
  eventType: NotificationEventType;
  status: NotificationDeliveryStatus;
  attempts: number;
  lastError: string | null;
  sentAt: Date | null;
  /**
   * Deterministic identity of one notification attempt:
   * `incident:{id}:{event}:{channel}` for incident notifications
   * `test:{channel}:{uuid}` for manual test notifications.
   * Guarantees "same incident + same event + same channel" is delivered once.
   */
  dedupeKey: string;
  createdAt: Date;
  updatedAt: Date;
}

const notificationDeliverySchema = new Schema<INotificationDelivery>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    monitorId: { type: Schema.Types.ObjectId, ref: 'Monitor', required: true, index: true },
    channelId: { type: Schema.Types.ObjectId, ref: 'NotificationChannel', required: true, index: true },
    incidentId: { type: Schema.Types.ObjectId, ref: 'Incident', default: null },
    eventType: {
      type: String,
      enum: ['INCIDENT_OPENED', 'INCIDENT_RESOLVED', 'MONITOR_TEST'],
      required: true,
    },
    status: { type: String, enum: ['PENDING', 'SENT', 'FAILED'], default: 'PENDING', index: true },
    attempts: { type: Number, default: 0, min: 0 },
    lastError: { type: String, default: null, maxlength: 500 },
    sentAt: { type: Date, default: null },
    dedupeKey: { type: String, required: true, unique: true },
  },
  { timestamps: true },
);

// Fast history queries (per user, newest first) and per-monitor filtering.
notificationDeliverySchema.index({ userId: 1, createdAt: -1 });
notificationDeliverySchema.index({ monitorId: 1, createdAt: -1 });

export const NotificationDelivery = model<INotificationDelivery>(
  'NotificationDelivery',
  notificationDeliverySchema,
);
