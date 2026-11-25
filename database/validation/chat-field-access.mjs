import pg from "pg";

/**
 * Checks, through the running API, that conversation queries follow the
 * database-held semantic model and the role's field access:
 *   - administrators can use cost and supplier fields; a viewer cannot,
 *   - everything else still works for the viewer,
 *   - organizations only count their own parts.
 *
 * Requires the API (API_PORT), the development accounts and migration 0028.
 * Temporarily clears the "must change password" flag on the accounts it uses
 * and always restores it.
 */

const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
const apiBaseUrl = `http://localhost:${process.env.API_PORT ?? 3000}/api/v1`;
const allowedOrigin = "http://localhost:4200";
if (!migrationDatabaseUrl)
  throw new Error("MIGRATION_DATABASE_URL is required.");

const accounts = {
  adminA: ["orga.admin@example.test", "DEV_ORG_A_ADMIN_PASSWORD"],
  viewerA: ["orga.viewer@example.test", "DEV_ORG_A_VIEWER_PASSWORD"],
  adminB: ["orgb.admin@example.test", "DEV_ORG_B_ADMIN_PASSWORD"],
};

const base = { version: 1, model: "automotive_catalog" };
const aggregate = (measures, dimensions = [], filters = []) => ({
  ...base,
  measures,
  dimensions,
  filters,
});
const records = (fields) => ({
  ...base,
  mode: "records",
  measures: [],
  dimensions: [],
  fields,
  filters: [],
  limit: 2,
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

class CookieJar {
  values = new Map();
  absorb(response) {
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";", 1);
      const separator = pair.indexOf("=");
      const value = pair.slice(separator + 1);
      if (value) this.values.set(pair.slice(0, separator), value);
      else this.values.delete(pair.slice(0, separator));
    }
  }
  header() {
    return [...this.values]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

async function call(path, jar, method = "GET", body) {
  const headers = { Origin: allowedOrigin };
  if (jar.values.size) headers.Cookie = jar.header();
  if (jar.values.get("XSRF-TOKEN")) {
    headers["X-XSRF-TOKEN"] = jar.values.get("XSRF-TOKEN");
  }
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  jar.absorb(response);
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function login(email, variable) {
  const password = process.env[variable];
  assert(password?.length >= 16, `${variable} is unavailable.`);
  const jar = new CookieJar();
  await call("/auth/csrf", jar);
  const result = await call("/auth/login", jar, "POST", { email, password });
  assert(result.status === 200, `Login failed for ${email}.`);
  return jar;
}

const owner = new pg.Client({ connectionString: migrationDatabaseUrl });
await owner.connect();
const emails = Object.values(accounts).map(([email]) => email);
const flagsBefore = (
  await owner.query(
    `SELECT u.email::text AS email, c.must_change_password
     FROM app.app_users u JOIN app.user_credentials c ON c.user_id = u.id
     WHERE u.email::text = ANY($1)`,
    [emails],
  )
).rows;

const results = [];
const pass = (name) => {
  results.push(name);
  console.log(`ok  ${name}`);
};

try {
  await owner.query(
    `UPDATE app.user_credentials SET must_change_password = false
     WHERE user_id IN (SELECT id FROM app.app_users WHERE email::text = ANY($1))`,
    [emails],
  );

  const adminA = await login(...accounts.adminA);
  const viewerA = await login(...accounts.viewerA);
  const adminB = await login(...accounts.adminB);
  const query = (jar, input) => call("/conversation/query", jar, "POST", input);
  const rows = (response) => response.body.data.rows;

  // Organization scope through the database-held model.
  const totalA = await query(adminA, aggregate(["part_count"]));
  assert(totalA.status === 200, "Org A total failed.");
  assert(
    rows(totalA)[0].part_count === "5000000",
    "Org A must count 5,000,000.",
  );
  const totalB = await query(adminB, aggregate(["part_count"]));
  assert(
    rows(totalB)[0].part_count === "1250000",
    "Org B must count 1,250,000.",
  );
  pass("organizations count only their own parts");

  // An administrator can use the guarded fields.
  for (const [label, input] of [
    ["cost measure", aggregate(["total_cost_usd"])],
    [
      "supplier status dimension",
      aggregate(["part_count"], ["supplier_status"]),
    ],
    [
      "cost filter",
      aggregate(
        ["part_count"],
        [],
        [{ field: "cost_usd", operator: "gt", value: 10 }],
      ),
    ],
    ["cost record field", records(["part_number", "cost_usd"])],
  ]) {
    const result = await query(adminA, input);
    assert(result.status === 200, `Administrator ${label} should work.`);
  }
  pass("administrators can use cost and supplier fields");

  // A viewer cannot name them in any position.
  for (const [label, input] of [
    ["cost measure", aggregate(["total_cost_usd"])],
    ["average cost measure", aggregate(["average_cost_usd"])],
    [
      "supplier status dimension",
      aggregate(["part_count"], ["supplier_status"]),
    ],
    ["cost dimension", aggregate(["part_count"], ["cost_usd"])],
    [
      "cost filter",
      aggregate(
        ["part_count"],
        [],
        [{ field: "cost_usd", operator: "gt", value: 10 }],
      ),
    ],
    [
      "supplier filter",
      aggregate(
        ["part_count"],
        [],
        [{ field: "supplier_status", operator: "equals", value: "approved" }],
      ),
    ],
    ["cost record field", records(["part_number", "cost_usd"])],
    ["supplier record field", records(["part_number", "supplier_status"])],
  ]) {
    const result = await query(viewerA, input);
    assert(
      result.status === 400,
      `Viewer ${label} must be rejected, got ${result.status}.`,
    );
  }
  pass("a viewer is rejected on every cost and supplier field");

  // Everything else keeps working for the viewer.
  const viewerTotal = await query(viewerA, aggregate(["part_count"]));
  assert(
    rows(viewerTotal)[0].part_count === "5000000",
    "Viewer total must work.",
  );
  const viewerRecords = await query(
    viewerA,
    records(["part_number", "region"]),
  );
  assert(viewerRecords.status === 200, "Viewer records must work.");
  const viewerCategory = await query(viewerA, {
    ...aggregate(["part_count"], ["category"]),
    limit: 3,
  });
  assert(viewerCategory.status === 200, "Viewer category breakdown must work.");
  pass("a viewer can still use every other field, including categories");

  console.log(`\n${results.length} chat field access checks passed.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  for (const row of flagsBefore) {
    await owner.query(
      `UPDATE app.user_credentials SET must_change_password = $2
       WHERE user_id = (SELECT id FROM app.app_users WHERE email::text = $1)`,
      [row.email, row.must_change_password],
    );
  }
  const flagsAfter = (
    await owner.query(
      `SELECT u.email::text AS email, c.must_change_password
       FROM app.app_users u JOIN app.user_credentials c ON c.user_id = u.id
       WHERE u.email::text = ANY($1)`,
      [emails],
    )
  ).rows;
  const restored = flagsBefore.every(
    (before) =>
      flagsAfter.find((after) => after.email === before.email)
        ?.must_change_password === before.must_change_password,
  );
  console.log(`password-change flags restored: ${restored}`);
  if (!restored) process.exitCode = 1;
  await owner.end();
}
