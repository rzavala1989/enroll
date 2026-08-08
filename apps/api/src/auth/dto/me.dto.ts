import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

class AdvisorSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty()
  email!: string;
}

export class MeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty({ enum: Role, isArray: true })
  roles!: Role[];

  @ApiProperty({ required: false, nullable: true })
  classStanding?: string | null;

  @ApiProperty({ required: false, nullable: true, type: AdvisorSummaryDto })
  advisor?: AdvisorSummaryDto | null;
}
