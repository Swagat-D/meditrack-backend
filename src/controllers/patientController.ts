import { Request, Response } from 'express';
import Patient from '../models/Patient';
import Medication from '../models/Medication';
import Activity from '../models/Activity';
import User from '../models/User';
import mongoose from 'mongoose';
import EmergencyContact from '../models/EmergencyContact';
import MealTime from '../models/MealTime';

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
    const adherenceRate = medications.length > 0 
      ? Math.round(medications.reduce((sum, med) => sum + med.adherenceRate, 0) / medications.length)
      : 0;

    const missedDoses = Math.floor(Math.random() * 3);

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
          missedDoses,
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

// Log medication taken
export const logMedicationTaken = async (req: AuthRequest, res: Response) => {
  try {
    const { medicationId } = req.params;
    const { takenAt, notes } = req.body;
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

    medication.lastTaken = new Date(takenAt);
    medication.remainingQuantity = Math.max(0, medication.remainingQuantity - 1);
    await medication.save();

    // Create activity log
    await Activity.create({
      type: 'dose_taken',
      patient: patientUserId,
      caregiver: medication.caregiver,
      medication: medication._id,
      message: `${req.user.name} took ${medication.name}`,
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

// Send SOS alert
export const sendSOSAlert = async (req: AuthRequest, res: Response) => {
  try {
    const { message, location, severity } = req.body;
    const patientUserId = req.user._id;

    const patient = await Patient.findOne({ email: req.user.email }).populate('caregiver');
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'No caregiver found for this patient'
      });
    }

    // Create SOS activity
    const sosActivity = await Activity.create({
      type: 'sos_alert',
      patient: patientUserId,
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

// Update the getCaregivers method to return proper format
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
        specialization: 'Healthcare Provider',
        connectedDate: patient.createdAt ? 
          new Date(patient.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 
          'January 2024',
        status: 'active' as const
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
