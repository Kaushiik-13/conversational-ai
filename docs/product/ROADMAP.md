# Roadmap

**Status:** 2026-11-25. Nothing below Phase 0 is started. Each phase needs an approved change set before code.

Running example: Acme Retail connects a database with `orders`, `customers`,
`products` and asks "Top 5 regions by revenue last quarter, electronics only."

## Phase 0: Restructure and document (done in this change)

- Docs split into `product/`, `reference/`, `poc/`.
- Planner moved to `conversation/planner/` as the seam Phase 2 replaces.
- No behaviour change.

## Phase 1: Foundation

- Per-organization semantic model in the database (versions, synonyms, descriptions, sample values).
- `llm` provider interface with Gemini and Ollama adapters.
- Automotive becomes organization #1 by importing `semantic/automotive/catalog.yaml`.
- `cube-query` reads the model it is handed.
- **Exit:** the 26 golden cases still pass, with the model loaded from the database.
- **Example:** Acme's model rows: measure `revenue = sum(orders.amount)`, dimension `region = customers.region`, `category = products.category`, time field `order_date`.

## Phase 2: Planner (largest phase)

- Field retrieval (embeddings), value matching, LLM plan, validation, one retry.
- Wider plan contract (period comparison, share of total, ratios, running totals, top-N per group, nested).
- Clarifying questions and honest refusal with a suggestion.
- Evaluation: about 50 questions times 10 phrasings per organization, gating every change.
- Interaction logging.
- Remove the regex shortcut stages.
- **Exit:** paraphrase suite at or above the agreed score; no cross-role or cross-tenant leaks in the security cases.
- **Example:** "where do we make the most money in electronics lately" yields measure `revenue`, group `region`, filters category and last quarter, sort desc, limit 5, and the answer states what it understood.

## Phase 3: Chat UI (web-next)

- Streaming answer: table, auto-chart, plain-English summary.
- "I understood: ..." line with one-click correction.
- "How I got this" panel (plan and SQL, role permitting).
- **Example:** "North leads electronics revenue at $1.2M, 18% above South", a bar chart of five regions, and the table.

## Phase 4: Model builder

- Connect PostgreSQL with read-only credentials.
- Schema scan, auto-drafted model with synonyms, admin edit and publish.
- Suggested starter questions.
- **Example:** Acme pastes a connection string; the system drafts "Revenue = sum(amount)" and "Region"; the admin renames, fixes one guess and publishes.

## Phase 5: Product layer

- Pinned boards, saved questions, thumbs feedback.
- Saved threads and memory.
- Row-level rules per model, field gating per role in the UI.

## Later

- Optional free-SQL mode (read-only, role-checked, admin-enabled).
- Databases beyond PostgreSQL.
- Scheduled questions and alerts.

## Open items

- Choice of embedding provider and where vectors live (pgvector extension in the application database is the default assumption).
- Paid cloud model and no-training terms for customer data; free tiers are for development only.
- Secret storage for organization database credentials (application-level encryption versus an external secret manager).
