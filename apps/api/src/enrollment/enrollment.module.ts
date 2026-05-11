import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { EnrollmentOwnershipGuard } from '../auth/guards/enrollment-ownership.guard';
import { EnrollmentController } from './enrollment.controller';
import { EnrollmentService } from './enrollment.service';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [EnrollmentController],
  providers: [EnrollmentService, EnrollmentOwnershipGuard],
})
export class EnrollmentModule {}
