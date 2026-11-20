// Runs the NestJS API directly on your machine (no Docker for the API).
// PostgreSQL still runs in Docker; .env points DATABASE_URL at localhost.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const envFile = path.join(root, ".env");

if (!existsSync(envFile)) {
  console.error("Missing .env. Copy .env.example to .env and fill it in.");
  process.exit(1);
}
process.loadEnvFile(envFile);

// Paths the API normally gets from Docker.
process.env.CUBE_QUERY_PACKAGE_ENTRY ??= path.join(
  root,
  "packages/cube-query/src/qgen.mjs",
);
process.env.SEMANTIC_MODEL_PATH ??= path.join(
  root,
  "semantic/automotive/catalog.yaml",
);
process.env.CONVERSATION_PLAN_SCHEMA_PATH ??= path.join(
  root,
  "packages/cube-query/conversation-plan.v1.schema.json",
);
// Ollama is not published to the host by default; chat needs it reachable.
process.env.OLLAMA_BASE_URL ??= "http://localhost:11434";

const child = spawn(
  "npm",
  ["run", "start:dev", "--workspace=@automotive-search/api"],
  { cwd: root, stdio: "inherit", shell: true, env: process.env },
);
child.on("exit", (code) => process.exit(code ?? 0));
