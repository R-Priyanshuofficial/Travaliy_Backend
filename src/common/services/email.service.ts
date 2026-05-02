import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false, // TLS upgrade happens via STARTTLS
      auth: {
        user: process.env.BREVO_SMTP_USER,
        pass: process.env.BREVO_SMTP_PASS,
      },
    });
  }

  /**
   * Send an OTP verification email to the user.
   */
  async sendOtpEmail(to: string, otp: string): Promise<void> {
    const senderEmail = process.env.SENDER_EMAIL || 'noreply@travaily.com';

    const mailOptions: nodemailer.SendMailOptions = {
      from: `"Travaily" <${senderEmail}>`,
      to,
      subject: 'Your OTP Code — Travaily',
      html: this.buildOtpEmailHtml(otp),
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`✅ OTP email sent to ${to} (messageId: ${info.messageId})`);
    } catch (error) {
      this.logger.error(`❌ Failed to send OTP email to ${to}`, (error as Error).stack);
      throw new InternalServerErrorException(
        'Failed to send OTP email. Please try again later.',
      );
    }
  }

  /**
   * Build a professional HTML email template for the OTP.
   */
  private buildOtpEmailHtml(otp: string): string {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    </head>
    <body style="margin: 0; padding: 0; background-color: #f4f6f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f6f9; padding: 40px 0;">
        <tr>
          <td align="center">
            <table role="presentation" width="420" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); overflow: hidden;">

              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 32px 40px; text-align: center;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">
                    Travaily
                  </h1>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding: 40px;">
                  <h2 style="margin: 0 0 8px 0; color: #1e293b; font-size: 20px; font-weight: 600;">
                    Verification Code
                  </h2>
                  <p style="margin: 0 0 24px 0; color: #64748b; font-size: 14px; line-height: 1.6;">
                    Use the code below to complete your verification. This code is valid for <strong>10 minutes</strong>.
                  </p>

                  <!-- OTP Code -->
                  <div style="background-color: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 24px;">
                    <span style="font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #6366f1; font-family: 'Courier New', monospace;">
                      ${otp}
                    </span>
                  </div>

                  <p style="margin: 0; color: #94a3b8; font-size: 13px; line-height: 1.6;">
                    If you didn't request this code, you can safely ignore this email. Someone might have entered your email address by mistake.
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #f8fafc; padding: 20px 40px; border-top: 1px solid #e2e8f0; text-align: center;">
                  <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                    &copy; ${new Date().getFullYear()} Travaily. All rights reserved.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    `;
  }
}
