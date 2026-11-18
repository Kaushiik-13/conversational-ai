import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const workspace = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const containerName = `automotive-search-phase11-clean-${process.pid}`;
const databaseName = "phase11_clean";
const ownerName = "phase11_owner";
const ownerPassword = "phase11-clean-owner-only";
const appPassword = "phase11-clean-runtime-only";
const image =
  "paradedb/paradedb:0.24.3-pg18@sha256:8101bedd88112393dc349f71784567a6da8c974b7405d15fc97c62fb955fb5bb";
let started = false;

function docker(args, options = {}) {
  const result = spawnSync("docker", args, {
    cwd: workspace,
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `Docker command failed (${args[0]}): ${result.stderr || result.stdout}`,
    );
  }
  return result.stdout.trim();
}

function runNode(script, environment) {
  const result = spawnSync(process.execPath, [script], {
    cwd: workspace,
    env: { ...process.env, ...environment },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `${path.basename(script)} failed:\n${result.stdout}\n${result.stderr}`,
    );
  }
}

async function waitForDatabase(connectionString) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const client = new Client({ connectionString });
    try {
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      return;
    } catch {
      await client.end().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("The isolated ParadeDB container did not become ready.");
}

try {
  docker([
    "run",
    "-d",
    "--rm",
    "--name",
    containerName,
    "--label",
    "automotive-search.phase11-clean-install=true",
    "-e",
    `POSTGRES_DB=${databaseName}`,
    "-e",
    `POSTGRES_USER=${ownerName}`,
    "-e",
    `POSTGRES_PASSWORD=${ownerPassword}`,
    "-p",
    "127.0.0.1::5432",
    image,
  ]);
  started = true;

  const portOutput = docker(["port", containerName, "5432/tcp"]);
  const port = Number(portOutput.match(/:(\d+)$/)?.[1]);
  assert.ok(
    Number.isInteger(port) && port > 0,
    `Could not parse Docker port: ${portOutput}`,
  );

  const ownerUrl = `postgresql://${ownerName}:${ownerPassword}@127.0.0.1:${port}/${databaseName}`;
  const runtimeUrl = `postgresql://automotive_app:${appPassword}@127.0.0.1:${port}/${databaseName}`;
  await waitForDatabase(ownerUrl);

  runNode("database/migrations/migrate.mjs", {
    MIGRATION_DATABASE_URL: ownerUrl,
    APP_DATABASE_PASSWORD: appPassword,
  });
  runNode("database/seeds/seed.mjs", { MIGRATION_DATABASE_URL: ownerUrl });

  const owner = new Client({ connectionString: ownerUrl });
  await owner.connect();
  const facts = await owner.query(`
    SELECT
      (SELECT count(*)::integer FROM public.schema_migrations) AS migrations,
      (SELECT count(*)::integer FROM app.organizations) AS organizations,
      (SELECT count(*)::integer FROM catalog.categories) AS categories,
      (SELECT count(*)::integer FROM security.roles) AS roles,
      (SELECT count(*)::integer FROM security.permissions) AS permissions,
      (SELECT count(*)::integer FROM catalog.part_catalog) AS catalog_records
  `);
  await owner.end();
  assert.deepEqual(facts.rows[0], {
    migrations: 25,
    organizations: 4,
    categories: 114,
    roles: 5,
    permissions: 13,
    catalog_records: 0,
  });

  const runtime = new Client({ connectionString: runtimeUrl });
  await runtime.connect();
  const defaultDeny = await runtime.query(
    "SELECT count(*)::integer AS count FROM catalog.categories",
  );
  await runtime.end();
  assert.equal(
    defaultDeny.rows[0].count,
    0,
    "Clean-install runtime role is not default-deny.",
  );

  console.log(
    JSON.stringify(
      {
        status: "ok",
        isolatedContainer: containerName,
        migrations: facts.rows[0].migrations,
        organizations: facts.rows[0].organizations,
        categories: facts.rows[0].categories,
        roles: facts.rows[0].roles,
        permissions: facts.rows[0].permissions,
        initialCatalogRecords: facts.rows[0].catalog_records,
        runtimeDefaultDeny: "ok",
        persistentApplicationVolumeTouched: false,
      },
      null,
      2,
    ),
  );
} finally {
  if (started) {
    const label = docker([
      "inspect",
      "--format",
      '{{ index .Config.Labels "automotive-search.phase11-clean-install" }}',
      containerName,
    ]);
    assert.equal(
      label,
      "true",
      "Refusing to stop a container without the Phase 11 label.",
    );
    docker(["stop", "--time", "10", containerName]);
  }
}
