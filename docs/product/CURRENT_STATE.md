# Current State and Gaps

**Status:** 2026-11-25. This file records what exists today and how it differs from
the target in [ARCHITECTURE.md](ARCHITECTURE.md). Update it as phases land.

## Pipeline as built

```
Question (+ history)
  → exact / recognised / part-detail shortcuts     conversation/planner/query-planner.service.ts
  → otherwise Ollama plans against catalog.yaml    (JSON schema: conversation-plan.v1)
  → repair loop if an explicit filter was dropped
  → compileCubeQuery (validation)                  packages/cube-query/src/index.mjs
  → repair loop on validation error
  → qgen → parameterised SQL                       packages/cube-query/src/qgen.mjs
  → PostgreSQL inside the user's authorization context (RLS)
  → rows, audited
```

## Already solid (kept)

- The LLM never writes SQL, organization ids or roles; it proposes a plan.
- Validation, repair, clarification and "unsupported" outcomes exist.
- Follow-ups carry `history`.
- Authentication, organization context, roles, field access, row-level security, audit.
- 26 golden cases in `evaluation/conversation-golden-cases.json`.
- Catalog, Compare and the 3D Playground in `apps/web-next` (the automotive organization's UI).

## Gaps against the target

| #   | Gap                                                                      | Target                                                                                 |
| --- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| 1   | One hard-coded model (`semantic/automotive/catalog.yaml`, one table)     | Per-organization, versioned model in the database                                      |
| 2   | About 1,000 lines of regex shortcuts before the LLM, automotive-specific | LLM-led planning; code keeps validation, caching, matching                             |
| 3   | Ollama only, 4k context, no streaming                                    | Provider interface, cloud model first, streaming                                       |
| 4   | Plan covers measures, group-by, filters, top-N                           | Add period comparison, share of total, ratios, running totals, top-N per group, nested |
| 5   | Whole model in every prompt                                              | Embedding retrieval of the relevant slice                                              |
| 6   | Value matching hard-coded for a few cases                                | General value matching from sample values and the data                                 |
| 7   | Answer is a table                                                        | Table, chart, summary, interpretation line, plan and SQL panel                         |
| 8   | No saved threads, boards or feedback                                     | Persisted threads, boards, ratings, evaluation loop                                    |
| 9   | No way to connect another database                                       | Organization connections with read-only credentials and schema scan                    |

## Repository today

```
apps/api/src/conversation/      HTTP + service
  planner/                      legacy planner (replaced in Phase 2)
apps/web-next/                  Next.js app (target UI)
apps/web/                       Angular app (kept until web-next is stable)
packages/cube-query/            plan contract, validation, SQL compile
semantic/automotive/            the single hard-coded model
evaluation/                     golden cases
database/migrations/            0001–0027
```
