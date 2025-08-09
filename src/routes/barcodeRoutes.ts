// Backend: src/routes/barcodeRoutes.ts
import express from 'express';
import {
  getMedicationByBarcode,
  verifyBarcodeAccess,
  getBarcodeStats
} from '../controllers/barcodeController';
import { authenticateToken } from '../middleware/auth';
import { param, ValidationChain } from 'express-validator';
import { handleValidationErrors } from '../middleware/errorHandler';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limiting for barcode scanning
const barcodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 barcode scans per windowMs
  message: {
    success: false,
    message: 'Too many barcode scan attempts, please try again later'
  }
});

// Validation for barcode data
const barcodeValidation: ValidationChain[] = [
  param('barcodeData')
    .trim()
    .isLength({ min: 10, max: 50 })
    .withMessage('Invalid barcode format')
    .matches(/^MT_[A-Z]{1,3}_[A-Z0-9]+_[0-9]+_[A-Z0-9]+$/)
    .withMessage('Invalid MediTracker barcode format')
];

// All routes require authentication
router.use(authenticateToken);
router.use(barcodeLimiter);

// Public barcode scanning routes (accessible by both patients and caregivers)
router.get('/scan/:barcodeData', barcodeValidation, handleValidationErrors, getMedicationByBarcode);
router.get('/verify/:barcodeData', barcodeValidation, handleValidationErrors, verifyBarcodeAccess);

// Caregiver-only routes
router.get('/stats', getBarcodeStats);

export default router;