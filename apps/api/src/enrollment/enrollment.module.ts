import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { EnrollmentController } from './enrollment.controller';
import { EnrollmentService } from './enrollment.service';

@Module({
  imports: [AuditModule],
  controllers: [EnrollmentController],
  providers: [EnrollmentService],
})
export class EnrollmentModule {}
