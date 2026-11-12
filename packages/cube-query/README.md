# Cube Query v1

Cube Query is a constrained JSON request between the language model and trusted
backend code. It describes the requested business meaning; it is not SQL and
cannot choose an organization, role, table, join, or database connection.

The JSON Schema is `cube-query.v1.schema.json`. The dependency-free
`validateCubeQuery` function in `src/index.mjs` applies its semantic checks:
unknown fields, incompatible filter operators and values, duplicate
dimensions, sorts on unselected fields, and requests beyond the configured
limits are rejected. It normalizes a missing result limit to 50.

`compileCubeQuery` in `src/qgen.mjs` maps the allowlisted fields to fixed SQL
expressions and binds every filter and limit as a parameter. It emits a
read-only `SELECT`; category grouping and hierarchy filters count distinct part
IDs. Category filters use taxonomy slugs and include descendants.
`executeAuthorizedCubeQuery` helper requires a runner bound to the existing
`DatabaseService.withAuthorizationContext`, checks `catalog.read`, and then
executes through that scoped client. The helper does not accept organization or
role values from the query.

The API integration should pass the authenticated session from the existing
auth guard, not request-body identity fields:

```js
const result = await executeAuthorizedCubeQuery(
  request.body,
  (operation) => database.withAuthorizationContext(authenticatedSession, operation),
);
```

This package does not expose a public endpoint by itself; the authenticated API
route must supply the session-bound `DatabaseService.withAuthorizationContext`
runner.

Example:

```json
{
  "version": 1,
  "model": "automotive_catalog",
  "measures": ["part_count"],
  "dimensions": ["manufacturer"],
  "filters": [
    { "field": "category", "operator": "equals", "value": "braking" }
  ],
  "limit": 50
}
```

Allowed filters are field-typed: string fields accept `equals`, `in`, and
`contains`; model year accepts `equals`, `in`, and numeric comparisons; the
active flag accepts `equals` and `in`. `part_number` and `part_name` are lookup
filters only and cannot be grouped or sorted.

Validation is not authorization. The later execution layer must obtain the
organization and role from the authenticated server session, recheck
`catalog.read`, preserve PostgreSQL row-level security, compile only
parameterized SQL, and remain read-only. Category joins must use a distinct
part count to avoid double-counting. Category filter values must be taxonomy
slugs such as `braking`, not display labels such as `Braking`.
