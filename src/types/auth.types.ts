import { Document } from 'mongoose';

export interface IUser extends Document {
  _id: string;
  email: string;
  name: string;
  password: string;
  role: UserRole;
  age?: number;
  gender?: Gender;
  phoneNumber?: string;
  isEmailVerified: boolean;
  otp?: string;
  otpExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
  
  // Methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  generateAuthToken(): string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  role: UserRole;
}

export interface SignupData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  age: number;
  gender: Gender;
  phoneNumber: string;
  role: UserRole;
}

export interface OTPVerification {
  email: string;
  otp: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    age?: number;
    gender?: Gender;
    phoneNumber?: string;
    isEmailVerified: boolean;
    createdAt: string;
    updatedAt: string;
  };
  token: string;
}

export type UserRole = 'caregiver' | 'patient';

export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say';

export interface ForgotPasswordData {
  email: string;
}

export interface ResetPasswordData {
  email: string;
  otp: string;
  newPassword: string;
  confirmPassword: string;
}

export interface JWTPayload {
  id: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}