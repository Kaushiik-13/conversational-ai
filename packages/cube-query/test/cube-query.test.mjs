import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateCubeQuery } from '../src/index.mjs';
import {
  CubeQueryAuthorizationError,
  CubeQueryValidationError,
  compileCubeQuery,
  executeAuthorizedCubeQuery,
} from '../src/qgen.mjs';

const baseQuery = {
  version: 1,
  model: 'automotive_catalog',
  measures: ['part_count'],
  dimensions: ['manufacturer'],
  filters: [],
};

test('validates a supported query and applies the default result limit', () => {
  const result = validateCubeQuery(baseQuery);
  assert.equal(result.valid, true);
  assert.equal(result.query.limit, 50);
  assert.deepEqual(result.query.measures, ['part_count']);
});

test('rejects unknown fields, sensitive fields, identity fields, and raw SQL', () => {
  for (const input of [
    { ...baseQuery, dimensions: ['cost_usd'] },
    { ...baseQuery, filters: [{ field: 'supplier_status', operator: 'equals', value: 'active' }] },
    { ...baseQuery, organization_id: 'org-b' },
    { ...baseQuery, sql: 'SELECT * FROM catalog.part_catalog' },
  ]) {
    assert.equal(validateCubeQuery(input).valid, false);
  }
});

test('rejects incompatible filter values and non-integer model years', () => {
  const badStringNumber = validateCubeQuery({
    ...baseQuery,
    filters: [{ field: 'active', operator: 'equals', value: 'true' }],
  });
  assert.equal(badStringNumber.valid, false);

  const badYear = validateCubeQuery({
    ...baseQuery,
    filters: [{ field: 'model_year', operator: 'gte', value: 2024.5 }],
  });
  assert.equal(badYear.valid, false);
});

test('rejects duplicate or excessive dimensions, invalid limits, and sorts on unselected fields', () => {
  assert.equal(validateCubeQuery({ ...baseQuery, dimensions: ['region', 'region'] }).valid, false);
  assert.equal(validateCubeQuery({ ...baseQuery, dimensions: ['manufacturer', 'region', 'country', 'plant'] }).valid, false);
  assert.equal(validateCubeQuery({ ...baseQuery, limit: 501 }).valid, false);
  assert.equal(
    validateCubeQuery({ ...baseQuery, order_by: [{ field: 'region', direction: 'asc' }] }).valid,
    false,
  );
});

test('compiles category aggregation with distinct parts and bound filter/limit values', () => {
  const compiled = compileCubeQuery({
    ...baseQuery,
    dimensions: ['manufacturer'],
    filters: [{ field: 'category', operator: 'equals', value: 'braking' }],
    order_by: [{ field: 'part_count', direction: 'desc' }],
    limit: 25,
  });

  assert.match(compiled.text, /COUNT\(DISTINCT part\.id\)/);
  assert.match(compiled.text, /FROM catalog\.part_categories AS filter_part_category/);
  assert.match(compiled.text, /filter_root\.slug IN \(\$1\)/);
  assert.match(compiled.text, /filter_category\.path <@ filter_root\.path/);
  assert.match(compiled.text, /ORDER BY part_count DESC/);
  assert.match(compiled.text, /LIMIT \$2/);
  assert.deepEqual(compiled.values, ['braking', 25]);
  assert.equal(compiled.text.includes('braking'), false);
});

test('escapes LIKE wildcards while keeping contains values parameterized', () => {
  const compiled = compileCubeQuery({
    ...baseQuery,
    filters: [{ field: 'part_name', operator: 'contains', value: 'brake_%!' }],
  });

  assert.match(compiled.text, /ILIKE \$1 ESCAPE '!'/);
  assert.deepEqual(compiled.values, ['%brake!_!%!!%', 50]);
});

test('executes only inside the supplied authorization context and checks catalog.read', async () => {
  const calls = [];
  const client = {
    async query(text, values) {
      calls.push({ text, values });
      if (calls.length === 1) return { rows: [{ allowed: true }] };
      return { rows: [{ part_count: '4', manufacturer: 'Example' }] };
    },
  };

  const result = await executeAuthorizedCubeQuery(baseQuery, (operation) => operation(client));
  assert.deepEqual(calls[0], {
    text: 'SELECT security.authz_has_permission($1) AS allowed',
    values: ['catalog.read'],
  });
  assert.match(calls[1].text, /FROM catalog\.part_catalog AS part/);
  assert.deepEqual(result.rows, [{ part_count: '4', manufacturer: 'Example' }]);
});

test('denies execution without catalog.read and skips the data query', async () => {
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

test('does not open an authorization context for an invalid query', async () => {
  let contextOpened = false;
  await assert.rejects(
    executeAuthorizedCubeQuery(
      { ...baseQuery, sql: 'DELETE FROM catalog.part_catalog' },
      async (operation) => {
        contextOpened = true;
        return operation({ query: async () => ({ rows: [] }) });
      },
    ),
    CubeQueryValidationError,
  );
  assert.equal(contextOpened, false);
});
