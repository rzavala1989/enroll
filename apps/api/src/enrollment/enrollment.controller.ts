import {
  Body,
  Controller,
  Get,
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

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { EnrollmentOwnershipGuard } from '../auth/guards/enrollment-ownership.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtPayload } from '../auth/types/jwt-payload.interface';
import { EnrollDto, EnrollFailureDto, EnrollmentResultDto } from './dto/enroll.dto';
import { EnrollmentService, RequestActor } from './enrollment.service';

function actorFrom(req: Request): Pick<RequestActor, 'ipAddress' | 'userAgent'> {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  };
}

@ApiTags('enrollment')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STUDENT')
@Controller('enrollments')
export class EnrollmentController {
  constructor(private readonly enrollmentService: EnrollmentService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Enroll the current student in a section',
    description:
      'Atomic enroll under a row-level Section lock. A full section returns 201 with status WAITLISTED and the student\'s waitlist position. Returns 409 ALREADY_ENROLLED or ALREADY_WAITLISTED, 400 REGISTRATION_CLOSED, 404 SECTION_NOT_FOUND or STUDENT_NOT_FOUND.',
  })
  @ApiCreatedResponse({ type: EnrollmentResultDto })
  @ApiConflictResponse({ type: EnrollFailureDto })
  @ApiBadRequestResponse({ type: EnrollFailureDto })
  @ApiNotFoundResponse({ type: EnrollFailureDto })
  enroll(
    @Body() body: EnrollDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<EnrollmentResultDto> {
    return this.enrollmentService.enroll(body, user.sub, {
      userId: user.sub,
      ...actorFrom(req),
    });
  }

  @Patch(':id/drop')
  @UseGuards(EnrollmentOwnershipGuard)
  @ApiOperation({ summary: 'Drop an active enrollment' })
  @ApiOkResponse({ type: EnrollmentResultDto })
  drop(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<EnrollmentResultDto> {
    return this.enrollmentService.drop(id, user.sub, {
      userId: user.sub,
      ...actorFrom(req),
    });
  }

  @Get(':id')
  @Roles('STUDENT', 'ADVISOR', 'ADMIN')
  @UseGuards(EnrollmentOwnershipGuard)
  @ApiOperation({ summary: 'Get an enrollment, including waitlist position' })
  @ApiOkResponse({ type: EnrollmentResultDto })
  getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<EnrollmentResultDto> {
    return this.enrollmentService.findOne(id);
  }
}
