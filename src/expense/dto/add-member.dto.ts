import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddMemberDto {
  @ApiProperty({ example: 'group_cuid_here', description: 'Expense group ID' })
  @IsString()
  groupId: string;

  @ApiProperty({ example: 'user_cuid_here', description: 'User ID to add as member' })
  @IsString()
  userId: string;
}
