import type {
  SearchFacetName,
  SearchSortDirection,
  SearchSortField,
} from './search.dto';

export interface SearchItem {
  id: number;
  partNumber: string;
  partName: string;
  description: string;
  manufacturer: string;
  vehicleProgram: string;
  region: string;
  country: string;
  modelYear: number;
  material: string;
  lifecycleStatus: string;
  weightKg: string;
  securityDomainId: number;
  primaryCategoryId: number;
  score: number;
}

export interface SearchFacetBucket {
  value: string;
  label?: string;
  count: number;
}

export type SearchFacets = Partial<
  Record<SearchFacetName, SearchFacetBucket[]>
>;

export interface SearchResult {
  items: SearchItem[];
  facets: SearchFacets;
  visibleHitCount: number;
  nextCursor: string | null;
  limit: number;
  queryTimeMs: number;
}

export interface SearchCursorPayload {
  version: 1;
  userId: string;
  sessionId: string;
  authorizationVersion: number;
  requestHash: string;
  sortField: SearchSortField;
  sortDirection: SearchSortDirection;
  sortValue: string | number;
  id: number;
  expiresAt: number;
}
