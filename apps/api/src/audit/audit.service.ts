import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { RecordEventParams } from './types';

@Injectable()
export class AuditService {
  /**
   * Append a row to the audit outbox inside the caller's transaction.
   *
   * The caller MUST pass its `tx` client so the outbox row commits or
   * rolls back atomically with the business mutation. A separate worker
   * (AuditOutboxWorker) drains undrained rows to Mongo.
   */
  async recordEvent(
    tx: Prisma.TransactionClient,
    params: RecordEventParams,
  ): Promise<void> {
    await tx.auditOutbox.create({
      data: {
        action: params.action,
        actorUserId: params.actor.userId,
        actorIp: params.actor.ipAddress,
        actorUserAgent: params.actor.userAgent,
        targetType: params.target.type,
        targetId: params.target.id,
        payload: {
          before: params.before,
          after: params.after,
          metadata: params.metadata ?? {},
        } as Prisma.InputJsonValue,
      },
    });
  }
}
