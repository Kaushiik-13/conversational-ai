import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import {
  convertLegacyModel,
  modelChecksum,
  validateModelDocument,
} from "../src/model.mjs";

const sourcePath = fileURLToPath(
  new URL("../../../semantic/automotive/catalog.yaml", import.meta.url),
);
const legacy = () => parse(readFileSync(sourcePath, "utf8"));
const converted = () => convertLegacyModel(legacy());

test("the automotive definition converts to a valid version 1 document", () => {
  const document = converted();
  const result = validateModelDocument(document);
  assert.deepEqual(result.errors, []);
  assert.equal(document.schema_version, 1);
  assert.equal(document.model, "automotive_catalog");
  assert.equal(document.source.table, "catalog.part_catalog");
  assert.equal(Object.keys(document.measures).length, 10);
  assert.equal(Object.keys(document.dimensions).length, 16);
});

test("documents hold columns and strategies, never SQL text", () => {
  const document = converted();
  assert.equal(document.measures.total_cost_usd.column, "cost_usd");
  assert.equal(document.dimensions.region.column, "region");
  assert.equal(document.dimensions.category.strategy, "category_tree");
  assert.equal(document.dimensions.category.column, undefined);
  assert.equal(document.record_fields.category.strategy, "category_tree");
  assert.doesNotMatch(JSON.stringify(document), /part\.[a-z_]|SELECT|JOIN/i);
});

test("sensitive fields carry their field access mapping", () => {
  const document = converted();
  const cost = { resource_type: "catalog.part", field_name: "costUsd" };
  const supplier = {
    resource_type: "catalog.part",
    field_name: "supplierStatus",
  };
  for (const measure of [
    "total_cost_usd",
    "average_cost_usd",
    "min_cost_usd",
    "max_cost_usd",
  ]) {
    assert.deepEqual(document.measures[measure].access, cost);
  }
  assert.deepEqual(document.dimensions.cost_usd.access, cost);
  assert.deepEqual(document.record_fields.cost_usd.access, cost);
  assert.deepEqual(document.dimensions.supplier_status.access, supplier);
  assert.deepEqual(document.record_fields.supplier_status.access, supplier);
  assert.equal(document.dimensions.region.access, undefined);
});

test("rejects SQL placed in a column", () => {
  const document = converted();
  document.dimensions.region.column = "region; DROP TABLE x";
  const result = validateModelDocument(document);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.path === "$.dimensions.region.column"));
});

test("rejects unknown strategies, aggregations and schemas", () => {
  const strategy = converted();
  strategy.dimensions.category.strategy = "raw_sql";
  assert.equal(validateModelDocument(strategy).valid, false);

  const aggregation = converted();
  aggregation.measures.part_count.aggregation = "median";
  assert.equal(validateModelDocument(aggregation).valid, false);

  const schema = converted();
  schema.source.table = "security.user_credentials";
  const result = validateModelDocument(schema);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.path === "$.source.table"));
});

test("rejects a field with both or neither of column and strategy", () => {
  const both = converted();
  both.dimensions.category.column = "name";
  assert.equal(validateModelDocument(both).valid, false);
  const neither = converted();
  delete neither.dimensions.region.column;
  assert.equal(validateModelDocument(neither).valid, false);
});

test("rejects unknown top-level properties and bad limits", () => {
  const extra = converted();
  extra.sql = "SELECT 1";
  assert.equal(validateModelDocument(extra).valid, false);
  const limits = converted();
  limits.limits.max_result_limit = 0;
  assert.equal(validateModelDocument(limits).valid, false);
});

test("rejects malformed access mappings", () => {
  const document = converted();
  document.measures.total_cost_usd.access = { resource_type: "x" };
  assert.equal(validateModelDocument(document).valid, false);
});

test("checksum ignores key order and changes with content", () => {
  const document = converted();
  const reverseKeys = (value) =>
    Array.isArray(value)
      ? value.map(reverseKeys)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .reverse()
              .map((key) => [key, reverseKeys(value[key])]),
          )
        : value;
  const reordered = reverseKeys(document);
  assert.notEqual(JSON.stringify(reordered), JSON.stringify(document));
  assert.equal(modelChecksum(document), modelChecksum(reordered));
  const changed = converted();
  changed.limits.max_result_limit = 499;
  assert.notEqual(modelChecksum(document), modelChecksum(changed));
  assert.match(modelChecksum(document), /^[0-9a-f]{64}$/);
});

test("the committed automotive model fixture matches the YAML conversion", async () => {
  const { readFileSync } = await import("node:fs");
  const fixture = JSON.parse(
    readFileSync(
      new URL("./fixtures/automotive-model.json", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(
    fixture,
    converted(),
    "Regenerate packages/cube-query/test/fixtures/automotive-model.json from semantic/automotive/catalog.yaml.",
  );
});
