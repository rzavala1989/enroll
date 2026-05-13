import { ApiProperty } from '@nestjs/swagger';

export class WaitlistEntryDto {
  @ApiProperty({ description: '1-based position in the waitlist (dense rank).' })
  position!: number;

  @ApiProperty({ format: 'uuid' })
  enrollmentId!: string;

  @ApiProperty({ format: 'uuid' })
  studentId!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty({ description: 'When the student joined the waitlist (ISO 8601).' })
  joinedAt!: string;
}
