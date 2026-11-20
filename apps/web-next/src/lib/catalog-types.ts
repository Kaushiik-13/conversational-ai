export interface CategoryNode {
  id: number;
  parentId: number | null;
  slug: string;
  name: string;
  path: string;
  depth: number;
  isSecurityDomain: boolean;
  status: string;
  children?: CategoryNode[];
}

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

export interface CatalogRecord extends Omit<SearchItem, "score"> {
  commodity: string;
  subCommodity: string;
  plant: string;
  supplierStatus?: string;
  costUsd?: string;
  sourceSystem?: string;
  version: number;
  active: boolean;
}

export interface SearchMeta {
  nextCursor: string | null;
  visibleHitCount: number;
  limit: number;
  queryTimeMs: number;
}

export interface SearchFilters {
  securityDomainIds?: number[];
  primaryCategoryIds?: number[];
  regions?: string[];
  lifecycleStatuses?: string[];
  modelYears?: { from?: number; to?: number };
}

export type SortField = "relevance" | "partNumber" | "modelYear" | "updatedAt";

export interface SearchRequest {
  query: string;
  filters?: SearchFilters;
  facets: string[];
  sort: { field: SortField; direction: "asc" | "desc" };
  limit: number;
  cursor?: string;
}

export const LIFECYCLE_STATUSES = [
  "active",
  "prototype",
  "superseded",
  "obsolete",
  "end-of-life",
] as const;

export const REGIONS = [
  "Africa",
  "Asia",
  "Europe",
  "Middle East",
  "North America",
  "Oceania",
  "South America",
] as const;
