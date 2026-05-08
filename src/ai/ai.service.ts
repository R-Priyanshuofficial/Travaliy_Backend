import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { GenerateItineraryDto } from './dto/generate-itinerary.dto';
import { ReplanItineraryDto } from './dto/replan-itinerary.dto';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  private readonly AI_BASE_URL =
    process.env.AI_ENGINE_URL ||
    'https://travaliy-ai-engine.onrender.com';

  constructor(private readonly httpService: HttpService) {}

  // ─── GENERATE ITINERARY ─────────────────────────────────────────────

  async generateItinerary(dto: GenerateItineraryDto) {
    const url = `${this.AI_BASE_URL}/generate-itinerary`;
    this.logger.log(`Calling AI engine: POST ${url}`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, dto, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 120_000, // 2 minutes — AI generation can be slow
        }),
      );

      return {
        success: true,
        message: 'Itinerary generated successfully',
        data: response.data,
      };
    } catch (error) {
      this.handleAiError(error, 'generate itinerary');
    }
  }

  // ─── REPLAN ITINERARY ───────────────────────────────────────────────

  async replanItinerary(dto: ReplanItineraryDto) {
    const url = `${this.AI_BASE_URL}/replan-itinerary`;
    this.logger.log(`Calling AI engine: POST ${url}`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, dto, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 120_000,
        }),
      );

      return {
        success: true,
        message: 'Itinerary replanned successfully',
        data: response.data,
      };
    } catch (error) {
      this.handleAiError(error, 'replan itinerary');
    }
  }

  // ─── ERROR HANDLER ──────────────────────────────────────────────────

  private handleAiError(error: any, operation: string): never {
    // Axios timeout
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      this.logger.error(`AI engine timeout during ${operation}`);
      throw new HttpException(
        {
          success: false,
          message:
            'AI service is taking too long to respond. Please try again.',
          error: 'AI_TIMEOUT',
        },
        HttpStatus.GATEWAY_TIMEOUT,
      );
    }

    // Axios network error (service down, DNS failure, etc.)
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      this.logger.error(`AI engine unreachable during ${operation}`);
      throw new HttpException(
        {
          success: false,
          message:
            'AI service is currently unavailable. Please try again later.',
          error: 'AI_UNAVAILABLE',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // AI engine returned an HTTP error response
    if (error.response) {
      const status = error.response.status || HttpStatus.BAD_GATEWAY;
      const aiMessage =
        error.response.data?.detail ||
        error.response.data?.message ||
        'AI engine returned an error';

      this.logger.error(
        `AI engine error during ${operation}: ${status} — ${aiMessage}`,
      );

      throw new HttpException(
        {
          success: false,
          message: `AI service error: ${aiMessage}`,
          error: 'AI_ENGINE_ERROR',
        },
        status >= 500 ? HttpStatus.BAD_GATEWAY : status,
      );
    }

    // Catch-all for unexpected errors
    this.logger.error(
      `Unexpected error during ${operation}: ${error.message}`,
    );
    throw new HttpException(
      {
        success: false,
        message:
          'An unexpected error occurred while communicating with the AI service.',
        error: 'AI_UNKNOWN_ERROR',
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
