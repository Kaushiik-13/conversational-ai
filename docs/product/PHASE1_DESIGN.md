# Phase 1 Design: Foundation

**Status:** Proposed 2026-11-25, awaiting approval. No code written yet.
**Goal:** move the model of the organization's data out of the code and into the
database, make the AI provider swappable, and make chat respect field access.
Users see no change except that chat now hides fields their role may not use.

## 1. What the code does today (findings)

| Finding                                                                                                                                                                                                                                                                      | Evidence                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| The query engine does not read the YAML model. Fields are hard-coded twice: validation sets in `packages/cube-query/src/index.mjs` and SQL expressions in `packages/cube-query/src/qgen.mjs`                                                                                 | `MEASURES`, `DIMENSIONS`, `SELECT_EXPRESSIONS`, `RECORD_EXPRESSIONS`                                                                        |
| `semantic/automotive/catalog.yaml` feeds only the planner prompt                                                                                                                                                                                                             | `query-planner.service.ts` `loadSemanticModel()`                                                                                            |
| Chat ignores field access rules. The app already hides `costUsd` and `supplierStatus` from roles other than admin and analyst (`security.authz_field_access`), but `cost_usd`, `total_cost_usd` and `supplier_status` are valid chat fields for any role with `catalog.read` | `0010_authorization_rls.sql`; no `field_access` use in `conversation/` or `cube-query/`. Found by reading the code, not yet reproduced live |
| Ollama is called directly from the planner                                                                                                                                                                                                                                   | `requestPlan()` in `query-planner.service.ts`                                                                                               |
| Organizations, roles, permissions, field rules and session context already exist                                                                                                                                                                                             | `app.organizations`, `security.roles`, `security.field_access_rules`, `security.authz_bind_context`                                         |

The finding on field access is a real gap in the proof of concept. Phase 1 closes it.

## 2. Decisions to approve

| #   | Decision                                                                                                                                     | Reason                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | The model document stores **structured definitions** (table, column, aggregation), not SQL text                                              | An admin-edited string that becomes SQL is an injection path. Structured definitions are validated at publish and compiled by our code |
| D2  | One **platform template** model (`organization_id` NULL) serves Orgs A to D. An organization can later override it with its own model        | Avoids four copies of identical data. Mirrors how `security.roles` already allows a NULL organization                                  |
| D3  | **Reuse `security.field_access_rules`** for role access to fields. The model maps each guarded field to a `(resource_type, field_name)` pair | One source of truth for what a role may see in search, catalog and chat                                                                |
| D4  | Many-to-many category filtering stays a **named strategy** in code (`category_tree`), referenced by the model                                | Its SQL is ltree-specific and must not be configurable                                                                                 |
| D5  | **pgvector and embeddings wait for Phase 2**                                                                                                 | Phase 1 does not retrieve; the automotive model is small enough to send whole                                                          |
| D6  | Provider selection is **environment-level in Phase 1** (`CONVERSATION_LLM_PROVIDER`), per-organization later                                 | Per-organization choice needs the admin UI                                                                                             |
| D7  | Cloud providers require an explicit opt-in flag (`LLM_ALLOW_EXTERNAL=true`)                                                                  | Free tiers may train on prompts. The automotive data set is synthetic, but the default must be safe                                    |

## 3. Database (migration `0028_semantic_models.sql`)

```
semantic.models
  id uuid PK
  organization_id uuid NULL REFERENCES app.organizations   -- NULL = platform template
  code text                    -- e.g. automotive_catalog
  name text
  source_kind text             -- 'application_database' now; 'organization_database' in Phase 4
  status text                  -- active | disabled
  created_at, updated_at
  UNIQUE NULLS NOT DISTINCT (organization_id, code)

semantic.model_versions
  id uuid PK
  model_id uuid REFERENCES semantic.models
  version_number int
  status text                  -- draft | published | archived
  document jsonb               -- see section 4
  checksum text                -- sha256 of canonical document
  created_by_user_id uuid NULL
  created_at, published_at
  UNIQUE (model_id, version_number)
  UNIQUE (model_id) WHERE status = 'published'   -- one live version

security.authz_resource_field_access(resource_type text, requested_field text) → text
  -- generalises authz_field_access (which is fixed to 'catalog.part')
```

Privileges and row security follow the existing pattern: the runtime role can
read published versions of its organization's model or the template, and cannot
write. Drafts and publishing are admin functions (Phase 4); in Phase 1 only the
seed script writes.

`semantic.field_index` and `semantic.field_access` from the architecture are
**not** created now: field access reuses `security.field_access_rules` (D3), and
the index arrives with embeddings in Phase 2.

## 4. Model document (version 1)

A superset of today's `catalog.yaml`, restructured so nothing is SQL text.

```json
{
  "schema_version": 1,
  "source": {
    "table": "catalog.part_catalog",
    "alias": "part",
    "grain": "one row per catalog part"
  },
  "measures": {
    "total_cost_usd": {
      "label": "Total cost (USD)",
      "description": "Sum of recorded part costs.",
      "aggregation": "sum",
      "column": "cost_usd",
      "access": { "resource_type": "catalog.part", "field_name": "costUsd" }
    },
    "part_count": {
      "aggregation": "count_distinct",
      "column": "id",
      "description": "…"
    }
  },
  "dimensions": {
    "region": {
      "column": "region",
      "type": "string",
      "groupable": true,
      "filterable": true,
      "aliases": ["geography"],
      "known_values": ["Europe", "…"]
    },
    "category": {
      "strategy": "category_tree",
      "type": "string",
      "groupable": true,
      "filterable": true
    }
  },
  "lookup_fields": {
    "part_number": {
      "column": "part_number",
      "type": "string",
      "filterable": true
    }
  },
  "record_fields": { "part_name": { "column": "part_name", "type": "string" } },
  "excluded_fields": ["tenant_id", "company_id"],
  "limits": {
    "max_dimensions_per_query": 5,
    "max_filters_per_query": 15,
    "max_result_limit": 500
  }
}
```

Publish-time validation (also run by the seed script): identifiers match
`^[a-z_][a-z0-9_]*$`, tables are in an allowlist of schemas for the source kind,
aggregations come from an enum, strategies exist in the code registry, and every
`access` pair is syntactically valid.

## 5. Query engine becomes model-driven

| Change                            | Detail                                                                                                                                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validateCubeQuery(input, model)` | Builds its field sets and per-type operator rules from the model instead of module constants                                                                                                                      |
| `compileCubeQuery(input, model)`  | Builds SELECT, FILTER and RECORD expressions from `column` and `aggregation`; calls named strategies (`category_tree`) for special joins                                                                          |
| Role filtering                    | `modelForRole(model, accessDecisions)` removes fields whose access is `omit`. Validation then rejects any plan that names them                                                                                    |
| Caching                           | Compiled model per `model_versions.id` (immutable, so safe to cache)                                                                                                                                              |
| Compatibility                     | A parity test generates the legacy model document from `catalog.yaml` and asserts the compiled SQL text is **byte-identical** to the current output for every query in `cube-query.test.mjs` and the golden cases |

The parity test is the safety net: the refactor is correct only if no existing
SQL changes.

## 6. API changes

| Module           | Change                                                                                                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `semantic` (new) | `SemanticService.resolveForSession(session)`: pick the organization's published model, else the template; run `authz_resource_field_access` for each guarded field inside the authorization context; return the role-filtered model and its version id |
| `conversation`   | `ask()` resolves the model first, passes it to the planner and to `compileCubeQuery`. Audit records the model version id                                                                                                                               |
| `planner`        | `plan(question, history, model)` receives the model instead of reading the YAML. Prompt, shortcuts and repair loops are unchanged                                                                                                                      |
| `llm` (new)      | See section 7                                                                                                                                                                                                                                          |

## 7. LLM provider interface

```ts
interface LlmProvider {
  readonly name: string;
  planJson(request: {
    system: string;
    messages: { role: "user" | "assistant"; content: string }[];
    schema: object; // JSON schema the output must satisfy
    timeoutMs: number;
  }): Promise<{
    content: unknown;
    usage: { inputTokens?: number; outputTokens?: number };
    latencyMs: number;
  }>;
  // summarise() and embed() are added in Phases 2 and 3
}
```

| Piece            | Detail                                                                                                                                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OllamaProvider` | The existing `fetch` call moved as is: `temperature 0`, `num_ctx 4096`, JSON schema in `format`                                                                                                            |
| `GeminiProvider` | REST `generateContent` with `responseMimeType: application/json` and `responseSchema`; key from `GEMINI_API_KEY`; model from `GEMINI_MODEL`                                                                |
| `LlmService`     | Chooses the provider from `CONVERSATION_LLM_PROVIDER`; refuses a cloud provider unless `LLM_ALLOW_EXTERNAL=true`; one bounded retry on 429 and 5xx with backoff; maps failures to the existing error codes |
| Logging          | One structured line per call: provider, model, latency, tokens, outcome. No prompt text and no user data in logs                                                                                           |
| Secrets          | Keys only from environment, never committed, never logged                                                                                                                                                  |

## 8. Seeding

`database/seeds/import-semantic-model.mjs` converts `semantic/automotive/catalog.yaml`
into a version-1 document, validates it, and inserts the platform template model
with that version published. It is idempotent: it compares checksums and
creates a new version only when the document changed. `catalog.yaml` stays in
the repository as the seed source for the demo organization.

## 9. Acceptance criteria

| #   | Check             | Pass condition                                                                                                                                                                                                                                                |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | SQL parity        | Compiled SQL from the database model is byte-identical to the legacy compile for every existing cube-query test and golden query                                                                                                                              |
| 2   | Golden cases      | The 26 golden cases give the same status and rows as before (cases that need a live model run only with a provider available)                                                                                                                                 |
| 3   | Field access      | A role with `costUsd = omit` cannot get `cost_usd`, `total_cost_usd`, `average_cost_usd`, `min_cost_usd`, `max_cost_usd` or `supplier_status` through chat: the planner slice excludes them and validation rejects a plan that names them. An admin still can |
| 4   | Tenant scope      | Org A and Org B counts match the existing proof (5,000,000 and 1,250,000)                                                                                                                                                                                     |
| 5   | Provider switch   | The same question works through Ollama and Gemini by changing environment variables only; a cloud provider is refused without the opt-in flag                                                                                                                 |
| 6   | Provider failures | Timeout, 429 and invalid JSON each map to a clear error and are covered by unit tests with mocked HTTP                                                                                                                                                        |
| 7   | Migration         | `0028` applies on a clean database and on the current one; a validation script checks constraints, one published version per model, and privileges                                                                                                            |
| 8   | No regressions    | API unit tests, cube-query tests and type-check pass                                                                                                                                                                                                          |

## 10. Work order

| Step | Deliverable                                                                |
| ---- | -------------------------------------------------------------------------- |
| 1.1  | Migration `0028`, validation script, seed script and template model import |
| 1.2  | Model-driven `cube-query` with the SQL parity test (no behaviour change)   |
| 1.3  | `semantic` module and role-filtered model resolution; `ask()` uses it      |
| 1.4  | Field-access enforcement in validation, with security tests                |
| 1.5  | `llm` module: interface, Ollama adapter (moved), `LlmService`, tests       |
| 1.6  | Gemini adapter and configuration, mocked tests, one manual live check      |
| 1.7  | Update docs: `CURRENT_STATE.md`, `ROADMAP.md`, `.env` example              |

Each step ends with the tests above for its area, and nothing in a step depends
on a later one, so each can be committed on its own.

## 11. Out of scope for Phase 1

Embeddings and retrieval, the wider plan contract, clarification changes,
streaming, the model-builder UI, organization database connections, per-organization
provider choice, and removal of the regex shortcuts (Phase 2).

## 12. Needed from you

- Approval of D1 to D7, or the changes you want.
- A Gemini API key for step 1.6, set locally in `.env` (never committed). Not needed before then.
