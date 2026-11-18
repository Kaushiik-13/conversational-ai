export interface CatalogRecord {
  id: number;
  partNumber: string;
  partName: string;
  description: string;
  commodity: string;
  subCommodity: string;
  manufacturer: string;
  vehicleProgram: string;
  region: string;
  country: string;
  plant: string;
  modelYear: number;
  material: string;
  lifecycleStatus: string;
  supplierStatus?: string;
  costUsd?: string;
  weightKg: string;
  securityDomainId: number;
  primaryCategoryId: number;
  sourceSystem?: string;
  sourceRecordId?: string | null;
  version: number;
  active: boolean;
}

export interface CatalogFacet {
  securityDomainId: number;
  slug: string;
  name: string;
  count: number;
}
