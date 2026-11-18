import pg from "pg";
import {
  FULL_ROW_COUNT,
  GENERATOR_VERSION,
  SMOKE_SOURCE_SYSTEM,
  SOURCE_SYSTEM,
  buildGroups,
  expectedCategoryCounts,
  generateRow,
  majorDistribution,
} from "../generators/plan.mjs";

const { Client } = pg;
const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
const runtimeDatabaseUrl = process.env.DATABASE_URL;
const apiBaseUrl = `http://localhost:${process.env.API_PORT ?? 3000}/api/v1`;
const allowedOrigin = "http://localhost:4200";

if (!migrationDatabaseUrl || !runtimeDatabaseUrl) {
  throw new Error("MIGRATION_DATABASE_URL and DATABASE_URL are required.");
}

const smoke = process.argv.includes("--smoke");

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

const owner = new Client({ connectionString: migrationDatabaseUrl });
const runtime = new Client({ connectionString: runtimeDatabaseUrl });

async function tuneClient(client) {
  await client.query("SET max_parallel_workers_per_gather = 0");
}

async function assertSearchIndexState() {
  const result = await owner.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'catalog'
      AND indexdef ILIKE '%bm25%'
    ORDER BY indexname
  `);
  assert(
    result.rowCount === 0 ||
      (result.rowCount === 1 &&
        result.rows[0].indexname === "part_catalog_search_bm25_idx"),
    "The catalog has an unexpected BM25 index state.",
  );
  return result.rowCount === 0 ? "absent-pre-phase8" : "phase8-index-present";
}

async function assertJobState(expectedTotal) {
  const expectedSeed = smoke ? `${GENERATOR_VERSION}-smoke` : GENERATOR_VERSION;
  const job = await owner.query(
    `SELECT generator_version, seed, status, target_rows, completed_rows
      FROM audit.data_generation_jobs
      WHERE generator_version = $1 AND seed = $2
      ORDER BY id DESC
      LIMIT 1`,
    [GENERATOR_VERSION, expectedSeed],
  );
  assert(job.rowCount === 1, "No generation job exists.");
  const row = job.rows[0];
  assert(row.status === "completed", `Generation job is ${row.status}.`);
  assert(
    Number(row.target_rows) === expectedTotal &&
      Number(row.completed_rows) === expectedTotal,
    "Generation job totals are incomplete.",
  );
}

async function assertCountsAndDistribution() {
  const groups = buildGroups({ smoke });
  const expectedTotal = groups.reduce((sum, group) => sum + group.count, 0);
  const sourceSystem = smoke ? SMOKE_SOURCE_SYSTEM : SOURCE_SYSTEM;

  await assertJobState(expectedTotal);

  const totals = await owner.query(
    `SELECT
       count(*)::bigint AS total,
       count(*) FILTER (WHERE source_system = $1)::bigint AS generated,
       count(*) FILTER (WHERE source_system <> $1)::bigint AS foreign_rows
     FROM catalog.part_catalog`,
    [sourceSystem],
  );
  const totalsRow = totals.rows[0];
  assert(
    Number(totalsRow.total) === expectedTotal &&
      Number(totalsRow.generated) === expectedTotal,
    `Expected exactly ${expectedTotal} generated rows, found ${totalsRow.total}.`,
  );
  assert(
    Number(totalsRow.foreign_rows) === 0,
    `Unexpected rows from another source system: ${totalsRow.foreign_rows}.`,
  );

  const distribution = await owner.query(`
    SELECT security_domain_id, count(*)::bigint AS count
    FROM catalog.part_catalog
    GROUP BY security_domain_id
    ORDER BY security_domain_id
  `);
  const countsByDomain = new Map(
    distribution.rows.map((row) => [
      Number(row.security_domain_id),
      Number(row.count),
    ]),
  );
  const planDistribution = majorDistribution(groups);
  assert(
    countsByDomain.get(10) === planDistribution.braking,
    `Braking distribution mismatch: ${countsByDomain.get(10)}.`,
  );
  assert(
    countsByDomain.get(11) === planDistribution["tyres-wheels"],
    `Tyres and wheels distribution mismatch: ${countsByDomain.get(11)}.`,
  );
  assert(
    countsByDomain.get(12) === planDistribution.steering,
    `Steering distribution mismatch: ${countsByDomain.get(12)}.`,
  );
  const otherTotal = [...countsByDomain.entries()]
    .filter(([domainId]) => domainId > 12)
    .reduce((sum, [, count]) => sum + count, 0);
  assert(
    otherTotal === planDistribution.other,
    `Other-domain total mismatch: ${otherTotal}.`,
  );

  const expectedByDomain = new Map(
    groups.map((group) => [group.domainId, group.count]),
  );
  for (const [domainId, count] of countsByDomain.entries()) {
    if (domainId > 12) {
      assert(
        count === expectedByDomain.get(domainId),
        `Domain ${domainId} count ${count} does not match ${expectedByDomain.get(domainId)}.`,
      );
    }
  }

  for (const group of groups) {
    const expectedCounts = expectedCategoryCounts(group);
    const actual = await owner.query(
      `SELECT primary_category_id, count(*)::bigint AS count
        FROM catalog.part_catalog
        WHERE security_domain_id = $1
        GROUP BY primary_category_id`,
      [group.domainId],
    );
    const actualCounts = new Map(
      actual.rows.map((row) => [
        Number(row.primary_category_id),
        Number(row.count),
      ]),
    );
    assert(
      actualCounts.size === expectedCounts.size,
      `Domain ${group.domainId} category count mismatch.`,
    );
    for (const [categoryId, expectedCount] of expectedCounts.entries()) {
      assert(
        actualCounts.get(categoryId) === expectedCount,
        `Domain ${group.domainId} category ${categoryId} has ${actualCounts.get(categoryId)} rows, expected ${expectedCount}.`,
      );
    }
  }
}

async function assertIntegrity() {
  const orphanCategories = await owner.query(`
    SELECT count(*)::bigint AS count
    FROM catalog.part_categories pc
    LEFT JOIN catalog.part_catalog part ON part.id = pc.part_id
    WHERE part.id IS NULL
  `);
  assert(
    Number(orphanCategories.rows[0].count) === 0,
    "Orphan part_categories rows exist.",
  );

  const invalidAssignments = await owner.query(`
    SELECT count(*)::bigint AS count
    FROM catalog.part_categories pc
    LEFT JOIN catalog.categories category ON category.id = pc.category_id
    WHERE category.id IS NULL OR category.status <> 'active'
  `);
  assert(
    Number(invalidAssignments.rows[0].count) === 0,
    "An assignment references a missing or inactive category.",
  );

  const invalidDomain = await owner.query(`
    SELECT count(*)::bigint AS count
    FROM catalog.part_catalog part
    LEFT JOIN catalog.categories category ON category.id = part.security_domain_id
    WHERE category.id IS NULL
       OR category.is_security_domain = false
       OR category.status <> 'active'
  `);
  assert(
    Number(invalidDomain.rows[0].count) === 0,
    "A part has an invalid security domain.",
  );

  const invalidHierarchy = await owner.query(`
    SELECT count(*)::bigint AS count
    FROM catalog.part_catalog part
    JOIN catalog.categories domain_category ON domain_category.id = part.security_domain_id
    JOIN catalog.categories primary_category ON primary_category.id = part.primary_category_id
    WHERE NOT (primary_category.path <@ domain_category.path)
  `);
  assert(
    Number(invalidHierarchy.rows[0].count) === 0,
    "A primary category does not descend from its security domain.",
  );

  const primaryIntegrity = await owner.query(`
    SELECT count(*)::bigint AS count
    FROM catalog.part_catalog part
    JOIN LATERAL (
      SELECT
        count(*) FILTER (WHERE assignment_type = 'primary')::bigint AS primary_count,
        count(*) FILTER (
          WHERE assignment_type = 'primary' AND category_id = part.primary_category_id
        )::bigint AS matching_primary
      FROM catalog.part_categories pc
      WHERE pc.part_id = part.id
    ) assignments ON true
    WHERE assignments.primary_count <> 1
       OR assignments.matching_primary <> 1
  `);
  assert(
    Number(primaryIntegrity.rows[0].count) === 0,
    "A part does not have exactly one matching primary assignment.",
  );

  const duplicateSecondary = await owner.query(`
    SELECT count(*)::bigint AS count
    FROM catalog.part_categories pc
    JOIN catalog.part_catalog part ON part.id = pc.part_id
    WHERE pc.assignment_type = 'secondary'
      AND pc.category_id = part.primary_category_id
  `);
  assert(
    Number(duplicateSecondary.rows[0].count) === 0,
    "A secondary assignment duplicates the primary category.",
  );
}

async function assertDeterministicSample() {
  const groups = buildGroups({ smoke });
  const sourceSystem = smoke ? SMOKE_SOURCE_SYSTEM : SOURCE_SYSTEM;

  for (const group of groups) {
    const samples = group.count > 1000 ? [0, 1, 2, group.count - 1] : [0];
    for (const index of samples) {
      const expected = generateRow(group, index, sourceSystem);
      const row = await owner.query(
        `SELECT
           company_id, tenant_id, part_number, part_name, description,
           commodity, sub_commodity, manufacturer, vehicle_program, region,
           country, plant, model_year, material, lifecycle_status,
           supplier_status, cost_usd, weight_kg, active,
           security_domain_id, primary_category_id, visibility_status,
           source_system, source_record_id, document_version
         FROM catalog.part_catalog
         WHERE part_number = $1`,
        [expected.partNumber],
      );
      assert(
        row.rowCount === 1,
        `Sample part ${expected.partNumber} is missing.`,
      );
      const db = row.rows[0];
      const match =
        Number(db.company_id) === expected.companyId &&
        Number(db.tenant_id) === expected.tenantId &&
        db.part_name === expected.partName &&
        db.description === expected.description &&
        db.commodity === expected.commodity &&
        db.sub_commodity === expected.subCommodity &&
        db.manufacturer === expected.manufacturer &&
        db.vehicle_program === expected.vehicleProgram &&
        db.region === expected.region &&
        db.country === expected.country &&
        db.plant === expected.plant &&
        Number(db.model_year) === expected.modelYear &&
        db.material === expected.material &&
        db.lifecycle_status === expected.lifecycleStatus &&
        db.supplier_status === expected.supplierStatus &&
        db.cost_usd === expected.costUsd &&
        db.weight_kg === expected.weightKg &&
        db.active === expected.active &&
        Number(db.security_domain_id) === expected.securityDomainId &&
        Number(db.primary_category_id) === expected.primaryCategoryId &&
        db.visibility_status === expected.visibilityStatus &&
        db.source_system === expected.sourceSystem &&
        db.source_record_id === expected.sourceRecordId &&
        Number(db.document_version) === expected.documentVersion;
      assert(match, `Sample part ${expected.partNumber} is not deterministic.`);

      const assignments = await owner.query(
        `SELECT category_id, assignment_type
          FROM catalog.part_categories
          WHERE part_id = (SELECT id FROM catalog.part_catalog WHERE part_number = $1)
          ORDER BY assignment_type, category_id`,
        [expected.partNumber],
      );
      const expectedSecondaries = expected.secondaryTag
        ? [Number(expected.secondaryTag)]
        : [];
      const actualSecondaries = assignments.rows
        .filter((row) => row.assignment_type === "secondary")
        .map((row) => Number(row.category_id));
      assert(
        assignments.rows.filter((row) => row.assignment_type === "primary")
          .length === 1,
        `Sample part ${expected.partNumber} primary assignment is missing.`,
      );
      assert(
        JSON.stringify(actualSecondaries) ===
          JSON.stringify(expectedSecondaries),
        `Sample part ${expected.partNumber} secondary tags do not match.`,
      );
    }
  }
}

async function assertRepresentativeText() {
  const checks = [
    ["ceramic", 10],
    ["tyre", 11],
    ["steering rack", 12],
    ["intake", 13],
    ["clutch", 14],
    ["BMS", 17],
    ["airbag", 20],
    ["radiator", 22],
  ];
  for (const [term, expectedDomain] of checks) {
    const result = await owner.query(
      `SELECT security_domain_id
       FROM catalog.part_catalog
       WHERE (part_name || ' ' || description) ILIKE '%' || $1 || '%'
       LIMIT 100`,
      [term],
    );
    assert(
      result.rowCount > 0,
      `No parts matched the representative term "${term}".`,
    );
    assert(
      result.rows.every(
        (row) => Number(row.security_domain_id) === expectedDomain,
      ),
      `Representative results for "${term}" escaped domain ${expectedDomain}.`,
    );
  }
}

async function assertOrganizationVisibility() {
  const groups = buildGroups({ smoke: false });
  const expectedDomainCount = (key) => {
    const group = groups.find((candidate) => candidate.key === key);
    assert(group, `Missing generator group ${key}.`);
    return group.count;
  };

  const restrictedExpected = await owner.query(
    `SELECT count(*)::bigint AS count
      FROM catalog.part_catalog
      WHERE security_domain_id = 10 AND company_id = 101`,
  );
  const restrictedExpectedCount = Number(restrictedExpected.rows[0].count);
  assert(
    restrictedExpectedCount > 0,
    "Company 101 has no braking rows for the Restricted Viewer.",
  );

  const expected = {
    orgA: FULL_ROW_COUNT,
    orgB: expectedDomainCount("braking"),
    orgC: expectedDomainCount("tyres-wheels"),
    orgD: expectedDomainCount("steering"),
    restrictedB: restrictedExpectedCount,
  };

  const jars = {};
  for (const [key, [email, passwordVariable]] of Object.entries(accounts)) {
    jars[key] = await login(email, passwordVariable);
  }

  const firstByDomain = await owner.query(`
    SELECT DISTINCT ON (security_domain_id)
      id, part_number, security_domain_id
    FROM catalog.part_catalog
    WHERE security_domain_id BETWEEN 10 AND 22
    ORDER BY security_domain_id, id
  `);
  assert(firstByDomain.rowCount === 13, "Missing a security-domain sample.");
  const firstIds = new Map(
    firstByDomain.rows.map((row) => [
      Number(row.security_domain_id),
      Number(row.id),
    ]),
  );
  const allowedDomains = {
    orgA: new Set(Array.from({ length: 13 }, (_, index) => index + 10)),
    orgB: new Set([10]),
    orgC: new Set([11]),
    orgD: new Set([12]),
  };
  const directAccess = Object.entries(allowedDomains).flatMap(
    ([accountKey, permitted]) =>
      [...firstIds.keys()].map((domainId) => [
        accountKey,
        domainId,
        permitted.has(domainId) ? 200 : 404,
      ]),
  );
  for (const [accountKey, domainId, expectedStatus] of directAccess) {
    const record = await apiRequest(
      `/catalog/records/${firstIds.get(domainId)}`,
      { jar: jars[accountKey] },
    );
    assert(
      record.response.status === expectedStatus,
      `${accountKey}/${domainId} expected ${expectedStatus}, got ${record.response.status}.`,
    );
  }

  const restrictedSamples = await owner.query(`
    SELECT DISTINCT ON (company_id = 101)
      id, company_id
    FROM catalog.part_catalog
    WHERE security_domain_id = 10
      AND company_id IN (101, 102)
    ORDER BY (company_id = 101) DESC, id
  `);
  assert(
    restrictedSamples.rowCount === 2,
    "Missing restricted-viewer samples.",
  );
  for (const sample of restrictedSamples.rows) {
    const expectedStatus = Number(sample.company_id) === 101 ? 200 : 404;
    const record = await apiRequest(`/catalog/records/${sample.id}`, {
      jar: jars.restrictedB,
    });
    assert(
      record.response.status === expectedStatus,
      `restrictedB/company-${sample.company_id} expected ${expectedStatus}, got ${record.response.status}.`,
    );
  }
  const outsideDomain = await apiRequest(
    `/catalog/records/${firstIds.get(11)}`,
    { jar: jars.restrictedB },
  );
  assert(
    outsideDomain.response.status === 404,
    `restrictedB/domain-11 expected 404, got ${outsideDomain.response.status}.`,
  );

  return expected;
}

await owner.connect();
await runtime.connect();
await tuneClient(owner);
await tuneClient(runtime);

try {
  const searchIndexState = await assertSearchIndexState();
  process.stderr.write(`[phase7] search-index-state ${searchIndexState}\n`);

  const noContext = await runtime.query(
    "SELECT count(*)::bigint AS count FROM catalog.part_catalog",
  );
  assert(
    Number(noContext.rows[0].count) === 0,
    "Missing context did not default deny.",
  );
  process.stderr.write("[phase7] default-deny ok\n");

  await assertCountsAndDistribution();
  process.stderr.write("[phase7] counts+distribution ok\n");
  await assertIntegrity();
  process.stderr.write("[phase7] integrity ok\n");
  await assertDeterministicSample();
  process.stderr.write("[phase7] deterministic sample ok\n");
  await assertRepresentativeText();
  process.stderr.write("[phase7] representative text ok\n");

  if (smoke) {
    console.log(
      JSON.stringify(
        {
          status: "ok",
          mode: "smoke",
          rows: buildGroups({ smoke: true }).reduce(
            (sum, group) => sum + group.count,
            0,
          ),
          distribution: majorDistribution(buildGroups({ smoke: true })),
          deterministicSample: "ok",
          foreignKeys: "ok",
          categoryIntegrity: "ok",
          representativeText: "ok",
          searchIndexState,
          defaultDeny: "ok",
        },
        null,
        2,
      ),
    );
  } else {
    process.stderr.write("[phase7] org-visibility tier starting\n");
    const organizationRows = await assertOrganizationVisibility();
    console.log(
      JSON.stringify(
        {
          status: "ok",
          mode: "full",
          rows: FULL_ROW_COUNT,
          distribution: {
            braking: 1250000,
            tyresWheels: 1250000,
            steering: 1250000,
            otherDomains: 1250000,
          },
          deterministicSample: "ok",
          foreignKeys: "ok",
          categoryIntegrity: "ok",
          representativeText: "ok",
          searchIndexState,
          organizationVisibility: "all 13 domains sampled through RLS",
          expectedVisibleRows: organizationRows,
          restrictedViewerVisibility: "ok",
          aggregateIsolation:
            searchIndexState === "phase8-index-present"
              ? "ParadeDB facets validated by Phase 8"
              : "owner totals verified; ParadeDB facets begin in Phase 8",
          directIdIsolation: "ok",
        },
        null,
        2,
      ),
    );
  }
} finally {
  if (smoke) {
    await owner
      .query("DELETE FROM catalog.part_catalog WHERE source_system = $1", [
        SMOKE_SOURCE_SYSTEM,
      ])
      .catch((error) =>
        console.error(`Smoke cleanup failed: ${error.message}`),
      );
    await owner
      .query("DELETE FROM audit.data_generation_jobs WHERE seed = $1", [
        `${GENERATOR_VERSION}-smoke`,
      ])
      .catch(() => undefined);
  }
  await runtime.end().catch(() => undefined);
  await owner.end().catch(() => undefined);
}
