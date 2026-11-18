import { statfs } from "node:fs/promises";
import pg from "pg";
import {
  BATCH_SIZE,
  CHECKPOINT_INTERVAL,
  DEFAULT_SMOKE_COUNT,
  FULL_ROW_COUNT,
  GENERATOR_VERSION,
  SECONDARY_TAGS,
  SMOKE_SOURCE_SYSTEM,
  SOURCE_SYSTEM,
  buildGroups,
  generateRow,
  majorDistribution,
} from "./plan.mjs";

const { Client } = pg;

const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
if (!migrationDatabaseUrl) {
  throw new Error("MIGRATION_DATABASE_URL is required.");
}

const args = new Map();
for (const argument of process.argv.slice(2)) {
  if (argument.startsWith("--")) {
    const [name, value] = argument.split("=", 2);
    args.set(name, value ?? true);
  }
}

const smoke = args.has("--smoke");
const force = args.has("--force");
const resume = args.has("--resume");
const requestedCount = Number(args.get("--count") ?? "0");
const minFreeSpaceMb = Number(args.get("--min-free-space-mb") ?? "1500");

const targetRows = smoke
  ? requestedCount > 0
    ? requestedCount
    : DEFAULT_SMOKE_COUNT
  : FULL_ROW_COUNT;
const sourceSystem = smoke ? SMOKE_SOURCE_SYSTEM : SOURCE_SYSTEM;
const seed = smoke ? `${GENERATOR_VERSION}-smoke` : GENERATOR_VERSION;
const diskGuardDrive = process.env.DISK_GUARD_DRIVE ?? "C:\\";

const PART_CATALOG_COLUMNS = [
  "company_id",
  "tenant_id",
  "part_number",
  "part_name",
  "description",
  "commodity",
  "sub_commodity",
  "manufacturer",
  "vehicle_program",
  "region",
  "country",
  "plant",
  "model_year",
  "material",
  "lifecycle_status",
  "supplier_status",
  "cost_usd",
  "weight_kg",
  "active",
  "security_domain_id",
  "primary_category_id",
  "visibility_status",
  "source_system",
  "source_record_id",
  "document_version",
];

const client = new Client({ connectionString: migrationDatabaseUrl });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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

async function availableFreeSpaceMb() {
  const stats = await statfs(diskGuardDrive);
  return (stats.bavail * stats.bsize) / 1024 / 1024;
}

async function verifyTaxonomy(groups) {
  const categoryIds = new Set();
  for (const group of groups) {
    categoryIds.add(group.domainId);
    for (const category of group.categories) {
      categoryIds.add(category.id);
      for (const tag of SECONDARY_TAGS[category.id] ?? []) {
        categoryIds.add(tag);
      }
    }
  }
  const categoryResult = await client.query(
    `SELECT id, slug, status FROM catalog.categories WHERE id = ANY($1::bigint[])`,
    [[...categoryIds]],
  );
  const found = new Map(
    categoryResult.rows.map((row) => [Number(row.id), row]),
  );
  for (const categoryId of categoryIds) {
    const row = found.get(categoryId);
    assert(row, `Category ${categoryId} is missing from the taxonomy.`);
    assert(
      row.status === "active",
      `Category ${categoryId} (${row.slug}) is not active.`,
    );
  }
  for (const group of groups) {
    const domain = found.get(group.domainId);
    assert(domain, `Security domain ${group.domainId} is missing.`);
  }
}

async function ensureJob() {
  const existing = await client.query(
    `SELECT * FROM audit.data_generation_jobs
      WHERE generator_version = $1 AND seed = $2
      ORDER BY id DESC LIMIT 1`,
    [GENERATOR_VERSION, seed],
  );

  if (!smoke) {
    await client.query(
      `DELETE FROM catalog.part_catalog WHERE source_system = $1`,
      [SMOKE_SOURCE_SYSTEM],
    );
    await client.query(
      `DELETE FROM audit.data_generation_jobs WHERE seed = $1`,
      [`${GENERATOR_VERSION}-smoke`],
    );
  } else if (existing.rowCount === 0) {
    await client.query(
      `DELETE FROM catalog.part_catalog WHERE source_system = $1`,
      [SMOKE_SOURCE_SYSTEM],
    );
  }

  let job;
  if (existing.rowCount === 1) {
    job = existing.rows[0];
    if (job.status === "completed" && !force) {
      throw new Error(
        `Job ${job.id} already completed for ${GENERATOR_VERSION}. Use --force to regenerate.`,
      );
    }
    if (!force && !resume) {
      throw new Error(
        `Job ${job.id} is ${job.status} with ${job.completed_rows} rows. Use --resume or --force.`,
      );
    }
    if (force) {
      await client.query("BEGIN");
      try {
        await client.query(
          `DELETE FROM catalog.part_catalog WHERE source_system = $1`,
          [sourceSystem],
        );
        await client.query(
          `DELETE FROM audit.data_generation_jobs WHERE id = $1`,
          [job.id],
        );
        const created = await client.query(
          `INSERT INTO audit.data_generation_jobs
            (generator_version, seed, target_rows, batch_size, status, completed_rows)
            VALUES ($1, $2, $3, $4, 'running', 0)
            RETURNING *`,
          [GENERATOR_VERSION, seed, targetRows, BATCH_SIZE],
        );
        job = created.rows[0];
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    } else {
      assert(
        Number(job.target_rows) === targetRows &&
          Number(job.batch_size) === BATCH_SIZE,
        `Job ${job.id} was created for a different target or batch size; use --force.`,
      );
      const resumed = await client.query(
        `UPDATE audit.data_generation_jobs
          SET status = 'running', error_message = NULL, updated_at = clock_timestamp()
          WHERE id = $1
          RETURNING *`,
        [job.id],
      );
      job = resumed.rows[0];
    }
  } else {
    const created = await client.query(
      `INSERT INTO audit.data_generation_jobs
        (generator_version, seed, target_rows, batch_size, status, completed_rows)
        VALUES ($1, $2, $3, $4, 'running', 0)
        RETURNING *`,
      [GENERATOR_VERSION, seed, targetRows, BATCH_SIZE],
    );
    job = created.rows[0];
  }
  return job;
}

async function verifyResumePosition(job) {
  const actual = await client.query(
    `SELECT count(*)::bigint AS count
       FROM catalog.part_catalog
      WHERE source_system = $1`,
    [sourceSystem],
  );
  const actualRows = Number(actual.rows[0].count);
  const completedRows = Number(job.completed_rows);
  assert(
    actualRows === completedRows,
    `Cannot resume job ${job.id}: checkpoint=${completedRows}, stored rows=${actualRows}. Use --force after reviewing the partial dataset.`,
  );
}

async function flushRows(rows) {
  const perRow = PART_CATALOG_COLUMNS.length;
  const params = [];
  const tuples = [];
  rows.forEach((row, rowIndex) => {
    const base = rowIndex * perRow;
    tuples.push(
      `(${PART_CATALOG_COLUMNS.map((_, column) => `$${base + column + 1}`).join(",")})`,
    );
    params.push(
      row.companyId,
      row.tenantId,
      row.partNumber,
      row.partName,
      row.description,
      row.commodity,
      row.subCommodity,
      row.manufacturer,
      row.vehicleProgram,
      row.region,
      row.country,
      row.plant,
      row.modelYear,
      row.material,
      row.lifecycleStatus,
      row.supplierStatus,
      row.costUsd,
      row.weightKg,
      row.active,
      row.securityDomainId,
      row.primaryCategoryId,
      row.visibilityStatus,
      row.sourceSystem,
      row.sourceRecordId,
      row.documentVersion,
    );
  });

  const catalogSql = `INSERT INTO catalog.part_catalog (${PART_CATALOG_COLUMNS.join(",")})
      VALUES ${tuples.join(",")}
      RETURNING id, part_number`;
  const inserted = await client.query(catalogSql, params);
  const partIdByNumber = new Map(
    inserted.rows.map((row) => [row.part_number, Number(row.id)]),
  );

  const categoryParams = [];
  const categoryTuples = [];
  for (const row of rows) {
    const partId = partIdByNumber.get(row.partNumber);
    const append = (categoryId, assignmentType) => {
      const base = categoryParams.length / 4;
      categoryTuples.push(
        `($${base * 4 + 1}, $${base * 4 + 2}, $${base * 4 + 3}, $${base * 4 + 4})`,
      );
      categoryParams.push(partId, categoryId, assignmentType, "generated");
    };
    append(row.primaryCategoryId, "primary");
    if (row.secondaryTag !== null) {
      append(row.secondaryTag, "secondary");
    }
  }
  if (categoryTuples.length > 0) {
    const categorySql = `INSERT INTO catalog.part_categories
        (part_id, category_id, assignment_type, source)
        VALUES ${categoryTuples.join(",")}`;
    await client.query(categorySql, categoryParams);
  }
}

async function run() {
  const groups = buildGroups({ smoke, count: targetRows });
  const totalPlan = majorDistribution(groups);
  const startedAt = Date.now();
  let lastCheckpointBucket = -1;

  await connectWithRetry();
  await client.query(
    "SELECT pg_advisory_lock(hashtext('automotive_search_generation'))",
  );

  try {
    assert(
      (
        await client.query(
          "SELECT to_regclass('audit.data_generation_jobs') AS t",
        )
      ).rows[0].t,
      "audit.data_generation_jobs is missing; run migrations first.",
    );

    const freeBefore = Math.floor(await availableFreeSpaceMb());
    if (freeBefore < minFreeSpaceMb) {
      throw new Error(
        `Only ${freeBefore} MB free on ${diskGuardDrive}; refusing to start below ${minFreeSpaceMb} MB.`,
      );
    }

    await verifyTaxonomy(groups);

    const job = await ensureJob();
    const resumeFrom = Number(job.completed_rows);
    if (resumeFrom > 0) {
      await verifyResumePosition(job);
    }
    let done = 0;

    for (const group of groups) {
      for (let start = 0; start < group.count; start += BATCH_SIZE) {
        const end = Math.min(start + BATCH_SIZE, group.count);
        const rows = [];
        for (let index = start; index < end; index += 1) {
          if (done >= resumeFrom) {
            rows.push(generateRow(group, index, sourceSystem));
          }
          done += 1;
        }
        if (rows.length > 0) {
          await client.query("BEGIN");
          try {
            await flushRows(rows);
            await client.query("SET CONSTRAINTS ALL IMMEDIATE");
            await client.query(
              `UPDATE audit.data_generation_jobs
                SET completed_rows = $1, updated_at = clock_timestamp()
                WHERE id = $2`,
              [done, job.id],
            );
            await client.query("COMMIT");
          } catch (error) {
            await client.query("ROLLBACK").catch(() => undefined);
            throw error;
          }
        }

        const checkpointBucket = Math.floor(done / CHECKPOINT_INTERVAL);
        if (checkpointBucket > lastCheckpointBucket) {
          lastCheckpointBucket = checkpointBucket;
          await client.query("CHECKPOINT");
          const freeMb = Math.floor(await availableFreeSpaceMb());
          if (freeMb < minFreeSpaceMb) {
            throw new Error(
              `Free space dropped to ${freeMb} MB; aborting below ${minFreeSpaceMb} MB.`,
            );
          }
          const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
          console.log(
            `progress ${done}/${targetRows} (${((100 * done) / targetRows).toFixed(1)}%) free=${freeMb}MB elapsed=${elapsed}s`,
          );
        }
      }
    }

    await client.query("ANALYZE catalog.part_catalog");
    await client.query("ANALYZE catalog.part_categories");
    await client.query(
      `UPDATE audit.data_generation_jobs
        SET status = 'completed', completed_rows = $1,
            completed_at = clock_timestamp(), updated_at = clock_timestamp()
        WHERE id = $2`,
      [done, job.id],
    );

    const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      JSON.stringify(
        {
          status: "ok",
          mode: smoke ? "smoke" : "full",
          sourceSystem,
          jobId: job.id,
          totalRows: done,
          distribution: totalPlan,
          elapsedSeconds: Number(elapsedSeconds),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client
      .query(
        `UPDATE audit.data_generation_jobs
          SET status = 'failed', error_message = $1, updated_at = clock_timestamp()
          WHERE generator_version = $2 AND seed = $3 AND status = 'running'`,
        [String(error.message).slice(0, 2000), GENERATOR_VERSION, seed],
      )
      .catch(() => undefined);
    throw error;
  } finally {
    await client
      .query(
        "SELECT pg_advisory_unlock(hashtext('automotive_search_generation'))",
      )
      .catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}

run().catch((error) => {
  console.error(`generation failed: ${error.message}`);
  process.exitCode = 1;
});
