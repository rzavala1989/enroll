import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';

/** Keyv namespace for cached catalog pages; `clear()` is scoped to it. */
export const CATALOG_CACHE_NAMESPACE = 'catalog';

/**
 * Invalidation for the cached course list.
 *
 * The list carries `totalEnrolled` and `totalCapacity`, which are the
 * numbers students refresh for during registration. It used to sit in a
 * five-minute in-process cache, so on the busiest day of the term the
 * catalog told students about seats that had been gone for minutes, and
 * every replica told them something different.
 *
 * Two mechanisms now, and the split is deliberate:
 *
 * - Seat movement (enroll, drop, promotion) rides the short TTL. It is
 *   tempting to evict on every seat change, but on registration day
 *   that is every request, which turns the cache off exactly when it is
 *   carrying load. A bounded staleness of a few seconds is the right
 *   trade; the enroll path itself is transactional and never reads
 *   through this cache, so a stale count costs a user one surprising
 *   "join waitlist" button, never a wrong allocation.
 *
 * - Structural change (an admin editing capacity or waitlist cap) evicts
 *   immediately. It is rare, it is the kind of change an admin expects
 *   to see reflected right away, and it is not self-limiting the way a
 *   seat count is.
 */
@Injectable()
export class CatalogCacheService {
  private readonly logger = new Logger(CatalogCacheService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async invalidate(reason: string): Promise<void> {
    try {
      await this.cache.clear();
      this.logger.debug(`Catalog cache cleared (${reason}).`);
    } catch (err) {
      // A cache that will not clear is a staleness problem bounded by
      // the TTL, not a reason to fail the admin's write.
      this.logger.warn(
        `Failed to clear the catalog cache after ${reason}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
