CREATE FUNCTION security.authz_current_uuid(setting_name text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog
AS $function$
DECLARE
    setting_value text;
BEGIN
    setting_value := current_setting(setting_name, true);
    IF setting_value IS NULL OR setting_value = '' THEN
        RETURN NULL;
    END IF;
    RETURN setting_value::uuid;
EXCEPTION
    WHEN invalid_text_representation THEN
        RETURN NULL;
END
$function$;

CREATE FUNCTION security.authz_bind_context(bound_session_id uuid, bound_user_id uuid)
RETURNS TABLE (
    membership_id uuid,
    organization_id uuid,
    role_id uuid,
    role_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, security
AS $function$
DECLARE
    context_membership_id uuid;
    context_organization_id uuid;
    context_role_id uuid;
    context_role_code text;
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

    PERFORM set_config('app.user_id', bound_user_id::text, true);
    PERFORM set_config('app.session_id', bound_session_id::text, true);
    PERFORM set_config('app.membership_id', context_membership_id::text, true);
    PERFORM set_config('app.organization_id', context_organization_id::text, true);
    PERFORM set_config('app.role_id', context_role_id::text, true);

    RETURN QUERY SELECT
        context_membership_id,
        context_organization_id,
        context_role_id,
        context_role_code;
END
$function$;

CREATE FUNCTION security.authz_has_permission(required_permission text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, security
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM security.role_permissions rp
        JOIN security.roles r ON r.id = rp.role_id
        JOIN security.permissions p ON p.code = rp.permission_code
        WHERE rp.role_id = security.authz_current_uuid('app.role_id')
          AND rp.permission_code = required_permission
          AND r.status = 'active'
    )
$function$;

CREATE FUNCTION security.authz_authorize_session(
    checked_session_id uuid,
    checked_user_id uuid,
    required_permissions text[]
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, app, security
AS $function$
DECLARE
    checked_role_id uuid;
BEGIN
    IF required_permissions IS NULL OR cardinality(required_permissions) = 0 THEN
        RETURN false;
    END IF;

    SELECT r.id
      INTO checked_role_id
      FROM app.user_sessions s
      JOIN app.app_users u ON u.id = s.user_id
      JOIN app.organization_memberships m ON m.id = s.selected_membership_id
      JOIN app.organizations o ON o.id = m.organization_id
      JOIN security.roles r ON r.id = m.role_id
     WHERE s.id = checked_session_id
       AND s.user_id = checked_user_id
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

    RETURN checked_role_id IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM unnest(required_permissions) permission(code)
            WHERE NOT EXISTS (
                SELECT 1
                FROM security.role_permissions rp
                WHERE rp.role_id = checked_role_id
                  AND rp.permission_code = permission.code
            )
       );
END
$function$;

CREATE FUNCTION security.authz_category_matches(
    candidate_category_id bigint,
    scoped_category_id bigint,
    include_descendants boolean
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, catalog, public
AS $function$
    SELECT COALESCE((
        SELECT CASE
            WHEN include_descendants THEN candidate.path <@ scoped.path
            ELSE candidate.id = scoped.id
        END
        FROM catalog.categories candidate
        JOIN catalog.categories scoped ON scoped.id = scoped_category_id
        WHERE candidate.id = candidate_category_id
    ), false)
$function$;

CREATE FUNCTION security.authz_part_in_scope(
    part_security_domain_id bigint,
    part_primary_category_id bigint,
    part_company_id integer,
    part_region text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, security
AS $function$
    WITH context AS (
        SELECT
            security.authz_current_uuid('app.organization_id') AS organization_id,
            security.authz_current_uuid('app.membership_id') AS membership_id
    ), active_entitlements AS (
        SELECT entitlement.*
        FROM security.organization_category_entitlements entitlement
        CROSS JOIN context
        WHERE entitlement.organization_id = context.organization_id
          AND entitlement.valid_from <= clock_timestamp()
          AND (entitlement.valid_until IS NULL OR entitlement.valid_until > clock_timestamp())
    ), active_restrictions AS (
        SELECT restriction.*
        FROM security.user_scope_restrictions restriction
        CROSS JOIN context
        WHERE restriction.membership_id = context.membership_id
          AND restriction.valid_from <= clock_timestamp()
          AND (restriction.valid_until IS NULL OR restriction.valid_until > clock_timestamp())
    )
    SELECT
        (SELECT organization_id IS NOT NULL AND membership_id IS NOT NULL FROM context)
        AND EXISTS (
            SELECT 1 FROM active_entitlements entitlement
            WHERE entitlement.effect = 'allow'
              AND security.authz_category_matches(
                    part_primary_category_id,
                    entitlement.category_id,
                    entitlement.include_descendants
              )
        )
        AND NOT EXISTS (
            SELECT 1 FROM active_entitlements entitlement
            WHERE entitlement.effect = 'deny'
              AND security.authz_category_matches(
                    part_primary_category_id,
                    entitlement.category_id,
                    entitlement.include_descendants
              )
        )
        AND NOT EXISTS (
            SELECT 1 FROM active_restrictions restriction
            WHERE restriction.effect = 'deny'
              AND CASE restriction.scope_type
                    WHEN 'category' THEN security.authz_category_matches(
                        part_primary_category_id,
                        restriction.category_id,
                        restriction.include_descendants
                    )
                    WHEN 'company' THEN part_company_id = restriction.company_id
                    WHEN 'region' THEN part_region = restriction.region
                    ELSE false
                  END
        )
        AND NOT EXISTS (
            SELECT 1
            FROM (VALUES ('category'), ('company'), ('region')) scope(scope_type)
            WHERE EXISTS (
                SELECT 1 FROM active_restrictions restriction
                WHERE restriction.effect = 'allow'
                  AND restriction.scope_type = scope.scope_type
            )
              AND NOT EXISTS (
                SELECT 1 FROM active_restrictions restriction
                WHERE restriction.effect = 'allow'
                  AND restriction.scope_type = scope.scope_type
                  AND CASE restriction.scope_type
                        WHEN 'category' THEN security.authz_category_matches(
                            part_primary_category_id,
                            restriction.category_id,
                            restriction.include_descendants
                        )
                        WHEN 'company' THEN part_company_id = restriction.company_id
                        WHEN 'region' THEN part_region = restriction.region
                        ELSE false
                      END
            )
        )
$function$;

CREATE FUNCTION security.authz_can_read_part(
    part_security_domain_id bigint,
    part_primary_category_id bigint,
    part_company_id integer,
    part_region text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, security
AS $function$
    SELECT (
        security.authz_has_permission('catalog.search')
        OR security.authz_has_permission('catalog.read')
    ) AND security.authz_part_in_scope(
        part_security_domain_id,
        part_primary_category_id,
        part_company_id,
        part_region
    )
$function$;

CREATE FUNCTION security.authz_can_view_category(candidate_category_id bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, catalog, security, public
AS $function$
    SELECT (
        security.authz_has_permission('catalog.search')
        OR security.authz_has_permission('catalog.read')
    ) AND EXISTS (
        SELECT 1
        FROM security.organization_category_entitlements entitlement
        JOIN catalog.categories candidate ON candidate.id = candidate_category_id
        JOIN catalog.categories scoped ON scoped.id = entitlement.category_id
        WHERE entitlement.organization_id = security.authz_current_uuid('app.organization_id')
          AND entitlement.effect = 'allow'
          AND entitlement.valid_from <= clock_timestamp()
          AND (entitlement.valid_until IS NULL OR entitlement.valid_until > clock_timestamp())
          AND (
              candidate.path <@ scoped.path
              OR scoped.path <@ candidate.path
          )
          AND NOT EXISTS (
              SELECT 1
              FROM security.organization_category_entitlements denied
              JOIN catalog.categories denied_scope ON denied_scope.id = denied.category_id
              WHERE denied.organization_id = entitlement.organization_id
                AND denied.effect = 'deny'
                AND denied.valid_from <= clock_timestamp()
                AND (denied.valid_until IS NULL OR denied.valid_until > clock_timestamp())
                AND candidate.path <@ denied_scope.path
          )
    )
$function$;

CREATE FUNCTION security.authz_field_access(requested_field text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, security
AS $function$
    SELECT COALESCE((
        SELECT rule.access
        FROM security.field_access_rules rule
        WHERE rule.role_id = security.authz_current_uuid('app.role_id')
          AND rule.resource_type = 'catalog.part'
          AND rule.field_name = requested_field
    ), CASE
        WHEN requested_field IN ('costUsd', 'supplierStatus', 'sourceSystem', 'sourceRecordId')
            THEN 'omit'
        ELSE 'allow'
    END)
$function$;

INSERT INTO security.field_access_rules (role_id, resource_type, field_name, access)
SELECT role.id, 'catalog.part', field.field_name, role_access.access
FROM security.roles role
CROSS JOIN (VALUES
    ('costUsd'),
    ('supplierStatus'),
    ('sourceSystem'),
    ('sourceRecordId')
) field(field_name)
CROSS JOIN LATERAL (
    SELECT CASE
        WHEN role.code IN ('GLOBAL_ADMIN', 'ORG_ADMIN', 'ANALYST') THEN 'allow'
        ELSE 'omit'
    END AS access
) role_access
WHERE role.organization_id IS NULL;

CREATE POLICY organizations_current_context_select ON app.organizations
    FOR SELECT TO automotive_runtime
    USING (id = security.authz_current_uuid('app.organization_id'));

CREATE POLICY app_users_self_or_organization_select ON app.app_users
    FOR SELECT TO automotive_runtime
    USING (
        id = security.authz_current_uuid('app.user_id')
        OR (
            security.authz_has_permission('organization.users.read')
            AND EXISTS (
                SELECT 1
                FROM app.organization_memberships visible_membership
                WHERE visible_membership.user_id = app_users.id
                  AND visible_membership.organization_id = security.authz_current_uuid('app.organization_id')
                  AND visible_membership.status = 'active'
            )
        )
    );

CREATE POLICY memberships_current_context_select ON app.organization_memberships
    FOR SELECT TO automotive_runtime
    USING (
        user_id = security.authz_current_uuid('app.user_id')
        OR (
            organization_id = security.authz_current_uuid('app.organization_id')
            AND security.authz_has_permission('organization.users.read')
        )
    );

CREATE POLICY categories_authorized_select ON catalog.categories
    FOR SELECT TO automotive_runtime
    USING (security.authz_can_view_category(id));

CREATE POLICY part_catalog_authorized_select ON catalog.part_catalog
    FOR SELECT TO automotive_runtime
    USING (security.authz_can_read_part(
        security_domain_id,
        primary_category_id,
        company_id,
        region
    ));

CREATE POLICY part_categories_authorized_select ON catalog.part_categories
    FOR SELECT TO automotive_runtime
    USING (EXISTS (
        SELECT 1 FROM catalog.part_catalog visible_part
        WHERE visible_part.id = part_categories.part_id
    ));

CREATE POLICY roles_current_context_select ON security.roles
    FOR SELECT TO automotive_runtime
    USING (
        id = security.authz_current_uuid('app.role_id')
        OR (
            security.authz_has_permission('organization.roles.assign')
            AND (organization_id IS NULL OR organization_id = security.authz_current_uuid('app.organization_id'))
        )
    );

CREATE POLICY permissions_current_role_select ON security.permissions
    FOR SELECT TO automotive_runtime
    USING (EXISTS (
        SELECT 1
        FROM security.role_permissions rp
        WHERE rp.role_id = security.authz_current_uuid('app.role_id')
          AND rp.permission_code = permissions.code
    ));

CREATE POLICY role_permissions_current_context_select ON security.role_permissions
    FOR SELECT TO automotive_runtime
    USING (
        role_id = security.authz_current_uuid('app.role_id')
        OR security.authz_has_permission('organization.roles.assign')
    );

CREATE POLICY entitlements_current_organization_select ON security.organization_category_entitlements
    FOR SELECT TO automotive_runtime
    USING (
        organization_id = security.authz_current_uuid('app.organization_id')
        AND security.authz_has_permission('organization.entitlements.read')
    );

CREATE POLICY restrictions_current_context_select ON security.user_scope_restrictions
    FOR SELECT TO automotive_runtime
    USING (
        membership_id = security.authz_current_uuid('app.membership_id')
        OR security.authz_has_permission('organization.users.read')
    );

CREATE POLICY field_rules_current_role_select ON security.field_access_rules
    FOR SELECT TO automotive_runtime
    USING (role_id = security.authz_current_uuid('app.role_id'));

CREATE POLICY audit_current_organization_select ON audit.audit_events
    FOR SELECT TO automotive_runtime
    USING (
        organization_id = security.authz_current_uuid('app.organization_id')
        AND security.authz_has_permission('audit.read')
    );

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA security FROM PUBLIC;
GRANT EXECUTE ON FUNCTION security.authz_bind_context(uuid, uuid) TO automotive_runtime;
GRANT EXECUTE ON FUNCTION security.authz_authorize_session(uuid, uuid, text[]) TO automotive_runtime;
GRANT EXECUTE ON FUNCTION security.authz_field_access(text) TO automotive_runtime;
GRANT EXECUTE ON FUNCTION security.authz_current_uuid(text) TO automotive_runtime;
GRANT EXECUTE ON FUNCTION security.authz_has_permission(text) TO automotive_runtime;
GRANT EXECUTE ON FUNCTION security.authz_category_matches(bigint, bigint, boolean) TO automotive_runtime;
GRANT EXECUTE ON FUNCTION security.authz_part_in_scope(bigint, bigint, integer, text) TO automotive_runtime;
GRANT EXECUTE ON FUNCTION security.authz_can_read_part(bigint, bigint, integer, text) TO automotive_runtime;
GRANT EXECUTE ON FUNCTION security.authz_can_view_category(bigint) TO automotive_runtime;
