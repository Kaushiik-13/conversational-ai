import assert from "node:assert/strict";
import { test } from "node:test";
import { validateCubeQuery as validateAgainst } from "../src/index.mjs";
import {
  CubeQueryAuthorizationError,
  CubeQueryValidationError,
  compileCubeQuery as compileAgainst,
  executeAuthorizedCubeQuery as executeAgainst,
} from "../src/qgen.mjs";
import { automotiveModel } from "./helpers.mjs";

const model = automotiveModel();
const validateCubeQuery = (input) => validateAgainst(input, model);
const compileCubeQuery = (input) => compileAgainst(input, model);
const executeAuthorizedCubeQuery = (input, runner) =>
  executeAgainst(input, runner, model);

const baseQuery = {
  version: 1,
  model: "automotive_catalog",
  measures: ["part_count"],
  dimensions: ["manufacturer"],
  filters: [],
};

test("validates a supported query and applies the default result limit", () => {
  const result = validateCubeQuery(baseQuery);
  assert.equal(result.valid, true);
  assert.equal(result.query.limit, 50);
  assert.deepEqual(result.query.measures, ["part_count"]);
});

test("validates the distinct manufacturer count measure without changing part_count", () => {
  const result = validateCubeQuery({
    ...baseQuery,
    measures: ["manufacturer_count"],
    dimensions: [],
    filters: [{ field: "category", operator: "equals", value: "brake-pads" }],
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.query.measures, ["manufacturer_count"]);
});

test("compiles manufacturer_count as a distinct count and safely filters the brake-pad category", () => {
  const compiled = compileCubeQuery({
    ...baseQuery,
    measures: ["manufacturer_count"],
    dimensions: [],
    filters: [{ field: "category", operator: "equals", value: "brake-pads" }],
  });

  assert.match(
    compiled.text,
    /COUNT\(DISTINCT part\.manufacturer\)::text AS manufacturer_count/,
  );
  assert.match(
    compiled.text,
    /FROM catalog\.part_categories AS filter_part_category/,
  );
  assert.deepEqual(compiled.values, ["brake-pads", 50]);
  assert.equal(compiled.text.includes("brake-pads"), false);
});

test("rejects unknown fields, sensitive fields, identity fields, and raw SQL", () => {
  for (const input of [
    { ...baseQuery, dimensions: ["organization_id"] },
    {
      ...baseQuery,
      filters: [{ field: "password_hash", operator: "equals", value: "x" }],
    },
    { ...baseQuery, organization_id: "org-b" },
    { ...baseQuery, sql: "SELECT * FROM catalog.part_catalog" },
  ]) {
    assert.equal(validateCubeQuery(input).valid, false);
  }
});

test("rejects incompatible filter values and non-integer model years", () => {
  const badStringNumber = validateCubeQuery({
    ...baseQuery,
    filters: [{ field: "active", operator: "equals", value: "true" }],
  });
  assert.equal(badStringNumber.valid, false);

  const badYear = validateCubeQuery({
    ...baseQuery,
    filters: [{ field: "model_year", operator: "gte", value: 2024.5 }],
  });
  assert.equal(badYear.valid, false);
});

test("rejects duplicate or excessive dimensions, invalid limits, and sorts on unselected fields", () => {
  assert.equal(
    validateCubeQuery({ ...baseQuery, dimensions: ["region", "region"] }).valid,
    false,
  );
  assert.equal(
    validateCubeQuery({
      ...baseQuery,
      dimensions: [
        "manufacturer",
        "region",
        "country",
        "plant",
        "material",
        "commodity",
      ],
    }).valid,
    false,
  );
  assert.equal(validateCubeQuery({ ...baseQuery, limit: 501 }).valid, false);
  assert.equal(
    validateCubeQuery({
      ...baseQuery,
      order_by: [{ field: "region", direction: "asc" }],
    }).valid,
    false,
  );
});

test("compiles category aggregation with distinct parts and bound filter/limit values", () => {
  const compiled = compileCubeQuery({
    ...baseQuery,
    dimensions: ["manufacturer"],
    filters: [{ field: "category", operator: "equals", value: "braking" }],
    order_by: [{ field: "part_count", direction: "desc" }],
    limit: 25,
  });

  assert.match(compiled.text, /COUNT\(DISTINCT part\.id\)/);
  assert.match(
    compiled.text,
    /FROM catalog\.part_categories AS filter_part_category/,
  );
  assert.match(compiled.text, /filter_root\.slug IN \(\$1\)/);
  assert.match(compiled.text, /filter_category\.path <@ filter_root\.path/);
  assert.match(compiled.text, /ORDER BY part_count DESC/);
  assert.match(compiled.text, /LIMIT \$2/);
  assert.deepEqual(compiled.values, ["braking", 25]);
  assert.equal(compiled.text.includes("braking"), false);
});

test("escapes LIKE wildcards while keeping contains values parameterized", () => {
  const compiled = compileCubeQuery({
    ...baseQuery,
    filters: [{ field: "part_name", operator: "contains", value: "brake_%!" }],
  });

  assert.match(compiled.text, /ILIKE \$1 ESCAPE '!'/);
  assert.deepEqual(compiled.values, ["%brake!_!%!!%", 50]);
});

test("executes only inside the supplied authorization context and checks catalog.read", async () => {
  const calls = [];
  const client = {
    async query(text, values) {
      calls.push({ text, values });
      if (calls.length === 1) return { rows: [{ allowed: true }] };
      return { rows: [{ part_count: "4", manufacturer: "Example" }] };
    },
  };

  const result = await executeAuthorizedCubeQuery(baseQuery, (operation) =>
    operation(client),
  );
  assert.deepEqual(calls[0], {
    text: "SELECT security.authz_has_permission($1) AS allowed",
    values: ["catalog.read"],
  });
  assert.match(calls[1].text, /FROM catalog\.part_catalog AS part/);
  assert.deepEqual(result.rows, [{ part_count: "4", manufacturer: "Example" }]);
});

test("tunes category breakdown queries inside the authorized transaction", async () => {
  const calls = [];
  const client = {
    async query(text, values) {
      calls.push({ text, values });
      if (calls.length === 1) return { rows: [{ allowed: true }] };
      if (text.startsWith("SET LOCAL")) return { rows: [] };
      return { rows: [{ part_count: "4", category: "Braking" }] };
    },
  };

  const result = await executeAuthorizedCubeQuery(
    { ...baseQuery, dimensions: ["category"] },
    (operation) => operation(client),
  );

  assert.deepEqual(
    calls.slice(1, 4).map(({ text }) => text),
    [
      "SET LOCAL enable_nestloop = off",
      "SET LOCAL max_parallel_workers_per_gather = 0",
      "SET LOCAL work_mem = '64MB'",
    ],
  );
  assert.match(calls[4].text, /COUNT\(DISTINCT part\.id\)/);
  assert.match(calls[4].text, /JOIN catalog\.part_categories/);
  assert.deepEqual(result.rows, [{ part_count: "4", category: "Braking" }]);
});

test("denies execution without catalog.read and skips the data query", async () => {
  const calls = [];
  const client = {
    async query(text, values) {
      calls.push({ text, values });
      return { rows: [{ allowed: false }] };
    },
  };

  await assert.rejects(
    executeAuthorizedCubeQuery(baseQuery, (operation) => operation(client)),
    CubeQueryAuthorizationError,
  );
  assert.equal(calls.length, 1);
});

test("does not open an authorization context for an invalid query", async () => {
  let contextOpened = false;
  await assert.rejects(
    executeAuthorizedCubeQuery(
      { ...baseQuery, sql: "DELETE FROM catalog.part_catalog" },
      async (operation) => {
        contextOpened = true;
        return operation({ query: async () => ({ rows: [] }) });
      },
    ),
    CubeQueryValidationError,
  );
  assert.equal(contextOpened, false);
});
