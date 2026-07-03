import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/types/jwt-payload.interface';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { MarkAllReadResponseDto } from './dto/mark-all-read-response.dto';
import { NotificationItemDto, NotificationsResponseDto } from './dto/notification-item.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: "List the current user's notifications, newest first" })
  @ApiOkResponse({ type: NotificationsResponseDto })
  list(
    @Query() query: ListNotificationsQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<NotificationsResponseDto> {
    return this.notifications.list(user.sub, {
      unreadOnly: query.unreadOnly,
      limit: query.limit,
    });
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification read' })
  @ApiOkResponse({ type: NotificationItemDto })
  @ApiNotFoundResponse({ description: 'NOTIFICATION_NOT_FOUND' })
  markRead(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<NotificationItemDto> {
    return this.notifications.markRead(user.sub, id);
  }

  @Post('read-all')
  @ApiOperation({ summary: "Mark all of the current user's unread notifications read" })
  @ApiOkResponse({ type: MarkAllReadResponseDto })
  markAllRead(@CurrentUser() user: JwtPayload): Promise<MarkAllReadResponseDto> {
    return this.notifications.markAllRead(user.sub);
  }
}
