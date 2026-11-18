CREATE FUNCTION security.authz_is_global_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, security
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM security.roles role
        WHERE role.id = security.authz_current_uuid('app.role_id')
          AND role.code = 'GLOBAL_ADMIN'
          AND role.status = 'active'
    )
$function$;

DROP POLICY part_catalog_authorized_select ON catalog.part_catalog;

CREATE POLICY part_catalog_authorized_select ON catalog.part_catalog
    FOR SELECT TO automotive_runtime
    USING (
        active
        AND (
            visibility_status IN ('organization', 'restricted')
            OR (
                visibility_status = 'internal'
                AND security.authz_is_global_admin()
            )
        )
        AND security.authz_can_read_part(
            security_domain_id,
            primary_category_id,
            company_id,
            region
        )
    );

REVOKE ALL ON FUNCTION security.authz_is_global_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION security.authz_is_global_admin() TO automotive_runtime;

