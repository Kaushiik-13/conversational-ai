import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedSession } from '../auth/auth.types';
import { FieldAccessService } from '../authorization/field-access.service';
import { DatabaseService } from '../database/database.service';
import type { SearchRequestDto, SearchSortField } from './search.dto';
import { SearchCursorService } from './search-cursor.service';
import { SearchRepository } from './search.repository';
import type { SearchResult } from './search.types';

@Injectable()
export class SearchService {
  constructor(
    private readonly database: DatabaseService,
    private readonly fieldAccess: FieldAccessService,
    private readonly cursor: SearchCursorService,
    private readonly repository: SearchRepository,
  ) {}

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

  private validateRanges(request: SearchRequestDto): void {
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
