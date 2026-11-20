-- Force a user to choose their own password after signing in with a password
-- they did not pick. New credentials default to "must change"; every existing
-- credential is marked too.
ALTER TABLE app.user_credentials
    ADD COLUMN must_change_password boolean NOT NULL DEFAULT true;

CREATE FUNCTION security.auth_password_state(requested_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, app, security
AS $function$
    SELECT COALESCE(
        (
            SELECT c.must_change_password
            FROM app.user_credentials c
            WHERE c.user_id = requested_user_id
        ),
        false
    )
$function$;

CREATE FUNCTION security.auth_change_password(
    requested_user_id uuid,
    current_session_id uuid,
    new_password_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, security
AS $function$
BEGIN
    UPDATE app.user_credentials
       SET password_hash = new_password_hash,
           password_changed_at = clock_timestamp(),
           must_change_password = false,
           failed_login_count = 0,
           locked_until = NULL
     WHERE user_id = requested_user_id;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- Sign out every other session so an old password stops working everywhere.
    UPDATE app.user_sessions
       SET revoked_at = clock_timestamp(),
           revocation_reason = 'password-changed'
     WHERE user_id = requested_user_id
       AND id <> current_session_id
       AND revoked_at IS NULL;

    RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION security.auth_password_state(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.auth_change_password(uuid, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION security.auth_password_state(uuid) TO automotive_app;
GRANT EXECUTE ON FUNCTION security.auth_change_password(uuid, uuid, text) TO automotive_app;
