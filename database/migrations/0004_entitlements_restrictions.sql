CREATE TABLE security.organization_category_entitlements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES app.organizations (id),
    category_id bigint NOT NULL REFERENCES catalog.categories (id),
    effect text NOT NULL,
    include_descendants boolean NOT NULL DEFAULT true,
    valid_from timestamptz NOT NULL DEFAULT clock_timestamp(),
    valid_until timestamptz,
    created_by_user_id uuid REFERENCES app.app_users (id),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT organization_entitlements_effect_check CHECK (effect IN ('allow', 'deny')),
    CONSTRAINT organization_entitlements_valid_range CHECK (valid_until IS NULL OR valid_until > valid_from),
    CONSTRAINT organization_entitlements_no_exact_duplicate
        UNIQUE NULLS NOT DISTINCT (
            organization_id,
            category_id,
            effect,
            include_descendants,
            valid_from,
            valid_until
        )
);

CREATE INDEX organization_entitlements_lookup_index
    ON security.organization_category_entitlements (organization_id, category_id, effect);

CREATE INDEX organization_entitlements_active_window_index
    ON security.organization_category_entitlements (organization_id, valid_from, valid_until);

CREATE TABLE security.user_scope_restrictions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    membership_id uuid NOT NULL REFERENCES app.organization_memberships (id) ON DELETE CASCADE,
    scope_type text NOT NULL,
    effect text NOT NULL,
    category_id bigint REFERENCES catalog.categories (id),
    company_id integer,
    region text,
    include_descendants boolean NOT NULL DEFAULT true,
    valid_from timestamptz NOT NULL DEFAULT clock_timestamp(),
    valid_until timestamptz,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT user_scope_restrictions_scope_type_check CHECK (scope_type IN ('category', 'company', 'region')),
    CONSTRAINT user_scope_restrictions_effect_check CHECK (effect IN ('allow', 'deny')),
    CONSTRAINT user_scope_restrictions_target_check CHECK (
        (scope_type = 'category' AND category_id IS NOT NULL AND company_id IS NULL AND region IS NULL)
        OR (scope_type = 'company' AND category_id IS NULL AND company_id IS NOT NULL AND region IS NULL)
        OR (scope_type = 'region' AND category_id IS NULL AND company_id IS NULL AND region IS NOT NULL)
    ),
    CONSTRAINT user_scope_restrictions_company_positive CHECK (company_id IS NULL OR company_id > 0),
    CONSTRAINT user_scope_restrictions_region_length CHECK (region IS NULL OR length(btrim(region)) BETWEEN 1 AND 120),
    CONSTRAINT user_scope_restrictions_valid_range CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE INDEX user_scope_restrictions_membership_index
    ON security.user_scope_restrictions (membership_id, effect, scope_type);

CREATE INDEX user_scope_restrictions_category_index
    ON security.user_scope_restrictions (category_id)
    WHERE category_id IS NOT NULL;

CREATE INDEX user_scope_restrictions_company_index
    ON security.user_scope_restrictions (company_id)
    WHERE company_id IS NOT NULL;

CREATE INDEX user_scope_restrictions_region_index
    ON security.user_scope_restrictions (region)
    WHERE region IS NOT NULL;

CREATE TABLE security.field_access_rules (
    role_id uuid NOT NULL REFERENCES security.roles (id) ON DELETE CASCADE,
    resource_type text NOT NULL,
    field_name text NOT NULL,
    access text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (role_id, resource_type, field_name),
    CONSTRAINT field_access_rules_resource_format CHECK (resource_type ~ '^[a-z][a-z0-9_.]{1,126}$'),
    CONSTRAINT field_access_rules_field_format CHECK (field_name ~ '^[a-z][a-zA-Z0-9_.]{0,126}$'),
    CONSTRAINT field_access_rules_access_check CHECK (access IN ('allow', 'omit', 'mask'))
);

CREATE INDEX field_access_rules_resource_index
    ON security.field_access_rules (resource_type, field_name, access);
