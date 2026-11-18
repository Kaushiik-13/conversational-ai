import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const { Client } = pg;
const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
const runtimeDatabaseUrl = process.env.DATABASE_URL;

if (!migrationDatabaseUrl || !runtimeDatabaseUrl) {
  throw new Error("MIGRATION_DATABASE_URL and DATABASE_URL are required.");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const expectedDomains = [
  "adas",
  "battery",
  "body",
  "braking",
  "electrical",
  "engine",
  "interior",
  "safety",
  "steering",
  "suspension",
  "thermal",
  "transmission",
  "tyres-wheels",
];

const expectedRolePermissionCounts = new Map([
  ["GLOBAL_ADMIN", 13],
  ["ORG_ADMIN", 11],
  ["ANALYST", 3],
  ["VIEWER", 2],
  ["RESTRICTED_VIEWER", 2],
]);

const expectedEntitlements = new Map([
  ["org-a", "automotive"],
  ["org-b", "braking"],
  ["org-c", "tyres-wheels"],
  ["org-d", "steering"],
]);

const owner = new Client({ connectionString: migrationDatabaseUrl });
const runtime = new Client({ connectionString: runtimeDatabaseUrl });

await owner.connect();

try {
  const seedPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../seeds/0001_reference_data.sql",
  );
  const seedSql = await readFile(seedPath, "utf8");
  const expectedChecksum = createHash("sha256").update(seedSql).digest("hex");
  const seedHistory = await owner.query(`
    SELECT version, checksum
    FROM public.seed_history
    ORDER BY version
  `);
  assert(seedHistory.rowCount === 1, "Expected exactly one applied seed.");
  assert(
    seedHistory.rows[0].version === "0001_reference_data.sql" &&
      seedHistory.rows[0].checksum === expectedChecksum,
    "Reference seed history or checksum is incorrect.",
  );

  const organizations = await owner.query(`
    SELECT code, name, status
    FROM app.organizations
    ORDER BY code
  `);
  assert(organizations.rowCount === 4, "Expected exactly four organizations.");
  assert(
    organizations.rows.every(
      (row, index) =>
        row.code === `org-${String.fromCharCode(97 + index)}` &&
        row.name === `Org ${String.fromCharCode(65 + index)}` &&
        row.status === "active",
    ),
    "Organization reference data is incorrect.",
  );

  const categorySummary = await owner.query(`
    SELECT
      count(*)::integer AS category_count,
      count(*) FILTER (WHERE is_security_domain)::integer AS domain_count,
      count(*) FILTER (WHERE parent_id IS NULL)::integer AS root_count,
      count(*) FILTER (WHERE status <> 'active')::integer AS inactive_count
    FROM catalog.categories
  `);
  const categoryCounts = categorySummary.rows[0];
  assert(
    categoryCounts.category_count === 114,
    "Expected 114 taxonomy categories.",
  );
  assert(categoryCounts.domain_count === 13, "Expected 13 security domains.");
  assert(categoryCounts.root_count === 1, "Expected one taxonomy root.");
  assert(
    categoryCounts.inactive_count === 0,
    "All initial categories must be active.",
  );

  const domains = await owner.query(`
    SELECT child.slug
    FROM catalog.categories child
    JOIN catalog.categories root ON root.id = child.parent_id
    WHERE child.is_security_domain
      AND root.path = 'automotive'::ltree
    ORDER BY child.slug
  `);
  assert(
    JSON.stringify(domains.rows.map((row) => row.slug)) ===
      JSON.stringify(expectedDomains),
    "Security-domain taxonomy does not match the approved design.",
  );

  const brokenHierarchy = await owner.query(`
    SELECT count(*)::integer AS count
    FROM catalog.categories child
    JOIN catalog.categories parent ON parent.id = child.parent_id
    WHERE child.depth <> parent.depth + 1
       OR NOT (child.path <@ parent.path)
       OR nlevel(child.path) <> nlevel(parent.path) + 1
  `);
  assert(
    brokenHierarchy.rows[0].count === 0,
    "One or more category parent/path relationships are invalid.",
  );

  const requiredLeaves = await owner.query(`
    SELECT slug
    FROM catalog.categories
    WHERE slug IN (
      'brake-pads', 'brake-rotors', 'calipers', 'brake-lines',
      'master-cylinders', 'abs-modules', 'tyres', 'wheels-rims',
      'wheel-hubs', 'wheel-bearings', 'valves', 'tpms-sensors',
      'steering-racks', 'steering-columns', 'eps-motors',
      'hydraulic-pumps', 'tie-rods'
    )
  `);
  assert(
    requiredLeaves.rowCount === 17,
    "One or more required taxonomy categories are missing.",
  );

  const roles = await owner.query(`
    SELECT r.code, count(rp.permission_code)::integer AS permission_count
    FROM security.roles r
    LEFT JOIN security.role_permissions rp ON rp.role_id = r.id
    GROUP BY r.id, r.code
    ORDER BY r.code
  `);
  assert(roles.rowCount === 5, "Expected five built-in roles.");
  for (const role of roles.rows) {
    assert(
      expectedRolePermissionCounts.get(role.code) === role.permission_count,
      `Unexpected permission count for ${role.code}.`,
    );
  }

  const permissions = await owner.query(
    "SELECT count(*)::integer AS count FROM security.permissions",
  );
  assert(permissions.rows[0].count === 13, "Expected 13 permissions.");

  const dangerousGrantCheck = await owner.query(`
    SELECT count(*)::integer AS count
    FROM security.role_permissions rp
    JOIN security.roles r ON r.id = rp.role_id
    WHERE r.code <> 'GLOBAL_ADMIN'
      AND rp.permission_code IN ('organization.entitlements.update', 'taxonomy.manage')
  `);
  assert(
    dangerousGrantCheck.rows[0].count === 0,
    "A non-global role can change entitlements or taxonomy.",
  );

  const entitlements = await owner.query(`
    SELECT o.code AS organization_code, c.slug AS category_slug,
           e.effect, e.include_descendants, e.valid_until
    FROM security.organization_category_entitlements e
    JOIN app.organizations o ON o.id = e.organization_id
    JOIN catalog.categories c ON c.id = e.category_id
    ORDER BY o.code
  `);
  assert(
    entitlements.rowCount === 4,
    "Expected four organization entitlements.",
  );
  for (const entitlement of entitlements.rows) {
    assert(
      expectedEntitlements.get(entitlement.organization_code) ===
        entitlement.category_slug &&
        entitlement.effect === "allow" &&
        entitlement.include_descendants &&
        entitlement.valid_until === null,
      `Incorrect entitlement for ${entitlement.organization_code}.`,
    );
  }

  const visibleDomainCounts = await owner.query(`
    SELECT o.code, count(DISTINCT domain.id)::integer AS domain_count
    FROM app.organizations o
    JOIN security.organization_category_entitlements e
      ON e.organization_id = o.id
     AND e.effect = 'allow'
     AND e.include_descendants
     AND e.valid_from <= clock_timestamp()
     AND (e.valid_until IS NULL OR e.valid_until > clock_timestamp())
    JOIN catalog.categories entitled ON entitled.id = e.category_id
    JOIN catalog.categories domain
      ON domain.is_security_domain
     AND domain.path <@ entitled.path
    GROUP BY o.code
    ORDER BY o.code
  `);
  const expectedVisibleCounts = [13, 1, 1, 1];
  assert(
    visibleDomainCounts.rows.every(
      (row, index) => row.domain_count === expectedVisibleCounts[index],
    ),
    "Organization descendant expansion exposes the wrong security domains.",
  );

  const visibleCategoryCounts = await owner.query(`
    SELECT o.code, count(DISTINCT visible.id)::integer AS category_count
    FROM app.organizations o
    JOIN security.organization_category_entitlements e
      ON e.organization_id = o.id
     AND e.effect = 'allow'
     AND e.include_descendants
     AND e.valid_from <= clock_timestamp()
     AND (e.valid_until IS NULL OR e.valid_until > clock_timestamp())
    JOIN catalog.categories entitled ON entitled.id = e.category_id
    JOIN catalog.categories visible ON visible.path <@ entitled.path
    GROUP BY o.code
    ORDER BY o.code
  `);
  const expectedVisibleCategoryCounts = [114, 19, 18, 17];
  assert(
    visibleCategoryCounts.rows.every(
      (row, index) =>
        row.category_count === expectedVisibleCategoryCounts[index],
    ),
    "Organization descendant expansion exposes the wrong category subtrees.",
  );

  const catalogData = await owner.query(`
    SELECT count(*)::integer AS catalog_records FROM catalog.part_catalog
  `);

  await runtime.connect();
  const runtimeVisibility = await runtime.query(`
    SELECT
      (SELECT count(*)::integer FROM app.organizations) AS organizations,
      (SELECT count(*)::integer FROM catalog.categories) AS categories,
      (SELECT count(*)::integer FROM security.roles) AS roles,
      (SELECT count(*)::integer FROM security.permissions) AS permissions,
      (SELECT count(*)::integer FROM security.organization_category_entitlements) AS entitlements
  `);
  assert(
    Object.values(runtimeVisibility.rows[0]).every((count) => count === 0),
    "Default-deny RLS exposed Phase 4 reference data to the runtime role.",
  );

  console.log(
    JSON.stringify(
      {
        status: "ok",
        organizations: organizations.rowCount,
        categories: categoryCounts.category_count,
        securityDomains: categoryCounts.domain_count,
        roles: roles.rowCount,
        permissions: permissions.rows[0].count,
        roleGrants: roles.rows.reduce(
          (sum, role) => sum + role.permission_count,
          0,
        ),
        entitlements: entitlements.rowCount,
        visibleSecurityDomainsByOrganization: Object.fromEntries(
          visibleDomainCounts.rows.map((row) => [row.code, row.domain_count]),
        ),
        visibleCategoriesByOrganization: Object.fromEntries(
          visibleCategoryCounts.rows.map((row) => [
            row.code,
            row.category_count,
          ]),
        ),
        developmentUsersAllowed: true,
        catalogRecords: catalogData.rows[0].catalog_records,
        runtimeRlsVisibility: runtimeVisibility.rows[0],
      },
      null,
      2,
    ),
  );
} finally {
  await runtime.end().catch(() => undefined);
  await owner.end();
}
