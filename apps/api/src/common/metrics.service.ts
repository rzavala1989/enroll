import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Prometheus registry and the handful of domain metrics worth alerting
 * on. Scraped at GET /api/metrics.
 *
 * The selection is deliberate. Request latency and process stats say
 * whether the service is healthy; these say whether the *product* is.
 * A Redis outage that stops promotion jobs, or a dead Mongo that stops
 * the audit drain, both leave the API answering 200s while enrolled
 * students sit behind an open seat and the compliance trail quietly
 * stops. Those failures are invisible in HTTP metrics.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  /** HTTP server latency, labelled by method, route template, and status. */
  readonly httpDuration = new Histogram({
    name: 'enroll_http_request_duration_seconds',
    help: 'HTTP request duration in seconds.',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });

  /** Enroll outcomes, so a spike in SECTION_FULL is visible on registration day. */
  readonly enrollOutcomes = new Counter({
    name: 'enroll_enrollment_outcomes_total',
    help: 'Enrollment attempts by outcome.',
    labelNames: ['outcome'] as const,
    registers: [this.registry],
  });

  /** Students moved off a waitlist into a seat. */
  readonly waitlistPromotions = new Counter({
    name: 'enroll_waitlist_promotions_total',
    help: 'Students promoted from a waitlist into an open seat.',
    registers: [this.registry],
  });

  /**
   * Failures to enqueue a promotion sweep. Non-zero means Redis is
   * degraded and seats may be sitting open; the safety-net sweep is
   * what stops that from being permanent.
   */
  readonly promotionEnqueueFailures = new Counter({
    name: 'enroll_promotion_enqueue_failures_total',
    help: 'Waitlist promotion jobs that could not be enqueued.',
    registers: [this.registry],
  });

  /** Sections the safety-net sweep found with an open seat and a waiting student. */
  readonly promotionSweepRecoveries = new Counter({
    name: 'enroll_promotion_sweep_recoveries_total',
    help: 'Sections re-enqueued by the promotion safety-net sweep.',
    registers: [this.registry],
  });

  /** Audit rows moved from the Postgres outbox into Mongo. */
  readonly auditRowsDrained = new Counter({
    name: 'enroll_audit_rows_drained_total',
    help: 'Audit outbox rows written to Mongo.',
    registers: [this.registry],
  });

  readonly auditDrainFailures = new Counter({
    name: 'enroll_audit_drain_failures_total',
    help: 'Audit outbox drain attempts that failed.',
    registers: [this.registry],
  });

  /**
   * Age of the oldest undrained audit row. This is the alert that
   * matters: a dead Mongo currently produces one log line every two
   * seconds and nothing else, while the audit trail silently stops.
   */
  readonly auditOutboxLagSeconds = new Gauge({
    name: 'enroll_audit_outbox_lag_seconds',
    help: 'Age of the oldest undrained audit outbox row, in seconds.',
    registers: [this.registry],
  });

  /** Rows deleted by the nightly retention jobs, by table. */
  readonly retentionDeletions = new Counter({
    name: 'enroll_retention_deletions_total',
    help: 'Rows removed by retention jobs.',
    labelNames: ['table'] as const,
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: 'enroll_' });
  }

  scrape(): Promise<string> {
    return this.registry.metrics();
  }
}
