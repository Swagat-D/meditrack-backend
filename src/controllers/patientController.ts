import { Request, Response } from 'express';
import Patient from '../models/Patient';
import Medication from '../models/Medication';
import Activity from '../models/Activity';
import User from '../models/User';
import EmergencyContact from '../models/EmergencyContact';
import MealTime from '../models/MealTime';
import { checkMedicationTimingWindow } from './barcodeController';
import { canTakeMedicationNow } from '../utils/barcodeUtils';
import { getCurrentIST, convertUTCToIST, getTodayStartIST, getTodayEndIST, getDaysAgoIST } from '../utils/timezoneUtils';

interface AuthRequest extends Request {
  user?: any;
}

// Get dashboard data
export const getDashboardData = async (req: AuthRequest, res: Response) => {
  try {
    const patientUserId = req.user._id;

    const medications = await Medication.find({ patient: patientUserId });

    // Calculate stats
    const totalMedications = medications.length;
    const activeMedications = medications.filter(med => med.status === 'active').length;

    // FIXED: Calculate proper adherence rate based on actual dose activities
    let totalExpectedDoses = 0;
    let totalTakenDoses = 0;
    let totalMissedDoses = 0;

    // Calculate adherence for last 7 days
    const sevenDaysAgo = getDaysAgoIST(7);

    for (const medication of medications) {
      if (medication.status === 'active') {
        // Calculate expected doses for this medication in last 7 days
        const expectedDosesPerDay = medication.frequency;
        const expectedDoses = expectedDosesPerDay * 7;
        totalExpectedDoses += expectedDoses;

        // Get actual taken doses from activities
        const takenDoses = await Activity.countDocuments({
          patient: patientUserId,
          medication: medication._id,
          type: 'dose_taken',
          createdAt: { $gte: sevenDaysAgo }
        });

        // Get missed doses from activities
        const missedDoses = await Activity.countDocuments({
          patient: patientUserId,
          medication: medication._id,
          type: 'dose_missed',
          createdAt: { $gte: sevenDaysAgo }
        });

        totalTakenDoses += takenDoses;
        totalMissedDoses += missedDoses;
      }
    }

    // Calculate adherence rate percentage
    const adherenceRate = totalExpectedDoses > 0 
      ? Math.round((totalTakenDoses / totalExpectedDoses) * 100)
      : 0;

    // Update individual medication adherence rates
    for (const medication of medications) {
      if (medication.status === 'active') {
        const expectedDoses = medication.frequency * 7;
        const takenDoses = await Activity.countDocuments({
          patient: patientUserId,
          medication: medication._id,
          type: 'dose_taken',
          createdAt: { $gte: sevenDaysAgo }
        });
        
        const medAdherenceRate = expectedDoses > 0 
          ? Math.round((takenDoses / expectedDoses) * 100)
          : 0;
        
        // Update medication adherence rate in database
        await Medication.findByIdAndUpdate(medication._id, {
          adherenceRate: medAdherenceRate
        });
      }
    }

    // FIXED: Calculate today's missed doses
    const todayStart = getTodayStartIST();
    const todayEnd = getTodayEndIST();

    const todayMissedDoses = await Activity.countDocuments({
      patient: patientUserId,
      type: 'dose_missed',
      createdAt: { $gte: todayStart, $lte: todayEnd }
    });

    // Get today's medications with actual dose tracking
    const todaysMedications = await Promise.all(
      medications
        .filter(med => med.status === 'active')
        .map(async (med) => {
          // Get today's taken doses for this medication
          const todayTakenDoses = await Activity.countDocuments({
            patient: patientUserId,
            medication: med._id,
            type: 'dose_taken',
            createdAt: { $gte: todayStart, $lte: todayEnd }
          });

          // Create taken array based on frequency and actual doses taken
          const takenArray = Array(med.frequency).fill(false);
          for (let i = 0; i < Math.min(todayTakenDoses, med.frequency); i++) {
            takenArray[i] = true;
          }

          return {
            id: med._id,
            name: med.name,
            dosage: `${med.dosage} ${med.dosageUnit}`,
            times: Array(med.frequency).fill(0).map((_, i) => `${8 + i * 4}:00`),
            taken: takenArray,
            nextDoseTime: `${8}:00`,
            instructions: med.instructions || '',
            color: '#2563EB'
          };
        })
    );

    // Get upcoming reminders
    const upcomingReminders = medications
      .filter(med => med.status === 'active')
      .map(med => ({
        id: med._id,
        medicationName: med.name,
        time: '08:00',
        dosage: `${med.dosage} ${med.dosageUnit}`,
        isUrgent: false
      }));

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalMedications,
          activeMedications,
          todayReminders: activeMedications,
          adherenceRate,
          missedDoses: todayMissedDoses, // Today's missed doses
          upcomingDoses: activeMedications,
          weeklyStats: {
            totalExpectedDoses,
            totalTakenDoses,
            totalMissedDoses,
            adherenceRate
          }
        },
        todaysMedications,
        upcomingReminders,
        recentLogs: []
      }
    });

  } catch (error) {
    console.error('Get dashboard data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get dashboard data'
    });
  }
};

// Get medications
export const getMedications = async (req: AuthRequest, res: Response) => {
  try {
    const patientUserId = req.user._id; 
    const { search, status } = req.query;

    let query: any = { patient: patientUserId };
    
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    
    if (status && status !== 'all') {
      query.status = status;
    }

    const medications = await Medication.find(query).sort({ createdAt: -1 });

    const formattedMedications = medications.map(med => ({
      id: med._id,
      name: med.name,
      dosage: med.dosage,
      dosageUnit: med.dosageUnit,
      frequency: med.frequency,
      remainingQuantity: med.remainingQuantity,
      totalQuantity: med.totalQuantity,
      status: med.status,
      adherenceRate: med.adherenceRate,
      nextDose: 'Today 08:00',
      expiryDate: med.expiryDate,
      instructions: med.instructions
    }));

    res.status(200).json({
      success: true,
      data: formattedMedications
    });

  } catch (error) {
    console.error('Get medications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get medications'
    });
  }
};

// Get medication details
export const getMedicationDetails = async (req: AuthRequest, res: Response) => {
  try {
    const { medicationId } = req.params;
    const patientUserId = req.user._id;

    const medication = await Medication.findOne({
      _id: medicationId,
      patient: patientUserId
    });

    if (!medication) {
      return res.status(404).json({
        success: false,
        message: 'Medication not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: medication._id,
        name: medication.name,
        dosage: medication.dosage,
        dosageUnit: medication.dosageUnit,
        frequency: medication.frequency,
        remainingQuantity: medication.remainingQuantity,
        totalQuantity: medication.totalQuantity,
        status: medication.status,
        adherenceRate: medication.adherenceRate,
        expiryDate: medication.expiryDate,
        instructions: medication.instructions
      }
    });

  } catch (error) {
    console.error('Get medication details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get medication details'
    });
  }
};

// Get meal times
export const getMealTimes = async (req: AuthRequest, res: Response) => {
  try {
    const patientUserId = req.user._id;

    let mealTimes = await MealTime.find({ patient: patientUserId }).sort({ mealId: 1 });

    if (mealTimes.length === 0) {
      const defaultMeals = getDefaultMealTimes();
      const createdMeals = await Promise.all(
        defaultMeals.map(meal => 
          MealTime.create({
            patient: patientUserId,
            ...meal
          })
        )
      );
      mealTimes = createdMeals;
    }

    // Convert to 12-hour format for frontend
    const formattedMealTimes = mealTimes.map(meal => ({
      id: meal.mealId,
      name: meal.name,
      time: convertTo12Hour(meal.time),
      enabled: meal.enabled
    }));

    res.status(200).json({
      success: true,
      data: formattedMealTimes
    });

  } catch (error) {
    console.error('Get meal times error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get meal times'
    });
  }
};

// Update meal times
export const updateMealTimes = async (req: AuthRequest, res: Response) => {
  try {
    const patientUserId = req.user._id;
    const mealTimesData = req.body;

    // Validate required meals
    const requiredMeals = ['breakfast', 'lunch', 'dinner'];
    for (const mealId of requiredMeals) {
      if (mealTimesData[mealId] && !mealTimesData[mealId].enabled) {
        return res.status(400).json({
          success: false,
          message: `${mealId.charAt(0).toUpperCase() + mealId.slice(1)} is required and cannot be disabled`
        });
      }
    }

    // Update each meal time
    const updatePromises = Object.entries(mealTimesData).map(async ([mealId, data]: [string, any]) => {
      const mealName = mealId.charAt(0).toUpperCase() + mealId.slice(1);
      const isOptional = mealId === 'snack';

      return await MealTime.findOneAndUpdate(
        { patient: patientUserId, mealId },
        {
          patient: patientUserId,
          mealId,
          name: mealName,
          time: data.time,
          enabled: data.enabled,
          isOptional
        },
        { 
          upsert: true, 
          new: true,
          runValidators: true 
        }
      );
    });

    await Promise.all(updatePromises);

    res.status(200).json({
      success: true,
      message: 'Meal times updated successfully'
    });

  } catch (error) {
    console.error('Update meal times error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update meal times'
    });
  }
};

// Get notifications
export const getNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const patientUserId = req.user._id;
    const { type, read } = req.query;

    // Get recent activities as notifications
    let query: any = { patient: patientUserId };
    
    const activities = await Activity.find(query)
      .populate('medication', 'name')
      .sort({ createdAt: -1 })
      .limit(20);

    const notifications = activities.map(activity => ({
      id: activity._id,
      type: activity.type,
      title: getNotificationTitle(activity.type),
      message: activity.message,
      isRead: activity.isRead,
      priority: activity.priority,
      createdAt: activity.createdAt,
      data: activity.metadata
    }));

    const unreadCount = activities.filter(activity => !activity.isRead).length;

    res.status(200).json({
      success: true,
      data: {
        notifications,
        unreadCount,
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalCount: notifications.length
        }
      }
    });

  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get notifications'
    });
  }
};

// Helper function for notification titles
const getNotificationTitle = (type: string): string => {
  switch (type) {
    case 'dose_taken': return 'Medication Taken';
    case 'dose_missed': return 'Missed Dose';
    case 'low_stock': return 'Low Stock Alert';
    case 'sos_alert': return 'Emergency Alert';
    case 'medication_added': return 'New Medication';
    default: return 'Notification';
  }
};

// Mark notification as read
export const markNotificationAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const { notificationId } = req.params;

    await Activity.findByIdAndUpdate(notificationId, { isRead: true });

    res.status(200).json({
      success: true
    });

  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read'
    });
  }
};

// Mark all notifications as read
export const markAllNotificationsAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const patientUserId = req.user._id;

    await Activity.updateMany(
      { patient: patientUserId },
      { isRead: true }
    );

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read'
    });

  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark all notifications as read'
    });
  }
};

export const sendSOSAlert = async (req: AuthRequest, res: Response) => {
  try {
    const { message, location, severity } = req.body;
    const patientUserId = req.user._id;

    // Find the patient relationship record using the user's email
    const patientRecord = await Patient.findOne({ email: req.user.email }).populate('caregiver');
    if (!patientRecord) {
      return res.status(404).json({
        success: false,
        message: 'No caregiver found for this patient'
      });
    }

    // Create SOS activity using the correct User ID
    const sosActivity = await Activity.create({
      type: 'sos_alert',
      patient: patientUserId, // This should be the User ID, not Patient record ID
      caregiver: patientRecord.caregiver,
      message,
      priority: 'critical',
      metadata: {
        alertType: 'sos',
        location
      }
    });

    res.status(201).json({
      success: true,
      data: {
        id: sosActivity._id,
        type: 'sos_alert',
        message,
        location,
        status: 'active',
        createdAt: sosActivity.createdAt
      }
    });

  } catch (error) {
    console.error('Send SOS alert error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send SOS alert'
    });
  }
};

export const getCaregivers = async (req: AuthRequest, res: Response) => {
  try {
    const patientEmail = req.user.email;

    // Find patient relationships using email to get caregivers
    const patientRelationships = await Patient.find({ email: patientEmail })
      .populate('caregiver', 'name email phoneNumber');

    if (patientRelationships.length === 0) {
      // Return empty array instead of error - patient might not have caregivers yet
      return res.status(200).json({
        success: true,
        data: []
      });
    }

    const caregivers = patientRelationships.map(relationship => ({
      id: (relationship.caregiver as any)._id,
      name: (relationship.caregiver as any).name,
      email: (relationship.caregiver as any).email,
      phoneNumber: (relationship.caregiver as any).phoneNumber,
      specialization: 'Healthcare Provider',
      connectedDate: relationship.createdAt ? 
        new Date(relationship.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 
        'January 2024',
      status: 'active' as const
    }));

    res.status(200).json({
      success: true,
      data: caregivers
    });

  } catch (error) {
    console.error('Get caregivers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get caregivers'
    });
  }
};

export const logMedicationTaken = async (req: AuthRequest, res: Response) => {
  try {
    const { medicationId } = req.params;
    const { notes, override } = req.body; // Add override option for emergencies
    const patientUserId = req.user._id;

    const medication = await Medication.findOne({
      _id: medicationId,
      patient: patientUserId
    });

    if (!medication) {
      return res.status(404).json({
        success: false,
        message: 'Medication not found'
      });
    }

    // Get last dose from Activity (same as barcode scan)
    const lastDoseActivity = await Activity.findOne({
      patient: patientUserId, 
      medication: medication._id,
      type: 'dose_taken'
    }).sort({ createdAt: -1 });

    const actualLastTaken = lastDoseActivity ? convertUTCToIST(lastDoseActivity.createdAt) : null;
        
    // SAFETY CHECK 1: Basic dose timing (prevent double dosing)
    const basicDoseCheck = canTakeMedicationNow(actualLastTaken, medication.frequency);
    
    // SAFETY CHECK 2: Meal timing windows
    const timingWindowCheck = await checkMedicationTimingWindow(medication, patientUserId);
    
    // SAFETY CHECK 3: Medication expiry
    const isExpired = new Date(medication.expiryDate) <= new Date();
    
    // SAFETY CHECK 4: Medication status and quantity
    const hasQuantity = medication.remainingQuantity > 0;
    const isActive = medication.status === 'active';

    // Calculate days left
    const daysLeft = Math.floor(medication.remainingQuantity / medication.frequency);

    // Final decision: Must pass all checks OR be overridden
    const finalCanTake = override || (
      basicDoseCheck.canTake && 
      timingWindowCheck.canTake && 
      !isExpired && 
      isActive && 
      hasQuantity
    );

    // Determine reason for blocking
    let blockReason = '';
    let safetyWarnings = [];

    if (!basicDoseCheck.canTake) {
      blockReason = 'Too soon for next dose';
      safetyWarnings.push(`Next dose available in ${basicDoseCheck.hoursRemaining} hours`);
    } 
    if (!timingWindowCheck.canTake) {
      if (!blockReason) blockReason = timingWindowCheck.reason;
      safetyWarnings.push(timingWindowCheck.reason);
    }
    if (isExpired) {
      if (!blockReason) blockReason = 'Medication expired';
      safetyWarnings.push(`Medication expired on ${medication.expiryDate.toDateString()}`);
    }
    if (!isActive) {
      if (!blockReason) blockReason = 'Medication not active';
      safetyWarnings.push('This medication is currently paused or inactive');
    }
    if (!hasQuantity) {
      if (!blockReason) blockReason = 'No medication remaining';
      safetyWarnings.push('No doses remaining - please contact your caregiver');
    }

    if (finalCanTake && safetyWarnings.length === 0) {
      blockReason = 'Safe to take';
    }

    console.log('Safety check results:', {
      basicDoseCheck: basicDoseCheck.canTake,
      timingWindowCheck: timingWindowCheck.canTake,
      isExpired,
      isActive,
      hasQuantity,
      finalCanTake,
      blockReason
    });

    // If not safe to take and no override, return safety warning
    if (!finalCanTake) {
      return res.status(400).json({
        success: false,
        message: blockReason,
        data: {
          canTake: false,
          reason: blockReason,
          warnings: safetyWarnings,
          medication: {
            id: medication._id,
            name: medication.name,
            dosage: `${medication.dosage} ${medication.dosageUnit}`,
            lastTaken: actualLastTaken,
            nextDoseTime: basicDoseCheck.nextDoseTime,
            daysLeft: Math.max(0, daysLeft),
            remainingQuantity: medication.remainingQuantity,
            isExpired,
            expiryDate: medication.expiryDate
          },
          timingInfo: {
            timingRelation: medication.timingRelation,
            currentWindows: timingWindowCheck.currentWindows,
            nextWindow: timingWindowCheck.nextWindow,
            timeUntilNextWindow: timingWindowCheck.timeUntilNextWindow
          }
        }
      });
    }

    // If safe to take or overridden, proceed with logging
    const takenTime = getCurrentIST();
    
    medication.lastTaken = takenTime;
    medication.remainingQuantity = Math.max(0, medication.remainingQuantity - 1);
    
    if (medication.remainingQuantity === 0) {
      medication.status = 'completed';
    }

    const savedMedication = await medication.save();

    // Create activity log with safety info
    await Activity.create({
      type: 'dose_taken',
      patient: patientUserId,
      caregiver: medication.caregiver,
      medication: medication._id,
      message: override 
        ? `${req.user.name} took ${medication.name} (OVERRIDE - ${blockReason})`
        : `${req.user.name} took ${medication.name}`,
      priority: override ? 'medium' : 'low',
      metadata: {
        doseTaken: takenTime,
        remainingQuantity: savedMedication.remainingQuantity,
        wasOverridden: override || false,
        safetyReason: blockReason,
        warnings: safetyWarnings
      }
    });

    // Send low stock warning if running low
    if (savedMedication.remainingQuantity <= 3 && savedMedication.remainingQuantity > 0) {
      await Activity.create({
        type: 'low_stock',
        patient: patientUserId,
        caregiver: medication.caregiver,
        medication: medication._id,
        message: `${medication.name} is running low (${savedMedication.remainingQuantity} doses left)`,
        priority: 'high',
        metadata: {
          stockLevel: savedMedication.remainingQuantity
        }
      });
    }

    res.status(200).json({
      success: true,
      message: override 
        ? 'Medication dose logged with safety override' 
        : 'Medication dose logged successfully',
      data: {
        medicationId: savedMedication._id,
        medicationName: savedMedication.name,
        dosage: `${savedMedication.dosage} ${savedMedication.dosageUnit}`,
        takenAt: takenTime,
        lastTaken: savedMedication.lastTaken,
        remainingQuantity: savedMedication.remainingQuantity,
        status: savedMedication.status,
        daysLeft: Math.max(0, Math.floor(savedMedication.remainingQuantity / medication.frequency)),
        wasOverridden: override || false,
        safetyInfo: {
          reason: blockReason,
          warnings: safetyWarnings
        }
      }
    });

  } catch (error) {
    console.error('Log medication taken error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to log medication dose'
    });
  }
};

// Keep the existing checkMedicationTiming function but enhance it
export const checkMedicationTiming = async (req: AuthRequest, res: Response) => {
  try {
    const { medicationId } = req.params;
    const patientUserId = req.user._id;

    const medication = await Medication.findOne({
      _id: medicationId,
      patient: patientUserId
    });

    if (!medication) {
      return res.status(404).json({
        success: false,
        message: 'Medication not found'
      });
    }

    // Get last dose from Activity (same as barcode scan)
    const lastDoseActivity = await Activity.findOne({
      patient: patientUserId, 
      medication: medication._id,
      type: 'dose_taken'
    }).sort({ createdAt: -1 });

    const actualLastTaken = lastDoseActivity ? convertUTCToIST(lastDoseActivity.createdAt) : null;
    
    // Perform all safety checks
    const basicDoseCheck = canTakeMedicationNow(actualLastTaken, medication.frequency);
    const timingWindowCheck = await checkMedicationTimingWindow(medication, patientUserId);
    const isExpired = new Date(medication.expiryDate) <= new Date();
    const hasQuantity = medication.remainingQuantity > 0;
    const isActive = medication.status === 'active';

    const finalCanTake = basicDoseCheck.canTake && 
                        timingWindowCheck.canTake && 
                        !isExpired && 
                        isActive && 
                        hasQuantity;

    // Prepare detailed response
    let warnings = [];
    let reason = 'Safe to take';

    if (!basicDoseCheck.canTake) {
      reason = 'Too soon for next dose';
      warnings.push(`Next dose available in ${basicDoseCheck.hoursRemaining} hours`);
    }
    if (!timingWindowCheck.canTake) {
      if (reason === 'Safe to take') reason = timingWindowCheck.reason;
      warnings.push(timingWindowCheck.reason);
    }
    if (isExpired) {
      if (reason === 'Safe to take') reason = 'Medication expired';
      warnings.push(`Expired on ${medication.expiryDate.toDateString()}`);
    }
    if (!isActive) {
      if (reason === 'Safe to take') reason = 'Medication not active';
      warnings.push('Medication is paused or inactive');
    }
    if (!hasQuantity) {
      if (reason === 'Safe to take') reason = 'No medication remaining';
      warnings.push('No doses remaining');
    }

    res.status(200).json({
      success: true,
      data: {
        canTake: finalCanTake,
        reason,
        warnings,
        medication: {
          id: medication._id,
          name: medication.name,
          dosage: `${medication.dosage} ${medication.dosageUnit}`,
          remainingQuantity: medication.remainingQuantity,
          status: medication.status,
          isExpired,
          expiryDate: medication.expiryDate
        },
        dosing: {
          lastTaken: actualLastTaken,
          nextDoseTime: basicDoseCheck.nextDoseTime,
          hoursRemaining: basicDoseCheck.hoursRemaining
        },
        timing: {
          timingRelation: medication.timingRelation,
          currentWindows: timingWindowCheck.currentWindows,
          nextWindow: timingWindowCheck.nextWindow,
          timeUntilNextWindow: timingWindowCheck.timeUntilNextWindow
        }
      }
    });

  } catch (error) {
    console.error('Check medication timing error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check timing'
    });
  }
};

// Helper function to get timing recommendation (same as barcode controller)
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

// Update getEmergencyContacts
export const getEmergencyContacts = async (req: AuthRequest, res: Response) => {
  try {
    const patientUserId = req.user._id;

    // Get emergency contacts from database
    const emergencyContacts = await EmergencyContact.find({ patient: patientUserId })
      .sort({ isPrimary: -1, createdAt: -1 });

    const contacts = emergencyContacts.map(contact => ({
      id: contact._id,
      name: contact.name,
      relationship: contact.relationship,
      phone: contact.phoneNumber,
      isPrimary: contact.isPrimary,
    }));

    // Always include emergency services
    contacts.push({
      id: '911',
      name: 'Emergency Services',
      relationship: 'Emergency',
      phone: '911',
      isPrimary: false,
    });

    res.status(200).json({
      success: true,
      data: contacts
    });

  } catch (error) {
    console.error('Get emergency contacts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get emergency contacts'
    });
  }
};

// Update addEmergencyContact
export const addEmergencyContact = async (req: AuthRequest, res: Response) => {
  try {
    const { name, relationship, phoneNumber, isPrimary } = req.body;
    const patientUserId = req.user._id;

    if (!name || !relationship || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Name, relationship, and phone number are required'
      });
    }

    if (isPrimary) {
      await EmergencyContact.updateMany(
        { patient: patientUserId },
        { isPrimary: false }
      );
    }

    // Create new emergency contact
    const newContact = await EmergencyContact.create({
      patient: patientUserId,
      name,
      relationship,
      phoneNumber,
      isPrimary: isPrimary || false
    });

    res.status(201).json({
      success: true,
      message: 'Emergency contact added successfully',
      data: {
        id: newContact._id,
        name: newContact.name,
        relationship: newContact.relationship,
        phone: newContact.phoneNumber,
        isPrimary: newContact.isPrimary
      }
    });

  } catch (error) {
    console.error('Add emergency contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add emergency contact'
    });
  }
};

// Update removeEmergencyContact
export const removeEmergencyContact = async (req: AuthRequest, res: Response) => {
  try {
    const { contactId } = req.params;
    const patientUserId = req.user._id;

    // Don't allow removal of emergency services
    if (contactId === '911') {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove emergency services'
      });
    }

    // Find and remove the contact
    const contact = await EmergencyContact.findOneAndDelete({
      _id: contactId,
      patient: patientUserId
    });

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Emergency contact not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Emergency contact removed successfully'
    });

  } catch (error) {
    console.error('Remove emergency contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove emergency contact'
    });
  }
};

// Request caregiver connection
export const requestCaregiverConnection = async (req: AuthRequest, res: Response) => {
  try {
    const { caregiverEmail, message } = req.body;

    // In a real implementation, you would:
    // 1. Find the caregiver by email
    // 2. Send them a connection request
    // 3. Store the pending request

    res.status(200).json({
      success: true,
      message: 'Connection request sent successfully'
    });

  } catch (error) {
    console.error('Request caregiver connection error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send connection request'
    });
  }
};

// Get notification settings
export const getNotificationSettings = async (req: AuthRequest, res: Response) => {
  try {
    const defaultSettings = {
      medicationReminders: true,
      refillReminders: true,
      adherenceAlerts: true,
      sosAlerts: true
    };

    res.status(200).json({
      success: true,
      data: defaultSettings
    });

  } catch (error) {
    console.error('Get notification settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get notification settings'
    });
  }
};

// Get current user profile
export const getCurrentUser = async (req: AuthRequest, res: Response) => {
  try {
    const patientEmail = req.user.email;
    
    const user = await User.findOne({ email: patientEmail });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber || '',
        age: user.age || 0,
        gender: user.gender || ''
      }
    });

  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user profile'
    });
  }
};

// Update notification settings
export const updateNotificationSettings = async (req: AuthRequest, res: Response) => {
  try {
    const settings = req.body;

    // In a real implementation, save these settings to the database
    res.status(200).json({
      success: true,
      message: 'Notification settings updated successfully'
    });

  } catch (error) {
    console.error('Update notification settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update notification settings'
    });
  }
};

// Export health data
export const exportHealthData = async (req: AuthRequest, res: Response) => {
  try {
    const { format } = req.body;

    // In a real implementation, generate the actual file
    const fileName = `health-data-${Date.now()}.${format}`;
    const downloadUrl = `https://your-app.com/downloads/${fileName}`;

    res.status(200).json({
      success: true,
      data: {
        downloadUrl,
        fileName
      }
    });

  } catch (error) {
    console.error('Export health data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export health data'
    });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { name, phoneNumber } = req.body;
    const patientEmail = req.user.email;

    const user = await User.findOneAndUpdate(
      { email: patientEmail },
      { name, phoneNumber },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully'
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
};

// Add this new function to patientController.ts
export const getRecentActivities = async (req: AuthRequest, res: Response) => {
  try {
    const patientUserId = req.user._id;


    // Get recent activities for this patient
    const activities = await Activity.find({ patient: patientUserId})
      .populate('medication', 'name')
      .sort({ createdAt: -1 })
      .limit(20);

    const recentActivities = activities.map(activity => ({
      id: activity._id,
      type: activity.type,
      medicationName: activity.medication ? (activity.medication as any).name : 'Unknown',
      message: activity.message,
      timestamp: formatTimeAgo(activity.createdAt),
      priority: activity.priority
    }));

    res.status(200).json({
      success: true,
      data: recentActivities
    });

  } catch (error) {
    console.error('Get recent activities error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get recent activities'
    });
  }
};

// Helper function to format time ago
const formatTimeAgo = (date: Date): string => {
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
  
  if (diffInMinutes < 1) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays}d ago`;
};

const convertTo12Hour = (time24: string): string => {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
};

// Helper function to get default meal times
const getDefaultMealTimes = () => [
  { mealId: 'breakfast', name: 'Breakfast', time: '08:00', enabled: true, isOptional: false },
  { mealId: 'lunch', name: 'Lunch', time: '12:30', enabled: true, isOptional: false },
  { mealId: 'dinner', name: 'Dinner', time: '19:00', enabled: true, isOptional: false },
  { mealId: 'snack', name: 'Snack', time: '15:30', enabled: false, isOptional: true },
];
