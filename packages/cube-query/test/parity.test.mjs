import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { validateCubeQuery } from "../src/index.mjs";
import { compileCubeQuery } from "../src/qgen.mjs";
import { automotiveModel } from "./helpers.mjs";

/**
 * The snapshot was recorded from the original hard-coded engine, before the
 * query engine became model-driven. Every validation result, error message
 * and generated SQL text must still match byte for byte.
 */
const snapshot = JSON.parse(
  readFileSync(
    new URL("./fixtures/legacy-engine-snapshot.json", import.meta.url),
    "utf8",
  ),
);
const model = automotiveModel();

test("the snapshot covers valid and invalid queries across every area", () => {
  const valid = snapshot.entries.filter((entry) => entry.validation.valid);
  assert.ok(snapshot.entries.length >= 450);
  assert.ok(valid.length >= 300);
  assert.ok(snapshot.entries.length - valid.length >= 100);
});

for (const entry of snapshot.entries) {
  test(`parity: ${entry.name}`, () => {
    const validation = validateCubeQuery(entry.input, model);
    assert.deepEqual(validation, entry.validation);

    if (entry.validation.valid) {
      const compiled = compileCubeQuery(entry.input, model);
      assert.equal(compiled.text, entry.sql.text);
      assert.deepEqual(compiled.values, entry.sql.values);
    } else {
      assert.throws(
        () => compileCubeQuery(entry.input, model),
        (error) =>
          error.name === entry.compile.name &&
          error.code === entry.compile.code &&
          JSON.stringify(error.errors) === JSON.stringify(entry.compile.errors),
      );
    }
  });
}
