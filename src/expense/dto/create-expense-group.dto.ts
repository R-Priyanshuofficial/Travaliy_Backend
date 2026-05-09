import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateExpenseGroupDto {
  @ApiProperty({ example: 'trip_cuid_here', description: 'Trip ID to link this expense group to' })
  @IsString()
  tripId: string;

  @ApiProperty({ example: 'Manali Expense Group', description: 'Title for the expense group' })
  @IsString()
  title: string;
}
