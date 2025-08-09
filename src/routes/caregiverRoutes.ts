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
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 50 requests per windowMs
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

export default router;