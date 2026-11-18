DROP FUNCTION security.auth_rotate_session(uuid, text, text, uuid, text, text, timestamptz, text, text);

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
    rotation_result text,
    rotated_user_id uuid,
    rotated_authorization_version bigint,
    rotated_selected_membership_id uuid,
    rotated_token_family_id uuid,
    rotated_absolute_expires_at timestamptz
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
    SELECT session_row.*
      INTO prior
      FROM app.user_sessions AS session_row
     WHERE session_row.id = presented_session_id
     FOR UPDATE;

    IF NOT FOUND
       OR prior.refresh_token_hash <> presented_refresh_token_hash
       OR prior.csrf_token_hash <> presented_csrf_token_hash THEN
        RETURN QUERY
        SELECT 'invalid'::text, NULL::uuid, NULL::bigint, NULL::uuid, NULL::uuid, NULL::timestamptz;
        RETURN;
    END IF;

    IF prior.revoked_at IS NOT NULL THEN
        IF prior.revocation_reason = 'rotated' THEN
            UPDATE app.user_sessions AS family_session
               SET revoked_at = COALESCE(family_session.revoked_at, clock_timestamp()),
                   revocation_reason = CASE
                       WHEN family_session.revoked_at IS NULL THEN 'refresh-replay'
                       ELSE family_session.revocation_reason
                   END
             WHERE family_session.token_family_id = prior.token_family_id;
        END IF;

        RETURN QUERY
        SELECT 'replay'::text, prior.user_id, NULL::bigint, NULL::uuid,
               prior.token_family_id, prior.absolute_expires_at;
        RETURN;
    END IF;

    IF prior.expires_at <= clock_timestamp() OR prior.absolute_expires_at <= clock_timestamp() THEN
        UPDATE app.user_sessions AS expired_session
           SET revoked_at = clock_timestamp(),
               revocation_reason = 'expired'
         WHERE expired_session.id = prior.id;

        RETURN QUERY
        SELECT 'expired'::text, prior.user_id, NULL::bigint, NULL::uuid,
               prior.token_family_id, prior.absolute_expires_at;
        RETURN;
    END IF;

    SELECT app_user.status, app_user.authorization_version
      INTO current_user_status, current_authorization_version
      FROM app.app_users AS app_user
     WHERE app_user.id = prior.user_id;

    IF current_user_status <> 'active'
       OR current_authorization_version <> prior.authorization_version THEN
        UPDATE app.user_sessions AS family_session
           SET revoked_at = clock_timestamp(),
               revocation_reason = 'authorization-changed'
         WHERE family_session.token_family_id = prior.token_family_id
           AND family_session.revoked_at IS NULL;

        RETURN QUERY
        SELECT 'invalid'::text, prior.user_id, current_authorization_version,
               NULL::uuid, prior.token_family_id, prior.absolute_expires_at;
        RETURN;
    END IF;

    SELECT membership.id
      INTO effective_membership_id
      FROM app.organization_memberships AS membership
      JOIN app.organizations AS organization
        ON organization.id = membership.organization_id
     WHERE membership.id = prior.selected_membership_id
       AND membership.user_id = prior.user_id
       AND membership.status = 'active'
       AND membership.valid_from <= clock_timestamp()
       AND (membership.valid_until IS NULL OR membership.valid_until > clock_timestamp())
       AND organization.status = 'active';

    IF effective_membership_id IS NULL THEN
        SELECT membership.id
          INTO effective_membership_id
          FROM app.organization_memberships AS membership
          JOIN app.organizations AS organization
            ON organization.id = membership.organization_id
         WHERE membership.user_id = prior.user_id
           AND membership.status = 'active'
           AND membership.valid_from <= clock_timestamp()
           AND (membership.valid_until IS NULL OR membership.valid_until > clock_timestamp())
           AND organization.status = 'active'
         ORDER BY membership.is_default DESC, organization.code, membership.id
         LIMIT 1;
    END IF;

    IF effective_membership_id IS NULL THEN
        UPDATE app.user_sessions AS family_session
           SET revoked_at = clock_timestamp(),
               revocation_reason = 'membership-unavailable'
         WHERE family_session.token_family_id = prior.token_family_id
           AND family_session.revoked_at IS NULL;

        RETURN QUERY
        SELECT 'invalid'::text, prior.user_id, current_authorization_version,
               NULL::uuid, prior.token_family_id, prior.absolute_expires_at;
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

    UPDATE app.user_sessions AS prior_session
       SET revoked_at = clock_timestamp(),
           revocation_reason = 'rotated',
           replaced_by_session_id = replacement_session_id,
           last_used_at = clock_timestamp()
     WHERE prior_session.id = prior.id;

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

REVOKE ALL ON FUNCTION security.auth_rotate_session(uuid, text, text, uuid, text, text, timestamptz, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION security.auth_rotate_session(uuid, text, text, uuid, text, text, timestamptz, text, text) TO automotive_app;
