import { IsString, IsDateString, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SaveTripDto {
  @ApiProperty({ example: 'Ahmedabad', description: 'Trip origin city' })
  @IsString()
  source: string;

  @ApiProperty({ example: 'Manali', description: 'Trip destination city' })
  @IsString()
  destination: string;

  @ApiProperty({ example: '2026-06-10', description: 'Trip start date (ISO 8601)' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-06-15', description: 'Trip end date (ISO 8601)' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ example: 'romantic', description: 'Trip mood' })
  @IsOptional()
  @IsString()
  tripMood?: string;

  @ApiPropertyOptional({ example: 'medium', description: 'Budget level' })
  @IsOptional()
  @IsString()
  budget?: string;

  @ApiProperty({
    description: 'Complete AI-generated itinerary JSON object',
    example: { days: [] },
  })
  @IsObject()
  itineraryData: Record<string, any>;
}
