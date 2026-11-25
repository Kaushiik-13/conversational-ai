# Conversational AI

A conversational analytics product: an organization connects its own
PostgreSQL database, defines a semantic model, and people ask questions in
everyday language. The AI proposes a structured plan; trusted code validates it
against the user's role and compiles the SQL. Answers are governed and
explainable, or an honest "I can't answer that".

The automotive catalog is the first organization and the demo data set. The
repository is moving from a proof of concept to a multi-organization product.
Read [docs/product/VISION.md](docs/product/VISION.md) first, then the
[architecture](docs/product/ARCHITECTURE.md) and [roadmap](docs/product/ROADMAP.md).

## Layout

| Path                  | What it is                                          |
| --------------------- | --------------------------------------------------- |
| `apps/api`            | NestJS API: auth, roles, catalog, conversation      |
| `apps/web-next`       | Next.js app (target UI)                             |
| `apps/web`            | Angular app, kept until `web-next` is stable        |
| `packages/cube-query` | Plan contract, validation and SQL compile           |
| `database`            | Migrations, seeds, generators, validation           |
| `semantic`            | Seed semantic model for the automotive organization |
| `evaluation`          | Golden question suites                              |
| `docs`                | [Index](docs/README.md): product, reference, poc    |

## Automotive data

See [Automotive PostgreSQL data setup](docs/reference/AUTOMOTIVE_DATA_SETUP.md).
For a short manual check of the conversation API, follow
[Conversation API manual test](docs/poc/CONVERSATION_API_MANUAL_TEST.md).

## Run the API and web app without Docker

Only PostgreSQL needs Docker. Everything else runs directly on your machine
with hot reload.

```powershell
docker compose up -d db      # start just the database
npm install                  # first time only
npm run dev:local            # NestJS API (3001) + Next.js web (4300)
```

Open http://localhost:4300. Use `npm run dev:local:api` or
`npm run dev:local:web` to run one of them alone. Stop with Ctrl+C.

- Settings come from `.env` (it must point `DATABASE_URL` at `localhost:5433`).
- Keep the web app on port 4200 or 4300; the API only accepts those origins.
- The local Ollama model is not started in this mode, so natural-language
  planning is unavailable until you run `docker compose up -d ollama` and
  publish its port. A cloud provider replaces this in Phase 1 of the roadmap.

## Product and architecture

- [Vision](docs/product/VISION.md)
- [Architecture](docs/product/ARCHITECTURE.md) and [current state](docs/product/CURRENT_STATE.md)
- [Roadmap](docs/product/ROADMAP.md)
- [Decision log](docs/product/DECISIONS.md)
