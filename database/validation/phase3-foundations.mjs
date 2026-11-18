import pg from "pg";

const { Client } = pg;
const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
const runtimeDatabaseUrl = process.env.DATABASE_URL;

if (!migrationDatabaseUrl || !runtimeDatabaseUrl) {
  throw new Error("MIGRATION_DATABASE_URL and DATABASE_URL are required.");
}

const expectedTables = [
  "app.app_users",
  "app.idempotency_keys",
  "app.organization_memberships",
  "app.organizations",
  "app.user_credentials",
  "app.user_sessions",
  "audit.audit_events",
  "audit.data_generation_jobs",
  "catalog.categories",
  "catalog.part_catalog",
  "catalog.part_categories",
  "security.field_access_rules",
  "security.organization_category_entitlements",
  "security.permissions",
  "security.role_permissions",
  "security.roles",
  "security.user_scope_restrictions",
];

const requiredConstraints = [
  "app_users_email_unique",
  "organization_memberships_one_active_per_org",
  "organization_memberships_one_default",
  "categories_path_unique",
  "part_catalog_part_number_unique",
  "part_catalog_cost_nonnegative",
  "part_catalog_weight_nonnegative",
  "part_categories_one_primary",
  "user_scope_restrictions_target_check",
  "audit_events_metadata_size",
  "idempotency_key_length",
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectDatabaseError(client, query, expectedCode) {
  await client.query("SAVEPOINT expected_error");
  try {
    await client.query(query.text, query.values);
    throw new Error(
      `Expected database error ${expectedCode}, but the statement succeeded.`,
    );
  } catch (error) {
    if (error.code !== expectedCode) {
      throw error;
    }
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT expected_error");
    await client.query("RELEASE SAVEPOINT expected_error");
  }
}

async function validateConstraintEnforcement(client) {
  await client.query("BEGIN");
  try {
    const organization = await client.query(`
      INSERT INTO app.organizations (code, name)
      VALUES ('phase3-validation', 'Phase 3 Validation')
      RETURNING id
    `);
    await client.query(
      "UPDATE app.organizations SET name = 'Phase 3 Validation Updated' WHERE id = $1",
      [organization.rows[0].id],
    );
    const updatedOrganization = await client.query(
      "SELECT created_at, updated_at FROM app.organizations WHERE id = $1",
      [organization.rows[0].id],
    );
    assert(
      updatedOrganization.rows[0].updated_at >
        updatedOrganization.rows[0].created_at,
      "updated_at trigger did not advance the timestamp.",
    );

    await expectDatabaseError(
      client,
      {
        text: "INSERT INTO app.organizations (code, name, status) VALUES ('invalid-status', 'Invalid', 'unknown')",
      },
      "23514",
    );

    const rootCategory = await client.query(`
      INSERT INTO catalog.categories (slug, name, path, depth)
      VALUES ('phase3-validation-root', 'Phase 3 Validation Root', 'phase3_validation_root', 0)
      RETURNING id
    `);
    const brakingDomain = await client.query(
      `
        INSERT INTO catalog.categories
          (parent_id, slug, name, path, depth, is_security_domain)
        VALUES ($1, 'phase3-braking', 'Phase 3 Braking', 'phase3_validation_root.braking', 1, true)
        RETURNING id
      `,
      [rootCategory.rows[0].id],
    );
    const brakePads = await client.query(
      `
        INSERT INTO catalog.categories (parent_id, slug, name, path, depth)
        VALUES ($1, 'phase3-brake-pads', 'Phase 3 Brake Pads', 'phase3_validation_root.braking.brake_pads', 2)
        RETURNING id
      `,
      [brakingDomain.rows[0].id],
    );
    const tyresDomain = await client.query(
      `
        INSERT INTO catalog.categories
          (parent_id, slug, name, path, depth, is_security_domain)
        VALUES ($1, 'phase3-tyres-wheels', 'Phase 3 Tyres and Wheels', 'phase3_validation_root.tyres_wheels', 1, true)
        RETURNING id
      `,
      [rootCategory.rows[0].id],
    );
    const tyres = await client.query(
      `
        INSERT INTO catalog.categories (parent_id, slug, name, path, depth)
        VALUES ($1, 'phase3-tyres', 'Phase 3 Tyres', 'phase3_validation_root.tyres_wheels.tyres', 2)
        RETURNING id
      `,
      [tyresDomain.rows[0].id],
    );

    const insertPartSql = `
      INSERT INTO catalog.part_catalog (
        company_id, tenant_id, part_number, part_name, description, commodity,
        sub_commodity, manufacturer, vehicle_program, region, country, plant,
        model_year, material, lifecycle_status, supplier_status, cost_usd,
        weight_kg, security_domain_id, primary_category_id, source_system,
        source_record_id
      )
      VALUES (
        1, 1, $1, 'Validation Part', 'Temporary validation record', 'Braking',
        'Brake Pads', 'Validation Manufacturer', 'Validation Program', 'Europe',
        'Germany', 'Validation Plant', 2026, 'Ceramic', 'active', 'approved',
        $2, 1.250, $3, $4, 'phase3-validation', $5
      )
      RETURNING id
    `;

    await expectDatabaseError(
      client,
      {
        text: insertPartSql,
        values: [
          "PHASE3-NEGATIVE-COST",
          -1,
          brakingDomain.rows[0].id,
          brakePads.rows[0].id,
          "negative-cost",
        ],
      },
      "23514",
    );

    await expectDatabaseError(
      client,
      {
        text: insertPartSql,
        values: [
          "PHASE3-CROSS-DOMAIN",
          10,
          brakingDomain.rows[0].id,
          tyres.rows[0].id,
          "cross-domain",
        ],
      },
      "23514",
    );

    const validPart = await client.query(insertPartSql, [
      "PHASE3-VALID",
      10,
      brakingDomain.rows[0].id,
      brakePads.rows[0].id,
      "valid",
    ]);
    await client.query(
      `
        INSERT INTO catalog.part_categories (part_id, category_id, assignment_type, source)
        VALUES ($1, $2, 'primary', 'manual')
      `,
      [validPart.rows[0].id, brakePads.rows[0].id],
    );
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  } finally {
    await client.query("ROLLBACK");
  }
}

const owner = new Client({ connectionString: migrationDatabaseUrl });
const runtime = new Client({ connectionString: runtimeDatabaseUrl });

await owner.connect();

try {
  const tableResult = await owner.query(`
    SELECT
      n.nspname || '.' || c.relname AS table_name,
      owner_role.rolname AS owner_name,
      c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_roles owner_role ON owner_role.oid = c.relowner
    WHERE c.relkind = 'r'
      AND n.nspname IN ('app', 'catalog', 'security', 'audit')
    ORDER BY table_name
  `);

  const actualTables = tableResult.rows.map((row) => row.table_name);
  assert(
    JSON.stringify(actualTables) === JSON.stringify(expectedTables),
    `Unexpected protected table set: ${actualTables.join(", ")}`,
  );
  assert(
    tableResult.rows.every(
      (row) =>
        !["automotive_app", "automotive_runtime"].includes(row.owner_name),
    ),
    "A runtime role owns a protected table.",
  );
  assert(
    tableResult.rows.every((row) => row.rls_enabled && row.rls_forced),
    "Every protected table must have forced Row-Level Security.",
  );

  const migrationResult = await owner.query(
    "SELECT version FROM public.schema_migrations ORDER BY version",
  );
  assert(
    migrationResult.rowCount === 25,
    `Expected 25 migrations, found ${migrationResult.rowCount}.`,
  );

  const extensionResult = await owner.query(`
    SELECT extname
    FROM pg_extension
    WHERE extname IN ('citext', 'ltree', 'pg_search', 'pgcrypto', 'vector')
    ORDER BY extname
  `);
  assert(
    extensionResult.rowCount === 5,
    "One or more required extensions are missing.",
  );

  const objectResult = await owner.query(`
    SELECT conname AS object_name FROM pg_constraint
    UNION ALL
    SELECT indexname AS object_name FROM pg_indexes
  `);
  const objectNames = new Set(objectResult.rows.map((row) => row.object_name));
  for (const constraint of requiredConstraints) {
    assert(
      objectNames.has(constraint),
      `Required constraint/index ${constraint} is missing.`,
    );
  }

  const triggerResult = await owner.query(`
    SELECT count(*)::integer AS count
    FROM information_schema.triggers
    WHERE trigger_schema IN ('app', 'catalog', 'security')
      AND trigger_name LIKE '%set_updated_at'
  `);
  assert(
    triggerResult.rows[0].count === 6,
    "Expected six updated_at triggers.",
  );

  const privilegeResult = await owner.query(`
    SELECT
      has_schema_privilege('automotive_app', 'app', 'CREATE') AS can_create_app_objects,
      has_table_privilege('automotive_app', 'audit.audit_events', 'SELECT') AS can_read_audit,
      has_table_privilege('automotive_app', 'audit.audit_events', 'INSERT') AS can_insert_audit,
      has_table_privilege('automotive_app', 'audit.audit_events', 'UPDATE') AS can_update_audit,
      has_table_privilege('automotive_app', 'audit.audit_events', 'DELETE') AS can_delete_audit
  `);
  const privileges = privilegeResult.rows[0];
  assert(
    !privileges.can_create_app_objects,
    "Runtime role can create objects in app schema.",
  );
  assert(
    privileges.can_read_audit && privileges.can_insert_audit,
    "Audit read/insert grants are missing.",
  );
  assert(
    !privileges.can_update_audit && !privileges.can_delete_audit,
    "Audit events are mutable by runtime.",
  );

  await validateConstraintEnforcement(owner);

  await runtime.connect();
  const runtimeIdentity = await runtime.query("SELECT current_user");
  assert(
    runtimeIdentity.rows[0].current_user === "automotive_app",
    "API does not use automotive_app.",
  );

  const defaultDenyResult = await runtime.query(
    "SELECT count(*)::integer AS count FROM app.organizations",
  );
  assert(
    defaultDenyResult.rows[0].count === 0,
    "Default-deny RLS did not hide organization rows.",
  );

  console.log(
    JSON.stringify(
      {
        status: "ok",
        migrations: migrationResult.rowCount,
        protectedTables: tableResult.rowCount,
        forcedRlsTables: tableResult.rows.filter(
          (row) => row.rls_enabled && row.rls_forced,
        ).length,
        requiredExtensions: extensionResult.rows.map((row) => row.extname),
        runtimeRole: runtimeIdentity.rows[0].current_user,
        constraintChecks: 4,
        referenceDataAllowed: true,
      },
      null,
      2,
    ),
  );
} finally {
  await runtime.end().catch(() => undefined);
  await owner.end();
}
