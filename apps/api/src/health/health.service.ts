import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

import { MongoService } from '../audit/mongo.service';
import { PrismaService } from '../prisma/prisma.service';
import { PROMOTE_WAITLIST_QUEUE } from '../waitlist/waitlist.service';

export type DependencyState = 'up' | 'down' | 'not_configured';

export interface ReadinessReport {
  status: 'ok' | 'degraded';
  checks: Record<string, DependencyState>;
}

/** How long a single dependency probe may take before it counts as down. */
const PROBE_TIMEOUT_MS = 2000;

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mongo: MongoService,
    @InjectQueue(PROMOTE_WAITLIST_QUEUE) private readonly queue: Queue,
  ) {}

  /**
   * Readiness: can this process actually serve traffic?
   *
   * The old `GET /health` returned `{ ok: true }` from a handler that
   * touched nothing, so a pod with a dead Postgres connection pool
   * stayed in the load balancer answering 500s. Each dependency is
   * probed for real, with a timeout so a hung socket fails the check
   * instead of hanging the probe.
   *
   * Postgres and Redis are hard requirements. Mongo is not: the audit
   * outbox buffers in Postgres while Mongo is away, so its absence is
   * reported without failing readiness and taking the service down for
   * something the design already tolerates.
   */
  async readiness(): Promise<ReadinessReport> {
    const [postgres, redis, mongo] = await Promise.all([
      this.probe('postgres', () => this.prisma.$queryRaw`SELECT 1`),
      this.probe('redis', async () => {
        const client = await this.queue.client;
        await client.ping();
      }),
      this.probeMongo(),
    ]);

    const status = postgres === 'up' && redis === 'up' ? 'ok' : 'degraded';
    return { status, checks: { postgres, redis, mongo } };
  }

  private async probeMongo(): Promise<DependencyState> {
    if (!this.mongo.isConfigured()) return 'not_configured';
    return this.probe('mongo', () => this.mongo.ping());
  }

  private async probe(
    name: string,
    run: () => Promise<unknown>,
  ): Promise<DependencyState> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        run(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(new Error(`${name} probe timed out after ${PROBE_TIMEOUT_MS}ms`)),
            PROBE_TIMEOUT_MS,
          );
        }),
      ]);
      return 'up';
    } catch (err) {
      this.logger.warn(
        `Readiness probe for ${name} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 'down';
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
