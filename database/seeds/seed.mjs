import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const { Client } = pg;
const seedsDirectory = path.dirname(fileURLToPath(import.meta.url));
const seedPattern = /^\d{4}_[a-z0-9_]+\.sql$/;
const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;

if (!migrationDatabaseUrl) {
  throw new Error("MIGRATION_DATABASE_URL is required.");
}

const client = new Client({ connectionString: migrationDatabaseUrl });

async function connectWithRetry(attempts = 30) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await client.connect();
      return;
    } catch (error) {
      const retryableCodes = new Set(["ECONNREFUSED", "ENOTFOUND", "57P03"]);
      if (!retryableCodes.has(error.code) || attempt === attempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

async function run() {
  await connectWithRetry();
  await client.query(
    "SELECT pg_advisory_lock(hashtext('automotive_search_reference_seeds'))",
  );

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.seed_history (
        version text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
      )
    `);
    await client.query("REVOKE ALL ON public.seed_history FROM PUBLIC");

    const fileNames = (await readdir(seedsDirectory))
      .filter((name) => seedPattern.test(name))
      .sort();

    for (const fileName of fileNames) {
      const sql = await readFile(path.join(seedsDirectory, fileName), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = await client.query(
        "SELECT checksum FROM public.seed_history WHERE version = $1",
        [fileName],
      );

      if (existing.rowCount === 1) {
        if (existing.rows[0].checksum !== checksum) {
          throw new Error(`Applied seed ${fileName} has been modified.`);
        }
        console.log(`unchanged ${fileName}`);
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO public.seed_history (version, checksum) VALUES ($1, $2)",
          [fileName, checksum],
        );
        await client.query("COMMIT");
        console.log(`applied   ${fileName}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    console.log(`complete  ${fileNames.length} reference seed(s)`);
  } finally {
    await client.query(
      "SELECT pg_advisory_unlock(hashtext('automotive_search_reference_seeds'))",
    );
    await client.end();
  }
}

await run();
