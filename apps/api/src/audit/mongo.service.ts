import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Collection, Db, MongoClient } from 'mongodb';

import type { Env } from '../config/env';
import type { AuditEventDoc } from './types';

/**
 * Connects to MongoDB at boot, exposes the audit_events collection.
 *
 * The application only ever inserts into this collection. A
 * least-privilege (insert-only) Mongo role is the proper enforcement,
 * deferred to Phase 8 hardening.
 */
@Injectable()
export class MongoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MongoService.name);
  private client: MongoClient | null = null;
  private database: Db | null = null;
  private readonly uri: string | undefined;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.uri = this.config.get('MONGODB_URI', { infer: true });
  }

  async onModuleInit(): Promise<void> {
    if (!this.uri) {
      this.logger.warn(
        'MONGODB_URI is not set. Audit rows will accumulate in the Postgres outbox until it is configured.',
      );
      return;
    }

    const dbName = this.config.get('MONGODB_DB', { infer: true });

    this.client = new MongoClient(this.uri);
    await this.client.connect();
    this.database = this.client.db(dbName);

    // Idempotency key for the drain. The worker inserts a batch and
    // then marks those outbox rows drained; a crash between the two
    // re-inserts the same batch on the next tick. With this index and
    // ordered:false, the retry writes only the rows Mongo has not seen
    // and reports the rest as duplicates, which the worker ignores.
    await this.auditEvents().createIndex({ outboxId: 1 }, { unique: true });
    await this.auditEvents().createIndex({ occurredAt: -1 });

    this.logger.log(`Mongo connected to ${dbName}`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.database = null;
    }
  }

  /** Whether an audit destination was configured at all. */
  isConfigured(): boolean {
    return Boolean(this.uri);
  }

  isReady(): boolean {
    return this.database !== null;
  }

  /** Round-trips a command to the server; used by the readiness probe. */
  async ping(): Promise<void> {
    if (!this.database) throw new Error('MongoService is not connected.');
    await this.database.command({ ping: 1 });
  }

  auditEvents(): Collection<AuditEventDoc> {
    if (!this.database) {
      throw new Error('MongoService is not connected.');
    }
    return this.database.collection<AuditEventDoc>('audit_events');
  }
}
