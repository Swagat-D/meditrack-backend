import { Request, Response } from 'express';
import User from '../models/User';
import { emailService } from '../services/emailService';
import { generateOTP, generateOTPExpiry, isOTPExpired } from '../utils/otpUtils';
import { 
  LoginCredentials, 
  SignupData, 
  OTPVerification, 
  ForgotPasswordData, 
  ResetPasswordData 
} from '../types/auth.types';

interface AuthRequest extends Request {
  user?: any;
}

// Login user
export const loginUser = async (req: Request, res: Response) => {
  try {
    const { email, password, role } = req.body as LoginCredentials;

    // Check if user exists and include password for comparison
    const user = await User.findOne({ email }).select('+password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if role matches
    if (user.role !== role) {
      return res.status(401).json({
        success: false,
        message: 'Invalid role selected'
      });
    }

    // Check password
    const isPasswordMatch = await user.comparePassword(password);
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if email is verified
    if (!user.isEmailVerified) {
      return res.status(401).json({
        success: false,
        message: 'Please verify your email before logging in'
      });
    }

    // Generate token
    const token = user.generateAuthToken();

    // Return user data without password
    const userResponse = user.toJSON();

    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: userResponse,
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
};

// Signup user
export const signupUser = async (req: Request, res: Response) => {
  try {
    const signupData = req.body as SignupData;

    // Check if user already exists
    const existingUser = await User.findOne({ email: signupData.email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpires = generateOTPExpiry();

    // Create user
    const user = new User({
      name: signupData.name,
      email: signupData.email,
      password: signupData.password,
      role: signupData.role,
      age: signupData.age,
      gender: signupData.gender,
      phoneNumber: signupData.phoneNumber,
      otp,
      otpExpires,
      isEmailVerified: false
    });

    await user.save();

    // Send OTP email
    await emailService.sendOTPEmail(user.email, otp, 'signup');

    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please verify your email.',
      user: user.toJSON(),
      otpSent: true
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Signup failed'
    });
  }
};

// Verify OTP
export const verifyOTP = async (req: Request, res: Response) => {
  try {
    const { email, otp, type } = req.body; 

    // Find user with OTP
    const user = await User.findOne({ email }).select('+otp +otpExpires');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if OTP exists
    if (!user.otp || !user.otpExpires) {
      return res.status(400).json({
        success: false,
        message: 'No OTP found. Please request a new one.'
      });
    }

    // Check if OTP is expired
    if (isOTPExpired(user.otpExpires)) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.'
      });
    }

    // Check if OTP matches
    if (user.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      });
    }

    // Handle different OTP verification types
    if (type === 'forgot_password') {
      res.status(200).json({
        success: true,
        message: 'OTP verified successfully. You can now reset your password.'
      });
    } else {
      user.isEmailVerified = true;
      user.otp = undefined;
      user.otpExpires = undefined;
      await user.save();

      const token = user.generateAuthToken();

      res.status(200).json({
        success: true,
        message: 'Email verified successfully',
        user: user.toJSON(),
        token
      });
    }

  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({
      success: false,
      message: 'OTP verification failed'
    });
  }
};

// Resend OTP
export const resendOTP = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified'
      });
    }

    // Generate new OTP
    const otp = generateOTP();
    const otpExpires = generateOTPExpiry();

    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    // Send OTP email
    await emailService.sendOTPEmail(user.email, otp, 'signup');

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      otpSent: true
    });

  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend OTP'
    });
  }
};

// Forgot password
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body as ForgotPasswordData;

    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found with this email'
      });
    }

    // Generate OTP for password reset
    const otp = generateOTP();
    const otpExpires = generateOTPExpiry();

    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    // Send password reset OTP email
    await emailService.sendOTPEmail(user.email, otp, 'forgot_password');

    res.status(200).json({
      success: true,
      message: 'Password reset OTP sent to your email',
      otpSent: true
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send password reset OTP'
    });
  }
};

// Reset password
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, otp, newPassword } = req.body as ResetPasswordData;

    // Find user with OTP
    const user = await User.findOne({ email }).select('+otp +otpExpires +password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if OTP exists
    if (!user.otp || !user.otpExpires) {
      return res.status(400).json({
        success: false,
        message: 'No OTP found. Please request password reset again.'
      });
    }

    // Check if OTP is expired
    if (isOTPExpired(user.otpExpires)) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.'
      });
    }

    // Check if OTP matches
    if (user.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      });
    }

    // Update password and clear OTP
    user.password = newPassword;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Password reset failed'
    });
  }
};

// Get current user
export const getCurrentUser = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    
    res.status(200).json({
      success: true,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user data'
    });
  }
};

// Logout user (client-side token removal)
export const logoutUser = async (req: AuthRequest, res: Response) => {
  try {
    // Since we're using stateless JWT, logout is handled on client-side
    // This endpoint just confirms logout action
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
};

// Update user profile
export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const allowedUpdates = ['name', 'age', 'gender', 'phoneNumber'];
    const updates = Object.keys(req.body);
    const isValidOperation = updates.every(update => allowedUpdates.includes(update));

    if (!isValidOperation) {
      return res.status(400).json({
        success: false,
        message: 'Invalid updates'
      });
    }

    const user = req.user;
    
    updates.forEach(update => {
      user[update] = req.body[update];
    });

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: user.toJSON()
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Profile update failed'
    });
  }
};

// Change password
export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await User.findById(req.user._id).select('+password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check current password
    const isPasswordMatch = await user.comparePassword(currentPassword);
    if (!isPasswordMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Password change failed'
    });
  }
};

// Delete account
export const deleteAccount = async (req: AuthRequest, res: Response) => {
  try {
    const { password } = req.body;

    // Get user with password
    const user = await User.findById(req.user._id).select('+password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify password
    const isPasswordMatch = await user.comparePassword(password);
    if (!isPasswordMatch) {
      return res.status(400).json({
        success: false,
        message: 'Password is incorrect'
      });
    }

    // Delete user
    await User.findByIdAndDelete(req.user._id);

    res.status(200).json({
      success: true,
      message: 'Account deleted successfully'
    });

  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Account deletion failed'
    });
  }
};