import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  @IsNotEmpty({ message: 'OTP code is required' })
  code!: string;
}
