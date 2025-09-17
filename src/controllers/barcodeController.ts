import { Request, Response } from 'express';
import Medication from '../models/Medication';
import MealTime from '../models/MealTime';
import Activity from '../models/Activity'
import { parseMedicationBarcodeData, canTakeMedicationNow } from '../utils/barcodeUtils';
import { validateMedicationTiming } from '../utils/medicationTimingUtils';
import { getCurrentIST, convertUTCToIST } from '../utils/timezoneUtils';

interface AuthRequest extends Request {
  user?: any;
}

export const checkMedicationTimingWindow = async (
  medication: any,
  patientUserId: string
): Promise<{
  canTake: boolean;
  reason: string;
  currentWindows: any[];
  nextWindow: any;
  timeUntilNextWindow: string | null;
}> => {
  try {
    // Get patient's meal times
    const mealTimes = await MealTime.find({ patient: patientUserId }).sort({ mealId: 1 });
    
    if (mealTimes.length === 0) {
      // No meal times set - use default validation
      return {
        canTake: true,
        reason: 'Meal times not configured - taking anytime',
        currentWindows: [],
        nextWindow: null,
        timeUntilNextWindow: null
      };
    }

    // Convert to meal times object
    const mealTimesObj: any = {};
    mealTimes.forEach(meal => {
      mealTimesObj[meal.mealId] = meal.time;
    });

    // Use the timing validation function (you'll need to import this)
    const validation = validateMedicationTiming(
      medication.frequency,
      medication.timingRelation,
      mealTimesObj
    );

    return validation;

  } catch (error) {
    console.error('Error checking timing window:', error);
    // Fallback to basic validation
    return {
      canTake: true,
      reason: 'Timing check failed - allowing dose',
      currentWindows: [],
      nextWindow: null,
      timeUntilNextWindow: null
    };
  }
};

export const scanBarcode = async (req: AuthRequest, res: Response) => {
  try {
    const { barcodeData } = req.params;
    const userEmail = req.user.email;

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

    const patientUser = medication.patient as any;
    if (patientUser.email !== userEmail) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this medication.'
      });
    }

    const lastDoseActivity = await Activity.findOne({
      patient: patientUser._id, 
      medication: medication._id,
      type: 'dose_taken'
    }).sort({ createdAt: -1 });

    const actualLastTaken = lastDoseActivity ? convertUTCToIST(lastDoseActivity.createdAt) : null;
    
    // Check basic dose timing (prevent double dosing)
    const basicDoseCheck = canTakeMedicationNow(actualLastTaken, medication.frequency);
    
    // Check meal timing windows
    const timingWindowCheck = await checkMedicationTimingWindow(medication, patientUser._id);
    
    const daysLeft = Math.floor(medication.remainingQuantity / medication.frequency);
    const isExpired = new Date(medication.expiryDate) <= getCurrentIST();

    // Final decision: Must pass both checks
    const finalCanTake = basicDoseCheck.canTake && 
                        timingWindowCheck.canTake && 
                        !isExpired && 
                        medication.status === 'active' && 
                        medication.remainingQuantity > 0;

    // Determine reason for blocking
    let blockReason = '';
    if (!basicDoseCheck.canTake) {
      blockReason = 'Too soon for next dose';
    } else if (!timingWindowCheck.canTake) {
      blockReason = timingWindowCheck.reason;
    } else if (isExpired) {
      blockReason = 'Medication expired';
    } else if (medication.status !== 'active') {
      blockReason = 'Medication not active';
    } else if (medication.remainingQuantity <= 0) {
      blockReason = 'No medication remaining';
    } else {
      blockReason = 'Safe to take';
    }

    const result = {
      medication: {
        id: medication._id,
        name: medication.name,
        dosage: medication.dosage,
        dosageUnit: medication.dosageUnit,
        frequency: medication.frequency,
        timingRelation: medication.timingRelation,
        instructions: medication.instructions || 'Take as directed',
        lastTaken: actualLastTaken,
        daysLeft: Math.max(0, daysLeft),
        remainingQuantity: medication.remainingQuantity,
        status: medication.status,
        isExpired,
        expiryDate: medication.expiryDate
      },
      patient: {
        id: patientUser._id,
        name: patientUser.name,
        email: patientUser.email
      },
      caregiver: {
        id: (medication.caregiver as any)._id,
        name: (medication.caregiver as any).name,
        email: (medication.caregiver as any).email
      },
      dosingSafety: {
        canTake: finalCanTake,
        reason: blockReason,
        
        // Basic timing info
        nextDoseTime: basicDoseCheck.nextDoseTime,
        hoursRemaining: basicDoseCheck.hoursRemaining,
        lastTaken: actualLastTaken,
        
        // Meal timing info
        timingRelation: medication.timingRelation,
        currentWindows: timingWindowCheck.currentWindows,
        nextWindow: timingWindowCheck.nextWindow,
        timeUntilNextWindow: timingWindowCheck.timeUntilNextWindow,
        
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

    const medication = await Medication.findById(medicationId)
      .populate('patient', 'name email'); // This now points to User model

    if (!medication) {
      return res.status(404).json({
        success: false,
        message: 'Medication not found'
      });
    }

    const patientUser = medication.patient as any;
    if (patientUser.email !== userEmail) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this medication'
      });
    }

    const takenTime = takenAt ? convertUTCToIST(new Date(takenAt)) : getCurrentIST();
    
    medication.lastTaken = takenTime;
    medication.remainingQuantity = Math.max(0, medication.remainingQuantity - 1);
    
    if (medication.remainingQuantity === 0) {
      medication.status = 'completed';
    }

    await medication.save();

    await Activity.create({
      type: 'dose_taken',
      patient: patientUser._id, // This is now User._id
      caregiver: medication.caregiver,
      medication: medication._id,
      message: `${patientUser.name} took ${medication.name}`,
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

/**
 * Test endpoint for barcode collision handling
 * Only available in development mode
 */
export const testBarcodeCollision = async (req: Request, res: Response) => {
  try {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({
        success: false,
        message: 'Test endpoints only available in development mode'
      });
    }

    const { simulateBarcodeCollision, testBarcodeFormats } = await import('../utils/barcodeCollisionTest');
    
    console.log('Running barcode collision tests...');
    
    // Capture console output for response
    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (...args) => {
      logs.push(args.join(' '));
      originalLog(...args);
    };
    
    try {
      await simulateBarcodeCollision();
      testBarcodeFormats();
    } finally {
      console.log = originalLog;
    }
    
    res.status(200).json({
      success: true,
      message: 'Barcode collision tests completed',
      data: {
        testOutput: logs,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Test barcode collision error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to run barcode collision tests',
      error: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
    });
  }
};