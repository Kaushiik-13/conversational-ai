import argon2 from "argon2";
import pg from "pg";

const { Client } = pg;
const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
const runtimeDatabaseUrl = process.env.DATABASE_URL;
const apiBaseUrl = `http://localhost:${process.env.API_PORT ?? 3000}/api/v1`;
const allowedOrigin = "http://localhost:4200";

if (!migrationDatabaseUrl || !runtimeDatabaseUrl) {
  throw new Error("MIGRATION_DATABASE_URL and DATABASE_URL are required.");
}

const accounts = [
  ["global.admin@example.test", "DEV_GLOBAL_ADMIN_PASSWORD"],
  ["orga.admin@example.test", "DEV_ORG_A_ADMIN_PASSWORD"],
  ["orgb.admin@example.test", "DEV_ORG_B_ADMIN_PASSWORD"],
  ["orgc.admin@example.test", "DEV_ORG_C_ADMIN_PASSWORD"],
  ["orgd.admin@example.test", "DEV_ORG_D_ADMIN_PASSWORD"],
  ["orgb.restricted@example.test", "DEV_ORG_B_RESTRICTED_PASSWORD"],
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

class CookieJar {
  values = new Map();
  lastSetCookie = [];

  absorb(response) {
    this.lastSetCookie = response.headers.getSetCookie();
    for (const cookie of this.lastSetCookie) {
      const [pair] = cookie.split(";", 1);
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value) this.values.set(name, value);
      else this.values.delete(name);
    }
  }

  header() {
    return [...this.values.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  get(name) {
    return this.values.get(name);
  }

  clone() {
    const clone = new CookieJar();
    clone.values = new Map(this.values);
    return clone;
  }
}

async function apiRequest(
  path,
  {
    jar = new CookieJar(),
    method = "GET",
    body,
    csrf = false,
    origin = allowedOrigin,
  } = {},
) {
  const headers = {};
  if (jar.values.size > 0) headers.Cookie = jar.header();
  if (origin) headers.Origin = origin;
  if (csrf && jar.get("XSRF-TOKEN")) {
    headers["X-XSRF-TOKEN"] = jar.get("XSRF-TOKEN");
  }
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  jar.absorb(response);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  return { response, payload, jar };
}

function password(variableName) {
  const value = process.env[variableName];
  assert(
    value && value.length >= 16,
    `${variableName} is missing or too short.`,
  );
  return value;
}

async function freshLogin(email, passwordVariable) {
  const jar = new CookieJar();
  const csrf = await apiRequest("/auth/csrf", { jar });
  assert(csrf.response.status === 200, "CSRF bootstrap failed.");
  assert(jar.get("XSRF-TOKEN"), "CSRF cookie was not set.");
  const login = await apiRequest("/auth/login", {
    jar,
    method: "POST",
    csrf: true,
    body: { email, password: password(passwordVariable) },
  });
  assert(login.response.status === 200, `Login failed for ${email}.`);
  assert(jar.get("automotive_access"), "Access cookie was not set.");
  assert(jar.get("automotive_refresh"), "Refresh cookie was not set.");
  return {
    jar,
    profile: login.payload.data,
    setCookies: login.jar.lastSetCookie,
  };
}

const owner = new Client({ connectionString: migrationDatabaseUrl });
const runtime = new Client({ connectionString: runtimeDatabaseUrl });
await owner.connect();

const restoredMemberships = new Set();
const restoredUsers = new Set();
const restoredRolePermissions = new Set();

try {
  const migrationCount = await owner.query(
    "SELECT count(*)::integer AS count FROM public.schema_migrations",
  );
  assert(
    migrationCount.rows[0].count === 25,
    "Expected twenty-five migrations.",
  );

  const accountSummary = await owner.query(`
    SELECT
      (SELECT count(*)::integer FROM app.app_users) AS users,
      (SELECT count(*)::integer FROM app.user_credentials) AS credentials,
      (SELECT count(*)::integer FROM app.organization_memberships) AS memberships
  `);
  assert(accountSummary.rows[0].users === 6, "Expected six development users.");
  assert(accountSummary.rows[0].credentials === 6, "Expected six credentials.");
  assert(
    accountSummary.rows[0].memberships === 9,
    "Expected nine memberships.",
  );

  for (const [email, passwordVariable] of accounts) {
    const credential = await owner.query(
      `
        SELECT c.password_hash
        FROM app.app_users u
        JOIN app.user_credentials c ON c.user_id = u.id
        WHERE u.email = $1::citext
      `,
      [email],
    );
    assert(credential.rowCount === 1, `Credential missing for ${email}.`);
    const hash = credential.rows[0].password_hash;
    assert(hash.startsWith("$argon2id$"), `${email} does not use Argon2id.`);
    assert(hash !== password(passwordVariable), `${email} stores plaintext.`);
    assert(
      await argon2.verify(hash, password(passwordVariable)),
      `${email} password does not verify.`,
    );
  }

  const functionBoundary = await owner.query(`
    SELECT
      count(*)::integer AS function_count,
      count(*) FILTER (WHERE p.prosecdef)::integer AS security_definer_count,
      count(*) FILTER (
        WHERE has_function_privilege('automotive_app', p.oid, 'EXECUTE')
      )::integer AS executable_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'security'
      AND left(p.proname, 5) = 'auth_'
  `);
  assert(
    functionBoundary.rows[0].function_count === 12,
    "Expected 12 auth functions.",
  );
  assert(
    functionBoundary.rows[0].security_definer_count === 12,
    "Authentication functions must be security definers.",
  );
  assert(
    functionBoundary.rows[0].executable_count === 12,
    "The API cannot execute every authentication function.",
  );

  await runtime.connect();
  const directVisibility = await runtime.query(`
    SELECT
      (SELECT count(*)::integer FROM app.app_users) AS users,
      (SELECT count(*)::integer FROM app.user_sessions) AS sessions,
      (SELECT count(*)::integer FROM audit.audit_events) AS audit_events
  `);
  assert(
    Object.values(directVisibility.rows[0]).every((value) => value === 0),
    "The API role can directly read protected authentication tables.",
  );

  const anonymousMe = await apiRequest("/auth/me");
  assert(
    anonymousMe.response.status === 401,
    "Anonymous /auth/me was not rejected.",
  );

  const missingCsrfJar = new CookieJar();
  await apiRequest("/auth/csrf", { jar: missingCsrfJar });
  const missingCsrf = await apiRequest("/auth/login", {
    jar: missingCsrfJar,
    method: "POST",
    body: {
      email: "orga.admin@example.test",
      password: password("DEV_ORG_A_ADMIN_PASSWORD"),
    },
  });
  assert(missingCsrf.response.status === 403, "Missing CSRF was not rejected.");
  assert(
    missingCsrf.payload.error.code === "CSRF_FAILED",
    "Wrong CSRF error code.",
  );

  const hostileOriginJar = new CookieJar();
  await apiRequest("/auth/csrf", { jar: hostileOriginJar });
  const hostileOrigin = await apiRequest("/auth/login", {
    jar: hostileOriginJar,
    method: "POST",
    csrf: true,
    origin: "https://untrusted.example",
    body: {
      email: "orga.admin@example.test",
      password: password("DEV_ORG_A_ADMIN_PASSWORD"),
    },
  });
  assert(
    hostileOrigin.response.status === 403,
    "Untrusted origin was not rejected.",
  );

  async function failedLogin(email) {
    const jar = new CookieJar();
    await apiRequest("/auth/csrf", { jar });
    return apiRequest("/auth/login", {
      jar,
      method: "POST",
      csrf: true,
      body: { email, password: "incorrect-password-value" },
    });
  }
  const knownFailure = await failedLogin("orgd.admin@example.test");
  const unknownFailure = await failedLogin("missing-user@example.test");
  assert(
    knownFailure.response.status === 401,
    "Known-user failure was not 401.",
  );
  assert(
    unknownFailure.response.status === 401,
    "Unknown-user failure was not 401.",
  );
  assert(
    knownFailure.payload.error.code === unknownFailure.payload.error.code &&
      knownFailure.payload.error.message ===
        unknownFailure.payload.error.message,
    "Login failures enumerate user accounts.",
  );

  const globalLogin = await freshLogin(
    "global.admin@example.test",
    "DEV_GLOBAL_ADMIN_PASSWORD",
  );
  assert(
    globalLogin.profile.memberships.length === 4,
    "Global Admin needs four contexts.",
  );
  assert(
    globalLogin.profile.capabilities.length === 13,
    "Global Admin capability count is wrong.",
  );
  assert(
    globalLogin.profile.activeContext.organizationCode === "org-a",
    "Wrong default context.",
  );
  assert(
    globalLogin.setCookies.some(
      (cookie) =>
        cookie.startsWith("automotive_access=") &&
        cookie.includes("HttpOnly") &&
        cookie.includes("SameSite=Lax"),
    ),
    "Access cookie security attributes are missing.",
  );

  const oldJar = globalLogin.jar.clone();
  const oldRefreshToken = oldJar.get("automotive_refresh");
  const refreshed = await apiRequest("/auth/refresh", {
    jar: globalLogin.jar,
    method: "POST",
    csrf: true,
  });
  assert(refreshed.response.status === 200, "Refresh rotation failed.");
  assert(
    globalLogin.jar.get("automotive_refresh") !== oldRefreshToken,
    "Refresh token did not rotate.",
  );
  const replay = await apiRequest("/auth/refresh", {
    jar: oldJar,
    method: "POST",
    csrf: true,
  });
  assert(
    replay.response.status === 401,
    `Refresh replay returned ${replay.response.status}: ${JSON.stringify(replay.payload)}`,
  );
  const afterReplay = await apiRequest("/auth/me", { jar: globalLogin.jar });
  assert(
    afterReplay.response.status === 401,
    "Replay did not revoke the token family.",
  );

  const contextLogin = await freshLogin(
    "global.admin@example.test",
    "DEV_GLOBAL_ADMIN_PASSWORD",
  );
  const orgD = contextLogin.profile.memberships.find(
    (membership) => membership.organizationCode === "org-d",
  );
  const switched = await apiRequest("/auth/organization-context", {
    jar: contextLogin.jar,
    method: "PUT",
    csrf: true,
    body: { organizationId: orgD.organizationId },
  });
  assert(switched.response.status === 200, "Organization switch failed.");
  assert(
    switched.payload.data.activeContext.organizationCode === "org-d",
    "Wrong switched context.",
  );
  const logout = await apiRequest("/auth/logout", {
    jar: contextLogin.jar,
    method: "POST",
    csrf: true,
  });
  assert(logout.response.status === 204, "Logout failed.");
  const afterLogout = await apiRequest("/auth/me", { jar: contextLogin.jar });
  assert(
    afterLogout.response.status === 401,
    "Logout did not revoke the session.",
  );

  const logoutAllLogin = await freshLogin(
    "orga.admin@example.test",
    "DEV_ORG_A_ADMIN_PASSWORD",
  );
  const logoutAll = await apiRequest("/auth/logout-all", {
    jar: logoutAllLogin.jar,
    method: "POST",
    csrf: true,
  });
  assert(logoutAll.response.status === 204, "Logout-all failed.");
  const afterLogoutAll = await apiRequest("/auth/me", {
    jar: logoutAllLogin.jar,
  });
  assert(
    afterLogoutAll.response.status === 401,
    "Logout-all did not invalidate access.",
  );

  const roleChangeLogin = await freshLogin(
    "orgb.admin@example.test",
    "DEV_ORG_B_ADMIN_PASSWORD",
  );
  assert(
    roleChangeLogin.profile.capabilities.includes("catalog.export"),
    "Org Admin is missing the initial export capability.",
  );
  await owner.query(`
    DELETE FROM security.role_permissions rp
    USING security.roles r
    WHERE rp.role_id = r.id
      AND r.code = 'ORG_ADMIN'
      AND r.organization_id IS NULL
      AND rp.permission_code = 'catalog.export'
  `);
  restoredRolePermissions.add("ORG_ADMIN:catalog.export");
  const afterRoleChange = await apiRequest("/auth/me", {
    jar: roleChangeLogin.jar,
  });
  assert(
    afterRoleChange.response.status === 200,
    "Role change invalidated identity.",
  );
  assert(
    !afterRoleChange.payload.data.capabilities.includes("catalog.export"),
    "Role permission change was hidden by stale token claims.",
  );
  await owner.query(`
    INSERT INTO security.role_permissions (role_id, permission_code)
    SELECT id, 'catalog.export'
    FROM security.roles
    WHERE code = 'ORG_ADMIN' AND organization_id IS NULL
    ON CONFLICT DO NOTHING
  `);
  restoredRolePermissions.delete("ORG_ADMIN:catalog.export");

  const membershipLogin = await freshLogin(
    "orgc.admin@example.test",
    "DEV_ORG_C_ADMIN_PASSWORD",
  );
  const membershipId = membershipLogin.profile.activeContext.membershipId;
  await owner.query(
    "UPDATE app.organization_memberships SET status = 'suspended' WHERE id = $1",
    [membershipId],
  );
  restoredMemberships.add(membershipId);
  await owner.query(
    "UPDATE app.organization_memberships SET status = 'active' WHERE id = $1",
    [membershipId],
  );
  restoredMemberships.delete(membershipId);
  const afterMembershipDisable = await apiRequest("/auth/me", {
    jar: membershipLogin.jar,
  });
  assert(
    afterMembershipDisable.response.status === 401,
    "Membership security change did not revoke the session.",
  );

  const disabledLogin = await freshLogin(
    "orgd.admin@example.test",
    "DEV_ORG_D_ADMIN_PASSWORD",
  );
  const disabledUserId = disabledLogin.profile.user.id;
  await owner.query(
    "UPDATE app.app_users SET status = 'disabled' WHERE id = $1",
    [disabledUserId],
  );
  restoredUsers.add(disabledUserId);
  await owner.query(
    "UPDATE app.app_users SET status = 'active' WHERE id = $1",
    [disabledUserId],
  );
  restoredUsers.delete(disabledUserId);
  const afterUserDisable = await apiRequest("/auth/me", {
    jar: disabledLogin.jar,
  });
  assert(
    afterUserDisable.response.status === 401,
    "Account security change did not revoke the session.",
  );

  const lockUser = await owner.query(
    "SELECT id FROM app.app_users WHERE email = 'orgb.restricted@example.test'::citext",
  );
  await owner.query("BEGIN");
  try {
    await owner.query(
      "UPDATE app.user_credentials SET failed_login_count = 0, locked_until = NULL WHERE user_id = $1",
      [lockUser.rows[0].id],
    );
    await owner.query("SELECT * FROM security.auth_record_failure($1, 2, 60)", [
      lockUser.rows[0].id,
    ]);
    const locked = await owner.query(
      "SELECT * FROM security.auth_record_failure($1, 2, 60)",
      [lockUser.rows[0].id],
    );
    assert(
      locked.rows[0].locked_until,
      "Account lock threshold was not enforced.",
    );
  } finally {
    await owner.query("ROLLBACK");
  }

  const securityEvidence = await owner.query(`
    SELECT
      (SELECT count(*)::integer FROM app.user_sessions) AS sessions,
      (SELECT count(*)::integer FROM app.user_sessions WHERE revoked_at IS NOT NULL) AS revoked_sessions,
      (SELECT count(*)::integer FROM audit.audit_events WHERE action LIKE 'auth.%') AS auth_audit_events,
      (SELECT count(*)::integer FROM app.user_sessions WHERE refresh_token_hash LIKE '%.%') AS raw_refresh_tokens
  `);
  assert(
    securityEvidence.rows[0].sessions >= 6,
    "Authentication sessions were not recorded.",
  );
  assert(
    securityEvidence.rows[0].revoked_sessions >= 5,
    "Session revocations were not recorded.",
  );
  assert(
    securityEvidence.rows[0].auth_audit_events >= 10,
    "Authentication audit coverage is incomplete.",
  );
  assert(
    securityEvidence.rows[0].raw_refresh_tokens === 0,
    "A raw refresh token was stored.",
  );

  for (const [, passwordVariable] of accounts) {
    const leakedSecret = await owner.query(
      "SELECT count(*)::integer AS count FROM audit.audit_events WHERE metadata::text LIKE '%' || $1 || '%'",
      [password(passwordVariable)],
    );
    assert(
      leakedSecret.rows[0].count === 0,
      `${passwordVariable} leaked into audit metadata.`,
    );
  }

  console.log(
    JSON.stringify(
      {
        status: "ok",
        migrations: migrationCount.rows[0].count,
        developmentUsers: accountSummary.rows[0].users,
        credentials: accountSummary.rows[0].credentials,
        memberships: accountSummary.rows[0].memberships,
        argon2idCredentials: accounts.length,
        authenticationFunctions: functionBoundary.rows[0].function_count,
        directRuntimeTableVisibility: directVisibility.rows[0],
        csrfProtection: "ok",
        originProtection: "ok",
        genericLoginFailures: "ok",
        refreshRotation: "ok",
        refreshReplayRevocation: "ok",
        organizationSwitching: "ok",
        logout: "ok",
        logoutAll: "ok",
        liveRolePermissionChanges: "ok",
        membershipRevocation: "ok",
        accountRevocation: "ok",
        accountLocking: "ok",
        recordedSessions: securityEvidence.rows[0].sessions,
        revokedSessions: securityEvidence.rows[0].revoked_sessions,
        authenticationAuditEvents: securityEvidence.rows[0].auth_audit_events,
        rawRefreshTokensStored: securityEvidence.rows[0].raw_refresh_tokens,
      },
      null,
      2,
    ),
  );
} finally {
  for (const membershipId of restoredMemberships) {
    await owner
      .query(
        "UPDATE app.organization_memberships SET status = 'active' WHERE id = $1",
        [membershipId],
      )
      .catch(() => undefined);
  }
  for (const userId of restoredUsers) {
    await owner
      .query("UPDATE app.app_users SET status = 'active' WHERE id = $1", [
        userId,
      ])
      .catch(() => undefined);
  }
  for (const rolePermission of restoredRolePermissions) {
    const [roleCode, permissionCode] = rolePermission.split(":");
    await owner
      .query(
        `
          INSERT INTO security.role_permissions (role_id, permission_code)
          SELECT id, $2
          FROM security.roles
          WHERE code = $1 AND organization_id IS NULL
          ON CONFLICT DO NOTHING
        `,
        [roleCode, permissionCode],
      )
      .catch(() => undefined);
  }
  await runtime.end().catch(() => undefined);
  await owner.end();
}
