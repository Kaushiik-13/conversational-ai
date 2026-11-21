-- A signature of exactly which catalog rows the current user can see.
--
-- The API uses it as part of the cache key for facet counts: two users share a
-- cached result only when their signatures are identical, so a cached count can
-- never reveal rows another user is not allowed to see.
CREATE FUNCTION catalog.search_visibility_signature()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, catalog, security, public
AS $function$
DECLARE
    requires_legacy_scope boolean;
BEGIN
    PERFORM security.authz_bind_context(
        security.authz_current_uuid('app.session_id'),
        security.authz_current_uuid('app.user_id')
    );
    IF COALESCE(current_setting('app.catalog_read_allowed', true), 'false') <> 'true' THEN
        RAISE EXCEPTION 'catalog search is not allowed' USING ERRCODE = '42501';
    END IF;

    requires_legacy_scope := current_setting('app.requires_legacy_scope')::boolean;

    -- When per-user scope restrictions apply, visibility also depends on the
    -- organization and membership, so they are part of the signature.
    RETURN md5(concat_ws(
        '|',
        current_setting('app.catalog_internal_allowed'),
        current_setting('app.allowed_category_ids'),
        current_setting('app.allowed_company_ids'),
        current_setting('app.denied_company_ids'),
        current_setting('app.company_allowlist_active'),
        current_setting('app.requires_legacy_scope'),
        CASE WHEN requires_legacy_scope
             THEN COALESCE(current_setting('app.organization_id', true), '')
                  || '|' || COALESCE(current_setting('app.membership_id', true), '')
             ELSE ''
        END
    ));
END
$function$;

REVOKE ALL ON FUNCTION catalog.search_visibility_signature() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION catalog.search_visibility_signature() TO automotive_app;
