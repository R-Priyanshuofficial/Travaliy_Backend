import { IsString, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SettleExpenseDto {
  @ApiProperty({ example: 'group_cuid_here', description: 'Expense group ID' })
  @IsString()
  groupId: string;

  @ApiProperty({ example: 'user_payer_id', description: 'User ID of the person paying the settlement' })
  @IsString()
  payerUserId: string;

  @ApiProperty({ example: 'user_receiver_id', description: 'User ID of the person receiving the settlement' })
  @IsString()
  receiverUserId: string;

  @ApiProperty({ example: 2400, description: 'Settlement amount' })
  @IsNumber()
  @Min(1)
  amount: number;
}
