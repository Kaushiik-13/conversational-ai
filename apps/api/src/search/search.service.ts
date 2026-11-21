import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedSession } from '../auth/auth.types';
import { FieldAccessService } from '../authorization/field-access.service';
import { DatabaseService } from '../database/database.service';
import type {
  SearchFacetsRequestDto,
  SearchRequestDto,
  SearchSortField,
} from './search.dto';
import { ConcurrencyLimiter } from './concurrency-limiter';
import { FacetCacheService } from './facet-cache.service';
import { SearchCursorService } from './search-cursor.service';
import { SearchRepository } from './search.repository';
import type { SearchFacets, SearchResult } from './search.types';

@Injectable()
export class SearchService {
  constructor(
    private readonly database: DatabaseService,
    private readonly fieldAccess: FieldAccessService,
    private readonly cursor: SearchCursorService,
    private readonly repository: SearchRepository,
    private readonly facetCache: FacetCacheService,
  ) {}

  /** At most this many group counts run at once across all requests. */
  private readonly facetLimiter = new ConcurrencyLimiter(
    Math.max(1, Number(process.env.FACET_MAX_CONCURRENCY ?? 4)),
  );

  async search(
    session: AuthenticatedSession,
    request: SearchRequestDto,
  ): Promise<SearchResult> {
    const queryStartedAt = performance.now();
    this.validateRanges(request);
    const requestedSortField = request.sort?.field ?? 'relevance';
    const sortField =
      request.query === '' && requestedSortField === 'relevance'
        ? 'updatedAt'
        : requestedSortField;
    const sortDirection = request.sort?.direction ?? 'desc';
    const requestHash = this.cursor.requestHash(request);
    const decodedCursor = request.cursor
      ? this.cursor.decode(request.cursor, session, requestHash)
      : undefined;
    if (
      decodedCursor &&
      (decodedCursor.sortField !== sortField ||
        decodedCursor.sortDirection !== sortDirection)
    ) {
      throw new BadRequestException({
        code: 'INVALID_CURSOR',
        message: 'The search cursor does not match the requested sort.',
      });
    }

    return this.database.withAuthorizationContext(session, async (client) => {
      if (
        request.filters?.cost &&
        (await this.fieldAccess.catalogFieldAccess(client, 'costUsd')) !==
          'allow'
      ) {
        throw new ForbiddenException({
          code: 'ACCESS_DENIED',
          message: 'The cost filter is not available for this role.',
        });
      }

      const search = this.repository.buildSearch(
        request.query,
        request.filters,
      );
      const visibleHitCount = await this.repository.count(client, search);
      const page = await this.repository.items(
        client,
        search,
        sortField,
        sortDirection,
        request.limit,
        decodedCursor,
      );
      const facets = await this.repository.facets(
        client,
        search,
        request.facets ?? [],
      );

      const hasNextPage = page.rows.length > request.limit;
      const lastRow = hasNextPage ? page.rows[request.limit - 1] : undefined;
      const nextCursor = lastRow
        ? this.cursor.encode(session, requestHash, {
            sortField,
            sortDirection,
            sortValue: this.sortValue(sortField, lastRow),
            id: Number(lastRow.id),
          })
        : null;

      return {
        items: page.items,
        facets,
        visibleHitCount,
        nextCursor,
        limit: request.limit,
        queryTimeMs:
          Math.round((performance.now() - queryStartedAt) * 100) / 100,
      };
    });
  }

  /**
   * Counts only (no hit count, no items). Each group is counted on its own
   * database connection so they run in parallel, and the whole result is cached
   * per visibility signature, query, filters and groups.
   */
  async searchFacets(
    session: AuthenticatedSession,
    request: SearchFacetsRequestDto,
  ): Promise<{ facets: SearchFacets; cached: boolean; queryTimeMs: number }> {
    const startedAt = performance.now();
    this.validateRanges(request);

    // A short transaction just to check access and learn what this user can see.
    const signature = await this.database.withAuthorizationContext(
      session,
      async (client) => {
        if (
          request.filters?.cost &&
          (await this.fieldAccess.catalogFieldAccess(client, 'costUsd')) !==
            'allow'
        ) {
          throw new ForbiddenException({
            code: 'ACCESS_DENIED',
            message: 'The cost filter is not available for this role.',
          });
        }
        return this.repository.visibilitySignature(client);
      },
    );

    const search = this.repository.buildSearch(request.query, request.filters);
    const key = this.facetCache.key(
      signature,
      request.query,
      request.filters,
      request.facets,
    );
    const { value, cached } = await this.facetCache.getOrCompute(key, () =>
      this.countGroups(session, search, request.facets),
    );
    return {
      facets: value,
      cached,
      queryTimeMs: Math.round((performance.now() - startedAt) * 100) / 100,
    };
  }

  private async countGroups(
    session: AuthenticatedSession,
    search: ReturnType<SearchRepository['buildSearch']>,
    groups: SearchFacetsRequestDto['facets'],
  ): Promise<SearchFacets> {
    const entries = await Promise.all(
      groups.map((group) =>
        this.facetLimiter.run(async () => {
          const buckets = await this.database.withAuthorizationContext(
            session,
            (client) => this.repository.facet(client, search, group),
          );
          return [group, buckets] as const;
        }),
      ),
    );
    return Object.fromEntries(entries);
  }

  private validateRanges(request: {
    filters?: SearchRequestDto['filters'];
  }): void {
    const ranges = [
      [request.filters?.modelYears?.from, request.filters?.modelYears?.to],
      [request.filters?.weightKg?.min, request.filters?.weightKg?.max],
      [request.filters?.cost?.min, request.filters?.cost?.max],
    ];
    if (
      ranges.some(
        ([minimum, maximum]) =>
          minimum !== undefined && maximum !== undefined && minimum > maximum,
      )
    ) {
      throw new BadRequestException({
        code: 'INVALID_FILTER',
        message: 'A filter minimum cannot be greater than its maximum.',
      });
    }
  }

  private sortValue(
    sortField: SearchSortField,
    row: {
      score: number;
      part_number: string;
      model_year: number;
      updated_at: Date;
    },
  ): string | number {
    switch (sortField) {
      case 'partNumber':
        return row.part_number;
      case 'modelYear':
        return row.model_year;
      case 'updatedAt':
        return row.updated_at.toISOString();
      default:
        return Number(row.score);
    }
  }
}
