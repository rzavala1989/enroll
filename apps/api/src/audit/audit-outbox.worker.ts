import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { PrismaService } from '../prisma/prisma.service';
import { MongoService } from './mongo.service';
import { outboxRowToAuditEvent } from './types';

const DRAIN_INTERVAL_MS = 2000;
const BATCH_SIZE = 200;

/**
 * Drains AuditOutbox rows to Mongo on a fixed interval.
 *
 * Single-instance worker (no leader election). At most one drain runs
 * at a time; if a tick takes longer than DRAIN_INTERVAL_MS, the next
 * tick is skipped via the inFlight guard rather than queueing.
 */
@Injectable()
export class AuditOutboxWorker {
  private readonly logger = new Logger(AuditOutboxWorker.name);
  private inFlight = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mongo: MongoService,
  ) {}

  @Interval(DRAIN_INTERVAL_MS)
  async drain(): Promise<void> {
    if (this.inFlight) return;
    if (!this.mongo.isReady()) return;
    this.inFlight = true;

    try {
      const batch = await this.prisma.auditOutbox.findMany({
        where: { drainedAt: null },
        take: BATCH_SIZE,
        orderBy: { id: 'asc' },
      });
      if (batch.length === 0) return;

      const docs = batch.map(outboxRowToAuditEvent);

      try {
        await this.mongo.auditEvents().insertMany(docs);
      } catch (err) {
        this.logger.error(
          `Mongo insertMany failed for ${batch.length} audit rows; will retry next tick.`,
          err instanceof Error ? err.stack : String(err),
        );
        return;
      }

      const ids = batch.map((b) => b.id);
      await this.prisma.auditOutbox.updateMany({
        where: { id: { in: ids } },
        data: { drainedAt: new Date() },
      });

      this.logger.log(`Drained ${batch.length} audit rows to Mongo.`);
    } catch (err) {
      this.logger.error(
        'AuditOutboxWorker drain failed.',
        err instanceof Error ? err.stack : String(err),
      );
    } finally {
      this.inFlight = false;
    }
  }
}
