import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiService } from './ai.service';
import { GenerateItineraryDto, ReplanItineraryDto } from './dto';

@ApiTags('AI')
@ApiBearerAuth()
@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  // ─── POST /ai/generate-itinerary ──────────────────────────────────

  @Post('generate-itinerary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a travel itinerary using AI' })
  @ApiResponse({ status: 200, description: 'Itinerary generated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized — invalid or missing JWT' })
  @ApiResponse({ status: 502, description: 'AI engine error' })
  @ApiResponse({ status: 504, description: 'AI engine timeout' })
  async generateItinerary(@Body() dto: GenerateItineraryDto) {
    return this.aiService.generateItinerary(dto);
  }

  // ─── POST /ai/replan-itinerary ────────────────────────────────────

  @Post('replan-itinerary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Replan an existing itinerary using AI' })
  @ApiResponse({ status: 200, description: 'Itinerary replanned successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized — invalid or missing JWT' })
  @ApiResponse({ status: 502, description: 'AI engine error' })
  @ApiResponse({ status: 504, description: 'AI engine timeout' })
  async replanItinerary(@Body() dto: ReplanItineraryDto) {
    return this.aiService.replanItinerary(dto);
  }
}
