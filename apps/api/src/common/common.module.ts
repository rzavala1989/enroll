import KeyvRedis from '@keyv/redis';
import { CacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Keyv from 'keyv';

import type { Env } from '../config/env';
import { CatalogCacheService, CATALOG_CACHE_NAMESPACE } from './catalog-cache.service';
import { MetricsService } from './metrics.service';
import { SchedulerGate } from './scheduler-gate.service';

/**
 * Cross-cutting singletons. Global because the metrics counters, the
 * scheduler gate, and the catalog cache are all wanted by feature
 * modules that have no business depending on each other.
 */
@Global()
@Module({
  imports: [
    /**
     * Redis-backed, not in-process.
     *
     * The previous in-memory store meant each replica held its own
     * truth about seat counts, so a student refreshing the catalog got
     * a different answer depending on which pod answered. It also could
     * not be invalidated from anywhere but the pod holding the entry.
     */
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        stores: [
          new Keyv({
            store: new KeyvRedis(config.get('REDIS_URL', { infer: true })),
            namespace: CATALOG_CACHE_NAMESPACE,
          }),
        ],
        ttl: config.get('CATALOG_CACHE_TTL_MS', { infer: true }),
      }),
    }),
  ],
  providers: [MetricsService, SchedulerGate, CatalogCacheService],
  exports: [MetricsService, SchedulerGate, CatalogCacheService, CacheModule],
})
export class CommonModule {}
