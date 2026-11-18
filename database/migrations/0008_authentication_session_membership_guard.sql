CREATE OR REPLACE FUNCTION security.auth_access_session(
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
      AND EXISTS (
          SELECT 1
          FROM app.organization_memberships m
          JOIN app.organizations o ON o.id = m.organization_id
          JOIN security.roles r ON r.id = m.role_id
          WHERE m.id = s.selected_membership_id
            AND m.user_id = s.user_id
            AND m.status = 'active'
            AND m.valid_from <= clock_timestamp()
            AND (m.valid_until IS NULL OR m.valid_until > clock_timestamp())
            AND o.status = 'active'
            AND r.status = 'active'
      )
$function$;

REVOKE ALL ON FUNCTION security.auth_access_session(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION security.auth_access_session(uuid, uuid) TO automotive_app;

CREATE FUNCTION security.invalidate_sessions_after_user_security_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app, security
AS $function$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.authorization_version IS DISTINCT FROM OLD.authorization_version THEN
        UPDATE app.user_sessions
           SET revoked_at = COALESCE(revoked_at, clock_timestamp()),
               revocation_reason = CASE
                   WHEN revoked_at IS NULL THEN 'account-security-change'
                   ELSE revocation_reason
               END
         WHERE user_id = NEW.id;
    END IF;

    RETURN NEW;
END
$function$;

CREATE TRIGGER app_users_invalidate_sessions_after_security_change
    AFTER UPDATE OF status, authorization_version
    ON app.app_users
    FOR EACH ROW
    EXECUTE FUNCTION security.invalidate_sessions_after_user_security_change();

CREATE FUNCTION security.invalidate_sessions_after_membership_security_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app, security
AS $function$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.role_id IS DISTINCT FROM OLD.role_id
       OR NEW.valid_until IS DISTINCT FROM OLD.valid_until THEN
        UPDATE app.user_sessions
           SET revoked_at = COALESCE(revoked_at, clock_timestamp()),
               revocation_reason = CASE
                   WHEN revoked_at IS NULL THEN 'membership-security-change'
                   ELSE revocation_reason
               END
         WHERE selected_membership_id = NEW.id;
    END IF;

    RETURN NEW;
END
$function$;

CREATE TRIGGER organization_memberships_invalidate_sessions_after_security_change
    AFTER UPDATE OF status, role_id, valid_until
    ON app.organization_memberships
    FOR EACH ROW
    EXECUTE FUNCTION security.invalidate_sessions_after_membership_security_change();
