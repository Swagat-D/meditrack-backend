import express from 'express';
import {
  getDashboardData,
  getMedications,
  getMedicationDetails,
  logMedicationTaken,
  getMealTimes,
  updateMealTimes,
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  sendSOSAlert,
  getEmergencyContacts,
  getCaregivers,
  requestCaregiverConnection,
  getNotificationSettings,
  updateNotificationSettings,
  exportHealthData,
  getCurrentUser,
  updateProfile,
  addEmergencyContact,
  removeEmergencyContact,
  getRecentActivities,
  checkMedicationTiming
} from '../controllers/patientController';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import { handleValidationErrors } from '../middleware/errorHandler';
import rateLimit from 'express-rate-limit';
import '../models/EmergencyContact';
import '../models/MealTime';

const router = express.Router();

// Rate limiting
const patientLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: 'Too many requests, please try again later'
  }
});

// All routes require authentication and patient role
router.use(authenticateToken);
router.use(authorizeRoles('patient'));
router.use(patientLimiter);

// Dashboard routes
router.get('/dashboard', getDashboardData);

// Medication routes
router.get('/medications', getMedications);
router.get('/medications/:medicationId', getMedicationDetails);
router.post('/medications/:medicationId/log', logMedicationTaken);

// Meal times
router.get('/meal-times', getMealTimes);
router.put('/meal-times', updateMealTimes);

// Notifications
router.get('/notifications', getNotifications);
router.patch('/notifications/:notificationId/read', markNotificationAsRead);
router.patch('/notifications/read-all', markAllNotificationsAsRead);

// SOS/Emergency
router.post('/sos', sendSOSAlert);
router.get('/emergency-contacts', getEmergencyContacts);

// Settings
router.get('/notification-settings', getNotificationSettings);
router.put('/notification-settings', updateNotificationSettings);

// Caregivers
router.get('/caregivers', getCaregivers);
router.post('/caregiver-request', requestCaregiverConnection);

// Data export
router.post('/export-data', exportHealthData);

router.get('/profile', getCurrentUser);
router.put('/profile', updateProfile);
router.post('/emergency-contacts', addEmergencyContact);
router.delete('/emergency-contacts/:contactId', removeEmergencyContact);
router.get('/activities', getRecentActivities);
router.get('/medications/:medicationId/timing-check', checkMedicationTiming);

export default router;