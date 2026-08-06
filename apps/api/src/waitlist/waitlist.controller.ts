import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtPayload } from '../auth/types/jwt-payload.interface';
import { actorFrom } from '../common/request-actor';
import { ReorderWaitlistDto } from './dto/reorder-waitlist.dto';
import { WaitlistEntryDto } from './dto/waitlist-entry.dto';
import { WaitlistService } from './waitlist.service';

@ApiTags('waitlist')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'ADVISOR')
@Controller('sections')
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @Get(':id/waitlist')
  @ApiOperation({ summary: "List a section's waitlist in order" })
  @ApiOkResponse({ type: [WaitlistEntryDto] })
  list(@Param('id', new ParseUUIDPipe()) id: string): Promise<WaitlistEntryDto[]> {
    return this.waitlist.listForSection(id);
  }

  @Patch(':id/waitlist')
  @Roles('ADMIN')
  @ApiOperation({
    summary: "Reorder a section's waitlist",
    description:
      'Submit every currently WAITLISTED enrollment id for the section, in the desired order. A stale or partial list is rejected with 409 WAITLIST_CHANGED.',
  })
  @ApiOkResponse({ type: [WaitlistEntryDto] })
  @ApiNotFoundResponse({ description: 'SECTION_NOT_FOUND' })
  @ApiConflictResponse({ description: 'WAITLIST_CHANGED' })
  reorder(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ReorderWaitlistDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<WaitlistEntryDto[]> {
    return this.waitlist.reorder(id, body.orderedEnrollmentIds, actorFrom(req, user.sub));
  }
}
