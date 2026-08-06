import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env';

/**
 * Whether this process runs the in-process schedulers.
 *
 * The audit outbox drain (@Interval), the hourly waitlist expiry
 * (@Cron), and the promotion safety-net sweep are all plain decorators
 * with no leader election, so they run in every replica. That is
 * invisible at one pod and wrong at two: the outbox gets double-drained
 * (two transactions racing the same batch), and every student left on a
 * closed waitlist gets N expiry notifications for one event.
 *
 * The cheap fix is a deployment split rather than a coordination
 * protocol: run the web replicas with SCHEDULERS_ENABLED=false and
 * exactly one worker deployment with it on. Both share the same image
 * and the same queue, so the BullMQ promotion workers keep running
 * everywhere; only the timer-driven work is gated.
 */
@Injectable()
export class SchedulerGate {
  private readonly logger = new Logger(SchedulerGate.name);
  readonly enabled: boolean;

  constructor(config: ConfigService<Env, true>) {
    this.enabled = config.get('SCHEDULERS_ENABLED', { infer: true });
    this.logger.log(
      this.enabled
        ? 'Schedulers enabled: this process drains the audit outbox, expires closed waitlists, and runs the promotion sweep.'
        : 'Schedulers disabled (SCHEDULERS_ENABLED=false): timer-driven work runs in the worker deployment.',
    );
  }
}
