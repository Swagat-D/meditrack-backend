import { body, query, param, ValidationChain } from 'express-validator';

// Patient validation for adding new patient
export const patientValidation: ValidationChain[] = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name can only contain letters and spaces'),
  
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('age')
    .isInt({ min: 1, max: 150 })
    .withMessage('Age must be between 1 and 150'),
  
  body('gender')
    .isIn(['male', 'female', 'other', 'prefer_not_to_say'])
    .withMessage('Please select a valid gender'),
  
  body('phoneNumber')
    .matches(/^[\+]?[1-9][\d]{0,15}$/)
    .withMessage('Please provide a valid phone number'),

  // Optional fields
  body('emergencyContact.name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Emergency contact name must be between 2 and 50 characters'),
  
  body('emergencyContact.relationship')
    .optional()
    .trim()
    .isLength({ min: 2, max: 30 })
    .withMessage('Relationship must be between 2 and 30 characters'),
  
  body('emergencyContact.phoneNumber')
    .optional()
    .matches(/^[\+]?[1-9][\d]{0,15}$/)
    .withMessage('Please provide a valid emergency contact phone number'),

  body('medicalHistory')
    .optional()
    .isArray()
    .withMessage('Medical history must be an array'),
  
  body('medicalHistory.*')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Each medical history item must be between 2 and 100 characters'),

  body('allergies')
    .optional()
    .isArray()
    .withMessage('Allergies must be an array'),
  
  body('allergies.*')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Each allergy item must be between 2 and 50 characters')
];

// Medication validation for adding new medication
export const medicationValidation: ValidationChain[] = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Medication name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z0-9\s\-\.]+$/)
    .withMessage('Medication name can only contain letters, numbers, spaces, hyphens, and periods'),
  
  body('dosage')
    .matches(/^\d+(\.\d+)?$/)
    .withMessage('Please enter a valid dosage (e.g., 500, 2.5)')
    .isFloat({ min: 0.1, max: 10000 })
    .withMessage('Dosage must be between 0.1 and 10000'),
  
  body('dosageUnit')
    .isIn(['mg', 'g', 'ml', 'tablets', 'capsules', 'drops', 'puffs', 'units'])
    .withMessage('Please select a valid dosage unit'),
  
  body('frequency')
    .isInt({ min: 1, max: 6 })
    .withMessage('Frequency must be between 1 and 6 times daily'),
  
  body('timingRelation')
    .isIn(['before_food', 'after_food', 'with_food', 'empty_stomach', 'anytime'])
    .withMessage('Please select a valid timing relation'),
  
  body('quantity')
    .isInt({ min: 1, max: 1000 })
    .withMessage('Quantity must be between 1 and 1000'),
  
  body('expiryDate')
    .isISO8601()
    .toDate()
    .withMessage('Please provide a valid expiry date')
    .custom((value) => {
      if (new Date(value) <= new Date()) {
        throw new Error('Expiry date must be in the future');
      }
      return true;
    }),

  body('instructions')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Instructions cannot exceed 500 characters')
];

// Search validation for patient search
export const searchValidation: ValidationChain[] = [
  query('search')
    .trim()
    .isLength({ min: 3 })
    .withMessage('Search query must be at least 3 characters')
    .custom((value) => {
      // Check if it's a valid email or phone number
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
      
      if (!emailRegex.test(value) && !phoneRegex.test(value.replace(/\s+/g, ''))) {
        throw new Error('Search must be a valid email address or phone number');
      }
      return true;
    })
];

// Patient ID validation
export const patientIdValidation: ValidationChain[] = [
  param('patientId')
    .isMongoId()
    .withMessage('Invalid patient ID format')
];

// OTP validation for patient addition
export const patientOTPValidation: ValidationChain[] = [
  body('patientId')
    .isMongoId()
    .withMessage('Invalid patient ID format'),
  
  body('otp')
    .optional()
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('OTP must be a 6-digit number')
];

// Query parameter validation for patient listing
export const patientQueryValidation: ValidationChain[] = [
  query('search')
    .optional()
    .trim()
    .isLength({ min: 1 })
    .withMessage('Search query cannot be empty'),
  
  query('status')
    .optional()
    .isIn(['all', 'active', 'inactive', 'critical'])
    .withMessage('Status must be one of: all, active, inactive, critical'),
  
  query('sortBy')
    .optional()
    .isIn(['name', 'email', 'status', 'adherenceRate', 'lastActivity', 'createdAt'])
    .withMessage('Invalid sort field'),
  
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc')
];

// Medication ID validation
export const medicationIdValidation: ValidationChain[] = [
  param('medicationId')
    .isMongoId()
    .withMessage('Invalid medication ID format')
];

// Update medication validation
export const updateMedicationValidation: ValidationChain[] = [
  body('status')
    .optional()
    .isIn(['active', 'paused', 'completed'])
    .withMessage('Status must be one of: active, paused, completed'),
  
  body('remainingQuantity')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Remaining quantity must be a non-negative integer'),
  
  body('instructions')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Instructions cannot exceed 500 characters')
];

// Batch operations validation
export const batchValidation: ValidationChain[] = [
  body('ids')
    .isArray({ min: 1, max: 20 })
    .withMessage('Must provide 1-20 IDs for batch operation'),
  
  body('ids.*')
    .isMongoId()
    .withMessage('All IDs must be valid MongoDB ObjectIds'),
  
  body('action')
    .isIn(['download', 'print', 'delete'])
    .withMessage('Action must be one of: download, print, delete')
];