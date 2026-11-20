// Runs the Next.js app directly on your machine (no Docker for the web app).
// It proxies /api/v1 to the API running on the host.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const envFile = path.join(root, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const apiPort = process.env.API_PORT ?? "3001";
// The API only accepts browsers on the ports listed in ALLOWED_ORIGINS
// (4200 and 4300 by default), so keep the web app on one of them.
const webPort = process.env.WEB_NEXT_PORT ?? "4300";

process.env.API_INTERNAL_URL ??= `http://localhost:${apiPort}`;

const child = spawn(
  "npm",
  [
    "run",
    "dev",
    "--workspace=@automotive-search/web-next",
    "--",
    "-p",
    webPort,
  ],
  { cwd: root, stdio: "inherit", shell: true, env: process.env },
);
child.on("exit", (code) => process.exit(code ?? 0));
