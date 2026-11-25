import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { parse } from "yaml";
import {
  convertLegacyModel,
  modelChecksum,
  validateModelDocument,
} from "../../packages/cube-query/src/model.mjs";

/**
 * Imports the reviewed automotive semantic definition as the platform
 * template model (organization_id NULL). Idempotent: a new version is created
 * only when the converted document differs from the published one.
 */

const { Client } = pg;
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const sourcePath = process.env.SEMANTIC_SOURCE_PATH
  ? path.resolve(process.env.SEMANTIC_SOURCE_PATH)
  : path.join(root, "semantic/automotive/catalog.yaml");
const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;

if (!migrationDatabaseUrl) {
  throw new Error("MIGRATION_DATABASE_URL is required.");
}

const legacy = parse(await readFile(sourcePath, "utf8"));
const document = convertLegacyModel(legacy);
const validation = validateModelDocument(document);
if (!validation.valid) {
  console.error(JSON.stringify(validation.errors, null, 2));
  throw new Error("The semantic model is not valid; nothing was written.");
}
const checksum = modelChecksum(document);

const client = new Client({ connectionString: migrationDatabaseUrl });
await client.connect();
try {
  await client.query(
    "SELECT pg_advisory_lock(hashtext('automotive_search_semantic_import'))",
  );
  await client.query("BEGIN");

  const existing = await client.query(
    `SELECT id FROM semantic.models
     WHERE organization_id IS NULL AND code = $1`,
    [document.model],
  );
  let modelId = existing.rows[0]?.id;
  if (!modelId) {
    const inserted = await client.query(
      `INSERT INTO semantic.models (organization_id, code, name, source_kind)
       VALUES (NULL, $1, $2, 'application_database')
       RETURNING id`,
      [document.model, "Automotive catalog"],
    );
    modelId = inserted.rows[0].id;
  }

  const published = await client.query(
    `SELECT id, version_number, checksum
     FROM semantic.model_versions
     WHERE model_id = $1 AND status = 'published'`,
    [modelId],
  );

  if (published.rows[0]?.checksum === checksum) {
    console.log(
      `unchanged ${document.model} v${published.rows[0].version_number}`,
    );
  } else {
    const latest = await client.query(
      `SELECT COALESCE(max(version_number), 0) AS latest
       FROM semantic.model_versions WHERE model_id = $1`,
      [modelId],
    );
    const next = Number(latest.rows[0].latest) + 1;
    if (published.rows[0]) {
      await client.query(
        "UPDATE semantic.model_versions SET status = 'archived' WHERE id = $1",
        [published.rows[0].id],
      );
    }
    await client.query(
      `INSERT INTO semantic.model_versions
         (model_id, version_number, status, document, checksum, published_at)
       VALUES ($1, $2, 'published', $3::jsonb, $4, clock_timestamp())`,
      [modelId, next, JSON.stringify(document), checksum],
    );
    console.log(`published ${document.model} v${next}`);
  }

  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client
    .query(
      "SELECT pg_advisory_unlock(hashtext('automotive_search_semantic_import'))",
    )
    .catch(() => undefined);
  await client.end();
}
