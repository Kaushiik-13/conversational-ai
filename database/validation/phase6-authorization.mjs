import pg from "pg";

const { Client } = pg;
const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
const runtimeDatabaseUrl = process.env.DATABASE_URL;
const apiBaseUrl = `http://localhost:${process.env.API_PORT ?? 3000}/api/v1`;
const allowedOrigin = "http://localhost:4200";

if (!migrationDatabaseUrl || !runtimeDatabaseUrl) {
  throw new Error("MIGRATION_DATABASE_URL and DATABASE_URL are required.");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

class CookieJar {
  values = new Map();

  absorb(response) {
    for (const cookie of response.headers.getSetCookie()) {
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
}

async function apiRequest(path, { jar, method = "GET", body } = {}) {
  const headers = { Origin: allowedOrigin };
  if (jar?.values.size) headers.Cookie = jar.header();
  if (jar?.values.get("XSRF-TOKEN")) {
    headers["X-XSRF-TOKEN"] = jar.values.get("XSRF-TOKEN");
  }
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  jar?.absorb(response);
  const text = await response.text();
  return { response, payload: text ? JSON.parse(text) : null };
}

async function login(email, passwordVariable) {
  const password = process.env[passwordVariable];
  assert(password?.length >= 16, `${passwordVariable} is unavailable.`);
  const jar = new CookieJar();
  const csrf = await apiRequest("/auth/csrf", { jar });
  assert(csrf.response.status === 200, `CSRF bootstrap failed for ${email}.`);
  const result = await apiRequest("/auth/login", {
    jar,
    method: "POST",
    body: { email, password },
  });
  assert(result.response.status === 200, `Login failed for ${email}.`);
  return jar;
}

const accounts = {
  orgA: ["orga.admin@example.test", "DEV_ORG_A_ADMIN_PASSWORD"],
  orgB: ["orgb.admin@example.test", "DEV_ORG_B_ADMIN_PASSWORD"],
  orgC: ["orgc.admin@example.test", "DEV_ORG_C_ADMIN_PASSWORD"],
  orgD: ["orgd.admin@example.test", "DEV_ORG_D_ADMIN_PASSWORD"],
  restrictedB: [
    "orgb.restricted@example.test",
    "DEV_ORG_B_RESTRICTED_PASSWORD",
  ],
};

const fixtureDefinitions = [
  {
    key: "brake101",
    partNumber: "PHASE6-BRAKE-101",
    name: "Phase 6 Brake Pad",
    commodity: "Braking",
    subCommodity: "Brake Pads",
    domain: 10,
    category: 101,
    company: 101,
    region: "Europe",
  },
  {
    key: "brake202",
    partNumber: "PHASE6-BRAKE-202",
    name: "Phase 6 Brake Rotor",
    commodity: "Braking",
    subCommodity: "Brake Rotors",
    domain: 10,
    category: 104,
    company: 202,
    region: "North America",
  },
  {
    key: "tyre101",
    partNumber: "PHASE6-TYRE-101",
    name: "Phase 6 Summer Tyre",
    commodity: "Tyres and Wheels",
    subCommodity: "Summer Tyres",
    domain: 11,
    category: 201,
    company: 101,
    region: "Europe",
  },
  {
    key: "steering101",
    partNumber: "PHASE6-STEERING-101",
    name: "Phase 6 Steering Rack",
    commodity: "Steering",
    subCommodity: "Steering Racks",
    domain: 12,
    category: 301,
    company: 101,
    region: "Asia",
  },
  {
    key: "engine101",
    partNumber: "PHASE6-ENGINE-101",
    name: "Phase 6 Air Intake",
    commodity: "Engine",
    subCommodity: "Air Intake",
    domain: 13,
    category: 400,
    company: 101,
    region: "Europe",
  },
  {
    key: "internalBrake",
    partNumber: "PHASE6-INTERNAL-BRAKE",
    name: "Phase 6 Internal Brake Design",
    commodity: "Braking",
    subCommodity: "Brake Controls",
    domain: 10,
    category: 117,
    company: 101,
    region: "Europe",
    visibility: "internal",
  },
  {
    key: "inactiveBrake",
    partNumber: "PHASE6-INACTIVE-BRAKE",
    name: "Phase 6 Inactive Brake Design",
    commodity: "Braking",
    subCommodity: "Brake Controls",
    domain: 10,
    category: 117,
    company: 101,
    region: "Europe",
    active: false,
  },
];

const owner = new Client({ connectionString: migrationDatabaseUrl });
const runtime = new Client({ connectionString: runtimeDatabaseUrl });
const fixtureIds = new Map();
let searchIndexCreated = false;
let permissionRemoved = false;

async function cleanup() {
  if (permissionRemoved) {
    await owner.query(`
      INSERT INTO security.role_permissions (role_id, permission_code)
      SELECT id, 'catalog.read'
      FROM security.roles
      WHERE code = 'RESTRICTED_VIEWER' AND organization_id IS NULL
      ON CONFLICT DO NOTHING
    `);
    permissionRemoved = false;
  }
  if (searchIndexCreated) {
    await owner.query("DROP INDEX IF EXISTS catalog.phase6_part_search_idx");
    searchIndexCreated = false;
  }
  await owner.query(
    "DELETE FROM catalog.part_catalog WHERE source_system = 'phase6-validation'",
  );
}

async function bindRuntime(email) {
  const session = await owner.query(
    `
      SELECT s.id AS session_id, u.id AS user_id
      FROM app.user_sessions s
      JOIN app.app_users u ON u.id = s.user_id
      WHERE u.email = $1::citext
        AND s.revoked_at IS NULL
      ORDER BY s.created_at DESC
      LIMIT 1
    `,
    [email],
  );
  assert(session.rowCount === 1, `No active session found for ${email}.`);
  await runtime.query("BEGIN READ ONLY");
  await runtime.query("SELECT * FROM security.authz_bind_context($1, $2)", [
    session.rows[0].session_id,
    session.rows[0].user_id,
  ]);
}

async function scopedCounts(email, includeParadeDbChecks) {
  await bindRuntime(email);
  try {
    const plain = await runtime.query(
      "SELECT count(*)::integer AS count FROM catalog.part_catalog",
    );
    const parade = includeParadeDbChecks
      ? await runtime.query(`
          SELECT count(*)::integer AS count
          FROM catalog.part_catalog
          WHERE description ||| 'phase6token'
        `)
      : null;
    const facets = includeParadeDbChecks
      ? await runtime.query(`
          SELECT commodity, count(*)::integer AS count
          FROM catalog.part_catalog
          GROUP BY commodity
          ORDER BY commodity
        `)
      : null;
    await runtime.query("COMMIT");
    return {
      plain: plain.rows[0].count,
      parade: parade?.rows[0].count ?? null,
      facets: facets?.rows ?? [],
    };
  } catch (error) {
    await runtime.query("ROLLBACK");
    throw error;
  }
}

await owner.connect();
await runtime.connect();

try {
  await cleanup();

  const baselineResult = await owner.query(
    "SELECT count(*)::integer AS count FROM catalog.part_catalog",
  );
  const persistentDatasetPresent = baselineResult.rows[0].count > 0;

  const migrations = await owner.query(
    "SELECT count(*)::integer AS count FROM public.schema_migrations",
  );
  assert(migrations.rows[0].count === 25, "Expected twenty-five migrations.");

  const boundary = await owner.query(`
    SELECT
      count(*) FILTER (WHERE p.proname LIKE 'authz_%')::integer AS functions,
      count(*) FILTER (
        WHERE p.proname LIKE 'authz_%'
          AND has_function_privilege('automotive_app', p.oid, 'EXECUTE')
      )::integer AS executable
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'security'
  `);
  assert(boundary.rows[0].functions === 10, "Expected ten authz functions.");
  assert(
    boundary.rows[0].executable === 10,
    "Authz function grants are incomplete.",
  );

  const policies = await owner.query(`
    SELECT count(*)::integer AS count
    FROM pg_policies
    WHERE schemaname IN ('app', 'catalog', 'security', 'audit')
  `);
  assert(
    policies.rows[0].count === 31,
    "Expected thirty-one application policies.",
  );

  const fieldRules = await owner.query(`
    SELECT count(*)::integer AS count
    FROM security.field_access_rules
    WHERE resource_type = 'catalog.part'
  `);
  assert(fieldRules.rows[0].count === 20, "Expected twenty field rules.");

  await owner.query("BEGIN");
  try {
    for (const fixture of fixtureDefinitions) {
      const inserted = await owner.query(
        `
          INSERT INTO catalog.part_catalog (
            company_id, tenant_id, part_number, part_name, description,
            commodity, sub_commodity, manufacturer, vehicle_program, region,
            country, plant, model_year, material, lifecycle_status,
            supplier_status, cost_usd, weight_kg, security_domain_id,
            primary_category_id, visibility_status, active, source_system,
            source_record_id
          )
          VALUES (
            $1, 1, $2, $3, 'phase6token authorization validation record',
            $4, $5, 'Phase 6 Manufacturer', 'Phase 6 Program', $6,
            'Validation Country', 'Validation Plant', 2026, 'Steel', 'active',
            'approved', 125.50, 2.500, $7, $8, $9, $10,
            'phase6-validation', $11
          )
          RETURNING id
        `,
        [
          fixture.company,
          fixture.partNumber,
          fixture.name,
          fixture.commodity,
          fixture.subCommodity,
          fixture.region,
          fixture.domain,
          fixture.category,
          fixture.visibility ?? "organization",
          fixture.active ?? true,
          fixture.key,
        ],
      );
      const id = inserted.rows[0].id;
      fixtureIds.set(fixture.key, id);
      await owner.query(
        `
          INSERT INTO catalog.part_categories
            (part_id, category_id, assignment_type, source)
          VALUES ($1, $2, 'primary', 'manual')
        `,
        [id, fixture.category],
      );
    }
    await owner.query("SET CONSTRAINTS ALL IMMEDIATE");
    await owner.query("COMMIT");
  } catch (error) {
    await owner.query("ROLLBACK");
    throw error;
  }

  if (!persistentDatasetPresent) {
    await owner.query(`
      CREATE INDEX phase6_part_search_idx
      ON catalog.part_catalog
      USING bm25 (
        id,
        part_name,
        description,
        (commodity::pdb.literal),
        security_domain_id,
        primary_category_id,
        company_id,
        (region::pdb.literal)
      )
      WITH (key_field='id')
    `);
    searchIndexCreated = true;
    await owner.query("ANALYZE catalog.part_catalog");
  }

  const noContext = await runtime.query(
    "SELECT count(*)::integer AS count FROM catalog.part_catalog",
  );
  assert(
    noContext.rows[0].count === 0,
    "Missing context did not default deny.",
  );

  const jars = {};
  for (const [key, [email, passwordVariable]] of Object.entries(accounts)) {
    jars[key] = await login(email, passwordVariable);
  }

  const expected = {
    orgA: { total: 5, facetCounts: [1, 2, 1, 1] },
    orgB: { total: 2, facetCounts: [2] },
    orgC: { total: 1, facetCounts: [1] },
    orgD: { total: 1, facetCounts: [1] },
    restrictedB: { total: 1, facetCounts: [1] },
  };

  if (!persistentDatasetPresent) {
    for (const [key, jar] of Object.entries(jars)) {
      const facets = await apiRequest("/catalog/facets", { jar });
      assert(facets.response.status === 200, `${key} facets were rejected.`);
      const counts = facets.payload.data.map((facet) => facet.count).sort();
      assert(
        counts.join(",") === expected[key].facetCounts.slice().sort().join(","),
        `${key} facet counts leaked or omitted rows: ${counts.join(",")}.`,
      );
    }
  }

  const accessMatrix = [
    ["orgB", "brake101", 200],
    ["orgB", "tyre101", 404],
    ["orgB", "steering101", 404],
    ["orgC", "tyre101", 200],
    ["orgC", "brake101", 404],
    ["orgC", "steering101", 404],
    ["orgD", "steering101", 200],
    ["orgD", "brake101", 404],
    ["orgD", "tyre101", 404],
  ];
  for (const [accountKey, fixtureKey, expectedStatus] of accessMatrix) {
    const record = await apiRequest(
      `/catalog/records/${fixtureIds.get(fixtureKey)}`,
      { jar: jars[accountKey] },
    );
    assert(
      record.response.status === expectedStatus,
      `${accountKey}/${fixtureKey} expected ${expectedStatus}, got ${record.response.status}.`,
    );
  }

  const adminRecord = await apiRequest(
    `/catalog/records/${fixtureIds.get("brake101")}`,
    { jar: jars.orgB },
  );
  assert("costUsd" in adminRecord.payload.data, "Org admin cost was omitted.");
  assert(
    "supplierStatus" in adminRecord.payload.data,
    "Org admin supplier status was omitted.",
  );
  assert(
    !("sourceSystem" in adminRecord.payload.data),
    "Internal source metadata leaked to an Org Admin.",
  );

  const globalAdmin = await login(
    "global.admin@example.test",
    "DEV_GLOBAL_ADMIN_PASSWORD",
  );
  const globalRecord = await apiRequest(
    `/catalog/records/${fixtureIds.get("engine101")}`,
    { jar: globalAdmin },
  );
  assert(
    "sourceSystem" in globalRecord.payload.data,
    "Global Admin source metadata was omitted.",
  );
  const internalForGlobal = await apiRequest(
    `/catalog/records/${fixtureIds.get("internalBrake")}`,
    { jar: globalAdmin },
  );
  assert(
    internalForGlobal.response.status === 200,
    "Global Admin could not read an internal record.",
  );
  const internalForOrgAdmin = await apiRequest(
    `/catalog/records/${fixtureIds.get("internalBrake")}`,
    { jar: jars.orgA },
  );
  assert(
    internalForOrgAdmin.response.status === 404,
    "An internal record leaked to an Org Admin.",
  );
  const inactiveForGlobal = await apiRequest(
    `/catalog/records/${fixtureIds.get("inactiveBrake")}`,
    { jar: globalAdmin },
  );
  assert(
    inactiveForGlobal.response.status === 404,
    "An inactive record remained readable.",
  );

  if (!persistentDatasetPresent) {
    const globalCounts = await scopedCounts("global.admin@example.test", true);
    assert(globalCounts.plain === 6, "Global Admin visibility is incorrect.");
    assert(
      globalCounts.parade === 6,
      "Global Admin ParadeDB visibility is incorrect.",
    );
  }

  const restrictedRecord = await apiRequest(
    `/catalog/records/${fixtureIds.get("brake101")}`,
    { jar: jars.restrictedB },
  );
  assert(
    restrictedRecord.response.status === 200,
    "Restricted allowed row failed.",
  );
  for (const field of [
    "costUsd",
    "supplierStatus",
    "sourceSystem",
    "sourceRecordId",
  ]) {
    assert(
      !(field in restrictedRecord.payload.data),
      `${field} leaked to viewer.`,
    );
  }
  const restrictedDenied = await apiRequest(
    `/catalog/records/${fixtureIds.get("brake202")}`,
    { jar: jars.restrictedB },
  );
  assert(
    restrictedDenied.response.status === 404,
    "User company restriction did not hide the row.",
  );

  const directResults = {};
  if (!persistentDatasetPresent) {
    for (const [key, [email]] of Object.entries(accounts)) {
      directResults[key] = await scopedCounts(email, true);
      assert(
        directResults[key].plain === expected[key].total,
        `${key} direct RLS count is incorrect.`,
      );
      assert(
        directResults[key].parade === expected[key].total,
        `${key} ParadeDB count bypassed RLS.`,
      );
      assert(
        directResults[key].facets.reduce((sum, row) => sum + row.count, 0) ===
          expected[key].total,
        `${key} SQL facets leaked protected totals.`,
      );
    }
  }

  await owner.query(`
    DELETE FROM security.role_permissions
    WHERE role_id = (
      SELECT id FROM security.roles
      WHERE code = 'RESTRICTED_VIEWER' AND organization_id IS NULL
    )
      AND permission_code = 'catalog.read'
  `);
  permissionRemoved = true;
  const forbidden = await apiRequest(
    `/catalog/records/${fixtureIds.get("brake101")}`,
    { jar: jars.restrictedB },
  );
  assert(
    forbidden.response.status === 403,
    "Permission guard did not deny access.",
  );
  await owner.query(`
    INSERT INTO security.role_permissions (role_id, permission_code)
    SELECT id, 'catalog.read'
    FROM security.roles
    WHERE code = 'RESTRICTED_VIEWER' AND organization_id IS NULL
    ON CONFLICT DO NOTHING
  `);
  permissionRemoved = false;

  console.log(
    JSON.stringify(
      {
        status: "ok",
        migrations: migrations.rows[0].count,
        authorizationFunctions: boundary.rows[0].functions,
        rowLevelPolicies: policies.rows[0].count,
        fieldAccessRules: fieldRules.rows[0].count,
        validationRecords: fixtureDefinitions.length,
        defaultDeny: "ok",
        organizationVisibility: persistentDatasetPresent
          ? "validated-by-phase7"
          : {
              orgA: directResults.orgA.plain,
              orgB: directResults.orgB.plain,
              orgC: directResults.orgC.plain,
              orgD: directResults.orgD.plain,
            },
        restrictedViewerVisibility: persistentDatasetPresent
          ? "validated-by-phase7"
          : directResults.restrictedB.plain,
        directIdIsolation: "ok",
        userScopeRestrictions: "ok",
        protectedFieldFiltering: "ok",
        inactiveAndInternalVisibility: "ok",
        unauthorizedFacetIsolation: persistentDatasetPresent
          ? "validated-by-phase7"
          : "ok",
        paradeDbRlsIsolation: persistentDatasetPresent
          ? "permanent-index-and-aggregate-isolation-validated-by-phase8"
          : "ok",
        permissionGuard: "ok",
      },
      null,
      2,
    ),
  );
} finally {
  await cleanup().catch((error) =>
    console.error(`Phase 6 cleanup failed: ${error.message}`),
  );
  await runtime.end().catch(() => undefined);
  await owner.end().catch(() => undefined);
}
