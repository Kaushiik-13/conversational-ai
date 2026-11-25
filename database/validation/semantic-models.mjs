import pg from "pg";

/**
 * Validates migration 0028 (semantic models): constraints, one live version,
 * immutability, runtime privileges, organization isolation and role field
 * access. Test rows are created and removed inside this script.
 */

const { Client } = pg;
const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
const runtimeDatabaseUrl = process.env.DATABASE_URL;
if (!migrationDatabaseUrl || !runtimeDatabaseUrl) {
  throw new Error("MIGRATION_DATABASE_URL and DATABASE_URL are required.");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function rejects(client, label, sql, params = []) {
  await client.query("SAVEPOINT attempt");
  try {
    await client.query(sql, params);
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT attempt");
    return error;
  }
  await client.query("ROLLBACK TO SAVEPOINT attempt");
  throw new Error(`${label} should have been rejected.`);
}

const owner = new Client({ connectionString: migrationDatabaseUrl });
const runtime = new Client({ connectionString: runtimeDatabaseUrl });
await owner.connect();
await runtime.connect();

const results = [];
const pass = (name) => {
  results.push(name);
  console.log(`ok  ${name}`);
};

const document = {
  schema_version: 1,
  model: "validation_probe",
  source: { table: "catalog.part_catalog", alias: "part" },
  measures: { part_count: { aggregation: "count_distinct", column: "id" } },
  dimensions: {},
  lookup_fields: {},
  record_fields: {},
  excluded_fields: [],
  limits: { max_result_limit: 10 },
};
const checksum = "a".repeat(64);

try {
  // --- structure and constraints (owner, rolled back) ---------------------
  await owner.query("BEGIN");
  const org = (
    await owner.query("SELECT id FROM app.organizations WHERE code = 'org-a'")
  ).rows[0];
  assert(org, "Organization org-a is required.");

  const probe = (
    await owner.query(
      `INSERT INTO semantic.models (organization_id, code, name)
       VALUES ($1, 'validation_probe', 'Probe') RETURNING id`,
      [org.id],
    )
  ).rows[0];

  await rejects(
    owner,
    "duplicate model code in the same scope",
    `INSERT INTO semantic.models (organization_id, code, name)
     VALUES ($1, 'validation_probe', 'Again')`,
    [org.id],
  );
  pass("model code is unique per organization");

  await rejects(
    owner,
    "duplicate platform template code",
    `INSERT INTO semantic.models (organization_id, code, name)
     VALUES (NULL, 'automotive_catalog', 'Duplicate template')`,
  );
  pass("platform template code is unique");

  await rejects(
    owner,
    "document that is not version 1",
    `INSERT INTO semantic.model_versions
       (model_id, version_number, document, checksum)
     VALUES ($1, 1, '{"schema_version":2}'::jsonb, $2)`,
    [probe.id, checksum],
  );
  await rejects(
    owner,
    "malformed checksum",
    `INSERT INTO semantic.model_versions
       (model_id, version_number, document, checksum)
     VALUES ($1, 1, $2::jsonb, 'not-a-checksum')`,
    [probe.id, JSON.stringify(document)],
  );
  pass("document and checksum constraints reject bad input");

  await owner.query(
    `INSERT INTO semantic.model_versions
       (model_id, version_number, status, document, checksum, published_at)
     VALUES ($1, 1, 'published', $2::jsonb, $3, clock_timestamp())`,
    [probe.id, JSON.stringify(document), checksum],
  );
  await rejects(
    owner,
    "a second published version",
    `INSERT INTO semantic.model_versions
       (model_id, version_number, status, document, checksum, published_at)
     VALUES ($1, 2, 'published', $2::jsonb, $3, clock_timestamp())`,
    [probe.id, JSON.stringify(document), checksum],
  );
  pass("only one published version per model");

  await rejects(
    owner,
    "editing a published document",
    `UPDATE semantic.model_versions
     SET document = '{"schema_version":1,"model":"changed"}'::jsonb
     WHERE model_id = $1`,
    [probe.id],
  );
  pass("published versions are immutable");

  // --- runtime role: read only, scoped ------------------------------------
  const otherOrg = (
    await owner.query("SELECT id FROM app.organizations WHERE code = 'org-b'")
  ).rows[0];
  await owner.query("COMMIT");

  // The probe was rolled forward by COMMIT above; remove it in finally.
  try {
    const writeError = await (async () => {
      try {
        await runtime.query(
          "INSERT INTO semantic.models (code, name) VALUES ('x_probe', 'x')",
        );
      } catch (error) {
        return error;
      }
      return null;
    })();
    assert(writeError, "The runtime role must not insert models.");
    assert(
      writeError.code === "42501",
      `Expected permission denied, got ${writeError.code}.`,
    );
    pass("runtime role cannot write models");

    async function visibleModels(organizationId) {
      await runtime.query("BEGIN READ ONLY");
      if (organizationId) {
        await runtime.query(
          "SELECT set_config('app.organization_id', $1, true)",
          [organizationId],
        );
      }
      const rows = (
        await runtime.query(
          `SELECT m.code, m.organization_id, v.version_number
           FROM semantic.models m
           JOIN semantic.model_versions v ON v.model_id = m.id
           ORDER BY m.code`,
        )
      ).rows;
      await runtime.query("ROLLBACK");
      return rows;
    }

    const noContext = await visibleModels(null);
    assert(
      noContext.every((row) => row.organization_id === null),
      "Without an organization only platform templates are visible.",
    );
    assert(
      noContext.some((row) => row.code === "automotive_catalog"),
      "The automotive template must be published and visible.",
    );
    pass("templates are visible without an organization");

    const orgA = await visibleModels(org.id);
    const orgB = await visibleModels(otherOrg.id);
    assert(
      orgA.some((row) => row.code === "validation_probe"),
      "Org A must see its own model.",
    );
    assert(
      !orgB.some((row) => row.code === "validation_probe"),
      "Org B must not see Org A's model.",
    );
    pass("an organization sees only its own models plus templates");

    // --- field access through the runtime role ----------------------------
    const roles = new Map(
      (await owner.query("SELECT id, code FROM security.roles")).rows.map(
        (row) => [row.code, row.id],
      ),
    );
    async function access(roleCode, resource, field) {
      await runtime.query("BEGIN READ ONLY");
      await runtime.query("SELECT set_config('app.role_id', $1, true)", [
        roles.get(roleCode),
      ]);
      const row = (
        await runtime.query(
          "SELECT security.authz_resource_field_access($1, $2) AS access",
          [resource, field],
        )
      ).rows[0];
      await runtime.query("ROLLBACK");
      return row.access;
    }
    for (const [role, expected] of [
      ["GLOBAL_ADMIN", "allow"],
      ["ORG_ADMIN", "allow"],
      ["ANALYST", "allow"],
      ["VIEWER", "omit"],
      ["RESTRICTED_VIEWER", "omit"],
    ]) {
      const actual = await access(role, "catalog.part", "costUsd");
      assert(actual === expected, `${role} costUsd: ${actual} != ${expected}.`);
    }
    assert(
      (await access("VIEWER", "catalog.part", "region")) === "allow",
      "Unguarded catalog fields stay allowed.",
    );
    assert(
      (await access("GLOBAL_ADMIN", "unknown.resource", "x")) === "omit",
      "Unknown resources deny by default.",
    );
    pass("role field access resolves as designed");
  } finally {
    await owner.query("DELETE FROM semantic.models WHERE id = $1", [probe.id]);
  }

  console.log(`\n${results.length} semantic model checks passed.`);
} catch (error) {
  await owner.query("ROLLBACK").catch(() => undefined);
  await owner
    .query("DELETE FROM semantic.models WHERE code = 'validation_probe'")
    .catch(() => undefined);
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await runtime.end();
  await owner.end();
}
