import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TripService } from './trip.service';
import { SaveTripDto } from './dto';

@ApiTags('Trip')
@ApiBearerAuth()
@Controller('trip')
@UseGuards(JwtAuthGuard)
export class TripController {
  constructor(private readonly tripService: TripService) {}

  // ─── POST /trip/save ──────────────────────────────────────────────

  @Post('save')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Save an AI-generated itinerary as a trip' })
  @ApiResponse({ status: 201, description: 'Trip saved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async saveTrip(@Req() req: any, @Body() dto: SaveTripDto) {
    return this.tripService.saveTrip(req.user.id, dto);
  }

  // ─── GET /trip/my-trips ───────────────────────────────────────────

  @Get('my-trips')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all trips of the logged-in user' })
  @ApiResponse({ status: 200, description: 'Trips retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMyTrips(@Req() req: any) {
    return this.tripService.getMyTrips(req.user.id);
  }

  // ─── GET /trip/:id ────────────────────────────────────────────────

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a single trip by ID (own trips only)' })
  @ApiParam({ name: 'id', description: 'Trip ID' })
  @ApiResponse({ status: 200, description: 'Trip retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — not your trip' })
  @ApiResponse({ status: 404, description: 'Trip not found' })
  async getTripById(@Req() req: any, @Param('id') id: string) {
    return this.tripService.getTripById(req.user.id, id);
  }

  // ─── DELETE /trip/:id ─────────────────────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a trip by ID (own trips only)' })
  @ApiParam({ name: 'id', description: 'Trip ID' })
  @ApiResponse({ status: 200, description: 'Trip deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — not your trip' })
  @ApiResponse({ status: 404, description: 'Trip not found' })
  async deleteTrip(@Req() req: any, @Param('id') id: string) {
    return this.tripService.deleteTrip(req.user.id, id);
  }
}
