import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { WaitlistController } from './waitlist.controller';
import { WaitlistProcessor } from './waitlist.processor';
import { PROMOTE_WAITLIST_QUEUE, WaitlistService } from './waitlist.service';

@Module({
  imports: [
    AuditModule,
    AuthModule,
    BullModule.registerQueue({ name: PROMOTE_WAITLIST_QUEUE }),
  ],
  controllers: [WaitlistController],
  providers: [WaitlistService, WaitlistProcessor],
  exports: [WaitlistService],
})
export class WaitlistModule {}
