CREATE FUNCTION catalog.search_visible_count(search_query text, search_filters jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, app, catalog, security, public
AS $function$
DECLARE
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
    result_count bigint;
BEGIN
    IF search_query IS NULL OR length(btrim(search_query)) NOT BETWEEN 1 AND 300 THEN
        RAISE EXCEPTION 'invalid search query' USING ERRCODE = '22023';
    END IF;
    IF search_filters IS NULL OR jsonb_typeof(search_filters) <> 'object' THEN
        RAISE EXCEPTION 'invalid search filters' USING ERRCODE = '22023';
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

    SELECT COALESCE(array_agg(value::bigint), '{}'::bigint[])
      INTO filter_security_domain_ids
      FROM jsonb_array_elements_text(COALESCE(search_filters->'securityDomainIds', '[]'::jsonb)) value;
    SELECT COALESCE(array_agg(value::bigint), '{}'::bigint[])
      INTO filter_primary_category_ids
      FROM jsonb_array_elements_text(COALESCE(search_filters->'primaryCategoryIds', '[]'::jsonb)) value;
    SELECT COALESCE(array_agg(value), '{}'::text[])
      INTO filter_manufacturers
      FROM jsonb_array_elements_text(COALESCE(search_filters->'manufacturerNames', '[]'::jsonb)) value;
    SELECT COALESCE(array_agg(value::integer), '{}'::integer[])
      INTO filter_company_ids
      FROM jsonb_array_elements_text(COALESCE(search_filters->'companyIds', '[]'::jsonb)) value;
    SELECT COALESCE(array_agg(value), '{}'::text[])
      INTO filter_regions
      FROM jsonb_array_elements_text(COALESCE(search_filters->'regions', '[]'::jsonb)) value;
    SELECT COALESCE(array_agg(value), '{}'::text[])
      INTO filter_countries
      FROM jsonb_array_elements_text(COALESCE(search_filters->'countries', '[]'::jsonb)) value;
    SELECT COALESCE(array_agg(value), '{}'::text[])
      INTO filter_materials
      FROM jsonb_array_elements_text(COALESCE(search_filters->'materials', '[]'::jsonb)) value;
    SELECT COALESCE(array_agg(value), '{}'::text[])
      INTO filter_lifecycle_statuses
      FROM jsonb_array_elements_text(COALESCE(search_filters->'lifecycleStatuses', '[]'::jsonb)) value;

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

    SELECT count(*)::bigint
      INTO result_count
      FROM catalog.part_catalog part
     WHERE part.active
       AND (
            part.visibility_status IN ('organization', 'restricted')
            OR (internal_allowed AND part.visibility_status = 'internal')
       )
       AND part.primary_category_id = ANY (allowed_category_ids)
       AND (
            (requires_legacy_scope AND security.authz_part_in_scope(
                part.security_domain_id,
                part.primary_category_id,
                part.company_id,
                part.region
            ))
            OR (
                NOT requires_legacy_scope
                AND part.company_id <> ALL (denied_company_ids)
                AND (NOT company_allowlist_active OR part.company_id = ANY (allowed_company_ids))
            )
       )
       AND (
            part.part_number ||| search_query
            OR part.part_name ||| search_query
            OR part.description ||| search_query
       )
       AND (cardinality(filter_security_domain_ids) = 0 OR part.security_domain_id = ANY (filter_security_domain_ids))
       AND (cardinality(filter_primary_category_ids) = 0 OR part.primary_category_id = ANY (filter_primary_category_ids))
       AND (cardinality(filter_manufacturers) = 0 OR part.manufacturer = ANY (filter_manufacturers))
       AND (cardinality(filter_company_ids) = 0 OR part.company_id = ANY (filter_company_ids))
       AND (cardinality(filter_regions) = 0 OR part.region = ANY (filter_regions))
       AND (cardinality(filter_countries) = 0 OR part.country = ANY (filter_countries))
       AND (cardinality(filter_materials) = 0 OR part.material = ANY (filter_materials))
       AND (cardinality(filter_lifecycle_statuses) = 0 OR part.lifecycle_status = ANY (filter_lifecycle_statuses))
       AND (filter_model_year_from IS NULL OR part.model_year >= filter_model_year_from)
       AND (filter_model_year_to IS NULL OR part.model_year <= filter_model_year_to)
       AND (filter_weight_min IS NULL OR part.weight_kg >= filter_weight_min)
       AND (filter_weight_max IS NULL OR part.weight_kg <= filter_weight_max)
       AND (filter_cost_min IS NULL OR part.cost_usd >= filter_cost_min)
       AND (filter_cost_max IS NULL OR part.cost_usd <= filter_cost_max);

    RETURN result_count;
END
$function$;

CREATE FUNCTION catalog.search_visible_facet(
    search_query text,
    search_filters jsonb,
    requested_facet text
)
RETURNS TABLE (value text, count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, app, catalog, security, public
AS $function$
DECLARE
    facet_expression text;
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
    facet_expression := CASE requested_facet
        WHEN 'securityDomain' THEN 'part.security_domain_id'
        WHEN 'primaryCategory' THEN 'part.primary_category_id'
        WHEN 'manufacturer' THEN 'part.manufacturer'
        WHEN 'region' THEN 'part.region'
        WHEN 'material' THEN 'part.material'
        WHEN 'lifecycleStatus' THEN 'part.lifecycle_status'
        ELSE NULL
    END;
    IF facet_expression IS NULL THEN
        RAISE EXCEPTION 'invalid search facet' USING ERRCODE = '22023';
    END IF;
    IF search_query IS NULL OR length(btrim(search_query)) NOT BETWEEN 1 AND 300
       OR search_filters IS NULL OR jsonb_typeof(search_filters) <> 'object' THEN
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

    RETURN QUERY EXECUTE format(
        'SELECT %1$s::text AS value, count(*)::bigint AS count
           FROM catalog.part_catalog part
          WHERE part.active
            AND (part.visibility_status IN (''organization'', ''restricted'') OR ($1 AND part.visibility_status = ''internal''))
            AND part.primary_category_id = ANY ($2)
            AND (($3 AND security.authz_part_in_scope(part.security_domain_id, part.primary_category_id, part.company_id, part.region))
                 OR (NOT $3 AND part.company_id <> ALL ($4) AND (NOT $5 OR part.company_id = ANY ($6))))
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
          GROUP BY %1$s
          ORDER BY %1$s
          LIMIT 50',
        facet_expression
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
        filter_cost_max;
END
$function$;

REVOKE ALL ON FUNCTION catalog.search_visible_count(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION catalog.search_visible_facet(text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION catalog.search_visible_count(text, jsonb) TO automotive_runtime;
GRANT EXECUTE ON FUNCTION catalog.search_visible_facet(text, jsonb, text) TO automotive_runtime;
