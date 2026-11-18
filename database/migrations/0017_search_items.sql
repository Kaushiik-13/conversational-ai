CREATE FUNCTION catalog.search_visible_items(
    search_query text,
    search_filters jsonb,
    requested_sort_field text,
    requested_sort_direction text,
    cursor_value text,
    cursor_id bigint,
    result_limit integer
)
RETURNS TABLE (
    id bigint,
    part_number text,
    part_name text,
    description text,
    manufacturer text,
    vehicle_program text,
    region text,
    country text,
    model_year integer,
    material text,
    lifecycle_status text,
    weight_kg numeric,
    security_domain_id bigint,
    primary_category_id bigint,
    updated_at timestamptz,
    score real
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, app, catalog, security, public
AS $function$
DECLARE
    sort_expression text;
    sort_type text;
    sort_keyword text;
    cursor_comparison text;
    cursor_clause text := '';
    scope_clause text;
    allowed_category_ids bigint[];
    allowed_company_ids integer[];
    denied_company_ids integer[];
    company_allowlist_active boolean;
    internal_allowed boolean;
    requires_legacy_scope boolean;
    filter_security_domain_ids bigint[];
    filter_primary_category_ids bigint[];
    filter_manufacturers text[];
    filter_company_ids integer[];
    filter_regions text[];
    filter_countries text[];
    filter_materials text[];
    filter_lifecycle_statuses text[];
    filter_model_year_from integer;
    filter_model_year_to integer;
    filter_weight_min numeric;
    filter_weight_max numeric;
    filter_cost_min numeric;
    filter_cost_max numeric;
BEGIN
    sort_expression := CASE requested_sort_field
        WHEN 'relevance' THEN 'pdb.score(part.id)'
        WHEN 'partNumber' THEN 'part.part_number'
        WHEN 'modelYear' THEN 'part.model_year'
        WHEN 'updatedAt' THEN 'part.updated_at'
        ELSE NULL
    END;
    sort_type := CASE requested_sort_field
        WHEN 'relevance' THEN 'real'
        WHEN 'partNumber' THEN 'text'
        WHEN 'modelYear' THEN 'integer'
        WHEN 'updatedAt' THEN 'timestamptz'
        ELSE NULL
    END;
    IF sort_expression IS NULL OR requested_sort_direction NOT IN ('asc', 'desc') THEN
        RAISE EXCEPTION 'invalid search sort' USING ERRCODE = '22023';
    END IF;
    IF search_query IS NULL OR length(btrim(search_query)) NOT BETWEEN 1 AND 300
       OR search_filters IS NULL OR jsonb_typeof(search_filters) <> 'object'
       OR result_limit NOT BETWEEN 1 AND 101
       OR (cursor_value IS NULL) <> (cursor_id IS NULL) THEN
        RAISE EXCEPTION 'invalid search request' USING ERRCODE = '22023';
    END IF;

    PERFORM security.authz_bind_context(
        security.authz_current_uuid('app.session_id'),
        security.authz_current_uuid('app.user_id')
    );
    IF COALESCE(current_setting('app.catalog_read_allowed', true), 'false') <> 'true' THEN
        RAISE EXCEPTION 'catalog search is not allowed' USING ERRCODE = '42501';
    END IF;

    allowed_category_ids := current_setting('app.allowed_category_ids')::bigint[];
    allowed_company_ids := current_setting('app.allowed_company_ids')::integer[];
    denied_company_ids := current_setting('app.denied_company_ids')::integer[];
    company_allowlist_active := current_setting('app.company_allowlist_active')::boolean;
    internal_allowed := current_setting('app.catalog_internal_allowed')::boolean;
    requires_legacy_scope := current_setting('app.requires_legacy_scope')::boolean;

    SELECT COALESCE(array_agg(item::bigint), '{}'::bigint[]) INTO filter_security_domain_ids
      FROM jsonb_array_elements_text(COALESCE(search_filters->'securityDomainIds', '[]'::jsonb)) item;
    SELECT COALESCE(array_agg(item::bigint), '{}'::bigint[]) INTO filter_primary_category_ids
      FROM jsonb_array_elements_text(COALESCE(search_filters->'primaryCategoryIds', '[]'::jsonb)) item;
    SELECT COALESCE(array_agg(item), '{}'::text[]) INTO filter_manufacturers
      FROM jsonb_array_elements_text(COALESCE(search_filters->'manufacturerNames', '[]'::jsonb)) item;
    SELECT COALESCE(array_agg(item::integer), '{}'::integer[]) INTO filter_company_ids
      FROM jsonb_array_elements_text(COALESCE(search_filters->'companyIds', '[]'::jsonb)) item;
    SELECT COALESCE(array_agg(item), '{}'::text[]) INTO filter_regions
      FROM jsonb_array_elements_text(COALESCE(search_filters->'regions', '[]'::jsonb)) item;
    SELECT COALESCE(array_agg(item), '{}'::text[]) INTO filter_countries
      FROM jsonb_array_elements_text(COALESCE(search_filters->'countries', '[]'::jsonb)) item;
    SELECT COALESCE(array_agg(item), '{}'::text[]) INTO filter_materials
      FROM jsonb_array_elements_text(COALESCE(search_filters->'materials', '[]'::jsonb)) item;
    SELECT COALESCE(array_agg(item), '{}'::text[]) INTO filter_lifecycle_statuses
      FROM jsonb_array_elements_text(COALESCE(search_filters->'lifecycleStatuses', '[]'::jsonb)) item;

    IF cardinality(filter_security_domain_ids) > 100
       OR cardinality(filter_primary_category_ids) > 100
       OR cardinality(filter_manufacturers) > 100
       OR cardinality(filter_company_ids) > 100
       OR cardinality(filter_regions) > 100
       OR cardinality(filter_countries) > 100
       OR cardinality(filter_materials) > 100
       OR cardinality(filter_lifecycle_statuses) > 100 THEN
        RAISE EXCEPTION 'too many search filter values' USING ERRCODE = '22023';
    END IF;

    filter_model_year_from := (search_filters#>>'{modelYears,from}')::integer;
    filter_model_year_to := (search_filters#>>'{modelYears,to}')::integer;
    filter_weight_min := (search_filters#>>'{weightKg,min}')::numeric;
    filter_weight_max := (search_filters#>>'{weightKg,max}')::numeric;
    filter_cost_min := (search_filters#>>'{cost,min}')::numeric;
    filter_cost_max := (search_filters#>>'{cost,max}')::numeric;

    IF (filter_cost_min IS NOT NULL OR filter_cost_max IS NOT NULL)
       AND security.authz_field_access('costUsd') <> 'allow' THEN
        RAISE EXCEPTION 'cost filter is not allowed' USING ERRCODE = '42501';
    END IF;

    scope_clause := CASE WHEN requires_legacy_scope THEN
        'security.authz_part_in_scope(part.security_domain_id, part.primary_category_id, part.company_id, part.region)'
    ELSE
        'part.company_id <> ALL ($4) AND (NOT $5 OR part.company_id = ANY ($6))'
    END;
    sort_keyword := upper(requested_sort_direction);
    cursor_comparison := CASE requested_sort_direction WHEN 'asc' THEN '>' ELSE '<' END;
    IF cursor_value IS NOT NULL THEN
        cursor_clause := format(
            'AND (%1$s %2$s $22::%3$s OR (%1$s = $22::%3$s AND part.id > $23))',
            sort_expression,
            cursor_comparison,
            sort_type
        );
    END IF;

    RETURN QUERY EXECUTE format(
        'SELECT
            part.id, part.part_number, part.part_name, part.description,
            part.manufacturer, part.vehicle_program, part.region, part.country,
            part.model_year, part.material, part.lifecycle_status, part.weight_kg,
            part.security_domain_id, part.primary_category_id, part.updated_at,
            pdb.score(part.id) AS score
           FROM catalog.part_catalog part
          WHERE part.active
            AND (part.visibility_status IN (''organization'', ''restricted'') OR ($1 AND part.visibility_status = ''internal''))
            AND part.primary_category_id = ANY ($2)
            AND %1$s
            AND (part.part_number ||| $7 OR part.part_name ||| $7 OR part.description ||| $7)
            AND (cardinality($8) = 0 OR part.security_domain_id = ANY ($8))
            AND (cardinality($9) = 0 OR part.primary_category_id = ANY ($9))
            AND (cardinality($10) = 0 OR part.manufacturer = ANY ($10))
            AND (cardinality($11) = 0 OR part.company_id = ANY ($11))
            AND (cardinality($12) = 0 OR part.region = ANY ($12))
            AND (cardinality($13) = 0 OR part.country = ANY ($13))
            AND (cardinality($14) = 0 OR part.material = ANY ($14))
            AND (cardinality($15) = 0 OR part.lifecycle_status = ANY ($15))
            AND ($16 IS NULL OR part.model_year >= $16)
            AND ($17 IS NULL OR part.model_year <= $17)
            AND ($18 IS NULL OR part.weight_kg >= $18)
            AND ($19 IS NULL OR part.weight_kg <= $19)
            AND ($20 IS NULL OR part.cost_usd >= $20)
            AND ($21 IS NULL OR part.cost_usd <= $21)
            %2$s
          ORDER BY %3$s %4$s, part.id ASC
          LIMIT $24',
        scope_clause,
        cursor_clause,
        sort_expression,
        sort_keyword
    ) USING
        internal_allowed,
        allowed_category_ids,
        requires_legacy_scope,
        denied_company_ids,
        company_allowlist_active,
        allowed_company_ids,
        search_query,
        filter_security_domain_ids,
        filter_primary_category_ids,
        filter_manufacturers,
        filter_company_ids,
        filter_regions,
        filter_countries,
        filter_materials,
        filter_lifecycle_statuses,
        filter_model_year_from,
        filter_model_year_to,
        filter_weight_min,
        filter_weight_max,
        filter_cost_min,
        filter_cost_max,
        cursor_value,
        cursor_id,
        result_limit;
END
$function$;

REVOKE ALL ON FUNCTION catalog.search_visible_items(text, jsonb, text, text, text, bigint, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION catalog.search_visible_items(text, jsonb, text, text, text, bigint, integer) TO automotive_runtime;
