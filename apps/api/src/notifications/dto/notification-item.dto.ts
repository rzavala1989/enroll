import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { NotificationItem, NotificationType } from '@enroll/shared';

const NOTIFICATION_TYPES: readonly NotificationType[] = [
  'WAITLIST_PROMOTED',
  'WAITLIST_EXPIRED',
];

export class NotificationItemDto implements NotificationItem {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: NOTIFICATION_TYPES })
  type!: NotificationType;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  body!: string;

  @ApiPropertyOptional({
    description: 'Linkage back to the triggering records, e.g. { enrollmentId, sectionId, courseId }.',
  })
  payload?: Record<string, unknown>;

  @ApiProperty({ nullable: true, description: 'ISO 8601, or null while unread.' })
  readAt!: string | null;

  @ApiProperty()
  createdAt!: string;
}

export class NotificationsResponseDto {
  @ApiProperty({ type: [NotificationItemDto], description: 'Newest first.' })
  data!: NotificationItemDto[];

  @ApiProperty({ description: 'Total unread rows for the user, independent of the page returned.' })
  unreadCount!: number;
}
