# Decision Log

Newest first. Each entry: decision, reason, consequence.

## 2026-11-25

1. **Build a product, not a PoC.** Organizations bring their own database and semantic model. The automotive catalog becomes the first organization.
2. **Plan-first only.** The LLM returns a structured plan; trusted code validates and compiles SQL. Free-form SQL is a later optional mode. _Reason:_ governance is the differentiator and permissions can be enforced before any SQL exists. _Consequence:_ the plan contract must widen so most questions fit.
3. **LLM-led understanding, no regex understanding.** The regex shortcut stages in the planner are removed in Phase 2. Code keeps validation, caching, synonym and value matching. _Reason:_ regex only handles wordings we predicted.
4. **Cloud model through a provider interface.** Gemini free tier for development; paid, no-training terms for real customers; Ollama stays optional for on-premises use. _Reason:_ free-tier quotas are small and unpublished for Gemini, and free tiers may train on prompts.
5. **PostgreSQL only** for organization data sources.
6. **Semantic model auto-drafted, then edited by an admin.**
7. **Quality bar:** wide plan coverage, clarification, "I understood" line, honest refusal, paraphrase evaluation, logging.
8. **Answers include table, chart and summary.**
9. **Chat memory and full history, and direct connection to organization databases, are enhancements** after the core (Phase 5 and Phase 4 respectively), with hooks designed early.
10. **Restructure in this repository** rather than a new one. Angular app kept until `web-next` is stable.
11. **No LangChain.** Our flow is a straight line with safety enforced in our code. Thin libraries are acceptable for provider access, structured output and tracing; LangGraph only if a multi-step agent loop proves necessary.
