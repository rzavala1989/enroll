import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { MetricsService } from '../common/metrics.service';
import { SchedulerGate } from '../common/scheduler-gate.service';
import { PrismaService } from '../prisma/prisma.service';

/** Keep spent refresh tokens for a week: long enough to investigate a reuse alert. */
const REFRESH_TOKEN_RETENTION_DAYS = 7;

/** Keep drained outbox rows for a month; Mongo is the system of record after the drain. */
const OUTBOX_RETENTION_DAYS = 30;

/**
 * Nightly cleanup of two append-only tables that had no lifecycle at all.
 *
 * RefreshToken gains a row per login and per rotation, so an active
 * student generates one every fifteen minutes all term and none were
 * ever removed. AuditOutbox keeps every drained row forever even though
 * Mongo holds the durable copy. Neither is a correctness problem; both
 * are a table that only grows, on the hot path of the auth check and
 * the drain scan respectively.
 */
@Injectable()
export class RetentionWorker {
  private readonly logger = new Logger(RetentionWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly gate: SchedulerGate,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purge(): Promise<void> {
    if (!this.gate.enabled) return;
    await this.purgeRefreshTokens();
    await this.purgeDrainedOutbox();
  }

  /**
   * Expired or revoked tokens past the retention window. Live tokens
   * are never touched, and the window is measured from expiry rather
   * than creation so a long-lived session is not cut short.
   */
  async purgeRefreshTokens(): Promise<number> {
    const cutoff = daysAgo(REFRESH_TOKEN_RETENTION_DAYS);
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    if (count > 0) {
      this.metrics.retentionDeletions.inc({ table: 'RefreshToken' }, count);
      this.logger.log(`Purged ${count} expired refresh token(s).`);
    }
    return count;
  }

  /** Drained outbox rows only: an undrained row is still owed to Mongo. */
  async purgeDrainedOutbox(): Promise<number> {
    const cutoff = daysAgo(OUTBOX_RETENTION_DAYS);
    const { count } = await this.prisma.auditOutbox.deleteMany({
      where: { drainedAt: { not: null, lt: cutoff } },
    });
    if (count > 0) {
      this.metrics.retentionDeletions.inc({ table: 'AuditOutbox' }, count);
      this.logger.log(`Purged ${count} drained audit outbox row(s).`);
    }
    return count;
  }
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
