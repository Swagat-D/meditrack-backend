import { Request, Response } from 'express';
import Medication from '../models/Medication';
import MedicationLog from '../models/MedicationLog';
import Patient from '../models/Patient';
import Activity from '../models/Activity'
import { parseMedicationBarcodeData, canTakeMedicationNow } from '../utils/barcodeUtils';
import mongoose from 'mongoose';

interface AuthRequest extends Request {
  user?: any;
}

export const scanBarcode = async (req: AuthRequest, res: Response) => {
  try {
    const { barcodeData } = req.params;
    const userEmail = req.user.email;

    console.log('=== BACKEND BARCODE SCAN DEBUG ===');
    console.log('Received barcode:', barcodeData);

    const parsedData = parseMedicationBarcodeData(barcodeData);
    
    const medication = await Medication.findOne({ barcodeData: parsedData.barcodeData })
      .populate('patient', 'name email')
      .populate('caregiver', 'name email');

    if (!medication) {
      return res.status(404).json({
        success: false,
        message: 'Medication not found. Please check the barcode and try again.'
      });
    }

    const patient = medication.patient as any;
    if (patient.email !== userEmail) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this medication.'
      });
    }

    // Fetch the most recent dose log from Activity table (real data)
    const lastDoseActivity = await Activity.findOne({
      patient: patient._id,
      medication: medication._id,
      type: 'dose_taken'
    }).sort({ createdAt: -1 });

    // Use actual last taken time from logs, not the medication.lastTaken field
    const actualLastTaken = lastDoseActivity ? lastDoseActivity.createdAt : null;
    
    console.log('Last dose activity found:', lastDoseActivity ? 'YES' : 'NO');
    console.log('Actual last taken from logs:', actualLastTaken);

    // Check timing based on real data
    const doseCheck = canTakeMedicationNow(actualLastTaken, medication.frequency);
    
    const daysLeft = Math.floor(medication.remainingQuantity / medication.frequency);
    const isExpired = new Date(medication.expiryDate) <= new Date();

    const result = {
      medication: {
        id: medication._id,
        name: medication.name,
        dosage: medication.dosage,
        dosageUnit: medication.dosageUnit,
        frequency: medication.frequency,
        timingRelation: medication.timingRelation,
        instructions: medication.instructions || 'Take as directed',
        lastTaken: actualLastTaken, // Real last taken time
        daysLeft: Math.max(0, daysLeft),
        remainingQuantity: medication.remainingQuantity,
        status: medication.status,
        isExpired,
        expiryDate: medication.expiryDate
      },
      patient: {
        id: patient._id,
        name: patient.name,
        email: patient.email
      },
      caregiver: {
        id: (medication.caregiver as any)._id,
        name: (medication.caregiver as any).name,
        email: (medication.caregiver as any).email
      },
      dosingSafety: {
        canTake: doseCheck.canTake && !isExpired && medication.status === 'active' && medication.remainingQuantity > 0,
        reason: !doseCheck.canTake ? 'Too soon for next dose' : 
                isExpired ? 'Medication expired' : 
                medication.status !== 'active' ? 'Medication not active' : 
                medication.remainingQuantity <= 0 ? 'No medication remaining' : 'Safe to take',
        nextDoseTime: doseCheck.nextDoseTime,
        hoursRemaining: doseCheck.hoursRemaining,
        lastTaken: actualLastTaken,
        timingRelation: medication.timingRelation,
        recommendedTiming: getTimingRecommendation(medication.timingRelation)
      }
    };

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Barcode scan error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to scan barcode. Please try again.'
    });
  }
};

export const recordMedicationViaBarcode = async (req: AuthRequest, res: Response) => {
  try {
    const { medicationId } = req.params;
    const { notes, takenAt } = req.body;
    const userEmail = req.user.email;

    console.log('=== RECORD VIA BARCODE DEBUG ===');
    console.log('Medication ID:', medicationId);
    console.log('User email:', userEmail);

    // Find medication and patient
    const medication = await Medication.findById(medicationId)
      .populate('patient', 'name email');

    if (!medication) {
      return res.status(404).json({
        success: false,
        message: 'Medication not found'
      });
    }

    const patient = medication.patient as any;
    if (patient.email !== userEmail) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this medication'
      });
    }

    // Same logic as patientController logMedicationTaken
    const takenTime = takenAt ? new Date(takenAt) : new Date();
    
    // Update medication
    medication.lastTaken = takenTime;
    medication.remainingQuantity = Math.max(0, medication.remainingQuantity - 1);
    
    if (medication.remainingQuantity === 0) {
      medication.status = 'completed';
    }

    await medication.save();

    // Create activity log (same as home screen)
    await Activity.create({
      type: 'dose_taken',
      patient: patient._id,
      caregiver: medication.caregiver,
      medication: medication._id,
      message: `${patient.name} took ${medication.name}`,
      priority: 'low',
      metadata: {
        doseTaken: takenTime
      }
    });

    const remainingDays = medication.remainingQuantity > 0 
      ? Math.floor(medication.remainingQuantity / medication.frequency)
      : 0;

    res.status(200).json({
      success: true,
      message: 'Medication dose logged successfully',
      data: {
        medicationId: medication._id,
        medicationName: medication.name,
        dosage: `${medication.dosage}${medication.dosageUnit}`,
        takenAt: takenTime,
        remainingQuantity: medication.remainingQuantity,
        remainingDays
      }
    });

  } catch (error) {
    console.error('Record via barcode error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record medication dose. Please try again.'
    });
  }
};

const getTimingRecommendation = (timingRelation: string): string => {
  const recommendations = {
    'before_food': 'Take 30-60 minutes before meals',
    'after_food': 'Take 30-60 minutes after meals',
    'with_food': 'Take during or immediately after meals',
    'empty_stomach': 'Take on an empty stomach, 2 hours after or 1 hour before meals',
    'anytime': 'Can be taken at any time'
  };
  return recommendations[timingRelation as keyof typeof recommendations] || 'Follow doctor instructions';
};