import nodemailer from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      const mailOptions = {
        from: `MediTracker <${process.env.EMAIL_USER}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`✅ Email sent successfully to ${options.to}`);
    } catch (error) {
      console.error('❌ Error sending email:', error);
      throw new Error('Failed to send email');
    }
  }

  async sendOTPEmail(email: string, otp: string, purpose: 'signup' | 'forgot_password' = 'signup'): Promise<void> {
    const subject = purpose === 'signup' 
      ? 'MediTracker - Verify Your Account'
      : 'MediTracker - Reset Your Password';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #2563EB 0%, #059669 100%); padding: 20px; text-align: center; color: white;">
          <h1 style="margin: 0; font-size: 28px;">MediTracker</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">Your trusted medication companion</p>
        </div>
        
        <div style="padding: 30px; background: #f8f9fa;">
          <h2 style="color: #1e293b; margin-bottom: 20px;">
            ${purpose === 'signup' ? 'Verify Your Account' : 'Reset Your Password'}
          </h2>
          
          <p style="color: #64748b; line-height: 1.6; margin-bottom: 25px;">
            ${purpose === 'signup' 
              ? 'Thank you for joining MediTracker! Please use the verification code below to complete your account setup.'
              : 'We received a request to reset your password. Please use the verification code below to proceed.'
            }
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <div style="background: white; display: inline-block; padding: 20px 30px; border-radius: 10px; border: 2px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <div style="font-size: 32px; font-weight: bold; color: #2563EB; letter-spacing: 6px; font-family: 'Courier New', monospace;">
                ${otp}
              </div>
            </div>
          </div>
          
          <div style="background: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; padding: 15px; margin: 25px 0;">
            <p style="margin: 0; color: #92400e; font-size: 14px;">
              ⏰ <strong>Important:</strong> This code will expire in 5 minutes for security reasons.
            </p>
          </div>
          
          <p style="color: #64748b; line-height: 1.6; font-size: 14px;">
            If you didn't request this ${purpose === 'signup' ? 'account creation' : 'password reset'}, 
            please ignore this email. Your account remains secure.
          </p>
        </div>
        
        <div style="background: #1e293b; padding: 20px; text-align: center; color: #94a3b8; font-size: 12px;">
          <p style="margin: 0;">© 2024 MediTracker. All rights reserved.</p>
          <p style="margin: 5px 0 0 0;">HIPAA Compliant & Secure</p>
        </div>
      </div>
    `;

    await this.sendEmail({
      to: email,
      subject,
      html,
      text: `Your verification code is: ${otp}. This code will expire in 5 minutes.`
    });
  }

  async sendPatientAdditionOTP(
    patientEmail: string, 
    otp: string, 
    caregiverName: string, 
    patientName: string
  ): Promise<void> {
    const subject = 'MediTracker - Caregiver Addition Request';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #2563EB 0%, #059669 100%); padding: 20px; text-align: center; color: white;">
          <h1 style="margin: 0; font-size: 28px;">MediTracker</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">Caregiver Addition Request</p>
        </div>
        
        <div style="padding: 30px; background: #f8f9fa;">
          <h2 style="color: #1e293b; margin-bottom: 20px;">Hello ${patientName},</h2>
          
          <p style="color: #64748b; line-height: 1.6; margin-bottom: 25px;">
            <strong>${caregiverName}</strong> wants to add you as a patient in their MediTracker account. 
            If you approve this request, please use the verification code below.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <div style="background: white; display: inline-block; padding: 20px 30px; border-radius: 10px; border: 2px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <div style="font-size: 32px; font-weight: bold; color: #2563EB; letter-spacing: 6px; font-family: 'Courier New', monospace;">
                ${otp}
              </div>
            </div>
          </div>
          
          <div style="background: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; padding: 15px; margin: 25px 0;">
            <p style="margin: 0; color: #92400e; font-size: 14px;">
              ⏰ <strong>Important:</strong> This code will expire in 5 minutes. Share this code only with the caregiver you trust.
            </p>
          </div>
          
          <p style="color: #64748b; line-height: 1.6; font-size: 14px;">
            If you didn't expect this request or don't know ${caregiverName}, please ignore this email.
          </p>
        </div>
        
        <div style="background: #1e293b; padding: 20px; text-align: center; color: #94a3b8; font-size: 12px;">
          <p style="margin: 0;">© 2024 MediTracker. All rights reserved.</p>
        </div>
      </div>
    `;

    await this.sendEmail({
      to: patientEmail,
      subject,
      html,
      text: `${caregiverName} wants to add you as a patient. Your verification code is: ${otp}. This code expires in 5 minutes.`
    });
  }
}
export const emailService = new EmailService();