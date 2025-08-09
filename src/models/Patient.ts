import mongoose, { Schema } from 'mongoose';

export interface IPatient extends mongoose.Document {
  _id: string;
  name: string;
  email: string;
  age: number;
  gender: string;
  phoneNumber: string;
  caregiver: mongoose.Types.ObjectId;
  status: 'active' | 'inactive' | 'critical';
  adherenceRate: number;
  lastActivity: Date;
  emergencyContact?: {
    name: string;
    relationship: string;
    phoneNumber: string;
  };
  medicalHistory?: string[];
  allergies?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const patientSchema = new Schema<IPatient>({
  name: {
    type: String,
    required: [true, 'Patient name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  age: {
    type: Number,
    required: [true, 'Age is required'],
    min: [1, 'Age must be at least 1'],
    max: [150, 'Age cannot exceed 150']
  },
  gender: {
    type: String,
    required: [true, 'Gender is required'],
    enum: ['male', 'female', 'other', 'prefer_not_to_say']
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    match: [/^[\+]?[1-9][\d]{0,15}$/, 'Please enter a valid phone number']
  },
  caregiver: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Caregiver is required']
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'critical'],
    default: 'active'
  },
  adherenceRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  emergencyContact: {
    name: {
      type: String,
      trim: true
    },
    relationship: {
      type: String,
      trim: true
    },
    phoneNumber: {
      type: String,
      trim: true
    }
  },
  medicalHistory: [{
    type: String,
    trim: true
  }],
  allergies: [{
    type: String,
    trim: true
  }]
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
patientSchema.index({ caregiver: 1 });
patientSchema.index({ email: 1 });
patientSchema.index({ status: 1 });
patientSchema.index({ name: 'text', email: 'text' });

export default mongoose.model<IPatient>('Patient', patientSchema);