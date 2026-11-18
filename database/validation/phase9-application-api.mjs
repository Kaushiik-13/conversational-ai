import assert from "node:assert/strict";
import pg from "pg";

const { Client } = pg;
const baseUrl = process.env.PHASE9_API_URL ?? "http://localhost:3000/api/v1";
const ownerUrl = process.env.MIGRATION_DATABASE_URL;
const required = [
  "DEV_GLOBAL_ADMIN_PASSWORD",
  "DEV_ORG_B_ADMIN_PASSWORD",
  "DEV_ORG_B_RESTRICTED_PASSWORD",
];
for (const variable of required) {
  if (!process.env[variable]) throw new Error(`${variable} is required.`);
}
if (!ownerUrl) throw new Error("MIGRATION_DATABASE_URL is required.");

class Session {
  cookies = new Map();
  csrfToken = null;

  absorb(response) {
    const values = response.headers.getSetCookie?.() ?? [];
    for (const value of values) {
      const pair = value.split(";", 1)[0];
      const separator = pair.indexOf("=");
      if (separator > 0)
        this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    this.csrfToken = this.cookies.get("XSRF-TOKEN") ?? this.csrfToken;
  }

  async request(path, options = {}) {
    const headers = new Headers(options.headers ?? {});
    const method = options.method ?? "GET";
    const unsafe = !["GET", "HEAD", "OPTIONS"].includes(method);
    if (this.cookies.size) {
      headers.set(
        "Cookie",
        [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; "),
      );
    }
    if (unsafe) {
      headers.set("Origin", "http://localhost:4200");
    }
    if (options.body !== undefined)
      headers.set("Content-Type", "application/json");
    if (options.csrf !== false && unsafe && this.csrfToken) {
      headers.set("X-XSRF-TOKEN", this.csrfToken);
    }
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    this.absorb(response);
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    return { status: response.status, body, headers: response.headers };
  }

  async login(email, password) {
    const csrf = await this.request("/auth/csrf");
    assert.equal(csrf.status, 200);
    this.csrfToken = csrf.body.data.csrfToken;
    const login = await this.request("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    assert.ok(login.body.meta.requestId);
    return login.body.data;
  }
}

const owner = new Client({ connectionString: ownerUrl });
const cleanup = {
  partId: null,
  categoryId: null,
  userId: null,
  organizationId: null,
};
const suffix = Date.now().toString(36);

async function expectStatus(request, status, label) {
  assert.equal(
    request.status,
    status,
    `${label}: ${JSON.stringify(request.body)}`,
  );
}

try {
  await owner.connect();

  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  console.log("pass health endpoint");

  const openApi = await fetch(`${baseUrl}/openapi.json`).then(
    async (response) => ({
      status: response.status,
      body: await response.json(),
    }),
  );
  assert.equal(openApi.status, 200);
  for (const path of [
    "/api/v1/catalog/parts",
    "/api/v1/categories/tree",
    "/api/v1/organizations",
    "/api/v1/users",
    "/api/v1/roles",
    "/api/v1/audit-events",
  ])
    assert.ok(openApi.body.paths[path], `OpenAPI path missing: ${path}`);
  console.log("pass OpenAPI contract");

  const orgB = new Session();
  await orgB.login(
    "orgb.admin@example.test",
    process.env.DEV_ORG_B_ADMIN_PASSWORD,
  );
  const orgBOrganizations = await orgB.request("/organizations");
  await expectStatus(orgBOrganizations, 200, "Org B organization list");
  assert.equal(orgBOrganizations.body.data.length, 1);
  assert.equal(orgBOrganizations.body.data[0].code, "org-b");
  const orgBId = orgBOrganizations.body.data[0].id;

  const hiddenOrganization = await orgB.request(
    "/organizations/00000000-0000-4000-a000-000000000003",
  );
  await expectStatus(hiddenOrganization, 404, "cross-organization read");

  const categoryTree = await orgB.request("/categories/tree");
  await expectStatus(categoryTree, 200, "category tree");
  const serializedTree = JSON.stringify(categoryTree.body.data);
  assert.match(serializedTree, /braking/);
  assert.doesNotMatch(serializedTree, /steering/);

  const entitlements = await orgB.request(
    `/organizations/${orgBId}/entitlements`,
  );
  await expectStatus(entitlements, 200, "entitlement read");
  assert.ok(entitlements.body.data.entries.length > 0);

  const roles = await orgB.request("/roles");
  await expectStatus(roles, 200, "role list");
  assert.ok(roles.body.data.some((role) => role.code === "VIEWER"));
  assert.ok(!roles.body.data.some((role) => role.code === "GLOBAL_ADMIN"));
  const platformAdmin = await orgB.request(
    "/users/20000000-0000-4000-a000-000000000001",
  );
  await expectStatus(platformAdmin, 200, "platform admin safe read");
  const platformAdminUpdate = await orgB.request(
    "/users/20000000-0000-4000-a000-000000000001",
    {
      method: "PATCH",
      headers: { "If-Match": `"${platformAdmin.body.data.version}"` },
      body: { displayName: "Unauthorized platform change" },
    },
  );
  await expectStatus(
    platformAdminUpdate,
    404,
    "Org Admin platform-user update",
  );
  const platformOrgBMembership = platformAdmin.body.data.memberships.find(
    (membership) => membership.organizationId === orgBId,
  );
  const platformMembershipUpdate = await orgB.request(
    `/memberships/${platformOrgBMembership.id}`,
    {
      method: "PATCH",
      headers: { "If-Match": `"${platformOrgBMembership.version}"` },
      body: { roleCode: "VIEWER" },
    },
  );
  await expectStatus(
    platformMembershipUpdate,
    404,
    "Org Admin platform-membership update",
  );
  console.log("pass organization, taxonomy, entitlement, and role read scope");

  const catalogInput = {
    companyId: 991001,
    tenantId: 991,
    partNumber: `P9-${suffix}`,
    partName: "Phase 9 brake validation part",
    description: "Temporary Phase 9 validation record",
    commodity: "Braking",
    subCommodity: "Brake Pads",
    manufacturer: "Validation Motors",
    vehicleProgram: "P9",
    region: "Europe",
    country: "Germany",
    plant: "Validation Plant",
    modelYear: 2026,
    material: "ceramic",
    lifecycleStatus: "active",
    supplierStatus: "approved",
    costUsd: 79.5,
    weightKg: 1.25,
    securityDomainId: 10,
    primaryCategoryId: 101,
    visibilityStatus: "organization",
    secondaryCategoryIds: [100],
  };
  const missingCsrf = await orgB.request("/catalog/parts", {
    method: "POST",
    body: catalogInput,
    csrf: false,
    headers: { "Idempotency-Key": `phase9-nocsrf-${suffix}` },
  });
  await expectStatus(missingCsrf, 403, "write without CSRF");
  assert.equal(missingCsrf.body.error.code, "CSRF_FAILED");

  const createdPart = await orgB.request("/catalog/parts", {
    method: "POST",
    body: catalogInput,
    headers: { "Idempotency-Key": `phase9-catalog-${suffix}` },
  });
  await expectStatus(createdPart, 201, "catalog create");
  cleanup.partId = createdPart.body.data.id;
  assert.equal(createdPart.body.data.version, 1);
  assert.equal(createdPart.headers.get("etag"), '"1"');
  const updatedPart = await orgB.request(`/catalog/parts/${cleanup.partId}`, {
    method: "PATCH",
    body: { partName: "Phase 9 updated brake validation part" },
    headers: { "If-Match": '"1"' },
  });
  await expectStatus(updatedPart, 200, "catalog update");
  assert.equal(updatedPart.body.data.version, 2);
  assert.equal(updatedPart.headers.get("etag"), '"2"');
  const stalePart = await orgB.request(`/catalog/parts/${cleanup.partId}`, {
    method: "PATCH",
    body: { partName: "stale write" },
    headers: { "If-Match": '"1"' },
  });
  await expectStatus(stalePart, 412, "stale catalog write");
  const archivedPart = await orgB.request(`/catalog/parts/${cleanup.partId}`, {
    method: "DELETE",
    headers: { "If-Match": '"2"' },
  });
  await expectStatus(archivedPart, 204, "catalog archive");
  console.log(
    "pass catalog create, idempotency, versioning, update, and archive",
  );

  const createdUser = await orgB.request("/users", {
    method: "POST",
    body: {
      email: `phase9-${suffix}@example.test`,
      displayName: "Phase 9 User",
      roleCode: "VIEWER",
    },
  });
  await expectStatus(createdUser, 201, "user create");
  cleanup.userId = createdUser.body.data.id;
  const membership = createdUser.body.data.memberships[0];
  const updatedMembership = await orgB.request(
    `/memberships/${membership.id}`,
    {
      method: "PATCH",
      headers: { "If-Match": '"1"' },
      body: {
        roleCode: "RESTRICTED_VIEWER",
        restrictions: [
          { scopeType: "company", effect: "allow", companyId: 101 },
        ],
      },
    },
  );
  await expectStatus(updatedMembership, 200, "membership update");
  const updatedUser = await orgB.request(`/users/${cleanup.userId}`, {
    method: "PATCH",
    headers: { "If-Match": '"1"' },
    body: { displayName: "Phase 9 Updated User" },
  });
  await expectStatus(updatedUser, 200, "user update");
  console.log("pass user and membership administration");

  const restricted = new Session();
  await restricted.login(
    "orgb.restricted@example.test",
    process.env.DEV_ORG_B_RESTRICTED_PASSWORD,
  );
  const denied = await restricted.request("/catalog/parts", {
    method: "POST",
    body: catalogInput,
    headers: { "Idempotency-Key": `phase9-denied-${suffix}` },
  });
  await expectStatus(denied, 403, "restricted write");
  assert.equal(denied.body.error.code, "ACCESS_DENIED");
  const deniedAudit = await owner.query(
    `SELECT count(*)::integer AS count FROM audit.audit_events
     WHERE actor_user_id = '20000000-0000-4000-a000-000000000006'
       AND action = 'authorization.denied' AND decision = 'deny'`,
  );
  assert.ok(deniedAudit.rows[0].count > 0);
  console.log("pass denied-action audit without protected payload");

  const audit = await orgB.request("/audit-events?limit=20");
  await expectStatus(audit, 200, "audit list");
  assert.ok(audit.body.data.length > 0);

  const global = new Session();
  await global.login(
    "global.admin@example.test",
    process.env.DEV_GLOBAL_ADMIN_PASSWORD,
  );
  const allOrganizations = await global.request("/organizations");
  await expectStatus(allOrganizations, 200, "global organization list");
  assert.equal(allOrganizations.body.data.length, 4);
  const createdCategory = await global.request("/categories", {
    method: "POST",
    body: {
      parentId: 10,
      slug: `phase9-${suffix}`,
      name: "Phase 9 Temporary Category",
    },
  });
  await expectStatus(createdCategory, 201, "category create");
  cleanup.categoryId = createdCategory.body.data.id;
  const updatedCategory = await global.request(
    `/categories/${cleanup.categoryId}`,
    {
      method: "PATCH",
      headers: { "If-Match": '"1"' },
      body: { name: "Phase 9 Updated Category" },
    },
  );
  await expectStatus(updatedCategory, 200, "category update");
  const archivedCategory = await global.request(
    `/categories/${cleanup.categoryId}`,
    {
      method: "DELETE",
      headers: { "If-Match": '"2"' },
    },
  );
  await expectStatus(archivedCategory, 204, "category archive");
  const temporaryOrganization = await owner.query(
    `INSERT INTO app.organizations (code, name)
     VALUES ($1, 'Phase 9 Temporary Organization') RETURNING id`,
    [`phase9-${suffix}`],
  );
  cleanup.organizationId = temporaryOrganization.rows[0].id;
  const replacedEntitlements = await global.request(
    `/organizations/${cleanup.organizationId}/entitlements`,
    {
      method: "PUT",
      headers: { "If-Match": '"1"' },
      body: {
        entitlements: [
          { categoryId: 10, effect: "allow", includeDescendants: true },
        ],
      },
    },
  );
  await expectStatus(
    replacedEntitlements,
    200,
    "Global Admin entitlement replacement",
  );
  assert.equal(replacedEntitlements.body.data.version, 2);
  console.log(
    "pass Global Admin cross-organization, taxonomy, and entitlement management",
  );

  const deniedEntitlementWrite = await orgB.request(
    `/organizations/${orgBId}/entitlements`,
    {
      method: "PUT",
      headers: { "If-Match": `"${entitlements.body.data.version}"` },
      body: {
        entitlements: [
          { categoryId: 10, effect: "allow", includeDescendants: true },
        ],
      },
    },
  );
  await expectStatus(
    deniedEntitlementWrite,
    403,
    "Org Admin entitlement write",
  );
  console.log("pass entitlement mutation permission boundary");

  console.log("Phase 9 application API validation passed.");
} finally {
  if (owner._connected) {
    await owner.query("BEGIN");
    try {
      if (cleanup.partId) {
        await owner.query("DELETE FROM catalog.part_catalog WHERE id = $1", [
          cleanup.partId,
        ]);
      }
      if (cleanup.categoryId) {
        await owner.query("DELETE FROM catalog.categories WHERE id = $1", [
          cleanup.categoryId,
        ]);
      }
      if (cleanup.userId) {
        await owner.query(
          "DELETE FROM app.organization_memberships WHERE user_id = $1",
          [cleanup.userId],
        );
        await owner.query("DELETE FROM app.app_users WHERE id = $1", [
          cleanup.userId,
        ]);
      }
      if (cleanup.organizationId) {
        await owner.query(
          "DELETE FROM security.organization_category_entitlements WHERE organization_id = $1",
          [cleanup.organizationId],
        );
        await owner.query("DELETE FROM app.organizations WHERE id = $1", [
          cleanup.organizationId,
        ]);
      }
      await owner.query(
        "DELETE FROM app.idempotency_keys WHERE idempotency_key LIKE $1",
        [`phase9-%-${suffix}`],
      );
      await owner.query("COMMIT");
    } catch (error) {
      await owner.query("ROLLBACK");
      throw error;
    } finally {
      await owner.end();
    }
  }
}
