import { validateCubeQuery } from './index.mjs';

const SELECT_EXPRESSIONS = Object.freeze({
  part_count: 'COUNT(DISTINCT part.id)::text',
  manufacturer: 'part.manufacturer',
  commodity: 'part.commodity',
  sub_commodity: 'part.sub_commodity',
  vehicle_program: 'part.vehicle_program',
  region: 'part.region',
  country: 'part.country',
  plant: 'part.plant',
  model_year: 'part.model_year',
  lifecycle_status: 'part.lifecycle_status',
  active: 'part.active',
  category: 'category.name',
});

const FILTER_EXPRESSIONS = Object.freeze({
  ...SELECT_EXPRESSIONS,
  part_number: 'part.part_number',
  part_name: 'part.part_name',
});

const CATEGORY_JOIN = `
  JOIN catalog.part_categories AS part_category
    ON part_category.part_id = part.id
  JOIN catalog.categories AS category
    ON category.id = part_category.category_id`;

export class CubeQueryValidationError extends Error {
  constructor(errors) {
    super('Cube Query is invalid.');
    this.name = 'CubeQueryValidationError';
    this.code = 'INVALID_CUBE_QUERY';
    this.errors = errors;
  }
}

export class CubeQueryAuthorizationError extends Error {
  constructor() {
    super('The active role cannot read automotive catalog data.');
    this.name = 'CubeQueryAuthorizationError';
    this.code = 'ACCESS_DENIED';
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
  if (filter.field === 'category') {
    const slugs = filter.operator === 'in' ? filter.value : [filter.value];
    const placeholders = slugs.map((slug) => pushParameter(values, slug));
    return `EXISTS (
  SELECT 1
  FROM catalog.part_categories AS filter_part_category
  JOIN catalog.categories AS filter_category
    ON filter_category.id = filter_part_category.category_id
  JOIN catalog.categories AS filter_root
    ON filter_root.slug IN (${placeholders.join(', ')})
  WHERE filter_part_category.part_id = part.id
    AND filter_category.path <@ filter_root.path
)`;
  }

  const expression = FILTER_EXPRESSIONS[filter.field];
  if (filter.operator === 'in') {
    const placeholders = filter.value.map((value) => pushParameter(values, value));
    return `${expression} IN (${placeholders.join(', ')})`;
  }
  if (filter.operator === 'contains') {
    const pattern = `%${escapeLikeValue(filter.value)}%`;
    const placeholder = pushParameter(values, pattern);
    return `${expression} ILIKE ${placeholder} ESCAPE '!'`;
  }

  const operators = Object.freeze({
    equals: '=',
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
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
  const usesCategory = query.dimensions.includes('category');
  const values = [];
  const selected = [
    `${SELECT_EXPRESSIONS.part_count} AS part_count`,
    ...query.dimensions.map(
      (dimension) => `${SELECT_EXPRESSIONS[dimension]} AS ${dimension}`,
    ),
  ];
  const joins = usesCategory ? CATEGORY_JOIN : '';
  const predicates = query.filters.map((filter) => compileFilter(filter, values));
  const whereClause = predicates.length > 0 ? `\nWHERE ${predicates.join('\n  AND ')}` : '';
  const groupBy = query.dimensions.length > 0
    ? `\nGROUP BY ${query.dimensions.map((dimension) => SELECT_EXPRESSIONS[dimension]).join(', ')}`
    : '';
  const orderBy = query.order_by?.length > 0
    ? `\nORDER BY ${query.order_by
        .map(({ field, direction }) => `${field} ${direction.toUpperCase()}`)
        .join(', ')}`
    : '';
  const limit = pushParameter(values, query.limit);

  return {
    text: `SELECT ${selected.join(', ')}\nFROM catalog.part_catalog AS part${joins ? `\n${joins}` : ''}${whereClause}${groupBy}${orderBy}\nLIMIT ${limit}`,
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
export async function executeAuthorizedCubeQuery(input, runInAuthorizationContext) {
  if (typeof runInAuthorizationContext !== 'function') {
    throw new TypeError('A trusted authorization-context runner is required.');
  }

  const compiled = compileCubeQuery(input);
  return runInAuthorizationContext(async (client) => {
    const authorization = await client.query(
      'SELECT security.authz_has_permission($1) AS allowed',
      ['catalog.read'],
    );
    if (authorization.rows[0]?.allowed !== true) {
      throw new CubeQueryAuthorizationError();
    }
    const result = await client.query(compiled.text, compiled.values);
    return {
      query: compiled.query,
      rows: result.rows,
    };
  });
}
