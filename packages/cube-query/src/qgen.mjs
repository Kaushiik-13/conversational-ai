import { engineFor } from "./engine.mjs";
import { validateCubeQuery } from "./index.mjs";

const AGGREGATIONS = Object.freeze({
  count_distinct: (expression) => `COUNT(DISTINCT ${expression})::text`,
  sum: (expression) => `SUM(${expression})::text`,
  average: (expression) => `AVG(${expression})::text`,
  minimum: (expression) => `MIN(${expression})::text`,
  maximum: (expression) => `MAX(${expression})::text`,
});

/**
 * Named join strategies. A model document refers to one by name; the SQL lives
 * here, in code, so a document can never carry SQL text.
 */
const STRATEGY_IMPLEMENTATIONS = Object.freeze({
  // Parts belong to categories through a link table; categories form an ltree.
  category_tree: {
    select: () => "category.name",
    join: (alias) => `
  JOIN catalog.part_categories AS part_category
    ON part_category.part_id = ${alias}.id
  JOIN catalog.categories AS category
    ON category.id = part_category.category_id`,
    filter: (alias, filter, values) => {
      const slugs = filter.operator === "in" ? filter.value : [filter.value];
      const placeholders = slugs.map((slug) => pushParameter(values, slug));
      return `EXISTS (
  SELECT 1
  FROM catalog.part_categories AS filter_part_category
  JOIN catalog.categories AS filter_category
    ON filter_category.id = filter_part_category.category_id
  JOIN catalog.categories AS filter_root
    ON filter_root.slug IN (${placeholders.join(", ")})
  WHERE filter_part_category.part_id = ${alias}.id
    AND filter_category.path <@ filter_root.path
)`;
    },
    record: (alias) => `ARRAY(
    SELECT DISTINCT detail_category.name
    FROM catalog.part_categories AS detail_part_category
    JOIN catalog.categories AS detail_category
      ON detail_category.id = detail_part_category.category_id
    WHERE detail_part_category.part_id = ${alias}.id
    ORDER BY detail_category.name
  )`,
    // RLS makes PostgreSQL underestimate the visible part rows and choose a
    // nested loop that revisits millions of category assignments.
    needsPlannerTuning: true,
  },
});

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

function strategyOf(definition) {
  return definition.strategy
    ? STRATEGY_IMPLEMENTATIONS[definition.strategy]
    : undefined;
}

/** SQL expressions for every selectable field of a model, built once. */
function expressionsFor(engine) {
  if (engine.expressions) return engine.expressions;
  const { alias, model } = engine;
  const select = {};
  const record = {};

  for (const [name, measure] of Object.entries(model.measures)) {
    select[name] =
      `${AGGREGATIONS[measure.aggregation](`${alias}.${measure.column}`)}`;
  }
  for (const source of [model.dimensions, model.lookup_fields]) {
    for (const [name, field] of Object.entries(source)) {
      select[name] =
        strategyOf(field)?.select(alias) ?? `${alias}.${field.column}`;
    }
  }
  for (const [name, field] of Object.entries(model.record_fields)) {
    record[name] =
      strategyOf(field)?.record(alias) ?? `${alias}.${field.column}`;
  }

  engine.expressions = Object.freeze({ select, record });
  return engine.expressions;
}

function compileFilter(engine, filter, values) {
  const definition = engine.filterFields.get(filter.field).definition;
  const strategy = strategyOf(definition);
  if (strategy) return strategy.filter(engine.alias, filter, values);

  const expression = expressionsFor(engine).select[filter.field];
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

/** The joins a query needs: one per distinct strategy among its dimensions. */
function joinsFor(engine, query) {
  if (query.mode === "records") return "";
  const joins = new Set();
  for (const name of query.dimensions) {
    const definition = engine.model.dimensions[name];
    const strategy = strategyOf(definition);
    if (strategy?.join) joins.add(strategy.join(engine.alias));
  }
  return [...joins].join("");
}

/**
 * Compile a validated Cube Query to a parameterized read-only SELECT.
 * @param {unknown} input
 * @param {object} model the semantic model document to compile against
 * @returns {{ text: string, values: unknown[], query: object }}
 */
export function compileCubeQuery(input, model) {
  const engine = engineFor(model);
  const result = validateCubeQuery(input, model);
  if (!result.valid) throw new CubeQueryValidationError(result.errors);

  const { query } = result;
  const { select: selectExpressions, record: recordExpressions } =
    expressionsFor(engine);
  const values = [];
  const selected =
    query.mode === "records"
      ? query.fields.map((field) => `${recordExpressions[field]} AS ${field}`)
      : [
          ...query.measures.map(
            (measure) => `${selectExpressions[measure]} AS ${measure}`,
          ),
          ...query.dimensions.map(
            (dimension) => `${selectExpressions[dimension]} AS ${dimension}`,
          ),
        ];
  const joins = joinsFor(engine, query);
  const predicates = query.filters.map((filter) =>
    compileFilter(engine, filter, values),
  );
  const whereClause =
    predicates.length > 0 ? `\nWHERE ${predicates.join("\n  AND ")}` : "";
  const groupBy =
    query.mode === "records"
      ? ""
      : query.dimensions.length > 0
        ? `\nGROUP BY ${query.dimensions.map((dimension) => selectExpressions[dimension]).join(", ")}`
        : "";
  const orderBy =
    query.order_by?.length > 0
      ? `\nORDER BY ${query.order_by
          .map(({ field, direction }) => `${field} ${direction.toUpperCase()}`)
          .join(", ")}`
      : "";
  const limit = pushParameter(values, query.limit);

  return {
    text: `SELECT ${selected.join(", ")}\nFROM ${engine.table} AS ${engine.alias}${joins ? `\n${joins}` : ""}${whereClause}${groupBy}${orderBy}\nLIMIT ${limit}`,
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
 * @param {object} model the semantic model document to compile against
 */
export async function executeAuthorizedCubeQuery(
  input,
  runInAuthorizationContext,
  model,
) {
  if (typeof runInAuthorizationContext !== "function") {
    throw new TypeError("A trusted authorization-context runner is required.");
  }

  const engine = engineFor(model);
  const compiled = compileCubeQuery(input, model);
  return runInAuthorizationContext(async (client) => {
    const authorization = await client.query(
      "SELECT security.authz_has_permission($1) AS allowed",
      [engine.requiredPermission],
    );
    if (authorization.rows[0]?.allowed !== true) {
      throw new CubeQueryAuthorizationError();
    }
    const needsTuning =
      compiled.query.mode !== "records" &&
      compiled.query.dimensions.some(
        (name) => strategyOf(model.dimensions[name])?.needsPlannerTuning,
      );
    if (needsTuning) {
      // Keep this tuning transaction-local and scoped to the queries that need it.
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
