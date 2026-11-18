export interface ApiResponse<T, M extends Record<string, unknown> = Record<string, unknown>> {
  data: T;
  meta: M & { requestId: string };
}

export interface ApiFailure {
  error?: {
    code?: string;
    message?: string;
    details?: Array<{ reason?: string }>;
    requestId?: string;
  };
}

export interface MembershipProfile {
  membershipId: string;
  organizationId: string;
  organizationCode: string;
  organizationName: string;
  role: string;
  isDefault: boolean;
  isSelected: boolean;
}

export interface AuthProfile {
  user: { id: string; email: string; displayName: string };
  activeContext: {
    organizationId: string;
    organizationCode: string;
    organizationName: string;
    membershipId: string;
    role: string;
  } | null;
  memberships: MembershipProfile[];
  capabilities: string[];
}

export interface CategoryNode {
  id: number;
  parentId: number | null;
  slug: string;
  name: string;
  path: string;
  depth: number;
  isSecurityDomain: boolean;
  status: string;
  version: number;
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

export interface FacetBucket {
  value: string;
  label?: string;
  count: number;
}

export type FacetName =
  'securityDomain' | 'primaryCategory' | 'manufacturer' | 'region' | 'material' | 'lifecycleStatus';

export interface SearchRequest {
  query: string;
  filters?: {
    securityDomainIds?: number[];
    primaryCategoryIds?: number[];
    manufacturerNames?: string[];
    regions?: string[];
    materials?: string[];
    lifecycleStatuses?: string[];
    modelYears?: { from?: number; to?: number };
  };
  facets: FacetName[];
  sort: {
    field: 'relevance' | 'partNumber' | 'modelYear' | 'updatedAt';
    direction: 'asc' | 'desc';
  };
  limit: number;
  cursor?: string;
}

export interface SearchMeta extends Record<string, unknown> {
  requestId: string;
  nextCursor: string | null;
  visibleHitCount: number;
  limit: number;
  queryTimeMs: number;
}

export interface CatalogRecord extends Omit<SearchItem, 'score'> {
  commodity: string;
  subCommodity: string;
  plant: string;
  supplierStatus?: string;
  costUsd?: string;
  sourceSystem?: string;
  sourceRecordId?: string | null;
  version: number;
  active: boolean;
}

export interface Organization {
  id: string;
  code: string;
  name: string;
  status: string;
  version: number;
  authorizationVersion: number;
}

export interface EntitlementEntry {
  id?: string;
  categoryId: number;
  categorySlug?: string;
  categoryName?: string;
  effect: 'allow' | 'deny';
  includeDescendants: boolean;
  validFrom?: string;
  validUntil?: string | null;
}

export interface EntitlementSet {
  organizationId: string;
  version: number;
  entries: EntitlementEntry[];
}

export interface UserSummary {
  id: string;
  email: string;
  displayName: string;
  status: string;
  version: number;
  membershipId: string;
  role: string;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  permissions: Array<{ code: string; description: string; riskLevel: string }>;
}

export interface AuditEvent {
  id: string;
  occurredAt: string;
  requestId: string;
  actorUserId: string | null;
  organizationId: string | null;
  action: string;
  decision: 'allow' | 'deny' | 'error';
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
}

export function apiErrorMessage(
  error: unknown,
  fallback = 'The request could not be completed.',
): string {
  const failure = error as { error?: ApiFailure };
  return failure.error?.error?.message ?? fallback;
}
