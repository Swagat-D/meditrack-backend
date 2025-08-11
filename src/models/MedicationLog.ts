import mongoose, { Schema } from 'mongoose';

export interface IMedicationLog extends mongoose.Document {
  _id: string;
  medication: mongoose.Types.ObjectId;
  patient: mongoose.Types.ObjectId;
  caregiver: mongoose.Types.ObjectId;
  takenAt: Date;
  dosage: string;
  dosageUnit: string;
  notes?: string;
  method: 'manual' | 'barcode_scan' | 'reminder';
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
  caregiver: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  takenAt: {
    type: Date,
    required: true
  },
  dosage: {
    type: String,
    required: true
  },
  dosageUnit: {
    type: String,
    required: true
  },
  notes: {
    type: String,
    maxlength: 500
  },
  method: {
    type: String,
    enum: ['manual', 'barcode_scan', 'reminder'],
    default: 'manual'
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
medicationLogSchema.index({ medication: 1, takenAt: -1 });
medicationLogSchema.index({ patient: 1, takenAt: -1 });
medicationLogSchema.index({ caregiver: 1, takenAt: -1 });

export default mongoose.model<IMedicationLog>('MedicationLog', medicationLogSchema);