# Conversational AI

Automotive conversational analytics proof of concept, with a local-first model
planned for a later stage. The current repository contains the product idea,
implementation plan, automotive data setup, and the first authenticated
Cube Query API integration.

## Automotive data

See [Automotive PostgreSQL data setup](docs/AUTOMOTIVE_DATA_SETUP.md) for how
this repository uses the automotive-search source submodule and the existing
PostgreSQL/ParadeDB volume. Docker Compose starts the database, existing
automotive web/API, and the conversation query endpoint.

The first conversation endpoint accepts a validated Cube Query JSON object at
`POST /api/v1/conversation/query`. Natural-language planning with the local
model and a dedicated chat screen are later stages.

For a short manual check, follow [Conversation API manual test](docs/CONVERSATION_API_MANUAL_TEST.md).

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
- The local Ollama model is not started in this mode, so the AI chat
  endpoints are unavailable until you run `docker compose up -d ollama`
  and publish its port.

## Product and architecture

- [Project idea](docs/PROJECT_IDEA.md)
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md)
