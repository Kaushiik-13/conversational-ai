import { validateModelDocument } from "./model.mjs";

/**
 * Turns a semantic model document into the lookup structures that validation
 * and SQL compilation use. Built once per document and cached; documents are
 * treated as immutable (a published model version never changes).
 */

const STRING_OPERATORS = new Set(["equals", "in", "contains"]);
const CATEGORY_OPERATORS = new Set(["equals", "in"]);
const NUMBER_OPERATORS = new Set(["equals", "in", "gt", "gte", "lt", "lte"]);
const DATE_OPERATORS = new Set(["equals", "in", "gt", "gte", "lt", "lte"]);
const BOOLEAN_OPERATORS = new Set(["equals", "in"]);

const cache = new WeakMap();

/** What a filter on one field accepts. */
function filterRules(field) {
  if (field.strategy === "category_tree") {
    return {
      operators: CATEGORY_OPERATORS,
      expectedType: "string",
      slug: true,
    };
  }
  switch (field.type) {
    case "string":
      return { operators: STRING_OPERATORS, expectedType: "string" };
    case "integer":
      return {
        operators: NUMBER_OPERATORS,
        expectedType: "number",
        integer: true,
      };
    case "number":
      return { operators: NUMBER_OPERATORS, expectedType: "number" };
    case "timestamp":
      return { operators: DATE_OPERATORS, expectedType: "string", date: true };
    case "boolean":
      return { operators: BOOLEAN_OPERATORS, expectedType: "boolean" };
    default:
      return null;
  }
}

/**
 * @param {object} model a semantic model document (version 1)
 */
export function engineFor(model) {
  if (model === null || typeof model !== "object") {
    throw new TypeError("A semantic model document is required.");
  }
  const cached = cache.get(model);
  if (cached) return cached;

  const check = validateModelDocument(model);
  if (!check.valid) {
    const error = new TypeError("The semantic model document is not valid.");
    error.errors = check.errors;
    throw error;
  }

  const { measures, dimensions, lookup_fields, record_fields, limits } = model;
  const groupable = (entries) =>
    Object.entries(entries)
      .filter(([, field]) => field.groupable)
      .map(([name]) => name);

  const filterFields = new Map();
  for (const source of [dimensions, lookup_fields]) {
    for (const [name, field] of Object.entries(source)) {
      if (!field.filterable) continue;
      const rules = filterRules(field);
      if (rules) filterFields.set(name, { ...rules, definition: field });
    }
  }

  const measureNames = new Set(Object.keys(measures));
  const dimensionNames = new Set(groupable(dimensions));
  const detailFields = new Set(Object.keys(record_fields));

  const engine = {
    model,
    code: model.model,
    alias: model.source.alias,
    table: model.source.table,
    requiredPermission: model.authorization?.require_permission,
    measures: measureNames,
    dimensions: dimensionNames,
    detailFields,
    filterFields,
    sortFields: new Set([...dimensionNames, ...measureNames, ...detailFields]),
    limits: {
      maxDimensions: limits.max_dimensions_per_query,
      maxFilters: limits.max_filters_per_query,
      defaultLimit: limits.default_result_limit,
      maxLimit: limits.max_result_limit,
      maxRecordFields: limits.max_record_fields,
      maxRecordRows: limits.max_record_rows,
    },
  };
  cache.set(model, engine);
  return engine;
}
