# Product Vision

**Status:** Direction set 2026-11-25. Supersedes the PoC idea in [../poc/PROJECT_IDEA.md](../poc/PROJECT_IDEA.md).

## One line

A conversational analytics product where any organization connects its own
PostgreSQL database, defines (or auto-drafts) a semantic model, and lets people
ask questions in everyday language, with answers that are governed, explainable
and correct, or an honest "I can't answer that".

Reference products: Wren AI (semantic layer plus text-to-SQL) and ThoughtSpot
Spotter (search, follow-ups, pinned boards, row-level security).

## What changes from the PoC

| PoC                                            | Product                                                                                  |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| One hard-coded automotive model in a YAML file | A semantic model per organization, stored in the database, versioned, editable in the UI |
| Local Ollama only                              | Provider interface, cloud model first (Gemini for development), Ollama optional          |
| Rules plus LLM planning                        | LLM-led planning with retrieval, validation, retry and clarification                     |
| One data source we ship                        | Organization connects its own PostgreSQL (read-only credentials)                         |
| Table result                                   | Table, auto-chart, plain-English summary, "how I got this"                               |
| Session follow-ups                             | Saved threads, pinned boards, saved questions, feedback                                  |

The automotive catalog stays as the first organization and the demo data set.

## Principles

1. **Any wording.** Users ask however they like. The model understands meaning, we do not predict phrasings.
2. **Plan-first, never free SQL (for now).** The LLM returns a structured plan. Trusted code validates it against the user's role and compiles SQL. A role that may not see `cost` is blocked before any SQL exists.
3. **Right, ask, or refuse.** Every question ends in a correct answer, one clarifying question, or an honest refusal with a nearby suggestion. Never a silent wrong number.
4. **Show the interpretation.** "I understood: revenue by region, last quarter" with a one-click correction, plus the plan and SQL behind it.
5. **Tenant boundaries are mandatory.** A prompt, a plan or a thread id can never select another organization's data.
6. **Measured quality.** Accuracy is tracked by an evaluation suite (many paraphrases per question) that gates every model, prompt or semantic change.
7. **Read-only.** Chat never changes the organization's data.

## Out of scope for now

- Free-form SQL generation (planned later as an optional, admin-enabled, read-only, role-checked mode).
- Databases other than PostgreSQL.
- Document search, Excel/DuckDB, RAG.
- Claims of superiority over Wren AI or ThoughtSpot without measured comparison.

## Question types the plan must express

| Type                        | Example                          |
| --------------------------- | -------------------------------- |
| Totals, counts, averages    | "Average order value"            |
| Group, rank, limit          | "Top 5 regions by revenue"       |
| Relative time               | "Last quarter", "since March"    |
| Trends                      | "Revenue by month this year"     |
| Period comparison           | "Revenue vs last year"           |
| Share of total              | "What % comes from electronics?" |
| Ratios and derived measures | "Return rate per supplier"       |
| Running totals              | "Cumulative sales this year"     |
| Top N per group             | "Best product in each region"    |
| Multi-step                  | "Regions beating the average"    |

Today's contract covers the first two and part of the third (see
[CURRENT_STATE.md](CURRENT_STATE.md)). Widening it is the main Phase 2 deliverable.
