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

## Product and architecture

- [Project idea](docs/PROJECT_IDEA.md)
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md)
