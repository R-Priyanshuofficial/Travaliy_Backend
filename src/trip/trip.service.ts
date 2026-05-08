import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SaveTripDto } from './dto/save-trip.dto';

@Injectable()
export class TripService {
  private readonly logger = new Logger(TripService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── SAVE TRIP ──────────────────────────────────────────────────────

  async saveTrip(userId: string, dto: SaveTripDto) {
    this.logger.log(`Saving trip for user ${userId}`);

    const trip = await this.prisma.trip.create({
      data: {
        userId,
        source: dto.source,
        destination: dto.destination,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        tripMood: dto.tripMood,
        budget: dto.budget,
        itineraryData: dto.itineraryData,
      },
    });

    return {
      success: true,
      message: 'Trip saved successfully',
      data: trip,
    };
  }

  // ─── GET MY TRIPS ──────────────────────────────────────────────────

  async getMyTrips(userId: string) {
    const trips = await this.prisma.trip.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        source: true,
        destination: true,
        startDate: true,
        endDate: true,
        tripMood: true,
        budget: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      message: 'Trips retrieved successfully',
      data: trips,
    };
  }

  // ─── GET SINGLE TRIP ───────────────────────────────────────────────

  async getTripById(userId: string, tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException({
        success: false,
        message: 'Trip not found',
      });
    }

    if (trip.userId !== userId) {
      throw new ForbiddenException({
        success: false,
        message: 'You do not have access to this trip',
      });
    }

    return {
      success: true,
      message: 'Trip retrieved successfully',
      data: trip,
    };
  }

  // ─── DELETE TRIP ────────────────────────────────────────────────────

  async deleteTrip(userId: string, tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException({
        success: false,
        message: 'Trip not found',
      });
    }

    if (trip.userId !== userId) {
      throw new ForbiddenException({
        success: false,
        message: 'You do not have access to this trip',
      });
    }

    await this.prisma.trip.delete({
      where: { id: tripId },
    });

    return {
      success: true,
      message: 'Trip deleted successfully',
    };
  }
}
