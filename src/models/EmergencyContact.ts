// Create src/models/EmergencyContact.ts
import mongoose, { Schema } from 'mongoose';

export interface IEmergencyContact extends mongoose.Document {
  _id: string;
  patient: mongoose.Types.ObjectId;
  name: string;
  relationship: string;
  phoneNumber: string;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const emergencyContactSchema = new Schema<IEmergencyContact>({
  patient: {
    type: Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Contact name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  relationship: {
    type: String,
    required: [true, 'Relationship is required'],
    trim: true,
    maxlength: [50, 'Relationship cannot exceed 50 characters']
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    match: [/^[\+]?[1-9][\d]{0,15}$/, 'Please enter a valid phone number']
  },
  isPrimary: {
    type: Boolean,
    default: false
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

// Index for performance
emergencyContactSchema.index({ patient: 1 });

export default mongoose.model<IEmergencyContact>('EmergencyContact', emergencyContactSchema);