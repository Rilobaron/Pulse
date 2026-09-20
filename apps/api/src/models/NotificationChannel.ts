import { Schema, model, type Document, type Types } from 'mongoose';
import type { NotificationChannelType } from '@pulse/shared';

export interface INotificationChannel extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  type: NotificationChannelType;
  enabled: boolean;
  /**
   * Channel-specific target. Never exposed raw by the API:
   *  - DISCORD: { url }
   *  - WEBHOOK: { url, secret }
   *  - EMAIL:   { email }
   */
  config: {
    url?: string;
    secret?: string;
    email?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const notificationChannelSchema = new Schema<INotificationChannel>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    type: { type: String, enum: ['DISCORD', 'WEBHOOK', 'EMAIL'], required: true },
    enabled: { type: Boolean, default: true, index: true },
    config: {
      url: { type: String, trim: true, maxlength: 2048 },
      // HMAC signing secret for generic webhooks (hex). Never returned by the API.
      secret: { type: String, select: false },
      email: { type: String, trim: true, lowercase: true, maxlength: 255 },
    },
  },
  { timestamps: true },
);

export const NotificationChannel = model<INotificationChannel>(
  'NotificationChannel',
  notificationChannelSchema,
);
