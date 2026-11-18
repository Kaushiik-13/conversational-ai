DROP POLICY organizations_authorized_select ON app.organizations;
CREATE POLICY organizations_authorized_select ON app.organizations
    FOR SELECT TO automotive_runtime
    USING (
        security.authz_is_global_admin()
        OR id = security.authz_current_uuid('app.organization_id')
        OR EXISTS (
            SELECT 1
            FROM app.organization_memberships own_membership
            WHERE own_membership.organization_id = organizations.id
              AND own_membership.user_id = security.authz_current_uuid('app.user_id')
              AND own_membership.status = 'active'
              AND own_membership.valid_from <= clock_timestamp()
              AND (own_membership.valid_until IS NULL OR own_membership.valid_until > clock_timestamp())
        )
    );

DROP POLICY app_users_authorized_update ON app.app_users;
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
            AND NOT EXISTS (
                SELECT 1
                FROM app.organization_memberships platform_membership
                JOIN security.roles platform_role ON platform_role.id = platform_membership.role_id
                WHERE platform_membership.user_id = app_users.id
                  AND platform_role.code = 'GLOBAL_ADMIN'
            )
        )
    )
    WITH CHECK (
        security.authz_is_global_admin()
        OR security.authz_has_permission('organization.users.manage')
    );

DROP POLICY memberships_authorized_update ON app.organization_memberships;
CREATE POLICY memberships_authorized_update ON app.organization_memberships
    FOR UPDATE TO automotive_runtime
    USING (
        security.authz_has_permission('organization.users.manage')
        AND (
            organization_id = security.authz_current_uuid('app.organization_id')
            OR security.authz_is_global_admin()
        )
        AND (
            security.authz_is_global_admin()
            OR NOT EXISTS (
                SELECT 1 FROM security.roles existing_role
                WHERE existing_role.id = organization_memberships.role_id
                  AND existing_role.code = 'GLOBAL_ADMIN'
            )
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
                WHERE target_role.id = organization_memberships.role_id
                  AND target_role.code = 'GLOBAL_ADMIN'
            )
        )
    );

DROP POLICY part_categories_authorized_insert ON catalog.part_categories;
CREATE POLICY part_categories_authorized_insert ON catalog.part_categories
    FOR INSERT TO automotive_runtime
    WITH CHECK (
        (
            security.authz_has_permission('catalog.create')
            OR security.authz_has_permission('catalog.update')
        )
        AND EXISTS (
            SELECT 1 FROM catalog.part_catalog visible_part
            WHERE visible_part.id = part_categories.part_id
        )
        AND EXISTS (
            SELECT 1 FROM catalog.categories visible_category
            WHERE visible_category.id = part_categories.category_id
        )
    );

DROP POLICY part_categories_authorized_update ON catalog.part_categories;
CREATE POLICY part_categories_authorized_update ON catalog.part_categories
    FOR UPDATE TO automotive_runtime
    USING (
        security.authz_has_permission('catalog.update')
        AND EXISTS (
            SELECT 1 FROM catalog.part_catalog visible_part
            WHERE visible_part.id = part_categories.part_id
        )
    )
    WITH CHECK (
        security.authz_has_permission('catalog.update')
        AND EXISTS (
            SELECT 1 FROM catalog.part_catalog visible_part
            WHERE visible_part.id = part_categories.part_id
        )
        AND EXISTS (
            SELECT 1 FROM catalog.categories visible_category
            WHERE visible_category.id = part_categories.category_id
        )
    );
