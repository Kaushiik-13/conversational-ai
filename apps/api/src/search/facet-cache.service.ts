import { Injectable } from '@nestjs/common';
import type { SearchFacets } from './search.types';

interface CacheEntry {
  expiresAt: number;
  value: SearchFacets;
}

/**
 * Short-lived cache for facet counts.
 *
 * Counts are shared only between users whose database visibility signature is
 * identical (they can see exactly the same rows), so a cached result can never
 * reveal rows another user is not allowed to see. Entries expire quickly and
 * are cleared whenever catalog parts are written.
 */
@Injectable()
export class FacetCacheService {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, Promise<SearchFacets>>();
  private generation = 0;
  private readonly ttlMs =
    Math.max(1, Number(process.env.FACET_CACHE_TTL_SECONDS ?? 300)) * 1000;
  private readonly maxEntries = Math.max(
    1,
    Number(process.env.FACET_CACHE_MAX_ENTRIES ?? 500),
  );

  /** A stable key: same meaning in, same key out (order does not matter). */
  key(
    visibilitySignature: string,
    query: string,
    filters: unknown,
    facets: readonly string[],
  ): string {
    return JSON.stringify([
      visibilitySignature,
      query.trim(),
      this.normalize(filters ?? {}),
      [...facets].sort(),
    ]);
  }

  async getOrCompute(
    key: string,
    compute: () => Promise<SearchFacets>,
  ): Promise<{ value: SearchFacets; cached: boolean }> {
    const now = Date.now();
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > now) {
      // Refresh recency so frequently used entries are evicted last.
      this.entries.delete(key);
      this.entries.set(key, hit);
      return { value: hit.value, cached: true };
    }
    if (hit) this.entries.delete(key);

    // Several identical requests at once share a single computation.
    const inFlight = this.pending.get(key);
    if (inFlight) return { value: await inFlight, cached: true };

    const startedInGeneration = this.generation;
    const computation = compute();
    this.pending.set(key, computation);
    try {
      const value = await computation;
      // Do not store a result that may predate a catalog write.
      if (startedInGeneration === this.generation) {
        this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
        while (this.entries.size > this.maxEntries) {
          const oldest = this.entries.keys().next().value as string | undefined;
          if (oldest === undefined) break;
          this.entries.delete(oldest);
        }
      }
      return { value, cached: false };
    } finally {
      this.pending.delete(key);
    }
  }

  /** Drop everything, e.g. after a catalog part was created or changed. */
  clear(): void {
    this.generation += 1;
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  private normalize(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value
        .map((item) => this.normalize(item))
        .sort((left, right) =>
          JSON.stringify(left).localeCompare(JSON.stringify(right)),
        );
    }
    if (value && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(value).sort()) {
        const item = (value as Record<string, unknown>)[key];
        if (item !== undefined) result[key] = this.normalize(item);
      }
      return result;
    }
    return value;
  }
}
