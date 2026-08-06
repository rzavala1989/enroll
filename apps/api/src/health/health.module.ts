import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { PROMOTE_WAITLIST_QUEUE } from '../waitlist/waitlist.service';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  // The promotion queue is registered here purely to borrow its Redis
  // connection for the readiness ping, rather than opening a second one.
  imports: [AuditModule, BullModule.registerQueue({ name: PROMOTE_WAITLIST_QUEUE })],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
