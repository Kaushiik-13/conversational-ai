import pg from "pg";

const { Client } = pg;
const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
const apiBaseUrl = `http://localhost:${process.env.API_PORT ?? 3000}/api/v1`;
const allowedOrigin = "http://localhost:4200";

if (!migrationDatabaseUrl) {
  throw new Error("MIGRATION_DATABASE_URL is required.");
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
  const started = performance.now();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  jar?.absorb(response);
  const text = await response.text();
  return {
    response,
    payload: text ? JSON.parse(text) : null,
    elapsedMs: Math.round((performance.now() - started) * 100) / 100,
  };
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

async function search(jar, body, expectedStatus = 200) {
  const result = await apiRequest("/search", {
    jar,
    method: "POST",
    body,
  });
  assert(
    result.response.status === expectedStatus,
    `Search returned ${result.response.status}, expected ${expectedStatus}: ${JSON.stringify(result.payload)}`,
  );
  return result;
}

const owner = new Client({ connectionString: migrationDatabaseUrl });
await owner.connect();

try {
  const migrations = await owner.query(
    "SELECT count(*)::integer AS count FROM public.schema_migrations",
  );
  assert(migrations.rows[0].count === 25, "Expected twenty-five migrations.");

  const index = await owner.query(`
    SELECT indexdef, pg_relation_size(pg_class.oid)::bigint AS size_bytes
    FROM pg_indexes
    JOIN pg_class ON pg_class.relname = pg_indexes.indexname
    JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
      AND pg_namespace.nspname = pg_indexes.schemaname
    WHERE schemaname = 'catalog'
      AND indexname = 'part_catalog_search_bm25_idx'
  `);
  assert(index.rowCount === 1, "The permanent catalog BM25 index is missing.");
  assert(
    index.rows[0].indexdef.includes("USING bm25"),
    "The permanent catalog index is not BM25.",
  );
  assert(Number(index.rows[0].size_bytes) > 0, "The BM25 index is empty.");

  const plan = await owner.query(`
    EXPLAIN (FORMAT JSON)
    SELECT id, part_number, pdb.score(id)
    FROM catalog.part_catalog
    WHERE part_name ||| 'ceramic brake pad'
    ORDER BY pdb.score(id) DESC, id
    LIMIT 10
  `);
  assert(
    JSON.stringify(plan.rows).includes("ParadeDB"),
    "The representative query did not plan a ParadeDB scan.",
  );

  const accounts = {
    global: await login(
      "global.admin@example.test",
      "DEV_GLOBAL_ADMIN_PASSWORD",
    ),
    orgA: await login("orga.admin@example.test", "DEV_ORG_A_ADMIN_PASSWORD"),
    orgB: await login("orgb.admin@example.test", "DEV_ORG_B_ADMIN_PASSWORD"),
    orgC: await login("orgc.admin@example.test", "DEV_ORG_C_ADMIN_PASSWORD"),
    orgD: await login("orgd.admin@example.test", "DEV_ORG_D_ADMIN_PASSWORD"),
    restrictedB: await login(
      "orgb.restricted@example.test",
      "DEV_ORG_B_RESTRICTED_PASSWORD",
    ),
  };

  const initialGlobalBrowse = await search(accounts.global, {
    query: "",
    facets: [
      "securityDomain",
      "primaryCategory",
      "manufacturer",
      "region",
      "material",
      "lifecycleStatus",
    ],
    sort: { field: "updatedAt", direction: "desc" },
    limit: 25,
  });
  const initialGlobalItemsOnly = await search(accounts.global, {
    query: "",
    facets: [],
    sort: { field: "updatedAt", direction: "desc" },
    limit: 25,
  });
  assert(
    initialGlobalItemsOnly.payload.data.items.length === 25 &&
      initialGlobalItemsOnly.payload.meta.visibleHitCount === 5_000_000,
    "The fast Global Admin initial page is incomplete.",
  );
  assert(
    Number.isFinite(initialGlobalItemsOnly.payload.meta.queryTimeMs) &&
      initialGlobalItemsOnly.payload.meta.queryTimeMs >= 0,
    "The fast Global Admin initial page did not return query timing.",
  );
  assert(
    initialGlobalBrowse.payload.meta.visibleHitCount === 5_000_000,
    `The Global Admin initial browse returned ${initialGlobalBrowse.payload.meta.visibleHitCount} rows instead of the full catalog.`,
  );
  assert(
    initialGlobalBrowse.payload.data.items.length === 25,
    "The Global Admin initial browse did not return its first 25 records.",
  );
  assert(
    Object.keys(initialGlobalBrowse.payload.data.facets).length === 6,
    "The Global Admin initial browse did not return all six facet groups.",
  );
  assert(
    initialGlobalBrowse.payload.meta.nextCursor,
    "The Global Admin initial browse did not provide a pagination cursor.",
  );
  assert(
    Number.isFinite(initialGlobalBrowse.payload.meta.queryTimeMs) &&
      initialGlobalBrowse.payload.meta.queryTimeMs >= 0,
    "The Global Admin initial browse did not return query timing.",
  );

  const domainChecks = [
    ["orgB", "caliper", 10],
    ["orgC", "tyre", 11],
    ["orgD", "steering", 12],
  ];
  const timings = {};
  for (const [account, query, expectedDomain] of domainChecks) {
    const result = await search(accounts[account], {
      query,
      facets: ["securityDomain", "manufacturer", "region", "material"],
      limit: 10,
    });
    assert(
      result.payload.meta.visibleHitCount > 0,
      `${account} found no rows.`,
    );
    assert(
      Number.isFinite(result.payload.meta.queryTimeMs) &&
        result.payload.meta.queryTimeMs >= 0,
      `${account} did not receive a valid backend query time.`,
    );
    assert(
      result.payload.data.items.every(
        (item) => item.securityDomainId === expectedDomain,
      ),
      `${account} received a row outside domain ${expectedDomain}.`,
    );
    assert(
      result.payload.data.facets.securityDomain.every(
        (facet) => Number(facet.value) === expectedDomain,
      ),
      `${account} received a leaking security-domain facet.`,
    );
    timings[`${account}:${query}`] = result.elapsedMs;
  }

  const categoryBaseline = await search(accounts.orgA, {
    query: "brake",
    facets: ["primaryCategory"],
    limit: 5,
  });
  const categoryBuckets = categoryBaseline.payload.data.facets.primaryCategory;
  assert(
    categoryBuckets.length > 1,
    "The category facet needs multiple values for the disjunctive-count check.",
  );
  const selectedCategoryId = Number(categoryBuckets[0].value);
  const categoryFiltered = await search(accounts.orgA, {
    query: "brake",
    filters: { primaryCategoryIds: [selectedCategoryId] },
    facets: ["primaryCategory", "manufacturer"],
    limit: 5,
  });
  assert(
    categoryFiltered.payload.data.items.every(
      (item) => item.primaryCategoryId === selectedCategoryId,
    ),
    "The selected category was not applied to result rows.",
  );
  assert(
    categoryFiltered.payload.data.facets.primaryCategory.some(
      (bucket) => Number(bucket.value) !== selectedCategoryId,
    ),
    "The category facet collapsed instead of retaining alternative scoped counts.",
  );

  const deniedChecks = [
    ["orgB", "tyre"],
    ["orgC", "caliper"],
    ["orgD", "caliper"],
  ];
  for (const [account, query] of deniedChecks) {
    const result = await search(accounts[account], { query, limit: 5 });
    assert(
      result.payload.meta.visibleHitCount === 0 &&
        result.payload.data.items.length === 0,
      `${account} received results for forbidden query ${query}.`,
    );
  }

  const allAccess = await search(accounts.orgA, {
    query: "caliper",
    facets: ["securityDomain"],
    limit: 5,
  });
  assert(
    allAccess.payload.meta.visibleHitCount > 0,
    "Org A could not search the full catalog.",
  );

  const restrictedAllowed = await search(accounts.restrictedB, {
    query: "caliper",
    filters: { companyIds: [101] },
    facets: ["securityDomain"],
    limit: 5,
  });
  assert(
    restrictedAllowed.payload.meta.visibleHitCount > 0,
    "Restricted Viewer could not search company 101.",
  );
  const restrictedDenied = await search(accounts.restrictedB, {
    query: "caliper",
    filters: { companyIds: [102] },
    limit: 5,
  });
  assert(
    restrictedDenied.payload.meta.visibleHitCount === 0,
    "Restricted Viewer received company 102 rows.",
  );
  await search(
    accounts.restrictedB,
    { query: "caliper", filters: { cost: { min: 1 } } },
    403,
  );

  const firstPage = await search(accounts.orgB, {
    query: "caliper",
    sort: { field: "partNumber", direction: "asc" },
    limit: 5,
  });
  assert(firstPage.payload.meta.nextCursor, "First page has no next cursor.");
  const secondPage = await search(accounts.orgB, {
    query: "caliper",
    sort: { field: "partNumber", direction: "asc" },
    limit: 5,
    cursor: firstPage.payload.meta.nextCursor,
  });
  const firstIds = new Set(firstPage.payload.data.items.map((item) => item.id));
  assert(
    secondPage.payload.data.items.every((item) => !firstIds.has(item.id)),
    "Cursor pagination repeated a record.",
  );
  const firstLast = firstPage.payload.data.items.at(-1).partNumber;
  const secondFirst = secondPage.payload.data.items[0].partNumber;
  assert(firstLast <= secondFirst, "Part-number cursor ordering is unstable.");

  const tamperedCursor = `${firstPage.payload.meta.nextCursor.slice(0, -1)}x`;
  await search(
    accounts.orgB,
    {
      query: "caliper",
      sort: { field: "partNumber", direction: "asc" },
      limit: 5,
      cursor: tamperedCursor,
    },
    400,
  );

  console.log(
    JSON.stringify(
      {
        status: "ok",
        migrations: migrations.rows[0].count,
        bm25Index: "part_catalog_search_bm25_idx",
        bm25IndexBytes: Number(index.rows[0].size_bytes),
        paradeDbPlan: "ok",
        organizationSearchIsolation: "ok",
        restrictedViewerCompanyIsolation: "ok",
        facetIsolation: "ok",
        selfExcludingFacetCounts: "ok",
        globalAdminInitialBrowse: "ok",
        globalAdminInitialBrowseQueryMs:
          initialGlobalBrowse.payload.meta.queryTimeMs,
        globalAdminInitialItemsQueryMs:
          initialGlobalItemsOnly.payload.meta.queryTimeMs,
        protectedCostFilter: "ok",
        signedCursorPagination: "ok",
        representativeWarmRequestMs: timings,
      },
      null,
      2,
    ),
  );
} finally {
  await owner.end().catch(() => undefined);
}
