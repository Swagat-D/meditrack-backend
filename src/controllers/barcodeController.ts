import { Request, Response } from 'express';
import Medication from '../models/Medication';
import MedicationLog from '../models/MedicationLog';
import Patient from '../models/Patient';
import { parseMedicationBarcodeData, canTakeMedicationNow } from '../utils/barcodeUtils';

interface AuthRequest extends Request {
  user?: any;
}

export const scanBarcode = async (req: AuthRequest, res: Response) => {
  try {
    const { barcodeData } = req.params;
    const userEmail = req.user.email;

    console.log('=== BACKEND BARCODE SCAN DEBUG ===');
    console.log('Received barcode:', barcodeData);
    console.log('User email:', userEmail);

    // Parse the barcode data
    const parsedData = parseMedicationBarcodeData(barcodeData);
    console.log('Parsed data:', parsedData);
    
    // Since we're using short format, find medication by barcodeData directly
    const medication = await Medication.findOne({ barcodeData: parsedData.barcodeData })
      .populate('patient', 'name email')
      .populate('caregiver', 'name email');

      console.log('Found medication:', medication ? 'YES' : 'NO');

      if (!medication) {
      // Let's also search for any medication with similar barcode
      const allMedications = await Medication.find({}).select('name barcodeData patient');
      console.log('All barcodes in database:', allMedications.map(m => m.barcodeData));
    }

    if (!medication) {
      return res.status(404).json({
        success: false,
        message: 'Medication not found. Please check the barcode and try again.'
      });
    }

    // Verify user has access to this medication
    const patient = medication.patient as any;
    if (patient.email !== userEmail) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this medication.'
      });
    }

    // Check if medication can be taken now
    const doseCheck = canTakeMedicationNow(medication.lastTaken || null, medication.frequency);
    
    // Calculate days left
    const daysLeft = Math.floor(medication.remainingQuantity / medication.frequency);

    // Check if medication is expired
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
        lastTaken: medication.lastTaken,
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
        canTake: doseCheck.canTake && !isExpired && medication.status === 'active',
        reason: !doseCheck.canTake ? 'Too soon for next dose' : 
                isExpired ? 'Medication expired' : 
                medication.status !== 'active' ? 'Medication not active' : 'Safe to take',
        nextDoseTime: doseCheck.nextDoseTime,
        hoursRemaining: doseCheck.hoursRemaining,
        lastTaken: medication.lastTaken,
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

// Rest of the controller remains the same...
export const recordMedicationTaken = async (req: AuthRequest, res: Response) => {
  // ... (same as before)
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