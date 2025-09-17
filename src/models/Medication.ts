import mongoose, { Schema } from 'mongoose';

export interface IMedication extends mongoose.Document {
  _id: string;
  name: string;
  dosage: string;
  dosageUnit: 'mg' | 'g' | 'ml' | 'tablets' | 'capsules' | 'drops' | 'puffs' | 'units';
  frequency: number;
  timingRelation: 'before_food' | 'after_food' | 'with_food' | 'empty_stomach' | 'anytime';
  totalQuantity: number;
  remainingQuantity: number;
  expiryDate: Date;
  instructions?: string;
  patient: mongoose.Types.ObjectId;
  caregiver: mongoose.Types.ObjectId;
  status: 'active' | 'paused' | 'completed';
  adherenceRate: number;
  lastTaken?: Date;
  barcodeData: string;
  createdAt: Date;
  updatedAt: Date;
}

const medicationSchema = new Schema<IMedication>({
  name: {
    type: String,
    required: [true, 'Medication name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  dosage: {
    type: String,
    required: [true, 'Dosage is required'],
    match: [/^\d+(\.\d+)?$/, 'Please enter a valid dosage (e.g., 500, 2.5)']
  },
  dosageUnit: {
    type: String,
    required: [true, 'Dosage unit is required'],
    enum: ['mg', 'g', 'ml', 'tablets', 'capsules', 'drops', 'puffs', 'units']
  },
  frequency: {
    type: Number,
    required: [true, 'Frequency is required'],
    min: [1, 'Frequency must be at least 1'],
    max: [6, 'Frequency cannot exceed 6 times daily']
  },
  timingRelation: {
    type: String,
    required: [true, 'Timing relation is required'],
    enum: ['before_food', 'after_food', 'with_food', 'empty_stomach', 'anytime']
  },
  totalQuantity: {
    type: Number,
    required: [true, 'Total quantity is required'],
    min: [1, 'Quantity must be at least 1']
  },
  remainingQuantity: {
    type: Number,
    required: [true, 'Remaining quantity is required'],
    min: [0, 'Remaining quantity cannot be negative']
  },
  expiryDate: {
    type: Date,
    required: [true, 'Expiry date is required'],
    validate: {
      validator: function(date: Date) {
        return date > new Date();
      },
      message: 'Expiry date must be in the future'
    }
  },
  instructions: {
    type: String,
    trim: true,
    maxlength: [500, 'Instructions cannot exceed 500 characters']
  },
  patient: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Patient is required']
  },
  caregiver: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Caregiver is required']
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'completed'],
    default: 'active'
  },
  adherenceRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  lastTaken: {
    type: Date
  },
  barcodeData: {
    type: String,
    unique: true
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

// Virtual for days left
medicationSchema.virtual('daysLeft').get(function() {
  return Math.floor(this.remainingQuantity / this.frequency);
});

// Virtual for days until expiry
medicationSchema.virtual('daysUntilExpiry').get(function() {
  const today = new Date();
  const expiry = new Date(this.expiryDate);
  const diffTime = expiry.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Generate unique barcode data before saving
medicationSchema.pre('save', async function(next) {
  if (!this.barcodeData) {
    try {
      // Find the patient User document (not Patient document)
      const patientUser = await mongoose.model('User').findById(this.patient);
      if (!patientUser) {
        return next(new Error('Patient user not found'));
      }

      // Create unique identifier components
      const patientInitials = patientUser.name.split(' ').map((n: string) => n[0]).join('').toUpperCase();
      const medicationCode = this.name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
      const dosageCode = this.dosage.replace('.', '');
      const unitCode = this.dosageUnit.substring(0, 2).toUpperCase();
      const timestamp = Date.now().toString().slice(-8); // Last 8 digits
      const randomCode = Math.random().toString(36).substring(2, 5).toUpperCase();

      // Format: MT_[PatientInitials]_[MedCode][Dosage][Unit]_[Timestamp]_[Random]
      this.barcodeData = `MT_${patientInitials}_${medicationCode}${dosageCode}${unitCode}_${timestamp}_${randomCode}`;

      // Ensure uniqueness by checking if barcode already exists
      let isUnique = false;
      let attempts = 0;
      while (!isUnique && attempts < 5) {
        const existingMedication = await mongoose.model('Medication').findOne({ 
          barcodeData: this.barcodeData 
        });
        
        if (!existingMedication) {
          isUnique = true;
        } else {
          // Generate new random code if duplicate found
          const newRandomCode = Math.random().toString(36).substring(2, 5).toUpperCase();
          this.barcodeData = `MT_${patientInitials}_${medicationCode}${dosageCode}${unitCode}_${timestamp}_${newRandomCode}`;
          attempts++;
        }
      }

      if (!isUnique) {
        return next(new Error('Failed to generate unique barcode'));
      }

    } catch (error) {
      return next(error as Error);
    }
  }
  next();
});

// Indexes for performance and uniqueness
medicationSchema.index({ patient: 1 });
medicationSchema.index({ caregiver: 1 });
medicationSchema.index({ status: 1 });
medicationSchema.index({ expiryDate: 1 });
medicationSchema.index({ barcodeData: 1 }, { unique: true });

export default mongoose.model<IMedication>('Medication', medicationSchema);