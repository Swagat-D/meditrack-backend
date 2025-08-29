import { Request, Response } from 'express';
import Patient from '../models/Patient';
import Medication from '../models/Medication';
import Activity from '../models/Activity';
import User from '../models/User';
import mongoose from 'mongoose';
import { generateOTP, generateOTPExpiry, isOTPExpired } from '../utils/otpUtils';
import { emailService } from '../services/emailService';
import { generateMedicationBarcodeData, generateShortBarcodeData } from '../utils/barcodeUtils';
import { getTodayStartIST, getTodayEndIST } from '../utils/timezoneUtils';

interface AuthRequest extends Request {
  user?: any;
}

// Get dashboard stats
export const getDashboardStats = async (req: AuthRequest, res: Response) => {
  try {
    const caregiverId = req.user._id;

    // Get all stats in parallel
    const [
      totalPatients,
      activeMedications,
      criticalAlerts,
      recentActivities
    ] = await Promise.all([
      Patient.countDocuments({ caregiver: caregiverId }),
      Medication.countDocuments({ caregiver: caregiverId, status: 'active' }),
      Activity.countDocuments({ 
        caregiver: caregiverId, 
        priority: 'critical', 
        isRead: false 
      }),
      Activity.find({ caregiver: caregiverId })
        .populate('patient', 'name')
        .populate('medication', 'name')
        .sort({ createdAt: -1 })
        .limit(10)
    ]);

    // Get today's reminders (medications that need to be taken today)
    const today = getTodayStartIST();
    const tomorrow = getTodayEndIST();

    const todayReminders = await Medication.countDocuments({
      caregiver: caregiverId,
      status: 'active',
      createdAt: { $gte: today, $lt: tomorrow }
    });

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalPatients,
          activeMedications,
          todayReminders,
          criticalAlerts
        },
        recentActivities: recentActivities.map(activity => ({
          id: activity._id,
          type: activity.type,
          patientName: activity.patient ? (activity.patient as any).name : 'Unknown',
          message: activity.message,
          timestamp: activity.createdAt,
          priority: activity.priority
        }))
      }
    });

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get dashboard stats'
    });
  }
};

export const getPatients = async (req: AuthRequest, res: Response) => {
  try {
    const caregiverId = req.user._id;
    const { search, status, sortBy = 'name', sortOrder = 'asc' } = req.query;

    // Build filter query
    const filter: any = { caregiver: caregiverId };
    
    if (search) {
      filter.$text = { $search: search as string };
    }
    
    if (status && status !== 'all') {
      filter.status = status;
    }

    // Build sort object
    const sort: any = {};
    sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;

    // Get patients with medication count - FIX THE LOOKUP
    const patients = await Patient.aggregate([
      { $match: filter },
      {
        // First lookup to get the User document for each patient
        $lookup: {
          from: 'users',
          let: { patientEmail: '$email' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$email', '$$patientEmail'] },
                    { $eq: ['$role', 'patient'] }
                  ]
                }
              }
            }
          ],
          as: 'patientUser'
        }
      },
      {
        // Then lookup medications using the User ID
        $lookup: {
          from: 'medications',
          let: { patientUserId: { $arrayElemAt: ['$patientUser._id', 0] } },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$patient', '$$patientUserId'] }
              }
            }
          ],
          as: 'medications'
        }
      },
      {
        // Lookup activities using the User ID
        $lookup: {
          from: 'activities',
          let: { patientUserId: { $arrayElemAt: ['$patientUser._id', 0] } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$patient', '$$patientUserId'] },
                    { $eq: ['$priority', 'critical'] },
                    { $eq: ['$isRead', false] }
                  ]
                }
              }
            }
          ],
          as: 'alerts'
        }
      },
      {
        $addFields: {
          medicationsCount: { $size: '$medications' },
          alerts: { $size: '$alerts' },
          adherenceRate: {
            $cond: {
              if: { $gt: [{ $size: '$medications' }, 0] },
              then: {
                $avg: {
                  $map: {
                    input: '$medications',
                    as: 'med',
                    in: '$$med.adherenceRate'
                  }
                }
              },
              else: 0
            }
          }
        }
      },
      {
        $project: {
          medications: 0,
          patientUser: 0 // Remove the user lookup data from final result
        }
      },
      { $sort: sort }
    ]);

    res.status(200).json({
      success: true,
      data: patients.map(patient => ({
        id: patient._id,
        name: patient.name,
        email: patient.email,
        age: patient.age,
        gender: patient.gender,
        phoneNumber: patient.phoneNumber,
        medicationsCount: patient.medicationsCount,
        adherenceRate: Math.round(patient.adherenceRate),
        lastActivity: patient.lastActivity,
        status: patient.status,
        alerts: patient.alerts
      }))
    });

  } catch (error) {
    console.error('Get patients error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get patients'
    });
  }
};

// getPatientDetails function:
export const getPatientDetails = async (req: AuthRequest, res: Response) => {
  try {
    const { patientId } = req.params;
    const caregiverId = req.user._id;

    // Validate patient ID
    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid patient ID'
      });
    }

    // Get patient details
    const patientRecord = await Patient.findOne({
      _id: patientId,
      caregiver: caregiverId
    });

    if (!patientRecord) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Find the actual User document for this patient
    const patientUser = await User.findOne({
      email: patientRecord.email,
      role: 'patient'
    });

    if (!patientUser) {
      return res.status(404).json({
        success: false,
        message: 'Patient user account not found'
      });
    }

    // Get patient medications using the correct User ID
    const medications = await Medication.find({
      patient: patientUser._id, // Use User ID, not Patient record ID
      caregiver: caregiverId
    }).sort({ createdAt: -1 });

    // Calculate overall adherence rate
    const adherenceRate = medications.length > 0 
      ? Math.round(medications.reduce((sum, med) => sum + med.adherenceRate, 0) / medications.length)
      : 0;

    res.status(200).json({
      success: true,
      data: {
        patient: {
          id: patientRecord._id, // Return the Patient record ID for frontend consistency
          name: patientRecord.name,
          email: patientRecord.email,
          phoneNumber: patientRecord.phoneNumber,
          age: patientRecord.age,
          gender: patientRecord.gender,
          lastActivity: patientRecord.lastActivity,
          status: patientRecord.status,
          adherenceRate,
          emergencyContact: patientRecord.emergencyContact,
          medicalHistory: patientRecord.medicalHistory,
          allergies: patientRecord.allergies
        },
        medications: medications.map(med => ({
          id: med._id,
          name: med.name,
          dosage: med.dosage,
          dosageUnit: med.dosageUnit,
          frequency: med.frequency,
          timingRelation: med.timingRelation,
          remainingQuantity: med.remainingQuantity,
          totalQuantity: med.totalQuantity,
          status: med.status,
          adherenceRate: med.adherenceRate,
          lastTaken: med.lastTaken,
          daysLeft: Math.floor(med.remainingQuantity / med.frequency),
          expiryDate: med.expiryDate
        }))
      }
    });

  } catch (error) {
    console.error('Get patient details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get patient details'
    });
  }
};

// Add medication
export const addMedication = async (req: AuthRequest, res: Response) => {
  try {
    const { patientId } = req.params;
    const caregiverId = req.user._id;
    const medicationData = req.body;

    // First, validate that the patient exists and belongs to this caregiver
    const patientRecord = await Patient.findOne({
      _id: patientId,
      caregiver: caregiverId
    });

    if (!patientRecord) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found or unauthorized access'
      });
    }

    // Now find the actual User document for this patient
    // The patient record contains the email, so we find the user by email and role
    const patientUser = await User.findOne({
      email: patientRecord.email,
      role: 'patient'
    });

    if (!patientUser) {
      return res.status(404).json({
        success: false,
        message: 'Patient user account not found'
      });
    }

    // Create the medication using the actual User's _id
    const medication = new Medication({
      name: medicationData.name,
      dosage: medicationData.dosage,
      dosageUnit: medicationData.dosageUnit,
      frequency: medicationData.frequency,
      timingRelation: medicationData.timingRelation,
      totalQuantity: medicationData.quantity, 
      remainingQuantity: medicationData.quantity, 
      expiryDate: medicationData.expiryDate,
      instructions: medicationData.instructions,
      patient: patientUser._id, // This is the correct User _id
      caregiver: caregiverId
    });

    await medication.save();

    const barcodeData = generateShortBarcodeData(medication._id.toString());
    medication.barcodeData = barcodeData;
    await medication.save();

    console.log('Created medication with barcode:', {
      medicationId: medication._id,
      patientUserId: patientUser._id,
      patientEmail: patientUser.email,
      barcodeData: barcodeData
    });

    // Create activity log using the correct patient User _id
    await Activity.create({
      type: 'medication_added',
      patient: patientUser._id, // Correct User _id
      caregiver: caregiverId,
      medication: medication._id,
      message: `New medication ${medication.name} added for ${patientRecord.name}`,
      priority: 'low'
    });

    res.status(201).json({
      success: true,
      message: 'Medication added successfully',
      data: {
        medicationId: medication._id,
        patientUserId: patientUser._id,
        patientName: patientRecord.name,
        barcodeData: medication.barcodeData
      }
    });

  } catch (error) {
    console.error('Add medication error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add medication',
      error: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
    });
  }
};

// Add new patient
export const addPatient = async (req: AuthRequest, res: Response) => {
  try {
    const caregiverId = req.user._id;
    const patientData = req.body;

    // Check if patient already exists with this email
    const existingPatient = await Patient.findOne({ email: patientData.email });
    if (existingPatient) {
      return res.status(400).json({
        success: false,
        message: 'Patient already exists with this email'
      });
    }

    // Create new patient
    const patient = new Patient({
      ...patientData,
      caregiver: caregiverId
    });

    await patient.save();

    // Create activity log
    await Activity.create({
      type: 'medication_added',
      patient: patient._id,
      caregiver: caregiverId,
      message: `New patient ${patient.name} added to your care`,
      priority: 'low'
    });

    res.status(201).json({
      success: true,
      message: 'Patient added successfully',
      data: patient
    });

  } catch (error) {
    console.error('Add patient error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add patient'
    });
  }
};

// Delete medication
export const deleteMedication = async (req: AuthRequest, res: Response) => {
  try {
    const { medicationId } = req.params;
    const caregiverId = req.user._id;

    // Validate medication ID
    if (!mongoose.Types.ObjectId.isValid(medicationId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid medication ID'
      });
    }

    // Find and delete medication (ensure it belongs to this caregiver)
    const medication = await Medication.findOneAndDelete({
      _id: medicationId,
      caregiver: caregiverId
    });

    if (!medication) {
      return res.status(404).json({
        success: false,
        message: 'Medication not found'
      });
    }

    // Create activity log
    const patient = await Patient.findById(medication.patient);
    if (patient) {
      await Activity.create({
        type: 'medication_added', // You might want to add 'medication_deleted' type
        patient: medication.patient,
        caregiver: caregiverId,
        message: `Medication ${medication.name} removed for ${patient.name}`,
        priority: 'low'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Medication deleted successfully'
    });

  } catch (error) {
    console.error('Delete medication error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete medication'
    });
  }
};

// Get barcodes
export const getBarcodes = async (req: AuthRequest, res: Response) => {
  try {
    const caregiverId = req.user._id;

    const medications = await Medication.find({
      caregiver: caregiverId
    }).sort({ createdAt: -1 });

    console.log(`Found ${medications.length} medications for caregiver ${caregiverId}`);

    const barcodes = [];

    for (const med of medications) {
      let patientUser = null;
      let patientName = 'Unknown Patient';

      try {
        await med.populate('patient', 'name email');
        
        if (med.patient && (med.patient as any).name) {
          patientUser = med.patient as any;
          patientName = patientUser.name;
          console.log(`✅ Found User directly for medication ${med._id}: ${patientName}`);
        } else {
          console.log(`⚠️ Patient User not found directly for medication ${med._id}, trying Patient relationship...`);
          
          const patientRelationships = await Patient.find({ caregiver: caregiverId });
          
          for (const relationship of patientRelationships) {
            const userWithEmail = await User.findOne({ 
              email: relationship.email, 
              role: 'patient' 
            });
            
            if (userWithEmail) {
              console.log(`🔄 Updating medication ${med._id} to point to User ${userWithEmail._id}`);
              await Medication.findByIdAndUpdate(med._id, { 
                patient: userWithEmail._id 
              });
              
              patientUser = userWithEmail;
              patientName = userWithEmail.name;
              break;
            }
          }
        }

        if (patientUser) {
          barcodes.push({
            id: med._id,
            patientId: patientUser._id,
            patientName: patientName,
            medicationName: med.name,
            dosage: `${med.dosage} ${med.dosageUnit}`,
            frequency: `${med.frequency}x daily`,
            timingRelation: med.timingRelation.replace('_', ' '),
            barcodeData: med.barcodeData,
            createdAt: med.createdAt,
            downloadCount: 0
          });
          console.log(`✅ Added barcode for ${patientName}: ${med.name}`);
        } else {
          console.warn(`❌ Could not find patient for medication ${med._id}: ${med.name}`);
        }

      } catch (error) {
        console.error(`Error processing medication ${med._id}:`, error);
      }
    }

    console.log(`Returning ${barcodes.length} barcodes`);

    res.status(200).json({
      success: true,
      data: barcodes
    });

  } catch (error) {
    console.error('Get barcodes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get barcodes'
    });
  }
};

// Get notifications for caregiver
export const getNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const caregiverId = req.user._id;
    const { type, read } = req.query;

    // Build query for activities that are caregiver notifications
    let query: any = { caregiver: caregiverId };
    
    if (type) {
      query.type = type;
    }
    
    if (read !== undefined) {
      query.isRead = read === 'true';
    }

    // Get activities as notifications
    const activities = await Activity.find(query)
      .populate('patient', 'name email')
      .populate('medication', 'name')
      .sort({ createdAt: -1 })
      .limit(50);

    const notifications = activities.map(activity => ({
      id: activity._id,
      type: activity.type,
      title: getCaregiverNotificationTitle(activity.type),
      message: activity.message,
      isRead: activity.isRead,
      priority: activity.priority,
      createdAt: activity.createdAt,
      data: activity.metadata,
      patient: activity.patient ? {
        id: (activity.patient as any)._id,
        name: (activity.patient as any).name,
        email: (activity.patient as any).email
      } : undefined
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
    console.error('Get caregiver notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get notifications'
    });
  }
};

// Mark notification as read for caregiver
export const markNotificationAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const { notificationId } = req.params;
    const caregiverId = req.user._id;

    // Update activity as read, but only if it belongs to this caregiver
    const activity = await Activity.findOneAndUpdate(
      { _id: notificationId, caregiver: caregiverId },
      { isRead: true },
      { new: true }
    );

    if (!activity) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.status(200).json({
      success: true
    });

  } catch (error) {
    console.error('Mark caregiver notification as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read'
    });
  }
};

// Mark all notifications as read for caregiver
export const markAllNotificationsAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const caregiverId = req.user._id;

    await Activity.updateMany(
      { caregiver: caregiverId },
      { isRead: true }
    );

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read'
    });

  } catch (error) {
    console.error('Mark all caregiver notifications as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark all notifications as read'
    });
  }
};

// Get notification count for caregiver dashboard/navbar
export const getNotificationCount = async (req: AuthRequest, res: Response) => {
  try {
    const caregiverId = req.user._id;

    const unreadCount = await Activity.countDocuments({
      caregiver: caregiverId,
      isRead: false
    });

    res.status(200).json({
      success: true,
      data: {
        unreadCount
      }
    });

  } catch (error) {
    console.error('Get caregiver notification count error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get notification count'
    });
  }
};

// Helper function for caregiver notification titles
const getCaregiverNotificationTitle = (type: string): string => {
  switch (type) {
    case 'dose_taken': return 'Patient Took Medication';
    case 'dose_missed': return 'Patient Missed Dose';
    case 'low_stock': return 'Low Medication Stock';
    case 'sos_alert': return 'Emergency Alert from Patient';
    case 'medication_added': return 'New Medication Added';
    default: return 'Notification';
  }
};

// Search existing patients by email or phone
export const searchExistingPatients = async (req: AuthRequest, res: Response) => {
  try {
    const { search } = req.query;
    const caregiverId = req.user._id;

    if (!search) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const existingPatientEmails = await Patient.distinct('email', { caregiver: caregiverId });

    const patients = await User.find({
      role: 'patient',
      email: { $nin: existingPatientEmails },
      $or: [
        { email: { $regex: search as string, $options: 'i' } },
        { phoneNumber: { $regex: search as string, $options: 'i' } }
      ]
    }).select('name email phoneNumber age gender updatedAt').limit(5);

    res.status(200).json({
      success: true,
      data: patients.map(patient => ({
        id: patient._id,
        name: patient.name,
        email: patient.email,
        phoneNumber: patient.phoneNumber,
        age: patient.age,
        gender: patient.gender,
        lastSeen: patient.updatedAt
      }))
    });

  } catch (error) {
    console.error('Search existing patients error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search patients'
    });
  }
};

// Send OTP to patient for caregiver addition
export const sendPatientOTP = async (req: AuthRequest, res: Response) => {
  try {
    const { patientId } = req.body;
    const caregiverId = req.user._id;

    // Find the patient user
    const patientUser = await User.findById(patientId);
    if (!patientUser || patientUser.role !== 'patient') {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Check if patient is already under this caregiver
    const existingPatient = await Patient.findOne({
      email: patientUser.email,
      caregiver: caregiverId
    });

    if (existingPatient) {
      return res.status(400).json({
        success: false,
        message: 'Patient is already under your care'
      });
    }

    // Generate OTP and save to user
    const otp = generateOTP();
    const otpExpires = generateOTPExpiry();

    patientUser.otp = otp;
    patientUser.otpExpires = otpExpires;
    await patientUser.save();

    // Send OTP email
    await emailService.sendPatientAdditionOTP(
      patientUser.email, 
      otp, 
      req.user.name, 
      patientUser.name
    );

    res.status(200).json({
      success: true,
      message: 'OTP sent to patient email',
      patientEmail: patientUser.email
    });

  } catch (error) {
    console.error('Send patient OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP'
    });
  }
};

// Verify OTP and add patient to caregiver
export const verifyPatientOTP = async (req: AuthRequest, res: Response) => {
  try {
    const { patientId, otp } = req.body;
    const caregiverId = req.user._id;

    // Find patient user with OTP
    const patientUser = await User.findById(patientId).select('+otp +otpExpires');
    if (!patientUser) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Verify OTP logic...
    if (!patientUser.otp || !patientUser.otpExpires) {
      return res.status(400).json({
        success: false,
        message: 'No OTP found. Please request a new one.'
      });
    }

    if (isOTPExpired(patientUser.otpExpires)) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.'
      });
    }

    if (patientUser.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      });
    }

    const patient = new Patient({
      name: patientUser.name,
      email: patientUser.email,
      age: patientUser.age,
      gender: patientUser.gender,
      phoneNumber: patientUser.phoneNumber,
      caregiver: caregiverId
    });

    await patient.save();

    // Clear OTP
    patientUser.otp = undefined;
    patientUser.otpExpires = undefined;
    await patientUser.save();

    // FIXED: Create activity log with User ID, not Patient record ID
    await Activity.create({
      type: 'patient_added',
      patient: patientUser._id,
      caregiver: caregiverId,
      message: `Patient ${patient.name} added to your care`,
      priority: 'low'
    });

    res.status(201).json({
      success: true,
      message: 'Patient added successfully',
      data: patient
    });

  } catch (error) {
    console.error('Verify patient OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP and add patient'
    });
  }
};

// Remove patient from caregiver list
export const removePatient = async (req: AuthRequest, res: Response) => {
  try {
    const { patientId } = req.params;
    const caregiverId = req.user._id;

    // Find the patient relationship record
    const patientRecord = await Patient.findOne({
      _id: patientId,
      caregiver: caregiverId
    });

    if (!patientRecord) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // FIXED: Find the actual User account to get the correct User ID
    const patientUser = await User.findOne({
      email: patientRecord.email,
      role: 'patient'
    });

    if (patientUser) {
      // Remove medications for this patient-caregiver relationship
      await Medication.deleteMany({ 
        patient: patientUser._id,  // Use User ID, not Patient record ID
        caregiver: caregiverId 
      });

      // Remove activities for this patient-caregiver relationship
      await Activity.deleteMany({ 
        patient: patientUser._id,  // Use User ID, not Patient record ID
        caregiver: caregiverId 
      });
    }

    // Remove the patient relationship record
    await Patient.findByIdAndDelete(patientId);

    res.status(200).json({
      success: true,
      message: 'Patient removed successfully from your care list.'
    });

  } catch (error) {
    console.error('Remove patient error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove patient'
    });
  }
};