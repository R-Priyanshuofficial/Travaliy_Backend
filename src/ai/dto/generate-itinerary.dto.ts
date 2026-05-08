import { IsString, IsInt, IsOptional, IsDateString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateItineraryDto {
  @ApiProperty({ example: 'Ahmedabad', description: 'Starting location' })
  @IsString()
  source: string;

  @ApiProperty({ example: 'Manali', description: 'Travel destination' })
  @IsString()
  destination: string;

  @ApiProperty({ example: '2026-06-10', description: 'Trip start date (YYYY-MM-DD)' })
  @IsDateString()
  start_date: string;

  @ApiProperty({ example: '2026-06-15', description: 'Trip end date (YYYY-MM-DD)' })
  @IsDateString()
  end_date: string;

  @ApiProperty({ example: 'couple', description: 'Type of trip: solo, couple, family, group' })
  @IsString()
  trip_type: string;

  @ApiPropertyOptional({ example: 0, description: 'Number of people in group' })
  @IsOptional()
  @IsInt()
  @Min(0)
  group_people?: number;

  @ApiPropertyOptional({ example: 1, description: 'Number of couple pairs' })
  @IsOptional()
  @IsInt()
  @Min(0)
  couple_pairs?: number;

  @ApiProperty({ example: 'romantic', description: 'Mood of the trip: romantic, adventure, relaxing, etc.' })
  @IsString()
  trip_mood: string;

  @ApiProperty({ example: 'veg', description: 'Food preference: veg, non-veg, both' })
  @IsString()
  food_pref: string;

  @ApiProperty({ example: 'train', description: 'Preferred transport: train, flight, bus, car' })
  @IsString()
  transport_pref: string;

  @ApiProperty({ example: 'medium', description: 'Budget level: low, medium, high, luxury' })
  @IsString()
  budget: string;
}
