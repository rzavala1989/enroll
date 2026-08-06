import { Module } from '@nestjs/common';

import { AuditOutboxWorker } from './audit-outbox.worker';
import { AuditService } from './audit.service';
import { MongoService } from './mongo.service';
import { RetentionWorker } from './retention.worker';

@Module({
  providers: [AuditService, MongoService, AuditOutboxWorker, RetentionWorker],
  exports: [AuditService, MongoService],
})
export class AuditModule {}
