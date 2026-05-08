import { IsString, IsObject, IsInt, IsBoolean, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReplanItineraryDto {
  @ApiProperty({ description: 'The original full itinerary object to be replanned' })
  @IsObject()
  old_itinerary: Record<string, any>;

  @ApiProperty({
    example: 'Train delayed. I will reach Manali at 3 PM instead of 8 AM.',
    description: 'Reason for replanning',
  })
  @IsString()
  reason: string;

  @ApiProperty({ example: '2026-05-12', description: 'The date affected by the change' })
  @IsString()
  affected_date: string;

  @ApiProperty({ example: 1, description: 'The day number affected (1-indexed)' })
  @IsInt()
  @Min(1)
  affected_day: number;

  @ApiProperty({ example: '03:00 PM', description: 'Current time at the moment of replanning' })
  @IsString()
  current_time: string;

  @ApiProperty({ example: 'Chandigarh Railway Station', description: 'Current location of the user' })
  @IsString()
  current_location: string;

  @ApiProperty({
    example: 'from_this_day_onward',
    description: 'Scope of replan: from_this_day_onward, only_this_day',
  })
  @IsString()
  replan_type: string;

  @ApiPropertyOptional({ example: true, description: 'Keep the same places in the plan' })
  @IsOptional()
  @IsBoolean()
  keep_same_places?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Include places that were missed' })
  @IsOptional()
  @IsBoolean()
  include_missed_places?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Suggest nearby alternative places' })
  @IsOptional()
  @IsBoolean()
  suggest_nearby_places?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Avoid long travel segments' })
  @IsOptional()
  @IsBoolean()
  avoid_long_travel?: boolean;

  @ApiPropertyOptional({
    example: 'Keep trip relaxing because we are tired.',
    description: 'Any special requests for the replan',
  })
  @IsOptional()
  @IsString()
  special_request?: string;
}
