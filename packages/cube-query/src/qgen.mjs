import { validateCubeQuery } from "./index.mjs";

const SELECT_EXPRESSIONS = Object.freeze({
  part_count: "COUNT(DISTINCT part.id)::text",
  manufacturer_count: "COUNT(DISTINCT part.manufacturer)::text",
  total_cost_usd: "SUM(part.cost_usd)::text",
  average_cost_usd: "AVG(part.cost_usd)::text",
  min_cost_usd: "MIN(part.cost_usd)::text",
  max_cost_usd: "MAX(part.cost_usd)::text",
  total_weight_kg: "SUM(part.weight_kg)::text",
  average_weight_kg: "AVG(part.weight_kg)::text",
  min_weight_kg: "MIN(part.weight_kg)::text",
  max_weight_kg: "MAX(part.weight_kg)::text",
  manufacturer: "part.manufacturer",
  commodity: "part.commodity",
  sub_commodity: "part.sub_commodity",
  vehicle_program: "part.vehicle_program",
  region: "part.region",
  country: "part.country",
  plant: "part.plant",
  model_year: "part.model_year",
  lifecycle_status: "part.lifecycle_status",
  active: "part.active",
  category: "category.name",
  material: "part.material",
  supplier_status: "part.supplier_status",
  cost_usd: "part.cost_usd",
  weight_kg: "part.weight_kg",
  document_version: "part.document_version",
  description: "part.description",
  part_number: "part.part_number",
  part_name: "part.part_name",
  created_at: "part.created_at",
  updated_at: "part.updated_at",
});

const FILTER_EXPRESSIONS = Object.freeze({
  ...SELECT_EXPRESSIONS,
});

const RECORD_EXPRESSIONS = Object.freeze({
  part_number: "part.part_number",
  part_name: "part.part_name",
  description: "part.description",
  commodity: "part.commodity",
  sub_commodity: "part.sub_commodity",
  manufacturer: "part.manufacturer",
  vehicle_program: "part.vehicle_program",
  region: "part.region",
  country: "part.country",
  plant: "part.plant",
  model_year: "part.model_year",
  material: "part.material",
  lifecycle_status: "part.lifecycle_status",
  supplier_status: "part.supplier_status",
  cost_usd: "part.cost_usd",
  weight_kg: "part.weight_kg",
  active: "part.active",
  document_version: "part.document_version",
  created_at: "part.created_at",
  updated_at: "part.updated_at",
  category: `ARRAY(
    SELECT DISTINCT detail_category.name
    FROM catalog.part_categories AS detail_part_category
    JOIN catalog.categories AS detail_category
      ON detail_category.id = detail_part_category.category_id
    WHERE detail_part_category.part_id = part.id
    ORDER BY detail_category.name
  )`,
});

const CATEGORY_JOIN = `
  JOIN catalog.part_categories AS part_category
    ON part_category.part_id = part.id
  JOIN catalog.categories AS category
    ON category.id = part_category.category_id`;

export class CubeQueryValidationError extends Error {
  constructor(errors) {
    super("Cube Query is invalid.");
    this.name = "CubeQueryValidationError";
    this.code = "INVALID_CUBE_QUERY";
    this.errors = errors;
  }
}

export class CubeQueryAuthorizationError extends Error {
  constructor() {
    super("The active role cannot read automotive catalog data.");
    this.name = "CubeQueryAuthorizationError";
    this.code = "ACCESS_DENIED";
  }
}

function escapeLikeValue(value) {
  return value.replace(/[!%_]/g, (character) => `!${character}`);
}

function pushParameter(values, value) {
  values.push(value);
  return `$${values.length}`;
}

function compileFilter(filter, values) {
  if (filter.field === "category") {
    const slugs = filter.operator === "in" ? filter.value : [filter.value];
    const placeholders = slugs.map((slug) => pushParameter(values, slug));
    return `EXISTS (
  SELECT 1
  FROM catalog.part_categories AS filter_part_category
  JOIN catalog.categories AS filter_category
    ON filter_category.id = filter_part_category.category_id
  JOIN catalog.categories AS filter_root
    ON filter_root.slug IN (${placeholders.join(", ")})
  WHERE filter_part_category.part_id = part.id
    AND filter_category.path <@ filter_root.path
)`;
  }

  const expression = FILTER_EXPRESSIONS[filter.field];
  if (filter.operator === "in") {
    const placeholders = filter.value.map((value) =>
      pushParameter(values, value),
    );
    return `${expression} IN (${placeholders.join(", ")})`;
  }
  if (filter.operator === "contains") {
    const pattern = `%${escapeLikeValue(filter.value)}%`;
    const placeholder = pushParameter(values, pattern);
    return `${expression} ILIKE ${placeholder} ESCAPE '!'`;
  }

  const operators = Object.freeze({
    equals: "=",
    gt: ">",
    gte: ">=",
    lt: "<",
    lte: "<=",
  });
  const sqlOperator = operators[filter.operator];
  const placeholder = pushParameter(values, filter.value);
  return `${expression} ${sqlOperator} ${placeholder}`;
}

/**
 * Compile a validated Cube Query to a parameterized read-only SELECT.
 * @param {unknown} input
 * @returns {{ text: string, values: unknown[], query: object }}
 */
export function compileCubeQuery(input) {
  const result = validateCubeQuery(input);
  if (!result.valid) throw new CubeQueryValidationError(result.errors);

  const { query } = result;
  const usesCategory =
    query.mode !== "records" && query.dimensions.includes("category");
  const values = [];
  const selected =
    query.mode === "records"
      ? query.fields.map((field) => `${RECORD_EXPRESSIONS[field]} AS ${field}`)
      : [
          ...query.measures.map(
            (measure) => `${SELECT_EXPRESSIONS[measure]} AS ${measure}`,
          ),
          ...query.dimensions.map(
            (dimension) => `${SELECT_EXPRESSIONS[dimension]} AS ${dimension}`,
          ),
        ];
  const joins = usesCategory ? CATEGORY_JOIN : "";
  const predicates = query.filters.map((filter) =>
    compileFilter(filter, values),
  );
  const whereClause =
    predicates.length > 0 ? `\nWHERE ${predicates.join("\n  AND ")}` : "";
  const groupBy =
    query.mode === "records"
      ? ""
      : query.dimensions.length > 0
        ? `\nGROUP BY ${query.dimensions.map((dimension) => SELECT_EXPRESSIONS[dimension]).join(", ")}`
        : "";
  const orderBy =
    query.order_by?.length > 0
      ? `\nORDER BY ${query.order_by
          .map(({ field, direction }) => `${field} ${direction.toUpperCase()}`)
          .join(", ")}`
      : "";
  const limit = pushParameter(values, query.limit);

  const distinct = "";
  return {
    text: `SELECT ${distinct}${selected.join(", ")}\nFROM catalog.part_catalog AS part${joins ? `\n${joins}` : ""}${whereClause}${groupBy}${orderBy}\nLIMIT ${limit}`,
    values,
    query,
  };
}

/**
 * Execute a Cube Query inside the application's trusted authorization context.
 * The callback must be bound to DatabaseService.withAuthorizationContext and
 * the authenticated session; never pass an organization or role from the LLM.
 * @param {unknown} input
 * @param {(operation: (client: { query: Function }) => Promise<unknown>) => Promise<unknown>} runInAuthorizationContext
 */
export async function executeAuthorizedCubeQuery(
  input,
  runInAuthorizationContext,
) {
  if (typeof runInAuthorizationContext !== "function") {
    throw new TypeError("A trusted authorization-context runner is required.");
  }

  const compiled = compileCubeQuery(input);
  return runInAuthorizationContext(async (client) => {
    const authorization = await client.query(
      "SELECT security.authz_has_permission($1) AS allowed",
      ["catalog.read"],
    );
    if (authorization.rows[0]?.allowed !== true) {
      throw new CubeQueryAuthorizationError();
    }
    if (compiled.query.dimensions.includes("category")) {
      // RLS makes PostgreSQL underestimate the visible part rows and choose a
      // nested loop that revisits millions of category assignments. Keep this
      // tuning transaction-local and scoped to category breakdowns only.
      await client.query("SET LOCAL enable_nestloop = off");
      await client.query("SET LOCAL max_parallel_workers_per_gather = 0");
      await client.query("SET LOCAL work_mem = '64MB'");
    }
    const result = await client.query(compiled.text, compiled.values);
    return {
      query: compiled.query,
      rows: result.rows,
    };
  });
}
