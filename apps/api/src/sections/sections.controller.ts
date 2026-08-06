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
  ApiBadRequestResponse,
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
import { SectionSummaryDto, UpdateSectionDto } from './dto/update-section.dto';
import { SectionsService } from './sections.service';

@ApiTags('sections')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sections')
export class SectionsController {
  constructor(private readonly sections: SectionsService) {}

  @Get(':id')
  @Roles('ADMIN', 'ADVISOR')
  @ApiOperation({ summary: 'Section summary for the waitlist management view' })
  @ApiOkResponse({ type: SectionSummaryDto })
  @ApiNotFoundResponse({ description: 'SECTION_NOT_FOUND' })
  summary(@Param('id', new ParseUUIDPipe()) id: string): Promise<SectionSummaryDto> {
    return this.sections.getSummary(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Edit section capacity and/or waitlist cap',
    description:
      'Raising capacity enqueues the waitlist promotion sweep, so newly opened seats fill automatically in position order. Capacity cannot go below the current enrolledCount (400 CAPACITY_BELOW_ENROLLED).',
  })
  @ApiOkResponse({ type: SectionSummaryDto })
  @ApiBadRequestResponse({ description: 'NO_FIELDS or CAPACITY_BELOW_ENROLLED' })
  @ApiNotFoundResponse({ description: 'SECTION_NOT_FOUND' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateSectionDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<SectionSummaryDto> {
    return this.sections.update(id, body, actorFrom(req, user.sub));
  }
}
