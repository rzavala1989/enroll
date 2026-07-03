import { ApiProperty } from '@nestjs/swagger';

export class MarkAllReadResponseDto {
  @ApiProperty({ description: 'Number of rows stamped with readAt.' })
  updated!: number;
}
