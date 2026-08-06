import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/** bcrypt hashes the first 72 bytes and silently ignores the rest. */
export const BCRYPT_MAX_PASSWORD_BYTES = 72;

export class LoginDto {
  @ApiProperty({ format: 'email' })
  @IsEmail(
    { allow_display_name: false, require_tld: true },
    { message: 'Valid email required' },
  )
  email!: string;

  @ApiProperty({ minLength: 8, maxLength: BCRYPT_MAX_PASSWORD_BYTES })
  @IsString({ message: 'Password must be a string' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  // Without an upper bound, a 200-character password and its
  // 72-character prefix are the same credential as far as bcrypt is
  // concerned, and the user is never told. Rejecting is honest, and
  // it also caps the work an unauthenticated caller can ask for.
  @MaxLength(BCRYPT_MAX_PASSWORD_BYTES, {
    message: `Password must be at most ${BCRYPT_MAX_PASSWORD_BYTES} characters`,
  })
  password!: string;
}
