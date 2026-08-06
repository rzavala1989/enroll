import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { MongoBulkWriteError } from 'mongodb';

import { MetricsService } from '../common/metrics.service';
import { SchedulerGate } from '../common/scheduler-gate.service';
import { PrismaService } from '../prisma/prisma.service';
import { MongoService } from './mongo.service';
import { outboxRowToAuditEvent } from './types';

const DRAIN_INTERVAL_MS = 2000;
const BATCH_SIZE = 200;
const DUPLICATE_KEY = 11000;

/**
 * Drains AuditOutbox rows to Mongo on a fixed interval.
 *
 * At most one drain runs at a time; if a tick takes longer than
 * DRAIN_INTERVAL_MS, the next tick is skipped via the inFlight guard
 * rather than queueing. Gated on SchedulerGate so only one deployment
 * drains: two replicas both reading `WHERE drainedAt IS NULL` pick up
 * the same batch and race to insert it.
 *
 * Delivery is at-least-once by construction. Rows are inserted into
 * Mongo and then marked drained in Postgres; a crash between those two
 * steps replays the batch. The unique index on `outboxId` plus
 * `ordered: false` turns that replay into a set of ignorable duplicate
 * key errors instead of duplicate audit events, which makes the
 * pipeline effectively exactly-once at rest.
 */
@Injectable()
export class AuditOutboxWorker {
  private readonly logger = new Logger(AuditOutboxWorker.name);
  private inFlight = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mongo: MongoService,
    private readonly metrics: MetricsService,
    private readonly gate: SchedulerGate,
  ) {}

  @Interval(DRAIN_INTERVAL_MS)
  async drain(): Promise<void> {
    if (!this.gate.enabled) return;
    if (this.inFlight) return;
    this.inFlight = true;

    try {
      await this.recordLag();
      if (!this.mongo.isReady()) return;

      const batch = await this.prisma.auditOutbox.findMany({
        where: { drainedAt: null },
        take: BATCH_SIZE,
        orderBy: { id: 'asc' },
      });
      if (batch.length === 0) return;

      const docs = batch.map(outboxRowToAuditEvent);

      let inserted: number;
      try {
        const result = await this.mongo.auditEvents().insertMany(docs, {
          ordered: false,
        });
        inserted = result.insertedCount;
      } catch (err) {
        const duplicatesOnly = this.isDuplicateKeyOnly(err);
        if (!duplicatesOnly) {
          this.metrics.auditDrainFailures.inc();
          this.logger.error(
            `Mongo insertMany failed for ${batch.length} audit rows; will retry next tick.`,
            err instanceof Error ? err.stack : String(err),
          );
          return;
        }
        // Every failure was a duplicate key, meaning a previous tick
        // already wrote these documents and died before marking the
        // outbox. Marking them drained now is the correct completion.
        inserted = (err as MongoBulkWriteError).result?.insertedCount ?? 0;
        this.logger.warn(
          `Replayed ${batch.length} audit rows; ${batch.length - inserted} were already in Mongo.`,
        );
      }

      const ids = batch.map((b) => b.id);
      await this.prisma.auditOutbox.updateMany({
        where: { id: { in: ids } },
        data: { drainedAt: new Date() },
      });

      this.metrics.auditRowsDrained.inc(batch.length);
      this.logger.log(`Drained ${batch.length} audit rows to Mongo.`);
    } catch (err) {
      this.metrics.auditDrainFailures.inc();
      this.logger.error(
        'AuditOutboxWorker drain failed.',
        err instanceof Error ? err.stack : String(err),
      );
    } finally {
      this.inFlight = false;
    }
  }

  /**
   * Age of the oldest undrained row, published every tick.
   *
   * This is the signal that a dead Mongo is eating the compliance
   * trail. Without it the only evidence is a log line every two
   * seconds, which nobody is watching at 3am.
   */
  private async recordLag(): Promise<void> {
    const oldest = await this.prisma.auditOutbox.findFirst({
      where: { drainedAt: null },
      orderBy: { id: 'asc' },
      select: { createdAt: true },
    });
    this.metrics.auditOutboxLagSeconds.set(
      oldest ? (Date.now() - oldest.createdAt.getTime()) / 1000 : 0,
    );
  }

  /** True when a bulk write failed and every individual error was a duplicate key. */
  private isDuplicateKeyOnly(err: unknown): boolean {
    if (!(err instanceof MongoBulkWriteError)) return false;
    const writeErrors = err.writeErrors;
    const list = Array.isArray(writeErrors) ? writeErrors : [writeErrors];
    return (
      list.length > 0 &&
      list.every((e) => (e as { code?: number } | undefined)?.code === DUPLICATE_KEY)
    );
  }
}
