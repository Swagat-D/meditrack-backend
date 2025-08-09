import mongoose, { Schema } from 'mongoose';

export interface IActivity extends mongoose.Document {
  _id: string;
  type: 'dose_taken' | 'dose_missed' | 'low_stock' | 'sos_alert' | 'medication_added' | 'medication_paused';
  patient: mongoose.Types.ObjectId;
  caregiver: mongoose.Types.ObjectId;
  medication?: mongoose.Types.ObjectId;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  isRead: boolean;
  metadata?: {
    doseTaken?: Date;
    stockLevel?: number;
    alertType?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const activitySchema = new Schema<IActivity>({
  type: {
    type: String,
    required: [true, 'Activity type is required'],
    enum: ['dose_taken', 'dose_missed', 'low_stock', 'sos_alert', 'medication_added', 'medication_paused']
  },
  patient: {
    type: Schema.Types.ObjectId,
    ref: 'Patient',
    required: [true, 'Patient is required']
  },
  caregiver: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Caregiver is required']
  },
  medication: {
    type: Schema.Types.ObjectId,
    ref: 'Medication'
  },
  message: {
    type: String,
    required: [true, 'Message is required'],
    trim: true,
    maxlength: [500, 'Message cannot exceed 500 characters']
  },
  priority: {
    type: String,
    required: [true, 'Priority is required'],
    enum: ['low', 'medium', 'high', 'critical']
  },
  isRead: {
    type: Boolean,
    default: false
  },
  metadata: {
    doseTaken: Date,
    stockLevel: Number,
    alertType: String
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc: any, ret: any) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for performance
activitySchema.index({ caregiver: 1, createdAt: -1 });
activitySchema.index({ patient: 1, createdAt: -1 });
activitySchema.index({ type: 1 });
activitySchema.index({ priority: 1 });
activitySchema.index({ isRead: 1 });

export default mongoose.model<IActivity>('Activity', activitySchema);