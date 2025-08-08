import express from 'express';
import {
  loginUser,
  signupUser,
  verifyOTP,
  resendOTP,
  forgotPassword,
  resetPassword,
  getCurrentUser,
  logoutUser,
  updateProfile,
  changePassword,
  deleteAccount
} from '../controllers/authController';
import {
  loginValidation,
  signupValidation,
  otpValidation,
  forgotPasswordValidation,
  resetPasswordValidation
} from '../middleware/validation';
import { handleValidationErrors } from '../middleware/errorHandler';
import { authenticateToken } from '../middleware/auth';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later'
  }
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 OTP requests per windowMs
  message: {
    success: false,
    message: 'Too many OTP requests, please try again later'
  }
});

// Public routes
router.post('/login', authLimiter, loginValidation, handleValidationErrors, loginUser);
router.post('/signup', authLimiter, signupValidation, handleValidationErrors, signupUser);
router.post('/verify-otp', otpLimiter, otpValidation, handleValidationErrors, verifyOTP);
router.post('/resend-otp', otpLimiter, forgotPasswordValidation, handleValidationErrors, resendOTP);
router.post('/forgot-password', otpLimiter, forgotPasswordValidation, handleValidationErrors, forgotPassword);
router.post('/reset-password', authLimiter, resetPasswordValidation, handleValidationErrors, resetPassword);

// Protected routes
router.use(authenticateToken); // All routes below require authentication

router.get('/me', getCurrentUser);
router.post('/logout', logoutUser);
router.patch('/profile', updateProfile);
router.post('/change-password', changePassword);
router.delete('/account', deleteAccount);

export default router;