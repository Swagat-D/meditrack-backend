import { Request, Response } from 'express';
import Patient from '../models/Patient';
import Medication from '../models/Medication';
import Activity from '../models/Activity';
import User from '../models/User';
import mongoose from 'mongoose';

interface AuthRequest extends Request {
  user?: any;
}

// Get dashboard data
export const getDashboardData = async (req: AuthRequest, res: Response) => {
  try {
    const patientEmail = req.user.email;

    // Find patient record
    const patient = await Patient.findOne({ email: patientEmail });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient profile not found'
      });
    }

    // Get medications for this patient
    const medications = await Medication.find({ patient: patient._id });

    // Calculate stats
    const totalMedications = medications.length;
    const activeMedications = medications.filter(med => med.status === 'active').length;
    const adherenceRate = medications.length > 0 
      ? Math.round(medications.reduce((sum, med) => sum + med.adherenceRate, 0) / medications.length)
      : 0;

    // Get today's medications
    const todaysMedications = medications
      .filter(med => med.status === 'active')
      .map(med => ({
        id: med._id,
        name: med.name,
        dosage: `${med.dosage} ${med.dosageUnit}`,
        times: Array(med.frequency).fill(0).map((_, i) => `${8 + i * 4}:00`),
        taken: Array(med.frequency).fill(false),
        nextDoseTime: `${8}:00`,
        instructions: med.instructions || '',
        color: '#2563EB'
      }));

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
          missedDoses: 0,
          upcomingDoses: activeMedications
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
    const patientEmail = req.user.email;
    const { search, status } = req.query;

    const patient = await Patient.findOne({ email: patientEmail });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient profile not found'
      });
    }

    let query: any = { patient: patient._id };
    
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
    const patientEmail = req.user.email;

    const patient = await Patient.findOne({ email: patientEmail });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient profile not found'
      });
    }

    const medication = await Medication.findOne({
      _id: medicationId,
      patient: patient._id
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

// Log medication taken
export const logMedicationTaken = async (req: AuthRequest, res: Response) => {
  try {
    const { medicationId } = req.params;
    const { takenAt, notes } = req.body;
    const patientEmail = req.user.email;

    const patient = await Patient.findOne({ email: patientEmail });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient profile not found'
      });
    }

    const medication = await Medication.findOne({
      _id: medicationId,
      patient: patient._id
    });

    if (!medication) {
      return res.status(404).json({
        success: false,
        message: 'Medication not found'
      });
    }

    // Update medication
    medication.lastTaken = new Date(takenAt);
    medication.remainingQuantity = Math.max(0, medication.remainingQuantity - 1);
    await medication.save();

    // Create activity log
    await Activity.create({
      type: 'dose_taken',
      patient: patient._id,
      caregiver: medication.caregiver,
      medication: medication._id,
      message: `${patient.name} took ${medication.name}`,
      priority: 'low',
      metadata: {
        doseTaken: new Date(takenAt)
      }
    });

    res.status(200).json({
      success: true,
      message: 'Medication dose logged successfully'
    });

  } catch (error) {
    console.error('Log medication taken error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to log medication dose'
    });
  }
};

// Get meal times
export const getMealTimes = async (req: AuthRequest, res: Response) => {
  try {
    // Return default meal times for now
    const defaultMealTimes = [
      { id: 'breakfast', name: 'Breakfast', time: '08:00', enabled: true },
      { id: 'lunch', name: 'Lunch', time: '12:30', enabled: true },
      { id: 'dinner', name: 'Dinner', time: '19:00', enabled: true },
      { id: 'snack', name: 'Snack', time: '15:30', enabled: false },
    ];

    res.status(200).json({
      success: true,
      data: defaultMealTimes
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
    const mealTimes = req.body;

    // In a real implementation, you would save these to a MealTimes model
    // For now, just return success
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
    const patientEmail = req.user.email;
    const { type, read } = req.query;

    const patient = await Patient.findOne({ email: patientEmail });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient profile not found'
      });
    }

    // Get recent activities as notifications
    let query: any = { patient: patient._id };
    
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
    const patientEmail = req.user.email;

    const patient = await Patient.findOne({ email: patientEmail });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient profile not found'
      });
    }

    await Activity.updateMany(
      { patient: patient._id },
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

// Send SOS alert
export const sendSOSAlert = async (req: AuthRequest, res: Response) => {
  try {
    const { message, location, severity } = req.body;
    const patientEmail = req.user.email;

    const patient = await Patient.findOne({ email: patientEmail });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient profile not found'
      });
    }

    // Create SOS activity
    const sosActivity = await Activity.create({
      type: 'sos_alert',
      patient: patient._id,
      caregiver: patient.caregiver,
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

// Get emergency contacts
export const getEmergencyContacts = async (req: AuthRequest, res: Response) => {
  try {
    const patientEmail = req.user.email;

    const patient = await Patient.findOne({ email: patientEmail })
      .populate('caregiver', 'name email phoneNumber');

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient profile not found'
      });
    }

    const contacts = [
      {
        id: '1',
        name: (patient.caregiver as any)?.name || 'Primary Caregiver',
        relationship: 'Primary Caregiver',
        phone: (patient.caregiver as any)?.phoneNumber || '+1-555-0123',
        isPrimary: true,
      },
      {
        id: '2',
        name: 'Emergency Services',
        relationship: 'Emergency',
        phone: '911',
        isPrimary: false,
      }
    ];

    if (patient.emergencyContact?.name) {
      contacts.push({
        id: '3',
        name: patient.emergencyContact.name,
        relationship: patient.emergencyContact.relationship || 'Emergency Contact',
        phone: patient.emergencyContact.phoneNumber || '+1-555-0456',
        isPrimary: false,
      });
    }

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

// Get caregivers
export const getCaregivers = async (req: AuthRequest, res: Response) => {
  try {
    const patientEmail = req.user.email;

    const patient = await Patient.findOne({ email: patientEmail })
      .populate('caregiver', 'name email phoneNumber');

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient profile not found'
      });
    }

    const caregivers = [];
    if (patient.caregiver) {
      caregivers.push({
        id: (patient.caregiver as any)._id,
        name: (patient.caregiver as any).name,
        email: (patient.caregiver as any).email,
        phoneNumber: (patient.caregiver as any).phoneNumber,
        isActive: true
      });
    }

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