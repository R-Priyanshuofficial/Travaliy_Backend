import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Get Profile ──────────────────────────────────────────────────────

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      success: true,
      user: this.sanitizeUser(user),
    };
  }

  // ─── Update Profile ───────────────────────────────────────────────────

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
    file?: Express.Multer.File,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Build update data dynamically
    const updateData: { name?: string; profileImage?: string } = {};

    if (dto.name !== undefined && dto.name !== null) {
      updateData.name = dto.name.trim();
    }

    if (file) {
      // Validate file type
      const allowedMimeTypes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
      ];

      if (!allowedMimeTypes.includes(file.mimetype)) {
        // Delete uploaded file if invalid
        this.deleteFile(file.path);
        throw new BadRequestException(
          'Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed',
        );
      }

      // Delete old profile image if it exists
      if (user.profileImage) {
        const oldImagePath = this.getLocalPathFromUrl(user.profileImage);
        if (oldImagePath) {
          this.deleteFile(oldImagePath);
        }
      }

      // Generate the URL for the uploaded image
      const baseUrl = process.env.APP_URL || 'http://localhost:3000';
      updateData.profileImage = `${baseUrl}/uploads/profiles/${file.filename}`;
    }

    // Only update if there's something to update
    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException(
        'At least one field (name or image) must be provided',
      );
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    this.logger.log(`Profile updated for user: ${updatedUser.email}`);

    return {
      success: true,
      message: 'Profile updated successfully',
      user: this.sanitizeUser(updatedUser),
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  /**
   * Remove sensitive fields (password) from user object.
   */
  private sanitizeUser(user: {
    id: string;
    name: string;
    email: string;
    password: string;
    isVerified: boolean;
    profileImage: string | null;
    createdAt: Date;
  }) {
    const { password, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Extract the local file path from a stored URL.
   */
  private getLocalPathFromUrl(url: string): string | null {
    try {
      const urlPath = new URL(url).pathname;
      // URL path looks like /uploads/profiles/filename.jpg
      return path.join(process.cwd(), urlPath);
    } catch {
      return null;
    }
  }

  /**
   * Safely delete a file from the filesystem.
   */
  private deleteFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.logger.log(`Deleted old profile image: ${filePath}`);
      }
    } catch (error) {
      this.logger.warn(`Failed to delete file: ${filePath}`, error);
    }
  }
}
