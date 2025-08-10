// Create src/models/MealTime.ts
import mongoose, { Schema } from 'mongoose';

export interface IMealTime extends mongoose.Document {
 _id: string;
 patient: mongoose.Types.ObjectId;
 mealId: string;
 name: string;
 time: string; // 24-hour format
 enabled: boolean;
 isOptional: boolean;
 createdAt: Date;
 updatedAt: Date;
}

const mealTimeSchema = new Schema<IMealTime>({
 patient: {
   type: Schema.Types.ObjectId,
   ref: 'Patient',
   required: true
 },
 mealId: {
   type: String,
   required: true,
   enum: ['breakfast', 'lunch', 'dinner', 'snack']
 },
 name: {
   type: String,
   required: true,
   trim: true
 },
 time: {
   type: String,
   required: true,
   match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Please enter a valid time in HH:MM format']
 },
 enabled: {
   type: Boolean,
   default: true
 },
 isOptional: {
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

// Compound index to ensure one meal per patient per meal type
mealTimeSchema.index({ patient: 1, mealId: 1 }, { unique: true });

export default mongoose.model<IMealTime>('MealTime', mealTimeSchema);