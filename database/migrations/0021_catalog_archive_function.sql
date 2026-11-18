CREATE FUNCTION security.app_archive_catalog_part(
    checked_session_id uuid,
    checked_user_id uuid,
    catalog_part_id bigint,
    expected_version integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, catalog, security
AS $function$
DECLARE
    part catalog.part_catalog%ROWTYPE;
BEGIN
    IF security.authz_current_uuid('app.session_id') IS DISTINCT FROM checked_session_id
       OR security.authz_current_uuid('app.user_id') IS DISTINCT FROM checked_user_id
       OR NOT security.authz_authorize_session(
            checked_session_id, checked_user_id, ARRAY['catalog.archive']::text[]
       ) THEN
        RAISE EXCEPTION 'catalog archive is not authorized' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO part FROM catalog.part_catalog WHERE id = catalog_part_id FOR UPDATE;
    IF NOT FOUND OR NOT part.active OR NOT security.authz_part_in_scope(
        part.security_domain_id, part.primary_category_id, part.company_id, part.region
    ) THEN
        RETURN 'not_found';
    END IF;
    IF part.document_version <> expected_version THEN
        RETURN 'version_mismatch';
    END IF;

    UPDATE catalog.part_catalog
       SET active = false,
           lifecycle_status = 'archived',
           document_version = document_version + 1
     WHERE id = catalog_part_id;
    RETURN 'ok';
END
$function$;

REVOKE ALL ON FUNCTION security.app_archive_catalog_part(uuid, uuid, bigint, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION security.app_archive_catalog_part(uuid, uuid, bigint, integer) TO automotive_runtime;
