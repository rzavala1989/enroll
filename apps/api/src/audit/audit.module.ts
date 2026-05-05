import { Module } from '@nestjs/common';

import { AuditOutboxWorker } from './audit-outbox.worker';
import { AuditService } from './audit.service';
import { MongoService } from './mongo.service';

@Module({
  providers: [AuditService, MongoService, AuditOutboxWorker],
  exports: [AuditService],
})
export class AuditModule {}
