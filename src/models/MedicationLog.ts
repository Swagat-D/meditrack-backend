import mongoose, { Schema } from 'mongoose';

export interface IMedicationLog extends mongoose.Document {
  _id: string;
  medication: mongoose.Types.ObjectId;
  patient: mongoose.Types.ObjectId;
  takenAt: Date;
  scheduledTime: Date;
  status: 'taken' | 'missed' | 'late';
  notes?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const medicationLogSchema = new Schema<IMedicationLog>({
  medication: {
    type: Schema.Types.ObjectId,
    ref: 'Medication',
    required: true
  },
  patient: {
    type: Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  takenAt: {
    type: Date,
    required: true
  },
  scheduledTime: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['taken', 'missed', 'late'],
    default: 'taken'
  },
  notes: {
    type: String,
    maxlength: 500
  },
  location: {
    latitude: Number,
    longitude: Number
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

// Indexes
medicationLogSchema.index({ patient: 1, takenAt: -1 });
medicationLogSchema.index({ medication: 1 });

export default mongoose.model<IMedicationLog>('MedicationLog', medicationLogSchema);