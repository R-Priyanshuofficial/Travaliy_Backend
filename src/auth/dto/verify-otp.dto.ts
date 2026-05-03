import { IsEmail, IsNotEmpty, IsString, Length, MinLength } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  name!: string;

  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  @IsNotEmpty({ message: 'Password is required' })
  password!: string;

  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  @IsNotEmpty({ message: 'OTP code is required' })
  otp!: string;
}
