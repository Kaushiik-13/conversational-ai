import { createHash } from "node:crypto";

/**
 * Semantic model documents.
 *
 * A model document describes one data source for the query engine: which
 * table it reads, which measures, dimensions and fields exist, and which of
 * them are guarded by role-based field access. Documents hold structured
 * definitions (table, column, aggregation), never SQL text, so that an edited
 * document cannot inject SQL. Special joins are named strategies implemented
 * in code.
 */

export const MODEL_SCHEMA_VERSION = 1;

/** Named strategies the SQL compiler implements. */
export const STRATEGIES = Object.freeze(new Set(["category_tree"]));

/** Schemas a model of each source kind may read. */
export const ALLOWED_SCHEMAS = Object.freeze({
  application_database: new Set(["catalog"]),
});

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
const TABLE = /^([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)$/;
const MODEL_CODE = /^[a-z][a-z0-9_]{1,62}$/;
const ACCESS_RESOURCE = /^[a-z][a-z0-9_.]{1,126}$/;
const ACCESS_FIELD = /^[a-z][a-zA-Z0-9_.]{0,126}$/;
const AGGREGATIONS = new Set([
  "count_distinct",
  "sum",
  "average",
  "minimum",
  "maximum",
]);
const TYPES = new Set([
  "string",
  "integer",
  "number",
  "boolean",
  "timestamp",
  "string[]",
]);
const TOP_LEVEL_KEYS = new Set([
  "schema_version",
  "model",
  "description",
  "source",
  "authorization",
  "measures",
  "dimensions",
  "lookup_fields",
  "record_fields",
  "excluded_fields",
  "limits",
]);
const LIMIT_KEYS = new Set([
  "max_dimensions_per_query",
  "max_filters_per_query",
  "default_result_limit",
  "max_result_limit",
  "max_record_fields",
  "max_record_rows",
]);

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function columnOf(expression, alias, label) {
  const match = new RegExp(`^${alias}\\.([a-z_][a-z0-9_]*)$`).exec(expression);
  if (!match) {
    throw new Error(
      `${label}: expression '${expression}' is not a plain column of '${alias}'.`,
    );
  }
  return match[1];
}

function pick(source, keys) {
  const result = {};
  for (const key of keys) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

/**
 * Convert the reviewed YAML semantic definition (semantic/automotive/catalog.yaml)
 * into a version 1 model document.
 * @param {Record<string, any>} legacy parsed YAML
 */
export function convertLegacyModel(legacy) {
  const alias = legacy.source.alias;
  const document = {
    schema_version: MODEL_SCHEMA_VERSION,
    model: legacy.model,
    description: legacy.description?.trim(),
    source: {
      table: `${legacy.source.schema}.${legacy.source.table}`,
      alias,
      grain: legacy.source.grain,
    },
    authorization: {
      require_permission: legacy.authorization.require_permission,
    },
    measures: {},
    dimensions: {},
    lookup_fields: {},
    record_fields: {},
    excluded_fields: [...legacy.excluded_fields],
    limits: { ...legacy.limits },
  };
  delete document.limits.read_only;

  for (const [name, measure] of Object.entries(legacy.measures)) {
    document.measures[name] = {
      ...pick(measure, ["description", "aggregation", "access"]),
      column: columnOf(measure.expression, alias, `measure ${name}`),
    };
  }

  for (const [name, dimension] of Object.entries(legacy.dimensions)) {
    const converted = pick(dimension, [
      "description",
      "type",
      "groupable",
      "filterable",
      "aliases",
      "known_values",
      "synonyms",
      "access",
    ]);
    if (dimension.join) converted.strategy = "category_tree";
    else {
      converted.column = columnOf(
        dimension.expression,
        alias,
        `dimension ${name}`,
      );
    }
    document.dimensions[name] = converted;
  }

  for (const [name, field] of Object.entries(legacy.lookup_fields)) {
    document.lookup_fields[name] = {
      ...pick(field, [
        "description",
        "filterable",
        "groupable",
        "aliases",
        "access",
      ]),
      type: field.type ?? "string",
      column: columnOf(field.expression, alias, `lookup field ${name}`),
    };
  }

  for (const [name, field] of Object.entries(legacy.record_fields)) {
    const converted = pick(field, ["description", "type", "access"]);
    if (name === "category") converted.strategy = "category_tree";
    else converted.column = name;
    document.record_fields[name] = converted;
  }

  return document;
}

function checkAccess(access, path, errors) {
  if (access === undefined) return;
  if (
    !isRecord(access) ||
    !ACCESS_RESOURCE.test(access.resource_type ?? "") ||
    !ACCESS_FIELD.test(access.field_name ?? "")
  ) {
    errors.push({
      path,
      message:
        "access must be { resource_type, field_name } with valid identifiers.",
    });
  }
}

function checkField(name, field, path, errors, { allowStrategy }) {
  if (!IDENTIFIER.test(name)) {
    errors.push({ path, message: `'${name}' is not a valid field key.` });
  }
  if (!isRecord(field)) {
    errors.push({ path, message: "Field definition must be an object." });
    return;
  }
  const hasColumn = field.column !== undefined;
  const hasStrategy = field.strategy !== undefined;
  if (hasColumn === hasStrategy) {
    errors.push({
      path,
      message: "Provide exactly one of 'column' or 'strategy'.",
    });
  }
  if (hasColumn && !IDENTIFIER.test(field.column)) {
    errors.push({ path: `${path}.column`, message: "Invalid column name." });
  }
  if (hasStrategy && (!allowStrategy || !STRATEGIES.has(field.strategy))) {
    errors.push({
      path: `${path}.strategy`,
      message: `Unknown strategy '${field.strategy}'.`,
    });
  }
  if (!TYPES.has(field.type)) {
    errors.push({ path: `${path}.type`, message: "Unsupported field type." });
  }
  checkAccess(field.access, `${path}.access`, errors);
}

/**
 * Validate a model document before it is stored or published.
 * @param {unknown} document
 * @param {{ sourceKind?: string }} [options]
 * @returns {{ valid: boolean, errors: Array<{ path: string, message: string }> }}
 */
export function validateModelDocument(
  document,
  { sourceKind = "application_database" } = {},
) {
  const errors = [];
  if (!isRecord(document)) {
    return {
      valid: false,
      errors: [{ path: "$", message: "Model must be an object." }],
    };
  }

  for (const key of Object.keys(document)) {
    if (!TOP_LEVEL_KEYS.has(key)) {
      errors.push({ path: `$.${key}`, message: "Unknown property." });
    }
  }
  if (document.schema_version !== MODEL_SCHEMA_VERSION) {
    errors.push({ path: "$.schema_version", message: "Must be 1." });
  }
  if (!MODEL_CODE.test(document.model ?? "")) {
    errors.push({ path: "$.model", message: "Invalid model code." });
  }

  const source = document.source;
  const tableMatch = TABLE.exec(source?.table ?? "");
  if (!tableMatch) {
    errors.push({ path: "$.source.table", message: "Use schema.table." });
  } else if (!ALLOWED_SCHEMAS[sourceKind]?.has(tableMatch[1])) {
    errors.push({
      path: "$.source.table",
      message: `Schema '${tableMatch[1]}' is not allowed for ${sourceKind}.`,
    });
  }
  if (!IDENTIFIER.test(source?.alias ?? "")) {
    errors.push({ path: "$.source.alias", message: "Invalid alias." });
  }

  for (const [name, measure] of Object.entries(document.measures ?? {})) {
    const path = `$.measures.${name}`;
    if (!IDENTIFIER.test(name)) {
      errors.push({ path, message: "Invalid measure key." });
    }
    if (!AGGREGATIONS.has(measure?.aggregation)) {
      errors.push({
        path: `${path}.aggregation`,
        message: "Unsupported aggregation.",
      });
    }
    if (!IDENTIFIER.test(measure?.column ?? "")) {
      errors.push({ path: `${path}.column`, message: "Invalid column name." });
    }
    checkAccess(measure?.access, `${path}.access`, errors);
  }
  if (Object.keys(document.measures ?? {}).length === 0) {
    errors.push({ path: "$.measures", message: "At least one measure." });
  }

  for (const [name, field] of Object.entries(document.dimensions ?? {})) {
    checkField(name, field, `$.dimensions.${name}`, errors, {
      allowStrategy: true,
    });
    if (typeof field?.groupable !== "boolean") {
      errors.push({
        path: `$.dimensions.${name}.groupable`,
        message: "Must be true or false.",
      });
    }
    if (typeof field?.filterable !== "boolean") {
      errors.push({
        path: `$.dimensions.${name}.filterable`,
        message: "Must be true or false.",
      });
    }
  }
  for (const [name, field] of Object.entries(document.lookup_fields ?? {})) {
    checkField(name, field, `$.lookup_fields.${name}`, errors, {
      allowStrategy: false,
    });
  }
  for (const [name, field] of Object.entries(document.record_fields ?? {})) {
    checkField(name, field, `$.record_fields.${name}`, errors, {
      allowStrategy: true,
    });
  }

  for (const entry of document.excluded_fields ?? []) {
    if (!IDENTIFIER.test(entry)) {
      errors.push({
        path: "$.excluded_fields",
        message: `'${entry}' is not a valid field key.`,
      });
    }
  }

  const limits = document.limits;
  if (!isRecord(limits)) {
    errors.push({ path: "$.limits", message: "limits is required." });
  } else {
    for (const [key, value] of Object.entries(limits)) {
      if (!LIMIT_KEYS.has(key) || !Number.isInteger(value) || value < 1) {
        errors.push({
          path: `$.limits.${key}`,
          message: "Unknown limit or not a positive integer.",
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** SHA-256 of the document with sorted keys, independent of key order. */
export function modelChecksum(document) {
  return createHash("sha256").update(canonicalize(document)).digest("hex");
}
