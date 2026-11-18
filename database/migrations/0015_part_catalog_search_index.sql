SET LOCAL max_parallel_maintenance_workers = 4;
SET LOCAL maintenance_work_mem = '512MB';

CREATE INDEX part_catalog_search_bm25_idx
ON catalog.part_catalog
USING bm25 (
    id,
    part_number,
    part_name,
    description,
    (commodity::pdb.literal),
    (sub_commodity::pdb.literal),
    (manufacturer::pdb.literal),
    (vehicle_program::pdb.literal),
    (region::pdb.literal),
    (country::pdb.literal),
    (plant::pdb.literal),
    model_year,
    (material::pdb.literal),
    (lifecycle_status::pdb.literal),
    (supplier_status::pdb.literal),
    cost_usd,
    weight_kg,
    active,
    security_domain_id,
    primary_category_id,
    company_id,
    tenant_id,
    (visibility_status::pdb.literal),
    updated_at
)
WITH (key_field = 'id');

ANALYZE catalog.part_catalog;
