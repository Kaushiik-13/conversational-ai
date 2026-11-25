import assert from "node:assert/strict";
import { test } from "node:test";
import { validateCubeQuery } from "../src/index.mjs";
import {
  CubeQueryAuthorizationError,
  compileCubeQuery,
  executeAuthorizedCubeQuery,
} from "../src/qgen.mjs";
import { automotiveModel } from "./helpers.mjs";

/** A different model over the same table: other names, other limits. */
function tinyModel() {
  return {
    schema_version: 1,
    model: "tiny_model",
    source: { table: "catalog.part_catalog", alias: "p" },
    authorization: { require_permission: "reports.read" },
    measures: {
      item_count: { aggregation: "count_distinct", column: "id" },
      spend: { aggregation: "sum", column: "cost_usd" },
    },
    dimensions: {
      maker: {
        column: "manufacturer",
        type: "string",
        groupable: true,
        filterable: true,
      },
      year: {
        column: "model_year",
        type: "integer",
        groupable: true,
        filterable: true,
      },
      kind: {
        strategy: "category_tree",
        type: "string",
        groupable: true,
        filterable: true,
      },
    },
    lookup_fields: {},
    record_fields: { maker: { column: "manufacturer", type: "string" } },
    excluded_fields: [],
    limits: {
      max_dimensions_per_query: 2,
      max_filters_per_query: 3,
      default_result_limit: 5,
      max_result_limit: 20,
      max_record_fields: 4,
      max_record_rows: 10,
    },
  };
}
const query = (extra = {}) => ({
  version: 1,
  model: "tiny_model",
  measures: ["item_count"],
  dimensions: [],
  filters: [],
  ...extra,
});

test("a model defines which fields exist", () => {
  const model = tinyModel();
  assert.equal(
    validateCubeQuery(query({ dimensions: ["maker"] }), model).valid,
    true,
  );
  assert.equal(
    validateCubeQuery(query({ dimensions: ["manufacturer"] }), model).valid,
    false,
  );
  assert.equal(
    validateCubeQuery(query({ measures: ["part_count"] }), model).valid,
    false,
  );
});

test("the model code, limits and defaults come from the model", () => {
  const model = tinyModel();
  assert.equal(validateCubeQuery(query(), model).query.limit, 5);
  assert.equal(validateCubeQuery(query({ limit: 21 }), model).valid, false);
  assert.equal(validateCubeQuery(query({ limit: 20 }), model).valid, true);
  assert.equal(
    validateCubeQuery(query({ dimensions: ["maker", "year", "kind"] }), model)
      .valid,
    false,
  );
  assert.equal(
    validateCubeQuery(query({ model: "automotive_catalog" }), model).valid,
    false,
  );
  const records = {
    version: 1,
    model: "tiny_model",
    mode: "records",
    fields: ["maker"],
    filters: [],
    limit: 11,
  };
  assert.equal(validateCubeQuery(records, model).valid, false);
});

test("SQL is built from the model's table, alias and columns", () => {
  const compiled = compileCubeQuery(
    query({
      measures: ["spend"],
      dimensions: ["maker"],
      filters: [{ field: "year", operator: "gte", value: 2020 }],
    }),
    tinyModel(),
  );
  assert.equal(
    compiled.text,
    "SELECT SUM(p.cost_usd)::text AS spend, p.manufacturer AS maker\n" +
      "FROM catalog.part_catalog AS p\n" +
      "WHERE p.model_year >= $1\n" +
      "GROUP BY p.manufacturer\n" +
      "LIMIT $2",
  );
  assert.deepEqual(compiled.values, [2020, 5]);
});

test("strategies use the model's alias", () => {
  const compiled = compileCubeQuery(
    query({
      dimensions: ["kind"],
      filters: [{ field: "kind", operator: "equals", value: "brake-pads" }],
    }),
    tinyModel(),
  );
  assert.match(compiled.text, /part_category\.part_id = p\.id/);
  assert.match(compiled.text, /filter_part_category\.part_id = p\.id/);
  assert.doesNotMatch(compiled.text, /part\.id/);
});

test("removing a field from the model makes it unavailable", () => {
  const model = automotiveModel();
  const restricted = structuredClone(model);
  for (const name of [
    "total_cost_usd",
    "average_cost_usd",
    "min_cost_usd",
    "max_cost_usd",
  ]) {
    delete restricted.measures[name];
  }
  delete restricted.dimensions.cost_usd;
  delete restricted.record_fields.cost_usd;
  const ask = {
    version: 1,
    model: "automotive_catalog",
    measures: ["total_cost_usd"],
    dimensions: [],
    filters: [],
  };
  assert.equal(validateCubeQuery(ask, model).valid, true);
  assert.equal(validateCubeQuery(ask, restricted).valid, false);
  assert.equal(
    validateCubeQuery(
      { ...ask, measures: ["part_count"], dimensions: ["cost_usd"] },
      restricted,
    ).valid,
    false,
  );
});

test("the permission to check comes from the model", async () => {
  const asked = [];
  const run = (operation) =>
    operation({
      query: async (text, values) => {
        asked.push(values);
        return { rows: [{ allowed: false }] };
      },
    });
  await assert.rejects(
    () => executeAuthorizedCubeQuery(query(), run, tinyModel()),
    CubeQueryAuthorizationError,
  );
  assert.deepEqual(asked, [["reports.read"]]);
});

test("a model is required and must be valid", () => {
  assert.throws(() => validateCubeQuery(query()), TypeError);
  assert.throws(() => compileCubeQuery(query(), undefined), TypeError);
  const broken = tinyModel();
  broken.measures.item_count.column = "id; DROP TABLE x";
  assert.throws(() => compileCubeQuery(query(), broken), TypeError);
  const missingLimit = tinyModel();
  delete missingLimit.limits.max_result_limit;
  assert.throws(() => validateCubeQuery(query(), missingLimit), TypeError);
});
