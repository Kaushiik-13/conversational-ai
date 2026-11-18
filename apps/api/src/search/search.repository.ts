import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type {
  SearchFacetName,
  SearchFiltersDto,
  SearchSortDirection,
  SearchSortField,
} from './search.dto';
import type {
  SearchCursorPayload,
  SearchFacetBucket,
  SearchFacets,
  SearchItem,
} from './search.types';

interface SearchRow {
  id: string;
  part_number: string;
  part_name: string;
  description: string;
  manufacturer: string;
  vehicle_program: string;
  region: string;
  country: string;
  model_year: number;
  material: string;
  lifecycle_status: string;
  weight_kg: string;
  security_domain_id: string;
  primary_category_id: string;
  updated_at: Date;
  score: number;
}

interface BuiltSearch {
  query: string;
  filters: SearchFiltersDto;
}

@Injectable()
export class SearchRepository {
  buildSearch(query: string, filters?: SearchFiltersDto): BuiltSearch {
    return {
      query,
      filters: filters ?? {},
    };
  }

  async count(client: PoolClient, search: BuiltSearch): Promise<number> {
    const result = await client.query<{ count: string }>(
      `SELECT catalog.search_visible_count($1, $2::jsonb)::text AS count`,
      [search.query, JSON.stringify(search.filters)],
    );
    return Number(result.rows[0].count);
  }

  async items(
    client: PoolClient,
    search: BuiltSearch,
    sortField: SearchSortField,
    sortDirection: SearchSortDirection,
    limit: number,
    cursor?: SearchCursorPayload,
  ): Promise<{ items: SearchItem[]; rows: SearchRow[] }> {
    const result = await client.query<SearchRow>(
      `
        SELECT *
        FROM catalog.search_visible_items(
          $1, $2::jsonb, $3, $4, $5, $6, $7
        )
      `,
      [
        search.query,
        JSON.stringify(search.filters),
        sortField,
        sortDirection,
        cursor ? String(cursor.sortValue) : null,
        cursor?.id ?? null,
        limit + 1,
      ],
    );
    const rows = result.rows;
    return {
      rows,
      items: rows.slice(0, limit).map((row) => ({
        id: Number(row.id),
        partNumber: row.part_number,
        partName: row.part_name,
        description: row.description,
        manufacturer: row.manufacturer,
        vehicleProgram: row.vehicle_program,
        region: row.region,
        country: row.country,
        modelYear: row.model_year,
        material: row.material,
        lifecycleStatus: row.lifecycle_status,
        weightKg: row.weight_kg,
        securityDomainId: Number(row.security_domain_id),
        primaryCategoryId: Number(row.primary_category_id),
        score: Number(row.score),
      })),
    };
  }

  async facets(
    client: PoolClient,
    search: BuiltSearch,
    requested: SearchFacetName[],
  ): Promise<SearchFacets> {
    const facets: SearchFacets = {};
    for (const facet of requested) {
      const facetFilters = this.withoutOwnFacetFilter(search.filters, facet);
      const result = await client.query<{
        value: string;
        count: string;
      }>(
        `
          SELECT value, count::text
          FROM catalog.search_visible_facet($1, $2::jsonb, $3)
        `,
        [search.query, JSON.stringify(facetFilters), facet],
      );
      facets[facet] = result.rows.map((row): SearchFacetBucket => ({
        value: row.value,
        count: Number(row.count),
      }));
    }
    return facets;
  }

  private withoutOwnFacetFilter(
    filters: SearchFiltersDto,
    facet: SearchFacetName,
  ): SearchFiltersDto {
    const facetFilters = { ...filters };
    switch (facet) {
      case 'securityDomain':
        delete facetFilters.securityDomainIds;
        break;
      case 'primaryCategory':
        delete facetFilters.primaryCategoryIds;
        break;
      case 'manufacturer':
        delete facetFilters.manufacturerNames;
        break;
      case 'region':
        delete facetFilters.regions;
        break;
      case 'material':
        delete facetFilters.materials;
        break;
      case 'lifecycleStatus':
        delete facetFilters.lifecycleStatuses;
        break;
    }
    return facetFilters;
  }
}
