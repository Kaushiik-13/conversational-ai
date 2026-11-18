ALTER TABLE app.organizations
    ADD COLUMN resource_version integer NOT NULL DEFAULT 1,
    ADD COLUMN authorization_version bigint NOT NULL DEFAULT 1,
    ADD CONSTRAINT organizations_resource_version_positive CHECK (resource_version > 0),
    ADD CONSTRAINT organizations_authorization_version_positive CHECK (authorization_version > 0);

ALTER TABLE app.app_users
    ADD COLUMN resource_version integer NOT NULL DEFAULT 1,
    ADD CONSTRAINT app_users_resource_version_positive CHECK (resource_version > 0);

ALTER TABLE app.organization_memberships
    ADD COLUMN resource_version integer NOT NULL DEFAULT 1,
    ADD CONSTRAINT memberships_resource_version_positive CHECK (resource_version > 0);

ALTER TABLE catalog.categories
    ADD COLUMN resource_version integer NOT NULL DEFAULT 1,
    ADD CONSTRAINT categories_resource_version_positive CHECK (resource_version > 0);

CREATE TABLE app.idempotency_keys (
    user_id uuid NOT NULL REFERENCES app.app_users (id),
    organization_id uuid NOT NULL REFERENCES app.organizations (id),
    http_method text NOT NULL,
    route text NOT NULL,
    idempotency_key text NOT NULL,
    request_hash text NOT NULL,
    response_body jsonb,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '24 hours'),
    PRIMARY KEY (user_id, organization_id, http_method, route, idempotency_key),
    CONSTRAINT idempotency_method_check CHECK (http_method IN ('POST', 'PUT')),
    CONSTRAINT idempotency_key_length CHECK (length(idempotency_key) BETWEEN 8 AND 200),
    CONSTRAINT idempotency_hash_format CHECK (request_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT idempotency_expiry_check CHECK (expires_at > created_at)
);

CREATE INDEX idempotency_keys_expiry_index ON app.idempotency_keys (expires_at);

ALTER TABLE app.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.idempotency_keys FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON app.idempotency_keys TO automotive_runtime;

CREATE POLICY idempotency_current_context_all ON app.idempotency_keys
    FOR ALL TO automotive_runtime
    USING (
        user_id = security.authz_current_uuid('app.user_id')
        AND organization_id = security.authz_current_uuid('app.organization_id')
    )
    WITH CHECK (
        user_id = security.authz_current_uuid('app.user_id')
        AND organization_id = security.authz_current_uuid('app.organization_id')
    );

DROP POLICY organizations_current_context_select ON app.organizations;
CREATE POLICY organizations_authorized_select ON app.organizations
    FOR SELECT TO automotive_runtime
    USING (
        id = security.authz_current_uuid('app.organization_id')
        OR security.authz_is_global_admin()
    );

CREATE POLICY organizations_global_update ON app.organizations
    FOR UPDATE TO automotive_runtime
    USING (security.authz_is_global_admin())
    WITH CHECK (security.authz_is_global_admin());

DROP POLICY app_users_self_or_organization_select ON app.app_users;
CREATE POLICY app_users_authorized_select ON app.app_users
    FOR SELECT TO automotive_runtime
    USING (
        security.authz_is_global_admin()
        OR id = security.authz_current_uuid('app.user_id')
        OR (
            security.authz_has_permission('organization.users.read')
            AND EXISTS (
                SELECT 1 FROM app.organization_memberships visible_membership
                WHERE visible_membership.user_id = app_users.id
                  AND visible_membership.organization_id = security.authz_current_uuid('app.organization_id')
            )
        )
    );

DROP POLICY memberships_current_context_select ON app.organization_memberships;
CREATE POLICY memberships_authorized_select ON app.organization_memberships
    FOR SELECT TO automotive_runtime
    USING (
        security.authz_is_global_admin()
        OR user_id = security.authz_current_uuid('app.user_id')
        OR (
            organization_id = security.authz_current_uuid('app.organization_id')
            AND security.authz_has_permission('organization.users.read')
        )
    );

CREATE POLICY app_users_authorized_insert ON app.app_users
    FOR INSERT TO automotive_runtime
    WITH CHECK (security.authz_has_permission('organization.users.manage'));

CREATE POLICY app_users_authorized_update ON app.app_users
    FOR UPDATE TO automotive_runtime
    USING (
        security.authz_is_global_admin()
        OR (
            security.authz_has_permission('organization.users.manage')
            AND EXISTS (
                SELECT 1
                FROM app.organization_memberships membership
                WHERE membership.user_id = app_users.id
                  AND membership.organization_id = security.authz_current_uuid('app.organization_id')
            )
        )
    )
    WITH CHECK (
        security.authz_is_global_admin()
        OR security.authz_has_permission('organization.users.manage')
    );

CREATE POLICY memberships_authorized_insert ON app.organization_memberships
    FOR INSERT TO automotive_runtime
    WITH CHECK (
        security.authz_has_permission('organization.users.manage')
        AND (
            organization_id = security.authz_current_uuid('app.organization_id')
            OR security.authz_is_global_admin()
        )
        AND (
            security.authz_is_global_admin()
            OR NOT EXISTS (
                SELECT 1 FROM security.roles target_role
                WHERE target_role.id = role_id AND target_role.code = 'GLOBAL_ADMIN'
            )
        )
    );

CREATE POLICY memberships_authorized_update ON app.organization_memberships
    FOR UPDATE TO automotive_runtime
    USING (
        security.authz_has_permission('organization.users.manage')
        AND (
            organization_id = security.authz_current_uuid('app.organization_id')
            OR security.authz_is_global_admin()
        )
    )
    WITH CHECK (
        security.authz_has_permission('organization.users.manage')
        AND (
            organization_id = security.authz_current_uuid('app.organization_id')
            OR security.authz_is_global_admin()
        )
        AND (
            security.authz_is_global_admin()
            OR NOT EXISTS (
                SELECT 1 FROM security.roles target_role
                WHERE target_role.id = role_id AND target_role.code = 'GLOBAL_ADMIN'
            )
        )
    );

DROP POLICY categories_authorized_select ON catalog.categories;
CREATE POLICY categories_authorized_select ON catalog.categories
    FOR SELECT TO automotive_runtime
    USING (security.authz_is_global_admin() OR security.authz_can_view_category(id));

CREATE POLICY categories_global_insert ON catalog.categories
    FOR INSERT TO automotive_runtime
    WITH CHECK (
        security.authz_is_global_admin()
        AND security.authz_has_permission('taxonomy.manage')
    );

CREATE POLICY categories_global_update ON catalog.categories
    FOR UPDATE TO automotive_runtime
    USING (
        security.authz_is_global_admin()
        AND security.authz_has_permission('taxonomy.manage')
    )
    WITH CHECK (
        security.authz_is_global_admin()
        AND security.authz_has_permission('taxonomy.manage')
    );

DROP POLICY permissions_current_role_select ON security.permissions;
CREATE POLICY permissions_authorized_select ON security.permissions
    FOR SELECT TO automotive_runtime
    USING (
        EXISTS (
            SELECT 1 FROM security.role_permissions role_permission
            WHERE role_permission.permission_code = permissions.code
              AND (
                  role_permission.role_id = security.authz_current_uuid('app.role_id')
                  OR security.authz_has_permission('organization.roles.assign')
              )
        )
    );

CREATE POLICY part_catalog_authorized_insert ON catalog.part_catalog
    FOR INSERT TO automotive_runtime
    WITH CHECK (
        security.authz_has_permission('catalog.create')
        AND security.authz_part_in_scope(
            security_domain_id, primary_category_id, company_id, region
        )
    );

CREATE POLICY part_catalog_authorized_update ON catalog.part_catalog
    FOR UPDATE TO automotive_runtime
    USING (
        security.authz_part_in_scope(
            security_domain_id, primary_category_id, company_id, region
        )
        AND (
            security.authz_has_permission('catalog.update')
            OR security.authz_has_permission('catalog.archive')
        )
    )
    WITH CHECK (
        security.authz_part_in_scope(
            security_domain_id, primary_category_id, company_id, region
        )
    );

CREATE POLICY part_categories_authorized_insert ON catalog.part_categories
    FOR INSERT TO automotive_runtime
    WITH CHECK (
        security.authz_has_permission('catalog.create')
        OR security.authz_has_permission('catalog.update')
    );

CREATE POLICY part_categories_authorized_update ON catalog.part_categories
    FOR UPDATE TO automotive_runtime
    USING (
        security.authz_has_permission('catalog.update')
        AND EXISTS (
            SELECT 1 FROM catalog.part_catalog visible_part
            WHERE visible_part.id = part_categories.part_id
        )
    )
    WITH CHECK (security.authz_has_permission('catalog.update'));

CREATE POLICY part_categories_authorized_delete ON catalog.part_categories
    FOR DELETE TO automotive_runtime
    USING (
        security.authz_has_permission('catalog.update')
        AND EXISTS (
            SELECT 1 FROM catalog.part_catalog visible_part
            WHERE visible_part.id = part_categories.part_id
        )
    );

DROP POLICY entitlements_current_organization_select ON security.organization_category_entitlements;
CREATE POLICY entitlements_authorized_select ON security.organization_category_entitlements
    FOR SELECT TO automotive_runtime
    USING (
        security.authz_has_permission('organization.entitlements.read')
        AND (
            organization_id = security.authz_current_uuid('app.organization_id')
            OR security.authz_is_global_admin()
        )
    );

CREATE POLICY entitlements_global_insert ON security.organization_category_entitlements
    FOR INSERT TO automotive_runtime
    WITH CHECK (
        security.authz_is_global_admin()
        AND security.authz_has_permission('organization.entitlements.update')
    );

CREATE POLICY entitlements_global_update ON security.organization_category_entitlements
    FOR UPDATE TO automotive_runtime
    USING (
        security.authz_is_global_admin()
        AND security.authz_has_permission('organization.entitlements.update')
    )
    WITH CHECK (
        security.authz_is_global_admin()
        AND security.authz_has_permission('organization.entitlements.update')
    );

CREATE POLICY restrictions_authorized_insert ON security.user_scope_restrictions
    FOR INSERT TO automotive_runtime
    WITH CHECK (
        security.authz_has_permission('organization.users.manage')
        AND EXISTS (
            SELECT 1
            FROM app.organization_memberships membership
            WHERE membership.id = membership_id
              AND (
                  membership.organization_id = security.authz_current_uuid('app.organization_id')
                  OR security.authz_is_global_admin()
              )
        )
    );

CREATE POLICY restrictions_authorized_update ON security.user_scope_restrictions
    FOR UPDATE TO automotive_runtime
    USING (
        security.authz_has_permission('organization.users.manage')
        AND EXISTS (
            SELECT 1 FROM app.organization_memberships membership
            WHERE membership.id = user_scope_restrictions.membership_id
              AND (
                  membership.organization_id = security.authz_current_uuid('app.organization_id')
                  OR security.authz_is_global_admin()
              )
        )
    )
    WITH CHECK (
        security.authz_has_permission('organization.users.manage')
        AND EXISTS (
            SELECT 1 FROM app.organization_memberships membership
            WHERE membership.id = user_scope_restrictions.membership_id
              AND (
                  membership.organization_id = security.authz_current_uuid('app.organization_id')
                  OR security.authz_is_global_admin()
              )
        )
    );

CREATE POLICY restrictions_authorized_delete ON security.user_scope_restrictions
    FOR DELETE TO automotive_runtime
    USING (
        security.authz_has_permission('organization.users.manage')
        AND EXISTS (
            SELECT 1 FROM app.organization_memberships membership
            WHERE membership.id = user_scope_restrictions.membership_id
              AND (
                  membership.organization_id = security.authz_current_uuid('app.organization_id')
                  OR security.authz_is_global_admin()
              )
        )
    );

DROP POLICY restrictions_current_context_select ON security.user_scope_restrictions;
CREATE POLICY restrictions_current_context_select ON security.user_scope_restrictions
    FOR SELECT TO automotive_runtime
    USING (
        membership_id = security.authz_current_uuid('app.membership_id')
        OR (
            security.authz_has_permission('organization.users.read')
            AND EXISTS (
                SELECT 1 FROM app.organization_memberships membership
                WHERE membership.id = user_scope_restrictions.membership_id
                  AND (
                      membership.organization_id = security.authz_current_uuid('app.organization_id')
                      OR security.authz_is_global_admin()
                  )
            )
        )
    );

CREATE FUNCTION security.app_record_event(
    event_request_id uuid,
    event_actor_user_id uuid,
    event_organization_id uuid,
    event_session_id uuid,
    event_action text,
    event_decision text,
    event_resource_type text,
    event_resource_id text,
    event_metadata jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, audit
AS $function$
DECLARE
    resolved_organization_id uuid;
BEGIN
    IF event_action !~ '^[a-z][a-z0-9.-]{2,159}$'
       OR event_decision NOT IN ('allow', 'deny', 'error') THEN
        RAISE EXCEPTION 'invalid application audit event' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(
        event_organization_id,
        (SELECT membership.organization_id
         FROM app.user_sessions session
         JOIN app.organization_memberships membership
           ON membership.id = session.selected_membership_id
         WHERE session.id = event_session_id
           AND session.user_id = event_actor_user_id)
    ) INTO resolved_organization_id;

    INSERT INTO audit.audit_events (
        request_id, actor_user_id, organization_id, session_id, action,
        decision, resource_type, resource_id, metadata
    ) VALUES (
        event_request_id, event_actor_user_id, resolved_organization_id,
        event_session_id, event_action, event_decision, event_resource_type,
        event_resource_id, COALESCE(event_metadata, '{}'::jsonb)
    );
END
$function$;

CREATE FUNCTION security.taxonomy_subtree_has_parts(category_id bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, catalog, public
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM catalog.part_catalog part
        JOIN catalog.categories assigned ON assigned.id = part.primary_category_id
        JOIN catalog.categories root ON root.id = category_id
        WHERE assigned.path <@ root.path
    )
$function$;

REVOKE ALL ON FUNCTION security.authz_is_global_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION security.app_record_event(uuid, uuid, uuid, uuid, text, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.taxonomy_subtree_has_parts(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION security.authz_is_global_admin() TO automotive_runtime;
GRANT EXECUTE ON FUNCTION security.app_record_event(uuid, uuid, uuid, uuid, text, text, text, text, jsonb) TO automotive_app;
GRANT EXECUTE ON FUNCTION security.taxonomy_subtree_has_parts(bigint) TO automotive_app;
