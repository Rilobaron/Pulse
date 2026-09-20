import { Schema, model, type Document, type Types } from 'mongoose';

export interface IStatusPage extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  slug: string;
  description: string;
  monitorIds: Types.ObjectId[];
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const statusPageSchema = new Schema<IStatusPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 60,
      index: true,
    },
    description: { type: String, trim: true, maxlength: 300, default: '' },
    monitorIds: [{ type: Schema.Types.ObjectId, ref: 'Monitor' }],
    isPublished: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

export const StatusPage = model<IStatusPage>('StatusPage', statusPageSchema);
