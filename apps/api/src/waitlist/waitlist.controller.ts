import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
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
}
