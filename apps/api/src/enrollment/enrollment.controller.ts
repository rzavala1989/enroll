import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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

import { DropDto, EnrollDto, EnrollFailureDto, EnrollmentResultDto } from './dto/enroll.dto';
import { EnrollmentService } from './enrollment.service';

@ApiTags('enrollment')
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
  enroll(@Body() body: EnrollDto): Promise<EnrollmentResultDto> {
    return this.enrollmentService.enroll(body);
  }

  @Patch(':id/drop')
  @ApiOperation({ summary: 'Drop an active enrollment' })
  @ApiOkResponse({ type: EnrollmentResultDto })
  drop(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: DropDto,
  ): Promise<EnrollmentResultDto> {
    return this.enrollmentService.drop(id, body);
  }
}
