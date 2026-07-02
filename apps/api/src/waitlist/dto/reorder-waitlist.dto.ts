import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

import type { ReorderWaitlistRequest } from '@enroll/shared';

export class ReorderWaitlistDto implements ReorderWaitlistRequest {
  @ApiProperty({
    type: [String],
    description:
      'Every WAITLISTED enrollment id for the section in the desired order. Must match the current set exactly.',
  })
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  orderedEnrollmentIds!: string[];
}
