import { IsString, IsNumber, IsOptional, IsArray, Min, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddExpenseDto {
  @ApiProperty({ example: 'group_cuid_here', description: 'Expense group ID' })
  @IsString()
  groupId: string;

  @ApiProperty({ example: 'Hotel Booking', description: 'Expense title' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: '3 nights hotel stay in Manali', description: 'Expense description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 12000, description: 'Total expense amount' })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({
    example: 'hotel',
    description: 'Expense category',
    enum: ['hotel', 'food', 'transport', 'activities', 'shopping', 'other'],
  })
  @IsString()
  @IsIn(['hotel', 'food', 'transport', 'activities', 'shopping', 'other'])
  category: string;

  @ApiProperty({ example: 'user_cuid_here', description: 'User ID of the person who paid' })
  @IsString()
  paidByUserId: string;

  @ApiProperty({
    example: ['user1_id', 'user2_id', 'user3_id', 'user4_id'],
    description: 'Array of user IDs to split the expense among (equal split)',
  })
  @IsArray()
  @IsString({ each: true })
  splitAmongUserIds: string[];
}
