import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { EnrollmentOwnershipGuard } from '../auth/guards/enrollment-ownership.guard';
import { WaitlistModule } from '../waitlist/waitlist.module';
import { EnrollmentController } from './enrollment.controller';
import { EnrollmentService } from './enrollment.service';

@Module({
  imports: [AuditModule, AuthModule, WaitlistModule],
  controllers: [EnrollmentController],
  providers: [EnrollmentService, EnrollmentOwnershipGuard],
})
export class EnrollmentModule {}
