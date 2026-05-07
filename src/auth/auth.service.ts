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
  private readonly OTP_EXPIRY_MINUTES = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  // ─── Login ───────────────────────────────────────────────────────────

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isVerified) {
      throw new BadRequestException('Please verify your email first');
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

  // ─── Send OTP (For Signup) ───────────────────────────────────────────

  async sendOtp(dto: SendOtpDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new BadRequestException('User already exists');
    }

    // Rate limiting check
    await this.checkOtpRateLimit(dto.email);

    const otpCode = this.generateOtp();
    await this.storeOtp(dto.email, otpCode);
    await this.emailService.sendOtpEmail(dto.email, otpCode);

    return {
      success: true,
      message: 'OTP sent successfully to your email',
    };
  }

  // ─── Verify OTP & Complete Signup ────────────────────────────────────

  async verifyOtp(dto: VerifyOtpDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new BadRequestException('User already exists');
    }

    // Validate OTP (throws if invalid/expired)
    await this.validateOtp(dto.email, dto.otp);

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    // Create User in DB
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: hashedPassword,
        isVerified: true,
      },
    });

    // Delete used OTP
    await this.prisma.otp.deleteMany({
      where: { email: dto.email },
    });

    this.logger.log(`New user registered: ${user.email}`);

    return {
      success: true,
      message: 'Registration and email verification successful',
      user: this.excludePassword(user),
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
    await this.checkOtpRateLimit(dto.email);

    const otpCode = this.generateOtp();
    await this.storeOtp(dto.email, otpCode);
    await this.emailService.sendOtpEmail(dto.email, otpCode);

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

    await this.validateOtp(dto.email, dto.otp);

    const hashedPassword = await bcrypt.hash(dto.newPassword, this.SALT_ROUNDS);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    // Delete used OTP
    await this.prisma.otp.deleteMany({
      where: { email: dto.email },
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
   * Deletes any previous OTPs for the email before creating a new one.
   */
  private async storeOtp(email: string, otp: string): Promise<void> {
    // Delete any existing OTPs for this email to keep only the latest
    await this.prisma.otp.deleteMany({
      where: { email },
    });

    // Hash the OTP before storing (security: OTP not readable in DB)
    const hashedOtp = await bcrypt.hash(otp, this.SALT_ROUNDS);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.OTP_EXPIRY_MINUTES);

    await this.prisma.otp.create({
      data: {
        otp: hashedOtp,
        expiresAt,
        email,
      },
    });
  }

  /**
   * Validate an OTP against the database using bcrypt.compare.
   * Throws BadRequestException if OTP is invalid or expired.
   */
  private async validateOtp(email: string, otp: string): Promise<void> {
    const otpRecord = await this.prisma.otp.findFirst({
      where: { email },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new BadRequestException('Invalid OTP');
    }

    // Check expiry first
    if (new Date() > otpRecord.expiresAt) {
      await this.prisma.otp.delete({ where: { id: otpRecord.id } });
      throw new BadRequestException('OTP expired');
    }

    // Compare submitted OTP with hashed OTP in database
    const isValid = await bcrypt.compare(otp, otpRecord.otp);

    if (!isValid) {
      throw new BadRequestException('Invalid OTP');
    }
  }

  /**
   * Database rate limiter: max 1 OTP request per email per 60 seconds.
   */
  private async checkOtpRateLimit(email: string): Promise<void> {
    const lastOtp = await this.prisma.otp.findFirst({
      where: { email },
      orderBy: { createdAt: 'desc' },
    });

    if (lastOtp) {
      const timeSinceLastOtp = Date.now() - lastOtp.createdAt.getTime();
      if (timeSinceLastOtp < 60000) { // 60 seconds
        throw new BadRequestException('Please wait before requesting OTP again');
      }
    }
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
    profileImage: string | null;
    createdAt: Date;
  }) {
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}
