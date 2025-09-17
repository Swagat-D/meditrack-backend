import express from 'express';
import {
  getDashboardStats,
  getPatients,
  getPatientDetails,
  addPatient,
  addMedication,
  getBarcodes,
  searchExistingPatients,
  removePatient,
  sendPatientOTP,
  verifyPatientOTP,
  deleteMedication,
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  deleteMultipleNotifications,
  deleteAllNotifications,
  getNotificationCount,
  getPatientEmergencyContacts,
  getPatientMedicationHistory,
} from '../controllers/caregiverController';
import {
  patientValidation,
  medicationValidation,
  searchValidation,
  medicationIdValidation,
} from '../middleware/caregiverValidation';
import { handleValidationErrors } from '../middleware/errorHandler';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limiting for caregiver endpoints
const caregiverLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: {
    success: false,
    message: 'Too many requests, please try again later'
  }
});

// All routes require authentication and caregiver role
router.use(authenticateToken);
router.use(authorizeRoles('caregiver'));
router.use(caregiverLimiter);

// Dashboard routes
router.get('/dashboard/stats', getDashboardStats);

// Patient routes
router.get('/patients', getPatients);
router.get('/patients/search', searchValidation, handleValidationErrors, searchExistingPatients);
router.get('/patients/:patientId', getPatientDetails);
router.post('/patients', patientValidation, handleValidationErrors, addPatient);
router.delete('/patients/:patientId', removePatient);
router.post('/patients/send-otp', sendPatientOTP);
router.post('/patients/verify-otp', verifyPatientOTP);

// Medication routes
router.post('/patients/:patientId/medications', medicationValidation, handleValidationErrors, addMedication);
router.delete('/medications/:medicationId', medicationIdValidation, handleValidationErrors, deleteMedication);

// Barcode routes
router.get('/barcodes', getBarcodes);

//notification routes 
router.get('/notifications', getNotifications);
router.get('/notifications/count', getNotificationCount);
router.patch('/notifications/read-all', markAllNotificationsAsRead);
router.delete('/notifications/delete-multiple', deleteMultipleNotifications);
router.delete('/notifications/delete-all', deleteAllNotifications);
router.patch('/notifications/:notificationId/read', markNotificationAsRead);
router.delete('/notifications/:notificationId', deleteNotification);

//others
router.get('/patients/:patientId/emergency-contacts', getPatientEmergencyContacts);
router.get('/patients/:patientId/medication-history', getPatientMedicationHistory);

export default router;