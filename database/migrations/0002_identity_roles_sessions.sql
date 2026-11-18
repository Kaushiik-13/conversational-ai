CREATE TABLE app.organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL,
    name text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT organizations_code_unique UNIQUE (code),
    CONSTRAINT organizations_code_format CHECK (code ~ '^[a-z][a-z0-9-]{1,62}$'),
    CONSTRAINT organizations_name_length CHECK (length(btrim(name)) BETWEEN 1 AND 160),
    CONSTRAINT organizations_status_check CHECK (status IN ('active', 'suspended', 'disabled'))
);

CREATE TABLE app.app_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email citext NOT NULL,
    display_name text NOT NULL,
    status text NOT NULL DEFAULT 'invited',
    authorization_version bigint NOT NULL DEFAULT 1,
    last_login_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT app_users_email_unique UNIQUE (email),
    CONSTRAINT app_users_email_length CHECK (length(email::text) BETWEEN 3 AND 320),
    CONSTRAINT app_users_display_name_length CHECK (length(btrim(display_name)) BETWEEN 1 AND 160),
    CONSTRAINT app_users_status_check CHECK (status IN ('invited', 'active', 'locked', 'disabled')),
    CONSTRAINT app_users_authorization_version_positive CHECK (authorization_version > 0)
);

CREATE TABLE app.user_credentials (
    user_id uuid PRIMARY KEY REFERENCES app.app_users (id) ON DELETE CASCADE,
    password_hash text NOT NULL,
    password_changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    failed_login_count integer NOT NULL DEFAULT 0,
    locked_until timestamptz,
    CONSTRAINT user_credentials_hash_length CHECK (length(password_hash) BETWEEN 20 AND 1024),
    CONSTRAINT user_credentials_failed_count_nonnegative CHECK (failed_login_count >= 0)
);

CREATE TABLE security.roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES app.organizations (id),
    code text NOT NULL,
    name text NOT NULL,
    is_system boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT roles_scope_code_unique UNIQUE NULLS NOT DISTINCT (organization_id, code),
    CONSTRAINT roles_code_format CHECK (code ~ '^[A-Z][A-Z0-9_]{1,62}$'),
    CONSTRAINT roles_name_length CHECK (length(btrim(name)) BETWEEN 1 AND 160),
    CONSTRAINT roles_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE TABLE security.permissions (
    code text PRIMARY KEY,
    description text NOT NULL,
    risk_level text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT permissions_code_format CHECK (code ~ '^[a-z][a-z0-9_.]{2,126}$'),
    CONSTRAINT permissions_description_length CHECK (length(btrim(description)) BETWEEN 1 AND 500),
    CONSTRAINT permissions_risk_level_check CHECK (risk_level IN ('low', 'medium', 'high'))
);

CREATE TABLE security.role_permissions (
    role_id uuid NOT NULL REFERENCES security.roles (id) ON DELETE CASCADE,
    permission_code text NOT NULL REFERENCES security.permissions (code) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by_user_id uuid REFERENCES app.app_users (id),
    PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE app.organization_memberships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES app.app_users (id),
    organization_id uuid NOT NULL REFERENCES app.organizations (id),
    role_id uuid NOT NULL REFERENCES security.roles (id),
    status text NOT NULL DEFAULT 'active',
    is_default boolean NOT NULL DEFAULT false,
    valid_from timestamptz NOT NULL DEFAULT clock_timestamp(),
    valid_until timestamptz,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT organization_memberships_status_check CHECK (status IN ('active', 'suspended', 'revoked')),
    CONSTRAINT organization_memberships_valid_range CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE UNIQUE INDEX organization_memberships_one_active_per_org
    ON app.organization_memberships (user_id, organization_id)
    WHERE status = 'active';

CREATE UNIQUE INDEX organization_memberships_one_default
    ON app.organization_memberships (user_id)
    WHERE is_default AND status = 'active';

CREATE TABLE app.user_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES app.app_users (id),
    token_family_id uuid NOT NULL,
    refresh_token_hash text NOT NULL,
    authorization_version bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    last_used_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    revocation_reason text,
    replaced_by_session_id uuid REFERENCES app.user_sessions (id) DEFERRABLE INITIALLY DEFERRED,
    ip_hash text,
    user_agent varchar(512),
    CONSTRAINT user_sessions_refresh_hash_length CHECK (length(refresh_token_hash) BETWEEN 32 AND 1024),
    CONSTRAINT user_sessions_authorization_version_positive CHECK (authorization_version > 0),
    CONSTRAINT user_sessions_expiry_after_creation CHECK (expires_at > created_at),
    CONSTRAINT user_sessions_last_used_after_creation CHECK (last_used_at >= created_at),
    CONSTRAINT user_sessions_revoked_after_creation CHECK (revoked_at IS NULL OR revoked_at >= created_at),
    CONSTRAINT user_sessions_revocation_reason_length CHECK (revocation_reason IS NULL OR length(revocation_reason) <= 500),
    CONSTRAINT user_sessions_ip_hash_length CHECK (ip_hash IS NULL OR length(ip_hash) <= 256)
);

CREATE INDEX app_users_status_index ON app.app_users (status);
CREATE INDEX organization_memberships_user_index ON app.organization_memberships (user_id, status);
CREATE INDEX organization_memberships_org_index ON app.organization_memberships (organization_id, status);
CREATE INDEX roles_organization_index ON security.roles (organization_id, status);
CREATE INDEX role_permissions_permission_index ON security.role_permissions (permission_code);
CREATE INDEX user_sessions_user_active_index ON app.user_sessions (user_id, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX user_sessions_token_family_index ON app.user_sessions (token_family_id);
