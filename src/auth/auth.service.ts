import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../common/services/email.service';
import {
  SignupDto,
  LoginDto,
  SendOtpDto,
  VerifyOtpDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly SALT_ROUNDS = 10;
  private readonly OTP_EXPIRY_MINUTES = 10;
  private readonly MAX_OTP_PER_MINUTE = 3;

  /**
   * In-memory rate limiter: email → [timestamp, timestamp, ...]
   * Tracks OTP request timestamps per email to prevent abuse.
   */
  private readonly otpRateLimit = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  // ─── Signup ──────────────────────────────────────────────────────────

  async signup(dto: SignupDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: hashedPassword,
      },
    });

    // Generate, hash, store, and send OTP
    const otpCode = this.generateOtp();
    await this.storeOtp(user.id, otpCode);
    await this.emailService.sendOtpEmail(user.email, otpCode);

    this.logger.log(`New user registered: ${user.email}`);

    return {
      success: true,
      message: 'User registered successfully. Please verify your email with the OTP sent.',
      user: this.excludePassword(user),
    };
  }

  // ─── Login ───────────────────────────────────────────────────────────

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload = { sub: user.id, email: user.email };
    const token = await this.jwtService.signAsync(payload);

    return {
      success: true,
      message: 'Login successful',
      token,
      user: this.excludePassword(user),
    };
  }

  // ─── Send OTP ────────────────────────────────────────────────────────

  async sendOtp(dto: SendOtpDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new BadRequestException('User with this email does not exist');
    }

    // Rate limiting check
    this.checkOtpRateLimit(dto.email);

    const otpCode = this.generateOtp();
    await this.storeOtp(user.id, otpCode);
    await this.emailService.sendOtpEmail(user.email, otpCode);

    return {
      success: true,
      message: 'OTP sent successfully to your email',
    };
  }

  // ─── Verify OTP ──────────────────────────────────────────────────────

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new BadRequestException('User with this email does not exist');
    }

    await this.validateOtp(user.id, dto.code);

    // Mark user as verified
    await this.prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true },
    });

    // Delete used OTP
    await this.prisma.oTP.deleteMany({
      where: { userId: user.id },
    });

    return {
      success: true,
      message: 'Email verified successfully',
    };
  }

  // ─── Forgot Password ────────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new BadRequestException('User with this email does not exist');
    }

    // Rate limiting check
    this.checkOtpRateLimit(dto.email);

    const otpCode = this.generateOtp();
    await this.storeOtp(user.id, otpCode);
    await this.emailService.sendOtpEmail(user.email, otpCode);

    return {
      success: true,
      message: 'Password reset OTP sent successfully to your email',
    };
  }

  // ─── Reset Password ─────────────────────────────────────────────────

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new BadRequestException('User with this email does not exist');
    }

    await this.validateOtp(user.id, dto.code);

    const hashedPassword = await bcrypt.hash(dto.newPassword, this.SALT_ROUNDS);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    // Delete used OTP
    await this.prisma.oTP.deleteMany({
      where: { userId: user.id },
    });

    return {
      success: true,
      message: 'Password reset successfully',
    };
  }

  // ─── Private Helpers ─────────────────────────────────────────────────

  /**
   * Generate a random 6-digit OTP.
   */
  private generateOtp(): string {
    const otp = Math.floor(100000 + Math.random() * 900000);
    return otp.toString();
  }

  /**
   * Hash the OTP and store it in the database with an expiry window.
   * Deletes any previous OTPs for the user before creating a new one.
   */
  private async storeOtp(userId: string, code: string): Promise<void> {
    // Delete any existing OTPs for this user to keep only the latest
    await this.prisma.oTP.deleteMany({
      where: { userId },
    });

    // Hash the OTP before storing (security: OTP not readable in DB)
    const hashedOtp = await bcrypt.hash(code, this.SALT_ROUNDS);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.OTP_EXPIRY_MINUTES);

    await this.prisma.oTP.create({
      data: {
        code: hashedOtp,
        expiresAt,
        userId,
      },
    });
  }

  /**
   * Validate an OTP against the database using bcrypt.compare.
   * Throws BadRequestException if OTP is invalid or expired.
   */
  private async validateOtp(userId: string, code: string): Promise<void> {
    const otp = await this.prisma.oTP.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new BadRequestException('Invalid OTP');
    }

    // Check expiry first
    if (new Date() > otp.expiresAt) {
      await this.prisma.oTP.delete({ where: { id: otp.id } });
      throw new BadRequestException('OTP has expired. Please request a new one');
    }

    // Compare submitted OTP with hashed OTP in database
    const isValid = await bcrypt.compare(code, otp.code);

    if (!isValid) {
      throw new BadRequestException('Invalid OTP');
    }
  }

  /**
   * Basic rate limiter: max 3 OTP requests per email per minute.
   * Uses an in-memory Map to track request timestamps.
   */
  private checkOtpRateLimit(email: string): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;

    // Get existing timestamps, filter to only those within the last minute
    const timestamps = (this.otpRateLimit.get(email) || []).filter(
      (t) => t > oneMinuteAgo,
    );

    if (timestamps.length >= this.MAX_OTP_PER_MINUTE) {
      throw new BadRequestException(
        'Too many OTP requests. Please wait a minute before trying again.',
      );
    }

    // Record this request
    timestamps.push(now);
    this.otpRateLimit.set(email, timestamps);
  }

  /**
   * Return a user object without the password field.
   */
  private excludePassword(user: {
    id: string;
    name: string;
    email: string;
    password: string;
    isVerified: boolean;
    createdAt: Date;
  }) {
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}
