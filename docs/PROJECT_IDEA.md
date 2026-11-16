# Project Idea — Conversational AI for Trusted Business Data

**Working name:** Conversational AI  
**First domain:** Automotive catalog analytics  
**Initial data source:** Existing PostgreSQL/ParadeDB automotive-search project  
**Model approach:** Local Ollama by default; optional OpenRouter API for deployment experiments
**Status:** Product concept; implementation requires staged approval.

## The idea

Build a conversational analytics product that lets people ask questions about their organization's business data in everyday language and receive answers they can inspect, verify, and refine.

The product is inspired by the user experience of ThoughtSpot Spotter and the semantic/context and query-planning ideas in Wren AI. It is our own product and architecture: it will reuse the automotive-search database and access controls, define its own semantic model and Cube Query JSON contract, and evaluate Wren components as optional infrastructure rather than assume Wren is the application.

## The problem

Business data is stored in schemas and files designed for applications, not for ordinary questions. A raw LLM may misunderstand table names, choose a wrong join, misinterpret business terms, produce an incorrect aggregate, or describe data the user is not allowed to see. Retrieval alone also cannot guarantee complete calculations over structured records.

People need a simpler way to explore data, while teams need answers that use approved definitions, respect organization and role boundaries, and show how the result was produced.

## Who it is for

- **Business users:** ask questions, inspect results, filter or compare, and continue with follow-ups without writing SQL.
- **Analysts/data owners:** define trusted measures, dimensions, synonyms, relationships, and question examples; review feedback and semantic changes.
- **Organization administrators:** manage users, roles, data-source access, and permitted knowledge sources using existing application controls.

The first PoC uses the automotive catalog to test these jobs. It is intended to demonstrate a reusable conversational analytics foundation, not a finished multi-industry product.

## Example automotive questions

- “How many catalog parts do we have by component manufacturer?”
- “Show braking-category records for Toyota.”
- “Among those results, group by vehicle model.”
- “Which five manufacturers have the most unique Toyota-compatible braking parts?”
- “Compare these two parts.”

These are examples, not claims that every field or metric already exists. The actual semantic model and supported questions must be derived from the automotive database schema and approved business definitions.

## How it works

1. The user signs in and selects an organization through the existing application.
2. The system retrieves only the relevant semantic definitions, relationships, approved rules, and examples the user may access.
3. The configured LLM provider interprets the question and proposes constrained Cube Query JSON. Ollama is the local default; OpenRouter is an explicit optional mode. The model does not choose tenant access or execute SQL.
4. Backend validation checks the contract, business meaning, available measures/joins, query limits, role permissions, and organization scope.
5. QGen compiles the approved request into parameterized SQL for an authorized data-source adapter.
6. The protected adapter executes the query using existing PostgreSQL access controls and returns typed results.
7. The answer layer presents a grounded explanation with records, table/chart, filters, provenance, and an inspectable trace.
8. Follow-up questions modify the structured query state (replace/add/remove/reset filters) and go through validation and authorization again.

The current PoC handles structured PostgreSQL questions only. Document search,
Excel/DuckDB, and hybrid questions are deferred and are not part of this build.

## Core product principles

- **Business meaning is explicit:** models, measures, dimensions, synonyms, grain, and approved join paths live in a reviewable semantic layer.
- **The LLM proposes; trusted code enforces:** authorization, SQL generation, query limits, execution, and evidence selection are backend responsibilities.
- **Structured analytics is computed over the data:** counts and groupings are computed over authorized PostgreSQL rows.
- **Answers are inspectable:** show the interpreted query, metric meaning, filters, and result provenance where the user's role permits.
- **Conversation state is explicit:** follow-ups carry forward validated query state, not just conversational text.
- **Tenant boundaries are mandatory:** a prompt, model response, filter, or conversation ID cannot select another organization's data.
- **Feedback is reviewed:** user corrections inform evaluation and potential semantic updates; they do not automatically become trusted policy.
- **Explicit model routing:** Ollama is the local default; selecting OpenRouter sends question text, approved semantic context, and sanitized query history to that provider. There is no silent fallback. The API key stays on the backend.

## PoC definition

The proof of concept should demonstrate one end-to-end structured analytics path:

1. An automotive question runs through the semantic model, Cube Query, validation, QGen, organization/role checks, and the protected PostgreSQL adapter.

PoC success also requires a working conversational UI, follow-up state,
organization/role isolation, clear unsupported/ambiguous cases, and local Docker
Compose startup. Excel/DuckDB, RAG, document ingestion, and hybrid questions
are explicitly deferred.

## What makes the product valuable

The intended value is not simply “chat over a database.” The product should make analytical exploration more accessible while making errors and permissions easier to understand:

- Reduce the need to translate every question into SQL or dashboard filters.
- Reuse approved business definitions across conversational queries.
- Let a user correct a filter or grouping through a follow-up and see what changed.
- Catch ambiguity, unsupported calculations, or invalid relationships before execution.
- Show when an answer is based on incomplete, truncated, or missing data.

These benefits are hypotheses to validate with users. The project should not claim superiority over ThoughtSpot or Wren without measured comparisons.

## First-version boundaries

- Read-only analytics; chat does not create, update, or delete catalog records.
- PostgreSQL is the only data source in the current PoC.
- A limited set of approved automotive entities, measures, dimensions, and join paths.
- One explicitly selected model provider: Ollama locally by default, or OpenRouter for deployment experiments after data-handling review.
- Session-level conversation state initially unless durable history is approved.
- Excel/DuckDB, document ingestion, RAG, and hybrid answers are deferred until separately approved.
- No arbitrary model-written SQL, silent cloud fallback, public deployment, or unrestricted workbook ingestion.

## How we will decide whether it is feasible

- Compare generated results to independently written SQL for a golden set of automotive questions.
- Test multi-table joins and distinct counts so compatibility relationships do not inflate metrics.
- Verify every supported question against the actual semantic definitions and database values.
- Attempt cross-organization and role-boundary queries through prompts, filters, IDs, follow-ups, history, and error paths.
- Measure local inference latency and memory use on the development machine.
- Measure onboarding effort, query correctness, correction time, follow-up retention, and answer provenance with representative users.
- Evaluate optional Wren reuse against correctness, API compatibility, SQL dialect support, licensing, operations, and tenant isolation before adopting it.

## Relationship to the implementation plan

This document describes the product concept and intended value. The detailed architecture, proposed repository structure, Docker design, delivery phases, approval gates, and acceptance criteria are in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). Plan approval is not approval for code changes; every implementation stage requires a specific proposed change set and your approval.

## Research notes

- [Reference — ThoughtSpot Spotter Product Research](https://app.notion.com/p/Reference-ThoughtSpot-Spotter-Product-Research-405c16ecc9ae812096cfd7f84565d954?pvs=21)
- [Reference — Wren AI Architecture Research](https://app.notion.com/p/Reference-Wren-AI-Architecture-Research-405c16ecc9ae81de95d8c7ee66a07879?pvs=21)
- [Conversational AI — Learning Notes](https://app.notion.com/p/Conversational-AI-Learning-Notes-405c16ecc9ae817f8cd5e1dd382b70ed?pvs=21)
