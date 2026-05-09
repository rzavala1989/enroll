import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DropDto, EnrollDto, EnrollFailureDto, EnrollmentResultDto } from './dto/enroll.dto';
import { EnrollmentService, RequestActor } from './enrollment.service';

function actorFrom(req: Request): RequestActor {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  };
}

@ApiTags('enrollment')
@UseGuards(JwtAuthGuard)
@Controller('enrollments')
export class EnrollmentController {
  constructor(private readonly enrollmentService: EnrollmentService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Enroll a student in a section',
    description:
      'Atomic enroll under a row-level Section lock. Returns 409 SECTION_FULL or ALREADY_ENROLLED, 400 REGISTRATION_CLOSED, 404 SECTION_NOT_FOUND or STUDENT_NOT_FOUND.',
  })
  @ApiCreatedResponse({ type: EnrollmentResultDto })
  @ApiConflictResponse({ type: EnrollFailureDto })
  @ApiBadRequestResponse({ type: EnrollFailureDto })
  @ApiNotFoundResponse({ type: EnrollFailureDto })
  enroll(
    @Body() body: EnrollDto,
    @Req() req: Request,
  ): Promise<EnrollmentResultDto> {
    return this.enrollmentService.enroll(body, actorFrom(req));
  }

  @Patch(':id/drop')
  @ApiOperation({ summary: 'Drop an active enrollment' })
  @ApiOkResponse({ type: EnrollmentResultDto })
  drop(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: DropDto,
    @Req() req: Request,
  ): Promise<EnrollmentResultDto> {
    return this.enrollmentService.drop(id, body, actorFrom(req));
  }
}
