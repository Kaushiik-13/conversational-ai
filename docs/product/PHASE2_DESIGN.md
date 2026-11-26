# Phase 2 Design: Planner

**Status:** Approved 2026-11-26 (see section 9). Step 2.1 is next.
**Goal:** a user can ask in their own words and every question ends in one of
three honest outcomes: a correct answer, one clarifying question, or a refusal
that says why and what to ask instead. A model mistake never reaches the user as
a server error.

## 1. What the code does today (findings)

| Finding                                                                                                                                                                                                    | Evidence                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| About 700 of the 1,107 lines in the planner are regex shortcuts that answer before the model is asked. They only cover wording someone predicted                                                           | `planExactSupportedQuestion`, `planRecognizedAnalyticsQuestion`, `planExplicitPartDetailQuestion` |
| Regex also patches the model's output afterwards (`missingExplicitFilters`, `extractManufacturerName`, `extractModelYear`)                                                                                 | `repairOmittedExplicitFilters`                                                                    |
| When the model's plan fails validation twice, the user gets `502 INVALID_MODEL_QUERY`. Reproduced live with Gemini: "which suppliers do we rely on the most" in `conversation.service.ts` lines 125 to 143 | Phase 1 live check                                                                                |
| Gemini ignores `const` and `enum` hints in the schema (returned `"model":"parts"`). The server-side validator is the real guard, as designed                                                               | Phase 1 live check                                                                                |
| The plan contract is narrow: one measure, `equals/contains/in/gt/gte/lt/lte`, no ratios, no period comparison, no share of total                                                                           | `conversation-plan.v1.schema.json`                                                                |
| The prompt is small (about 1,100 input tokens for the whole automotive model, 1 to 6 seconds on Gemini). Retrieval is not needed for this model yet                                                        | `llm call ok ... inputTokens=1184`                                                                |
| There are 27 golden cases, all written as the phrasing the regex stages expect. They prove the old planner, not understanding                                                                              | `evaluation/conversation-golden-cases.json`                                                       |
| Nothing records what users asked, what the planner decided, or whether the answer helped                                                                                                                   | No interaction log table                                                                          |

Example of the gap. User asks: "which suppliers do we rely on the most".
Today: 502 error. Wanted: "I don't have supplier names, only supplier status.
I can show parts by manufacturer or by supplier status. Which one?"

## 2. Decisions to approve

| #   | Decision                                                                                                                                                   | Reason                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **The model understands; trusted code decides.** Remove the three regex shortcut stages and the regex output patching, once the evaluation shows no loss   | Regex only handles wording we predicted. Safety stays in validation, which does not change                                             |
| D2  | **Every outcome is typed:** `answered`, `clarification`, `refused`, each with a reason code. A failed plan after one repair becomes `refused`, never a 502 | The user always gets something useful. Real outages (model down, rate limit) stay errors                                               |
| D3  | **Value resolution in code, after the plan.** Each filter value is matched against the field's known values (exact, then close spelling, then synonym)     | Replaces the manufacturer and year regexes. "Euroup" becomes "Europe". Two close matches become a question, not a guess                |
| D4  | **No embeddings in Phase 2.** The whole model fits in the prompt. Retrieval is added in Phase 4 when an organization's model is large                      | Embeddings add a vector store and a provider for no gain at this size. The planner takes a `FieldSelector` so retrieval plugs in later |
| D5  | **"I understood" is written by code from the validated plan**, not by the model                                                                            | It cannot disagree with what actually ran. Example: "Counting parts by region, for manufacturer Bosch, top 5"                          |
| D6  | **Refusals carry suggestions built from the role's model**, not invented by the model                                                                      | Suggestions only mention fields the user may use. No leak of hidden fields                                                             |
| D7  | **Contract widening is a separate change (2B).** 2A ships with the current contract                                                                        | Ratios, period comparison and share of total need engine and SQL work with their own parity tests                                      |
| D8  | **Evaluation gates every change:** the 27 golden cases plus paraphrases, scored on result, run through the live API for each provider                      | A prompt tweak can silently break a phrasing. The suite is the only way to see it                                                      |
| D9  | **Log every interaction** (question, plan, outcome, reason, provider, model, latency, tokens) in an organization-scoped table                              | You cannot improve what you cannot see. Question text is business data, so the table has row security and a retention setting          |
| D10 | **Quality needs a cloud model.** Ollama stays supported but is judged by the same suite and may score lower                                                | A 2B local model cannot match a cloud model on paraphrase. The suite will say how far apart they are                                   |

## 3. The new flow

```
Question
  -> resolve model for this user            (Phase 1)
  -> LLM plan (JSON schema, role-narrowed)  (one call)
  -> validate plan                          (cube-query, unchanged)
       invalid -> one repair call with the errors
       still invalid -> REFUSED (reason: could_not_plan) + suggestions
  -> resolve filter values                  (D3)
       no match / unclear -> CLARIFICATION with the candidates
  -> compile SQL, run read-only             (unchanged)
  -> ANSWERED + "I understood: ..." (D5)
  -> write interaction log                  (D9)
```

Outcomes the user can see:

| Outcome       | When                                                              | Example                                                                                         |
| ------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| answered      | Plan validated and ran                                            | Table of parts per category, "I understood: counting parts by category"                         |
| clarification | A needed value or choice is missing or ambiguous                  | "Did you mean Bosch Automotive or Bosch Rexroth?" with two buttons                              |
| refused       | Data is not in the model, role may not see it, or planning failed | "Your role cannot see cost. I can show part counts by category or region." (reason `no_access`) |

Reason codes: `out_of_scope`, `no_access`, `no_such_field`, `could_not_plan`,
`ambiguous_value`, `value_not_found`.

## 4. Changes by module

| Module                 | Change                                                                                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `planner`              | Delete shortcut stages and regex patching. Keep prompt, history handling, schema narrowing, one repair. Add a `FieldSelector` seam that returns the whole model today |
| `planner/values`       | New `ValueResolver`: exact, normalized, edit-distance and synonym match against `known_values`, plus a read-only distinct-value lookup for fields without a list      |
| `planner/explain`      | New `describePlan(plan, model)` producing the "I understood" sentence and refusal suggestions                                                                         |
| `conversation.service` | Return the typed outcome with reason code, understood text and suggestions. A repaired-then-invalid plan returns `refused`, not 502                                   |
| `conversation/log`     | New `InteractionLogService` writing the log table                                                                                                                     |
| `database`             | Migration `0029_conversation_interactions.sql`: `conversation.interactions` with row security by organization, indexes on created time and outcome                    |
| `evaluation`           | New `eval/chat.mjs` runner and a paraphrase file; JSON report with score per phrasing and per provider                                                                |
| `apps/web-next`        | Not in this phase. The UI shows the new fields in Phase 3. The API stays backward compatible: existing `status` values keep working                                   |

## 5. Evaluation design

- **Golden set (27):** kept as the regression floor. Expected plan and expected row result as today.
- **Paraphrase set:** about 40 questions covering what the contract can do, each written 6 to 10 ways: formal, casual, typo, abbreviation, reordered clauses, extra chatter, wrong word for a field. Example for "parts per category": "how many parts in each category", "give me category-wise part counts", "break down part numbers by cat", "counts per category pls".
- **Refusal set:** about 15 questions the system must not answer (hidden fields, unknown data, off-topic, destructive wording) with the expected reason code.
- **Role cases:** the same cost question for viewer, analyst and admin; expected `no_access`, answered, answered.
- **Scoring:** a case passes when the executed result matches, not when the plan text matches (two different plans can be correct). Clarification cases pass if a clarification with the right candidates is returned.
- **Gate (proposed):** 100% of golden, at least 90% of paraphrases, 100% of refusal and role cases, on the default cloud provider. The local model is reported but does not block.
- **Cost:** about 500 calls per full run at about 1,200 input tokens each, free on the Gemini free tier but slow (about 1 hour at the rate limit). A `--quick` flag runs one phrasing per question.

## 6. Steps

| Step | Work                                                                                                          | Done when                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 2.1  | Evaluation runner, paraphrase, refusal and role sets, baseline score of **today's planner** on both providers | Report committed. We know the starting number                               |
| 2.2  | Typed outcomes and reason codes; failed repair becomes `refused`; interaction log table and service           | The "suppliers" question returns a refusal with a suggestion, and a log row |
| 2.3  | `ValueResolver` and ambiguity clarifications                                                                  | "Euroup" resolves; "Bosch" with two matches asks                            |
| 2.4  | `describePlan` ("I understood") and refusal suggestions from the role's model                                 | Viewer's suggestions never name cost or supplier fields                     |
| 2.5  | Remove regex shortcut stages, one stage per commit, re-running the suite after each                           | Score does not drop; planner shrinks by about 700 lines                     |
| 2.6  | Prompt and schema tuning against the failing cases                                                            | Gate in section 5 met on the cloud provider                                 |
| 2.7  | Docs, `.env.example`, validation script for the log table and row security                                    | `CURRENT_STATE` and `ROADMAP` updated                                       |

Order matters: 2.1 first so each later step is measured, and 2.5 only after 2.2
to 2.4 exist so removing regex does not remove the only safety net.

## 7. Phase 2B (separate approval): wider contract

Needs its own design and parity tests. Candidates in priority order:

1. More than one measure in a query ("count and total cost by region").
2. Sort and filter on a measure ("regions with more than 1,000 parts").
3. Share of total and ratios ("what share of parts is Europe").
4. Period comparison and running totals, **only if the model has a date field**. The automotive model has none today, so this waits for an organization with one (Phase 4).
5. Top N per group.

## 8. Risks

| Risk                                                          | Mitigation                                                                                    |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Removing regex lowers accuracy on a phrase it handled         | Step 2.1 baseline and one-stage-at-a-time removal in 2.5; revert a stage that drops the score |
| Cloud free tier rate limits slow the evaluation               | `--quick` mode, retry already built into `LlmService`, optional paid key for full runs        |
| Free-tier prompts may train the provider                      | Development only; a paid no-training plan is required before real customer data (open item)   |
| Interaction log holds business text                           | Row security by organization, retention days setting, no secrets, access limited to admins    |
| Model returns a valid-looking plan that means the wrong thing | "I understood" line makes it visible; thumbs feedback arrives in Phase 5                      |
| Paraphrase set written by us under-represents real users      | Interaction log feeds new cases back into the set                                             |

## 9. Decisions recorded (2026-11-26)

- **D1 to D10 approved.**
- **D4:** embeddings wait for Phase 4 (large organization schemas).
- **D7:** contract widening is Phase 2B, with its own design and approval.
- **Evaluation provider:** Groq (`openai/gpt-oss-120b`) is the default, Gemini is
  run as a comparison, Ollama is reported only. Both are free tiers on synthetic
  data; a no-training plan (for example Cloudflare Workers AI) is needed before
  real customer data.
- **Gate:** 100% golden, at least 90% paraphrase, 100% refusal and role cases.

## 10. Live evidence before Phase 2 (Groq, 2026-11-26)

Today's planner on Groq answered quickly (0.5 to 1.5 seconds) but gave **wrong
answers that look right**, which is worse than an error:

| Question (administrator)                                  | What happened                                          |
| --------------------------------------------------------- | ------------------------------------------------------ |
| which suppliers do we rely on the most                    | Counted manufacturers per manufacturer (every row = 1) |
| what is the total cost of all parts                       | Listed single part costs instead of one total          |
| give me the 5 manufacturers with the most parts in Europe | Listed parts instead of ranking manufacturers          |

A viewer got a clarification for suppliers and a refusal for cost, which is the
wanted behaviour. These three cases go into the evaluation sets in step 2.1.
