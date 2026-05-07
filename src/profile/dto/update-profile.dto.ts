import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString({ message: 'Name must be a string' })
  @MaxLength(100, { message: 'Name must not exceed 100 characters' })
  name?: string;
}
