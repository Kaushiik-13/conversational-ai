import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const { Client } = pg;
const baseUrl = process.env.PHASE11_API_URL ?? "http://localhost:3000/api/v1";
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
const requiredPasswords = [
  "DEV_GLOBAL_ADMIN_PASSWORD",
  "DEV_ORG_A_ADMIN_PASSWORD",
  "DEV_ORG_B_ADMIN_PASSWORD",
  "DEV_ORG_C_ADMIN_PASSWORD",
  "DEV_ORG_D_ADMIN_PASSWORD",
  "DEV_ORG_B_RESTRICTED_PASSWORD",
];

if (!ownerUrl) throw new Error("MIGRATION_DATABASE_URL is required.");
for (const variable of requiredPasswords) {
  if (!process.env[variable]) throw new Error(`${variable} is required.`);
}

class Session {
  cookies = new Map();
  csrfToken = null;
  profile = null;

  absorb(response) {
    for (const value of response.headers.getSetCookie?.() ?? []) {
      const pair = value.split(";", 1)[0];
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;
      const name = pair.slice(0, separator);
      const cookieValue = pair.slice(separator + 1);
      if (cookieValue) this.cookies.set(name, cookieValue);
      else this.cookies.delete(name);
    }
    this.csrfToken = this.cookies.get("XSRF-TOKEN") ?? this.csrfToken;
  }

  async request(path, options = {}) {
    const method = options.method ?? "GET";
    const headers = new Headers(options.headers ?? {});
    if (this.cookies.size) {
      headers.set(
        "Cookie",
        [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "),
      );
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      headers.set("Origin", "http://localhost:4200");
      if (options.csrf !== false && this.csrfToken) {
        headers.set("X-XSRF-TOKEN", this.csrfToken);
      }
    }
    if (options.body !== undefined)
      headers.set("Content-Type", "application/json");

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    this.absorb(response);
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : null,
      headers: response.headers,
    };
  }

  async login(email, password) {
    const csrf = await this.request("/auth/csrf");
    assert.equal(csrf.status, 200, `CSRF bootstrap failed for ${email}.`);
    this.csrfToken = csrf.body.data.csrfToken;
    const login = await this.request("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    assert.equal(
      login.status,
      200,
      `Login failed for ${email}: ${JSON.stringify(login.body)}`,
    );
    assert.ok(login.body.meta.requestId, `${email} login has no request ID.`);
    this.profile = login.body.data;
    return this.profile;
  }
}

const owner = new Client({ connectionString: ownerUrl });
const suffix = Date.now().toString(36);
const temporaryUsers = [
  {
    id: randomUUID(),
    membershipId: randomUUID(),
    email: `phase11-analyst-${suffix}@example.test`,
    role: "ANALYST",
  },
  {
    id: randomUUID(),
    membershipId: randomUUID(),
    email: `phase11-viewer-${suffix}@example.test`,
    role: "VIEWER",
  },
];

const domainCases = [
  { key: "braking", query: "caliper", domainId: 10 },
  { key: "tyres", query: "tyre", domainId: 11 },
  { key: "steering", query: "steering", domainId: 12 },
  { key: "engine", query: "intake manifold", domainId: 13 },
];

const catalogWriteBody = {
  companyId: 991101,
  tenantId: 991,
  partNumber: `P11-DENIED-${suffix}`,
  partName: "Phase 11 denied write probe",
  description: "This payload must never be persisted.",
  commodity: "Braking",
  subCommodity: "Calipers",
  manufacturer: "Phase 11 Validation",
  vehicleProgram: "P11",
  region: "Europe",
  country: "Germany",
  plant: "Validation Plant",
  modelYear: 2026,
  material: "steel",
  lifecycleStatus: "active",
  supplierStatus: "approved",
  costUsd: 10,
  weightKg: 1,
  securityDomainId: 10,
  primaryCategoryId: 106,
  visibilityStatus: "organization",
  secondaryCategoryIds: [10],
};

async function expectStatus(result, expected, label) {
  const statuses = Array.isArray(expected) ? expected : [expected];
  assert.ok(
    statuses.includes(result.status),
    `${label}: received ${result.status}, expected ${statuses.join("/")}: ${JSON.stringify(result.body)}`,
  );
  if (result.body?.error) {
    assert.ok(
      result.body.error.requestId,
      `${label}: error response has no request ID.`,
    );
  }
}

async function search(session, body, label) {
  const result = await session.request("/search", { method: "POST", body });
  await expectStatus(result, 200, label);
  assert.ok(
    Number.isFinite(result.body.meta.queryTimeMs),
    `${label}: query timing is absent.`,
  );
  return result.body;
}

async function createTemporaryRoleUsers() {
  await owner.query("BEGIN");
  try {
    for (const user of temporaryUsers) {
      await owner.query(
        `INSERT INTO app.app_users (id, email, display_name, status)
         VALUES ($1, $2, $3, 'active')`,
        [user.id, user.email, `Phase 11 ${user.role}`],
      );
      await owner.query(
        `INSERT INTO app.user_credentials (user_id, password_hash)
         SELECT $1, credential.password_hash
         FROM app.user_credentials credential
         JOIN app.app_users source_user ON source_user.id = credential.user_id
         WHERE source_user.email = 'orgb.admin@example.test'::citext`,
        [user.id],
      );
      await owner.query(
        `INSERT INTO app.organization_memberships (
           id, user_id, organization_id, role_id, status, is_default, valid_from
         )
         SELECT $1, $2, organization.id, role.id, 'active', true,
                '2026-01-01 00:00:00+00'
         FROM app.organizations organization
         CROSS JOIN security.roles role
         WHERE organization.code = 'org-b'
           AND role.code = $3 AND role.organization_id IS NULL`,
        [user.membershipId, user.id, user.role],
      );
    }
    await owner.query("COMMIT");
  } catch (error) {
    await owner.query("ROLLBACK");
    throw error;
  }
}

async function cleanup() {
  const userIds = temporaryUsers.map((user) => user.id);
  await owner.query("BEGIN");
  try {
    await owner.query(
      "DELETE FROM audit.audit_events WHERE actor_user_id = ANY($1::uuid[])",
      [userIds],
    );
    await owner.query(
      "DELETE FROM app.user_sessions WHERE user_id = ANY($1::uuid[])",
      [userIds],
    );
    await owner.query(
      "DELETE FROM app.organization_memberships WHERE user_id = ANY($1::uuid[])",
      [userIds],
    );
    await owner.query("DELETE FROM app.app_users WHERE id = ANY($1::uuid[])", [
      userIds,
    ]);
    await owner.query("COMMIT");
  } catch (error) {
    await owner.query("ROLLBACK");
    throw error;
  }
}

try {
  await owner.connect();
  const migrations = await owner.query(
    "SELECT count(*)::integer AS count FROM public.schema_migrations",
  );
  assert.equal(
    migrations.rows[0].count,
    25,
    "Expected twenty-five migrations.",
  );

  const dataset = await owner.query(
    `SELECT count(*)::integer AS count
     FROM catalog.part_catalog WHERE source_system = 'phase7-generator'`,
  );
  assert.equal(
    dataset.rows[0].count,
    5_000_000,
    "The persistent dataset is incomplete.",
  );

  const runtimeRole = await owner.query(
    `SELECT rolsuper, rolbypassrls
     FROM pg_roles WHERE rolname = 'automotive_app'`,
  );
  assert.equal(runtimeRole.rowCount, 1);
  assert.equal(
    runtimeRole.rows[0].rolsuper,
    false,
    "Runtime role is a superuser.",
  );
  assert.equal(
    runtimeRole.rows[0].rolbypassrls,
    false,
    "Runtime role can bypass RLS.",
  );

  await createTemporaryRoleUsers();

  const samples = await owner.query(`
    SELECT DISTINCT ON (security_domain_id, company_id)
           id, security_domain_id, company_id, document_version
    FROM catalog.part_catalog
    WHERE active
      AND visibility_status = 'organization'
      AND security_domain_id IN (10, 11, 12, 13)
      AND company_id IN (101, 202)
    ORDER BY security_domain_id, company_id, id
  `);
  const sampleFor = (domainId, companyId = 101) => {
    const sample = samples.rows.find(
      (row) =>
        Number(row.security_domain_id) === domainId &&
        row.company_id === companyId,
    );
    assert.ok(
      sample,
      `Missing sample for domain ${domainId}, company ${companyId}.`,
    );
    return sample;
  };

  const sessions = {
    global: new Session(),
    orgA: new Session(),
    orgB: new Session(),
    orgC: new Session(),
    orgD: new Session(),
    analystB: new Session(),
    viewerB: new Session(),
    restrictedB: new Session(),
  };
  await sessions.global.login(
    "global.admin@example.test",
    process.env.DEV_GLOBAL_ADMIN_PASSWORD,
  );
  await sessions.orgA.login(
    "orga.admin@example.test",
    process.env.DEV_ORG_A_ADMIN_PASSWORD,
  );
  await sessions.orgB.login(
    "orgb.admin@example.test",
    process.env.DEV_ORG_B_ADMIN_PASSWORD,
  );
  await sessions.orgC.login(
    "orgc.admin@example.test",
    process.env.DEV_ORG_C_ADMIN_PASSWORD,
  );
  await sessions.orgD.login(
    "orgd.admin@example.test",
    process.env.DEV_ORG_D_ADMIN_PASSWORD,
  );
  await sessions.analystB.login(
    temporaryUsers[0].email,
    process.env.DEV_ORG_B_ADMIN_PASSWORD,
  );
  await sessions.viewerB.login(
    temporaryUsers[1].email,
    process.env.DEV_ORG_B_ADMIN_PASSWORD,
  );
  await sessions.restrictedB.login(
    "orgb.restricted@example.test",
    process.env.DEV_ORG_B_RESTRICTED_PASSWORD,
  );

  assert.equal(sessions.analystB.profile.activeContext.role, "ANALYST");
  assert.equal(sessions.viewerB.profile.activeContext.role, "VIEWER");

  const allowedDomains = {
    global: new Set(Array.from({ length: 13 }, (_, index) => index + 10)),
    orgA: new Set(Array.from({ length: 13 }, (_, index) => index + 10)),
    orgB: new Set([10]),
    orgC: new Set([11]),
    orgD: new Set([12]),
    analystB: new Set([10]),
    viewerB: new Set([10]),
    restrictedB: new Set([10]),
  };
  const searchResults = new Map();
  for (const [account, session] of Object.entries(sessions)) {
    for (const domainCase of domainCases) {
      const result = await search(
        session,
        {
          query: domainCase.query,
          facets: ["securityDomain"],
          limit: 5,
        },
        `${account} ${domainCase.key} search`,
      );
      searchResults.set(`${account}:${domainCase.key}`, result);
      if (allowedDomains[account].has(domainCase.domainId)) {
        assert.ok(
          result.meta.visibleHitCount > 0,
          `${account} lost ${domainCase.key} access.`,
        );
        assert.ok(
          result.data.items.every((item) =>
            allowedDomains[account].has(item.securityDomainId),
          ),
          `${account} received a cross-domain row for ${domainCase.key}.`,
        );
        const facetDomains = new Set(
          result.data.facets.securityDomain.map((bucket) =>
            Number(bucket.value),
          ),
        );
        assert.ok(
          [...facetDomains].every((domainId) =>
            allowedDomains[account].has(domainId),
          ),
          `${account} received a cross-domain facet for ${domainCase.key}.`,
        );
        if (allowedDomains[account].size === 1) {
          assert.ok(
            result.data.items.every(
              (item) => item.securityDomainId === domainCase.domainId,
            ),
            `${account} received a row outside its restricted domain for ${domainCase.key}.`,
          );
          assert.ok(
            facetDomains.size === 1 && facetDomains.has(domainCase.domainId),
            `${account} received a facet outside its restricted domain for ${domainCase.key}.`,
          );
        } else {
          assert.ok(
            facetDomains.has(domainCase.domainId),
            `${account} lost the expected domain facet for ${domainCase.key}.`,
          );
        }
      } else {
        assert.equal(
          result.meta.visibleHitCount,
          0,
          `${account} leaked ${domainCase.key} totals.`,
        );
        assert.equal(
          result.data.items.length,
          0,
          `${account} leaked ${domainCase.key} rows.`,
        );
        assert.equal(
          result.data.facets.securityDomain.length,
          0,
          `${account} leaked ${domainCase.key} facets.`,
        );
      }
    }
  }

  const orgBTotal = searchResults.get("orgB:braking").meta.visibleHitCount;
  assert.equal(
    searchResults.get("analystB:braking").meta.visibleHitCount,
    orgBTotal,
  );
  assert.equal(
    searchResults.get("viewerB:braking").meta.visibleHitCount,
    orgBTotal,
  );
  assert.ok(
    searchResults.get("restrictedB:braking").meta.visibleHitCount < orgBTotal,
    "Restricted Viewer totals are not a strict subset of Org B.",
  );

  const directAccess = {
    global: [10, 11, 12, 13],
    orgA: [10, 11, 12, 13],
    orgB: [10],
    orgC: [11],
    orgD: [12],
    analystB: [10],
    viewerB: [10],
  };
  for (const [account, session] of Object.entries(sessions)) {
    if (account === "restrictedB") continue;
    for (const domainId of [10, 11, 12, 13]) {
      const record = await session.request(
        `/catalog/records/${sampleFor(domainId).id}`,
      );
      await expectStatus(
        record,
        directAccess[account].includes(domainId) ? 200 : 404,
        `${account} direct domain ${domainId}`,
      );
    }
  }
  await expectStatus(
    await sessions.restrictedB.request(
      `/catalog/records/${sampleFor(10, 101).id}`,
    ),
    200,
    "Restricted Viewer allowed-company direct read",
  );
  await expectStatus(
    await sessions.restrictedB.request(
      `/catalog/records/${sampleFor(10, 202).id}`,
    ),
    404,
    "Restricted Viewer denied-company direct read",
  );

  const fieldExpectations = [
    ["global", true, true],
    ["orgB", true, false],
    ["analystB", true, false],
    ["viewerB", false, false],
    ["restrictedB", false, false],
  ];
  for (const [account, commercialAllowed, sourceAllowed] of fieldExpectations) {
    const record = await sessions[account].request(
      `/catalog/records/${sampleFor(10, 101).id}`,
    );
    await expectStatus(record, 200, `${account} field projection`);
    for (const field of ["costUsd", "supplierStatus"]) {
      assert.equal(
        field in record.body.data,
        commercialAllowed,
        `${field} projection is wrong for ${account}.`,
      );
    }
    for (const field of ["sourceSystem", "sourceRecordId"]) {
      assert.equal(
        field in record.body.data,
        sourceAllowed,
        `${field} projection is wrong for ${account}.`,
      );
    }
  }

  const forbiddenDomain = await search(
    sessions.orgB,
    {
      query: "tyre",
      filters: { securityDomainIds: [11] },
      facets: ["securityDomain", "primaryCategory"],
      limit: 5,
    },
    "manipulated forbidden-domain filter",
  );
  assert.equal(forbiddenDomain.meta.visibleHitCount, 0);
  assert.deepEqual(forbiddenDomain.data.facets.securityDomain, []);
  assert.deepEqual(forbiddenDomain.data.facets.primaryCategory, []);

  const restrictedCompany = await search(
    sessions.restrictedB,
    {
      query: "caliper",
      filters: { companyIds: [202] },
      facets: ["manufacturer"],
      limit: 5,
    },
    "manipulated restricted-company filter",
  );
  assert.equal(restrictedCompany.meta.visibleHitCount, 0);
  assert.deepEqual(restrictedCompany.data.facets.manufacturer, []);

  await expectStatus(
    await sessions.orgB.request("/search", {
      method: "POST",
      body: {
        query: "caliper",
        organizationId: "00000000-0000-4000-a000-000000000003",
      },
    }),
    400,
    "client-supplied organization scope",
  );
  await expectStatus(
    await sessions.viewerB.request("/search", {
      method: "POST",
      body: { query: "caliper", filters: { cost: { min: 1 } } },
    }),
    403,
    "Viewer protected cost filter",
  );
  await expectStatus(
    await sessions.orgB.request("/search", {
      method: "POST",
      body: {
        query: "caliper",
        filters: {
          securityDomainIds: Array.from(
            { length: 101 },
            (_, index) => index + 1,
          ),
        },
      },
    }),
    400,
    "oversized filter array",
  );
  const injection = await search(
    sessions.orgB,
    { query: "caliper' OR true --", facets: ["securityDomain"], limit: 5 },
    "bound injection-like query",
  );
  assert.equal(
    injection.data.items.every((item) => item.securityDomainId === 10),
    true,
    "Injection-like text escaped Org B's domain scope.",
  );
  assert.equal(
    injection.data.facets.securityDomain.every(
      (bucket) => Number(bucket.value) === 10,
    ),
    true,
    "Injection-like text escaped Org B's facet scope.",
  );

  const cursorPage = await search(
    sessions.orgB,
    {
      query: "caliper",
      facets: [],
      sort: { field: "partNumber", direction: "asc" },
      limit: 2,
    },
    "Org B cursor source",
  );
  assert.ok(
    cursorPage.meta.nextCursor,
    "Cursor source page has no next cursor.",
  );
  await expectStatus(
    await sessions.orgC.request("/search", {
      method: "POST",
      body: {
        query: "caliper",
        facets: [],
        sort: { field: "partNumber", direction: "asc" },
        limit: 2,
        cursor: cursorPage.meta.nextCursor,
      },
    }),
    400,
    "cross-organization cursor",
  );

  await expectStatus(
    await sessions.orgB.request("/auth/organization-context", {
      method: "PUT",
      body: { organizationId: "00000000-0000-4000-a000-000000000003" },
    }),
    [403, 404],
    "arbitrary organization switch",
  );
  const orgBProfile = await sessions.orgB.request("/auth/me");
  await expectStatus(orgBProfile, 200, "Org B profile after denied switch");
  assert.equal(orgBProfile.body.data.activeContext.organizationCode, "org-b");

  const deniedActors = ["analystB", "viewerB", "restrictedB"];
  for (const account of deniedActors) {
    const session = sessions[account];
    await expectStatus(
      await session.request("/catalog/parts", {
        method: "POST",
        headers: { "Idempotency-Key": `phase11-${account}-${suffix}` },
        body: catalogWriteBody,
      }),
      403,
      `${account} catalog create denial`,
    );
    await expectStatus(
      await session.request(`/catalog/parts/${sampleFor(10, 101).id}`, {
        method: "PATCH",
        headers: { "If-Match": `"${sampleFor(10, 101).document_version}"` },
        body: { partName: "Unauthorized Phase 11 update" },
      }),
      403,
      `${account} catalog update denial`,
    );
    await expectStatus(
      await session.request(`/catalog/parts/${sampleFor(10, 101).id}`, {
        method: "DELETE",
        headers: { "If-Match": `"${sampleFor(10, 101).document_version}"` },
      }),
      403,
      `${account} catalog archive denial`,
    );
    await expectStatus(
      await session.request("/users"),
      403,
      `${account} user-list denial`,
    );
    await expectStatus(
      await session.request("/audit-events?limit=5"),
      403,
      `${account} audit denial`,
    );
  }

  await expectStatus(
    await sessions.orgB.request(
      "/organizations/00000000-0000-4000-a000-000000000002/entitlements",
      {
        method: "PUT",
        headers: { "If-Match": '"1"' },
        body: {
          entitlements: [
            { categoryId: 10, effect: "allow", includeDescendants: true },
          ],
        },
      },
    ),
    403,
    "Org Admin entitlement update denial",
  );
  await expectStatus(
    await sessions.orgB.request("/categories", {
      method: "POST",
      body: {
        parentId: 10,
        slug: `phase11-${suffix}`,
        name: "Unauthorized category",
      },
    }),
    403,
    "Org Admin taxonomy denial",
  );

  await expectStatus(
    await sessions.viewerB.request("/exports"),
    404,
    "Viewer export route unavailable",
  );
  await expectStatus(
    await sessions.global.request("/exports"),
    404,
    "Global export route unavailable",
  );

  const deniedAudit = await owner.query(
    `SELECT count(*)::integer AS count,
            bool_and(metadata ? 'method' AND metadata ? 'requiredPermissions') AS safely_shaped,
            bool_and(metadata::text NOT ILIKE '%password%'
                     AND metadata::text NOT ILIKE '%token%'
                     AND metadata::text NOT ILIKE '%Phase 11 denied write probe%') AS redacted
     FROM audit.audit_events
     WHERE actor_user_id = ANY($1::uuid[])
       AND action = 'authorization.denied' AND decision = 'deny'`,
    [temporaryUsers.map((user) => user.id)],
  );
  assert.ok(
    deniedAudit.rows[0].count >= 8,
    "Denied actions were not fully audited.",
  );
  assert.equal(
    deniedAudit.rows[0].safely_shaped,
    true,
    "Denied audit shape is incomplete.",
  );
  assert.equal(
    deniedAudit.rows[0].redacted,
    true,
    "Denied audit metadata contains protected input.",
  );

  await owner.query(
    `UPDATE app.app_users
     SET status = 'disabled', authorization_version = authorization_version + 1
     WHERE id = $1`,
    [temporaryUsers[1].id],
  );
  await expectStatus(
    await sessions.viewerB.request("/auth/me"),
    401,
    "disabled-user session invalidation",
  );

  await owner.query(
    `UPDATE app.user_sessions
     SET revoked_at = clock_timestamp(), revocation_reason = 'phase11-validation'
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [temporaryUsers[0].id],
  );
  await expectStatus(
    await sessions.analystB.request("/auth/me"),
    401,
    "revoked-session invalidation",
  );

  const deniedPersistence = await owner.query(
    "SELECT count(*)::integer AS count FROM catalog.part_catalog WHERE part_number = $1",
    [catalogWriteBody.partNumber],
  );
  assert.equal(
    deniedPersistence.rows[0].count,
    0,
    "A denied catalog write was persisted.",
  );

  console.log(
    JSON.stringify(
      {
        status: "ok",
        migrations: migrations.rows[0].count,
        persistentRecords: dataset.rows[0].count,
        testedAccounts: Object.keys(sessions),
        organizationRoleMatrix: "ok",
        crossOrganizationAndCategoryDenial: "ok",
        directIdIsolation: "ok",
        facetAndTotalIsolation: "ok",
        protectedFieldOmission: "ok",
        writeAndAdministrationDenial: "ok",
        manipulatedRequestRejection: "ok",
        cursorAndOrganizationBinding: "ok",
        disabledUserAndRevokedSession: "ok",
        deniedActionAuditRedaction: "ok",
        runtimeCannotBypassRls: "ok",
        exportApi: "not-implemented-and-unreachable",
      },
      null,
      2,
    ),
  );
} finally {
  if (owner._connected) {
    await cleanup().catch((error) =>
      console.error(`Phase 11 cleanup failed: ${error.message}`),
    );
    await owner.end().catch(() => undefined);
  }
}
