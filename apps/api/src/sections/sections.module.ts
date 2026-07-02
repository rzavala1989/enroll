import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { WaitlistModule } from '../waitlist/waitlist.module';
import { SectionsController } from './sections.controller';
import { SectionsService } from './sections.service';

@Module({
  imports: [AuditModule, AuthModule, WaitlistModule],
  controllers: [SectionsController],
  providers: [SectionsService],
})
export class SectionsModule {}
