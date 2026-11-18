CREATE OR REPLACE FUNCTION security.authz_bind_context(bound_session_id uuid, bound_user_id uuid)
RETURNS TABLE (
    membership_id uuid,
    organization_id uuid,
    role_id uuid,
    role_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, catalog, security, public
AS $function$
DECLARE
    context_membership_id uuid;
    context_organization_id uuid;
    context_role_id uuid;
    context_role_code text;
    context_allowed_category_ids bigint[];
    context_allowed_company_ids integer[];
    context_denied_company_ids integer[];
    context_company_allowlist_active boolean;
    context_requires_legacy_scope boolean;
    context_catalog_read_allowed boolean;
BEGIN
    SELECT m.id, m.organization_id, r.id, r.code
      INTO context_membership_id, context_organization_id, context_role_id, context_role_code
      FROM app.user_sessions s
      JOIN app.app_users u ON u.id = s.user_id
      JOIN app.organization_memberships m ON m.id = s.selected_membership_id
      JOIN app.organizations o ON o.id = m.organization_id
      JOIN security.roles r ON r.id = m.role_id
     WHERE s.id = bound_session_id
       AND s.user_id = bound_user_id
       AND s.revoked_at IS NULL
       AND s.expires_at > clock_timestamp()
       AND s.absolute_expires_at > clock_timestamp()
       AND s.authorization_version = u.authorization_version
       AND u.status = 'active'
       AND m.user_id = u.id
       AND m.status = 'active'
       AND m.valid_from <= clock_timestamp()
       AND (m.valid_until IS NULL OR m.valid_until > clock_timestamp())
       AND o.status = 'active'
       AND r.status = 'active';

    IF context_membership_id IS NULL THEN
        RAISE EXCEPTION 'authorization context is not available'
            USING ERRCODE = '42501';
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM security.role_permissions permission
        WHERE permission.role_id = context_role_id
          AND permission.permission_code IN ('catalog.search', 'catalog.read')
    ) INTO context_catalog_read_allowed;

    SELECT COALESCE(array_agg(candidate.id ORDER BY candidate.id), '{}'::bigint[])
      INTO context_allowed_category_ids
      FROM catalog.categories candidate
     WHERE candidate.status = 'active'
       AND EXISTS (
            SELECT 1
            FROM security.organization_category_entitlements entitlement
            JOIN catalog.categories scoped ON scoped.id = entitlement.category_id
            WHERE entitlement.organization_id = context_organization_id
              AND entitlement.effect = 'allow'
              AND entitlement.valid_from <= clock_timestamp()
              AND (entitlement.valid_until IS NULL OR entitlement.valid_until > clock_timestamp())
              AND (
                    (entitlement.include_descendants AND candidate.path <@ scoped.path)
                    OR (NOT entitlement.include_descendants AND candidate.id = scoped.id)
              )
       )
       AND NOT EXISTS (
            SELECT 1
            FROM security.organization_category_entitlements entitlement
            JOIN catalog.categories scoped ON scoped.id = entitlement.category_id
            WHERE entitlement.organization_id = context_organization_id
              AND entitlement.effect = 'deny'
              AND entitlement.valid_from <= clock_timestamp()
              AND (entitlement.valid_until IS NULL OR entitlement.valid_until > clock_timestamp())
              AND (
                    (entitlement.include_descendants AND candidate.path <@ scoped.path)
                    OR (NOT entitlement.include_descendants AND candidate.id = scoped.id)
              )
       );

    SELECT
        COALESCE(
            array_agg(restriction.company_id ORDER BY restriction.company_id)
                FILTER (WHERE restriction.effect = 'allow'),
            '{}'::integer[]
        ),
        COALESCE(
            array_agg(restriction.company_id ORDER BY restriction.company_id)
                FILTER (WHERE restriction.effect = 'deny'),
            ARRAY[0]::integer[]
        ),
        COALESCE(bool_or(restriction.effect = 'allow'), false)
      INTO
        context_allowed_company_ids,
        context_denied_company_ids,
        context_company_allowlist_active
      FROM security.user_scope_restrictions restriction
     WHERE restriction.membership_id = context_membership_id
       AND restriction.scope_type = 'company'
       AND restriction.valid_from <= clock_timestamp()
       AND (restriction.valid_until IS NULL OR restriction.valid_until > clock_timestamp());

    SELECT EXISTS (
        SELECT 1
        FROM security.user_scope_restrictions restriction
        WHERE restriction.membership_id = context_membership_id
          AND restriction.scope_type IN ('category', 'region')
          AND restriction.valid_from <= clock_timestamp()
          AND (restriction.valid_until IS NULL OR restriction.valid_until > clock_timestamp())
    ) INTO context_requires_legacy_scope;

    PERFORM set_config('app.user_id', bound_user_id::text, true);
    PERFORM set_config('app.session_id', bound_session_id::text, true);
    PERFORM set_config('app.membership_id', context_membership_id::text, true);
    PERFORM set_config('app.organization_id', context_organization_id::text, true);
    PERFORM set_config('app.role_id', context_role_id::text, true);
    PERFORM set_config('app.catalog_read_allowed', context_catalog_read_allowed::text, true);
    PERFORM set_config('app.catalog_internal_allowed', (context_role_code = 'GLOBAL_ADMIN')::text, true);
    PERFORM set_config('app.allowed_category_ids', context_allowed_category_ids::text, true);
    PERFORM set_config('app.allowed_company_ids', context_allowed_company_ids::text, true);
    PERFORM set_config('app.denied_company_ids', context_denied_company_ids::text, true);
    PERFORM set_config('app.company_allowlist_active', context_company_allowlist_active::text, true);
    PERFORM set_config('app.requires_legacy_scope', context_requires_legacy_scope::text, true);

    RETURN QUERY SELECT
        context_membership_id,
        context_organization_id,
        context_role_id,
        context_role_code;
END
$function$;

REVOKE ALL ON FUNCTION security.authz_bind_context(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION security.authz_bind_context(uuid, uuid) TO automotive_runtime;
