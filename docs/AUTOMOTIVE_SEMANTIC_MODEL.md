# Automotive semantic model — review draft

This draft gives conversational analytics a small, explicit vocabulary over
`catalog.part_catalog`. It is a specification for later backend validation and
query generation; YAML examples are not SQL and are not executable.

## Supported first-version meaning

- **Measure:** `part_count`, calculated as a distinct count of catalog part IDs.
- **Dimensions:** manufacturer, commodity, sub-commodity, vehicle program,
  region, country, plant, model year, lifecycle status, active status, and
  category.
- **Lookups:** exact/contains lookup by part number or part name; these fields
  cannot be used as grouping dimensions in this first draft.
- **Category relationship:** parts can have multiple category assignments.
  Category groupings must use distinct part counts so a part assigned to more
  than one category is not counted twice. Category filters use taxonomy slugs
  and match the selected category plus its descendants.
- **Organization scope:** derive organization and role from the authenticated
  server session. Use the existing PostgreSQL row-level security path for every
  query. The user question and model output cannot select an organization.
- **Read-only limits:** at most three dimensions, ten filters, and 500 returned
  groups; default to 50.

## Hidden in the first version

Do not include cost, supplier status, weight, free-text descriptions, tenant or
company identifiers, security-domain IDs, visibility flags, or source tracking
fields in the conversational query contract. In particular, cost and supplier
status remain hidden for every role until explicit field-access rules and a
separate approval define otherwise.

## Starter questions

1. How many catalog parts can I see?
2. Show the number of parts in each commodity.
3. How many braking parts are there for each manufacturer?
4. Show active parts by region and model year.

The schema has a `vehicle_program` field, not a vehicle-make field. The first
version must not claim to answer questions grouped by vehicle make.

## Files

- `semantic/automotive/catalog.yaml` contains model, field, measure, join, and
  safety-limit definitions.
- `semantic/examples/automotive.yaml` contains example questions and their
  proposed Cube Query shapes.

Before implementation, a backend validator must reject unknown fields,
unsupported operators, excessive limits, writes, and any organization or
role-selection fields. QGen must accept only validated query objects and emit
parameterized, read-only SQL through the existing protected database path.
