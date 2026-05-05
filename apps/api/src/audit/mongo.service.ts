import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Collection, Db, MongoClient } from 'mongodb';

/**
 * Connects to MongoDB at boot, exposes the audit_events collection.
 *
 * The application only ever calls insertMany on this collection. A
 * least-privilege (insert-only) Mongo role is the proper enforcement,
 * deferred to Phase 8 hardening.
 */
@Injectable()
export class MongoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MongoService.name);
  private client: MongoClient | null = null;
  private database: Db | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const uri = this.config.get<string>('MONGODB_URI');
    if (!uri) {
      this.logger.warn(
        'MONGODB_URI is not set. Audit drain to Mongo will fail until it is configured.',
      );
      return;
    }

    const dbName = this.config.get<string>('MONGODB_DB') ?? 'enroll_audit';

    this.client = new MongoClient(uri);
    await this.client.connect();
    this.database = this.client.db(dbName);
    this.logger.log(`Mongo connected to ${dbName}`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.database = null;
    }
  }

  isReady(): boolean {
    return this.database !== null;
  }

  auditEvents(): Collection {
    if (!this.database) {
      throw new Error('MongoService is not connected.');
    }
    return this.database.collection('audit_events');
  }
}
