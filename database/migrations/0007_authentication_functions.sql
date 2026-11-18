ALTER TABLE app.user_sessions
    ADD COLUMN selected_membership_id uuid REFERENCES app.organization_memberships (id),
    ADD COLUMN csrf_token_hash text NOT NULL,
    ADD COLUMN absolute_expires_at timestamptz NOT NULL;

ALTER TABLE app.user_sessions
    ADD CONSTRAINT user_sessions_csrf_hash_length
        CHECK (length(csrf_token_hash) BETWEEN 32 AND 1024),
    ADD CONSTRAINT user_sessions_absolute_expiry_after_creation
        CHECK (absolute_expires_at > created_at),
    ADD CONSTRAINT user_sessions_idle_within_absolute_expiry
        CHECK (expires_at <= absolute_expires_at);

CREATE INDEX user_sessions_family_active_index
    ON app.user_sessions (token_family_id, revoked_at);

CREATE FUNCTION security.auth_lookup_user(lookup_email citext)
RETURNS TABLE (
    user_id uuid,
    email citext,
    display_name text,
    user_status text,
    authorization_version bigint,
    password_hash text,
    failed_login_count integer,
    locked_until timestamptz,
    active_membership_count integer
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, app, security, public
AS $function$
    SELECT
        u.id,
        u.email,
        u.display_name,
        u.status,
        u.authorization_version,
        c.password_hash,
        c.failed_login_count,
        c.locked_until,
        (
            SELECT count(*)::integer
            FROM app.organization_memberships m
            JOIN app.organizations o ON o.id = m.organization_id
            WHERE m.user_id = u.id
              AND m.status = 'active'
              AND m.valid_from <= clock_timestamp()
              AND (m.valid_until IS NULL OR m.valid_until > clock_timestamp())
              AND o.status = 'active'
        )
    FROM app.app_users u
    JOIN app.user_credentials c ON c.user_id = u.id
    WHERE u.email = lookup_email
    LIMIT 1
$function$;

CREATE FUNCTION security.auth_record_failure(
    failed_user_id uuid,
    lock_threshold integer,
    lock_seconds integer
)
RETURNS TABLE (failed_count integer, locked_until timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, security
AS $function$
BEGIN
    IF lock_threshold < 1 OR lock_seconds < 1 THEN
        RAISE EXCEPTION 'invalid authentication lock configuration'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    UPDATE app.user_credentials c
       SET failed_login_count = c.failed_login_count + 1,
           locked_until = CASE
               WHEN c.failed_login_count + 1 >= lock_threshold
                   THEN clock_timestamp() + make_interval(secs => lock_seconds)
               ELSE c.locked_until
           END
     WHERE c.user_id = failed_user_id
     RETURNING c.failed_login_count, c.locked_until;
END
$function$;

CREATE FUNCTION security.auth_record_success(success_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app, security
AS $function$
    UPDATE app.user_credentials
       SET failed_login_count = 0,
           locked_until = NULL
     WHERE user_id = success_user_id;

    UPDATE app.app_users
       SET last_login_at = clock_timestamp()
     WHERE id = success_user_id
$function$;

CREATE FUNCTION security.auth_create_session(
    new_session_id uuid,
    new_user_id uuid,
    new_token_family_id uuid,
    new_refresh_token_hash text,
    new_csrf_token_hash text,
    new_idle_expires_at timestamptz,
    new_absolute_expires_at timestamptz,
    new_ip_hash text,
    new_user_agent text
)
RETURNS TABLE (
    session_id uuid,
    user_id uuid,
    authorization_version bigint,
    selected_membership_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, security
AS $function$
DECLARE
    current_authorization_version bigint;
    default_membership_id uuid;
BEGIN
    SELECT u.authorization_version
      INTO current_authorization_version
      FROM app.app_users u
     WHERE u.id = new_user_id
       AND u.status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'authentication failed' USING ERRCODE = '28000';
    END IF;

    SELECT m.id
      INTO default_membership_id
      FROM app.organization_memberships m
      JOIN app.organizations o ON o.id = m.organization_id
     WHERE m.user_id = new_user_id
       AND m.status = 'active'
       AND m.valid_from <= clock_timestamp()
       AND (m.valid_until IS NULL OR m.valid_until > clock_timestamp())
       AND o.status = 'active'
     ORDER BY m.is_default DESC, o.code, m.id
     LIMIT 1;

    IF default_membership_id IS NULL THEN
        RAISE EXCEPTION 'authentication failed' USING ERRCODE = '28000';
    END IF;

    INSERT INTO app.user_sessions (
        id,
        user_id,
        token_family_id,
        refresh_token_hash,
        csrf_token_hash,
        authorization_version,
        selected_membership_id,
        expires_at,
        absolute_expires_at,
        ip_hash,
        user_agent
    )
    VALUES (
        new_session_id,
        new_user_id,
        new_token_family_id,
        new_refresh_token_hash,
        new_csrf_token_hash,
        current_authorization_version,
        default_membership_id,
        new_idle_expires_at,
        new_absolute_expires_at,
        new_ip_hash,
        left(new_user_agent, 512)
    );

    RETURN QUERY
    SELECT
        new_session_id,
        new_user_id,
        current_authorization_version,
        default_membership_id;
END
$function$;

CREATE FUNCTION security.auth_access_session(
    requested_session_id uuid,
    requested_user_id uuid
)
RETURNS TABLE (
    session_id uuid,
    user_id uuid,
    email citext,
    display_name text,
    authorization_version bigint,
    selected_membership_id uuid,
    csrf_token_hash text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, app, security
AS $function$
    SELECT
        s.id,
        u.id,
        u.email,
        u.display_name,
        u.authorization_version,
        s.selected_membership_id,
        s.csrf_token_hash
    FROM app.user_sessions s
    JOIN app.app_users u ON u.id = s.user_id
    WHERE s.id = requested_session_id
      AND s.user_id = requested_user_id
      AND s.revoked_at IS NULL
      AND s.expires_at > clock_timestamp()
      AND s.absolute_expires_at > clock_timestamp()
      AND s.authorization_version = u.authorization_version
      AND u.status = 'active'
$function$;

CREATE FUNCTION security.auth_rotate_session(
    presented_session_id uuid,
    presented_refresh_token_hash text,
    presented_csrf_token_hash text,
    replacement_session_id uuid,
    replacement_refresh_token_hash text,
    replacement_csrf_token_hash text,
    replacement_idle_expires_at timestamptz,
    replacement_ip_hash text,
    replacement_user_agent text
)
RETURNS TABLE (
    result text,
    user_id uuid,
    authorization_version bigint,
    selected_membership_id uuid,
    token_family_id uuid,
    absolute_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, security
AS $function$
DECLARE
    prior app.user_sessions%ROWTYPE;
    current_user_status text;
    current_authorization_version bigint;
    effective_membership_id uuid;
    effective_idle_expiry timestamptz;
BEGIN
    SELECT *
      INTO prior
      FROM app.user_sessions
     WHERE id = presented_session_id
     FOR UPDATE;

    IF NOT FOUND
       OR prior.refresh_token_hash <> presented_refresh_token_hash
       OR prior.csrf_token_hash <> presented_csrf_token_hash THEN
        RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::bigint, NULL::uuid, NULL::uuid, NULL::timestamptz;
        RETURN;
    END IF;

    IF prior.revoked_at IS NOT NULL THEN
        IF prior.revocation_reason = 'rotated' THEN
            UPDATE app.user_sessions
               SET revoked_at = COALESCE(revoked_at, clock_timestamp()),
                   revocation_reason = CASE
                       WHEN revoked_at IS NULL THEN 'refresh-replay'
                       ELSE revocation_reason
                   END
             WHERE token_family_id = prior.token_family_id;
        END IF;

        RETURN QUERY SELECT 'replay'::text, prior.user_id, NULL::bigint, NULL::uuid, prior.token_family_id, prior.absolute_expires_at;
        RETURN;
    END IF;

    IF prior.expires_at <= clock_timestamp() OR prior.absolute_expires_at <= clock_timestamp() THEN
        UPDATE app.user_sessions
           SET revoked_at = clock_timestamp(),
               revocation_reason = 'expired'
         WHERE id = prior.id;

        RETURN QUERY SELECT 'expired'::text, prior.user_id, NULL::bigint, NULL::uuid, prior.token_family_id, prior.absolute_expires_at;
        RETURN;
    END IF;

    SELECT u.status, u.authorization_version
      INTO current_user_status, current_authorization_version
      FROM app.app_users u
     WHERE u.id = prior.user_id;

    IF current_user_status <> 'active'
       OR current_authorization_version <> prior.authorization_version THEN
        UPDATE app.user_sessions
           SET revoked_at = clock_timestamp(),
               revocation_reason = 'authorization-changed'
         WHERE token_family_id = prior.token_family_id
           AND revoked_at IS NULL;

        RETURN QUERY SELECT 'invalid'::text, prior.user_id, current_authorization_version, NULL::uuid, prior.token_family_id, prior.absolute_expires_at;
        RETURN;
    END IF;

    SELECT m.id
      INTO effective_membership_id
      FROM app.organization_memberships m
      JOIN app.organizations o ON o.id = m.organization_id
     WHERE m.id = prior.selected_membership_id
       AND m.user_id = prior.user_id
       AND m.status = 'active'
       AND m.valid_from <= clock_timestamp()
       AND (m.valid_until IS NULL OR m.valid_until > clock_timestamp())
       AND o.status = 'active';

    IF effective_membership_id IS NULL THEN
        SELECT m.id
          INTO effective_membership_id
          FROM app.organization_memberships m
          JOIN app.organizations o ON o.id = m.organization_id
         WHERE m.user_id = prior.user_id
           AND m.status = 'active'
           AND m.valid_from <= clock_timestamp()
           AND (m.valid_until IS NULL OR m.valid_until > clock_timestamp())
           AND o.status = 'active'
         ORDER BY m.is_default DESC, o.code, m.id
         LIMIT 1;
    END IF;

    IF effective_membership_id IS NULL THEN
        UPDATE app.user_sessions
           SET revoked_at = clock_timestamp(),
               revocation_reason = 'membership-unavailable'
         WHERE token_family_id = prior.token_family_id
           AND revoked_at IS NULL;

        RETURN QUERY SELECT 'invalid'::text, prior.user_id, current_authorization_version, NULL::uuid, prior.token_family_id, prior.absolute_expires_at;
        RETURN;
    END IF;

    effective_idle_expiry := LEAST(replacement_idle_expires_at, prior.absolute_expires_at);

    INSERT INTO app.user_sessions (
        id,
        user_id,
        token_family_id,
        refresh_token_hash,
        csrf_token_hash,
        authorization_version,
        selected_membership_id,
        expires_at,
        absolute_expires_at,
        ip_hash,
        user_agent
    )
    VALUES (
        replacement_session_id,
        prior.user_id,
        prior.token_family_id,
        replacement_refresh_token_hash,
        replacement_csrf_token_hash,
        current_authorization_version,
        effective_membership_id,
        effective_idle_expiry,
        prior.absolute_expires_at,
        replacement_ip_hash,
        left(replacement_user_agent, 512)
    );

    UPDATE app.user_sessions
       SET revoked_at = clock_timestamp(),
           revocation_reason = 'rotated',
           replaced_by_session_id = replacement_session_id,
           last_used_at = clock_timestamp()
     WHERE id = prior.id;

    RETURN QUERY
    SELECT
        'ok'::text,
        prior.user_id,
        current_authorization_version,
        effective_membership_id,
        prior.token_family_id,
        prior.absolute_expires_at;
END
$function$;

CREATE FUNCTION security.auth_list_memberships(
    requested_session_id uuid,
    requested_user_id uuid
)
RETURNS TABLE (
    membership_id uuid,
    organization_id uuid,
    organization_code text,
    organization_name text,
    role_code text,
    is_default boolean,
    is_selected boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, app, security
AS $function$
    SELECT
        m.id,
        o.id,
        o.code,
        o.name,
        r.code,
        m.is_default,
        m.id = s.selected_membership_id
    FROM app.user_sessions s
    JOIN app.organization_memberships m ON m.user_id = s.user_id
    JOIN app.organizations o ON o.id = m.organization_id
    JOIN security.roles r ON r.id = m.role_id
    WHERE s.id = requested_session_id
      AND s.user_id = requested_user_id
      AND s.revoked_at IS NULL
      AND s.authorization_version = (
          SELECT authorization_version FROM app.app_users WHERE id = requested_user_id
      )
      AND m.status = 'active'
      AND m.valid_from <= clock_timestamp()
      AND (m.valid_until IS NULL OR m.valid_until > clock_timestamp())
      AND o.status = 'active'
      AND r.status = 'active'
    ORDER BY o.code, m.id
$function$;

CREATE FUNCTION security.auth_capabilities(
    requested_session_id uuid,
    requested_user_id uuid
)
RETURNS TABLE (permission_code text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, app, security
AS $function$
    SELECT rp.permission_code
    FROM app.user_sessions s
    JOIN app.organization_memberships m ON m.id = s.selected_membership_id
    JOIN security.roles r ON r.id = m.role_id
    JOIN security.role_permissions rp ON rp.role_id = r.id
    WHERE s.id = requested_session_id
      AND s.user_id = requested_user_id
      AND s.revoked_at IS NULL
      AND s.authorization_version = (
          SELECT authorization_version FROM app.app_users WHERE id = requested_user_id
      )
      AND m.status = 'active'
      AND r.status = 'active'
    ORDER BY rp.permission_code
$function$;

CREATE FUNCTION security.auth_select_membership(
    requested_session_id uuid,
    requested_user_id uuid,
    requested_organization_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, security
AS $function$
DECLARE
    selected_id uuid;
BEGIN
    SELECT m.id
      INTO selected_id
      FROM app.user_sessions s
      JOIN app.organization_memberships m ON m.user_id = s.user_id
      JOIN app.organizations o ON o.id = m.organization_id
     WHERE s.id = requested_session_id
       AND s.user_id = requested_user_id
       AND s.revoked_at IS NULL
       AND s.authorization_version = (
           SELECT authorization_version FROM app.app_users WHERE id = requested_user_id
       )
       AND m.organization_id = requested_organization_id
       AND m.status = 'active'
       AND m.valid_from <= clock_timestamp()
       AND (m.valid_until IS NULL OR m.valid_until > clock_timestamp())
       AND o.status = 'active';

    IF selected_id IS NULL THEN
        RETURN NULL;
    END IF;

    UPDATE app.user_sessions
       SET selected_membership_id = selected_id,
           last_used_at = clock_timestamp()
     WHERE id = requested_session_id;

    RETURN selected_id;
END
$function$;

CREATE FUNCTION security.auth_revoke_session(
    requested_session_id uuid,
    requested_user_id uuid,
    reason text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app, security
AS $function$
    WITH revoked AS (
        UPDATE app.user_sessions
           SET revoked_at = COALESCE(revoked_at, clock_timestamp()),
               revocation_reason = CASE
                   WHEN revoked_at IS NULL THEN left(reason, 500)
                   ELSE revocation_reason
               END
         WHERE id = requested_session_id
           AND user_id = requested_user_id
         RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM revoked)
$function$;

CREATE FUNCTION security.auth_logout_all(requested_user_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, security
AS $function$
DECLARE
    new_authorization_version bigint;
BEGIN
    UPDATE app.app_users
       SET authorization_version = authorization_version + 1
     WHERE id = requested_user_id
       AND status = 'active'
     RETURNING authorization_version INTO new_authorization_version;

    IF new_authorization_version IS NULL THEN
        RETURN NULL;
    END IF;

    UPDATE app.user_sessions
       SET revoked_at = COALESCE(revoked_at, clock_timestamp()),
           revocation_reason = CASE
               WHEN revoked_at IS NULL THEN 'logout-all'
               ELSE revocation_reason
           END
     WHERE user_id = requested_user_id;

    RETURN new_authorization_version;
END
$function$;

CREATE FUNCTION security.auth_record_event(
    event_request_id uuid,
    event_actor_user_id uuid,
    event_organization_id uuid,
    event_session_id uuid,
    event_action text,
    event_decision text,
    event_metadata jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, security, audit
AS $function$
BEGIN
    IF event_action !~ '^auth\.[a-z0-9.-]+$' THEN
        RAISE EXCEPTION 'invalid authentication audit action' USING ERRCODE = '22023';
    END IF;

    INSERT INTO audit.audit_events (
        request_id,
        actor_user_id,
        organization_id,
        session_id,
        action,
        decision,
        resource_type,
        resource_id,
        metadata
    )
    VALUES (
        event_request_id,
        event_actor_user_id,
        event_organization_id,
        event_session_id,
        event_action,
        event_decision,
        'authentication',
        event_actor_user_id::text,
        COALESCE(event_metadata, '{}'::jsonb)
    );
END
$function$;

REVOKE ALL ON FUNCTION security.auth_lookup_user(citext) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.auth_record_failure(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.auth_record_success(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.auth_create_session(uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.auth_access_session(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.auth_rotate_session(uuid, text, text, uuid, text, text, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.auth_list_memberships(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.auth_capabilities(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.auth_select_membership(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.auth_revoke_session(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.auth_logout_all(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.auth_record_event(uuid, uuid, uuid, uuid, text, text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION security.auth_lookup_user(citext) TO automotive_app;
GRANT EXECUTE ON FUNCTION security.auth_record_failure(uuid, integer, integer) TO automotive_app;
GRANT EXECUTE ON FUNCTION security.auth_record_success(uuid) TO automotive_app;
GRANT EXECUTE ON FUNCTION security.auth_create_session(uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text) TO automotive_app;
GRANT EXECUTE ON FUNCTION security.auth_access_session(uuid, uuid) TO automotive_app;
GRANT EXECUTE ON FUNCTION security.auth_rotate_session(uuid, text, text, uuid, text, text, timestamptz, text, text) TO automotive_app;
GRANT EXECUTE ON FUNCTION security.auth_list_memberships(uuid, uuid) TO automotive_app;
GRANT EXECUTE ON FUNCTION security.auth_capabilities(uuid, uuid) TO automotive_app;
GRANT EXECUTE ON FUNCTION security.auth_select_membership(uuid, uuid, uuid) TO automotive_app;
GRANT EXECUTE ON FUNCTION security.auth_revoke_session(uuid, uuid, text) TO automotive_app;
GRANT EXECUTE ON FUNCTION security.auth_logout_all(uuid) TO automotive_app;
GRANT EXECUTE ON FUNCTION security.auth_record_event(uuid, uuid, uuid, uuid, text, text, jsonb) TO automotive_app;
