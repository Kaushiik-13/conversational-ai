#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const DEFAULT_TIMEOUT_MS = 180_000;
const ACCOUNT_ENV = Object.freeze({
  orgAAdmin: ["DEV_ORG_A_ADMIN_EMAIL", "DEV_ORG_A_ADMIN_PASSWORD"],
  orgBAdmin: ["DEV_ORG_B_ADMIN_EMAIL", "DEV_ORG_B_ADMIN_PASSWORD"],
  orgBRestrictedViewer: [
    "DEV_ORG_B_RESTRICTED_EMAIL",
    "DEV_ORG_B_RESTRICTED_PASSWORD",
  ],
});
const FORBIDDEN_RESULT_FIELDS = new Set([
  "company_id",
  "tenant_id",
  "security_domain_id",
  "visibility_status",
  "source_system",
  "source_record_id",
  "cost_usd",
  "supplier_status",
  "weight_kg",
]);

function parseArgs(args) {
  const parsed = {
    baseUrl: process.env.CONVERSATION_API_BASE_URL,
    caseIds: [],
    repeat: 1,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--case") {
      const value = args[++index];
      if (!value) throw new Error("--case requires a case ID.");
      parsed.caseIds.push(
        ...value
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean),
      );
    } else if (arg.startsWith("--case=")) {
      const value = arg.slice("--case=".length);
      if (!value) throw new Error("--case requires a case ID.");
      parsed.caseIds.push(
        ...value
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean),
      );
    } else if (arg === "--repeat") {
      const value = Number(args[++index]);
      if (!Number.isSafeInteger(value) || value < 1 || value > 10) {
        throw new Error("--repeat must be an integer from 1 to 10.");
      }
      parsed.repeat = value;
    } else if (arg.startsWith("--repeat=")) {
      const value = Number(arg.slice("--repeat=".length));
      if (!Number.isSafeInteger(value) || value < 1 || value > 10) {
        throw new Error("--repeat must be an integer from 1 to 10.");
      }
      parsed.repeat = value;
    } else if (arg === "--base-url") {
      parsed.baseUrl = args[++index];
      if (!parsed.baseUrl) throw new Error("--base-url requires an API URL.");
    } else if (arg.startsWith("--base-url=")) {
      parsed.baseUrl = arg.slice("--base-url=".length);
      if (!parsed.baseUrl) throw new Error("--base-url requires an API URL.");
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  parsed.baseUrl ??= "http://localhost:3001/api/v1";
  parsed.baseUrl = parsed.baseUrl.replace(/\/+$/, "");
  return parsed;
}

function printHelp() {
  console.log(`Conversation golden-question evaluator

Usage:
  npm run eval:conversation
  npm.cmd run eval:conversation -- --case=A1,A2 --repeat=3
  node --env-file=../.env scripts/evaluate-conversation.mjs --base-url http://localhost:3001/api/v1

Options:
  --case ID[,ID...]  Run only the listed case IDs
  --repeat N         Run each selected case N times (1–10; default 1)
  --base-url URL     API base URL (default: CONVERSATION_API_BASE_URL or localhost)
  --help             Show this help

Development account values are read from the parent project .env file by the
package script. The evaluator never prints credentials or result rows.`);
}

function getSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const cookie = headers.get("set-cookie");
  return cookie ? [cookie] : [];
}

class ApiSession {
  constructor(baseUrl, timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
    this.cookies = new Map();
    this.csrfToken = null;
  }

  absorbCookies(headers) {
    for (const setCookie of getSetCookies(headers)) {
      const pair = setCookie.split(";", 1)[0];
      const separator = pair.indexOf("=");
      if (separator < 1) continue;
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      if (value) this.cookies.set(name, value);
      else this.cookies.delete(name);
    }
  }

  async request(path, { method = "GET", body, headers = {} } = {}) {
    const requestHeaders = new Headers({
      accept: "application/json",
      ...headers,
    });
    if (body !== undefined)
      requestHeaders.set("content-type", "application/json");
    if (this.cookies.size > 0) {
      requestHeaders.set(
        "cookie",
        [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "),
      );
    }
    if (this.csrfToken) requestHeaders.set("X-XSRF-TOKEN", this.csrfToken);

    let response;
    try {
      response = await fetch(`${this.baseUrl}/${path.replace(/^\/+/, "")}`, {
        method,
        headers: requestHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new Error(`request failed (${error.name ?? "network error"})`);
    }
    this.absorbCookies(response.headers);
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          `API returned non-JSON content (HTTP ${response.status})`,
        );
      }
    }
    return { response, data };
  }

  async signIn(context) {
    const accountKeys = ACCOUNT_ENV[context];
    if (!accountKeys) throw new Error(`Unknown account context: ${context}`);
    const [emailKey, passwordKey] = accountKeys;
    const email = process.env[emailKey];
    const password = process.env[passwordKey];
    if (!email || !password) return false;

    const csrf = await this.request("auth/csrf");
    if (!csrf.response.ok || typeof csrf.data?.data?.csrfToken !== "string") {
      throw new Error(
        `could not obtain login token (HTTP ${csrf.response.status})`,
      );
    }
    this.csrfToken = csrf.data.data.csrfToken;

    const login = await this.request("auth/login", {
      method: "POST",
      body: { email, password },
    });
    if (!login.response.ok) {
      throw new Error(
        `sign-in failed for ${context} (HTTP ${login.response.status})`,
      );
    }
    return true;
  }
}

function compareStringSets(actual, expected) {
  return (
    Array.isArray(actual) &&
    Array.isArray(expected) &&
    actual.length === expected.length &&
    [...actual]
      .sort()
      .every((value, index) => value === [...expected].sort()[index])
  );
}

function normalizeFilters(filters) {
  if (!Array.isArray(filters)) return null;
  return filters
    .map((filter) =>
      JSON.stringify([filter.field, filter.operator, filter.value]),
    )
    .sort();
}

function fail(message) {
  throw new Error(message);
}

function verifyQuery(actual, expected) {
  if (!actual || typeof actual !== "object")
    fail("accepted answer has no query trace");
  if (!compareStringSets(actual.measures, expected.measures)) {
    fail("query measures do not match");
  }
  if (!compareStringSets(actual.dimensions, expected.dimensions)) {
    fail("query dimensions do not match");
  }
  if (expected.limit !== undefined && actual.limit !== expected.limit) {
    fail("query result limit does not match");
  }
  const actualFilters = normalizeFilters(actual.filters);
  const expectedFilters = normalizeFilters(expected.filters);
  if (
    !actualFilters ||
    JSON.stringify(actualFilters) !== JSON.stringify(expectedFilters)
  ) {
    fail("query filters do not match");
  }
  if (expected.order_by !== undefined) {
    const actualOrderBy = Array.isArray(actual.order_by)
      ? actual.order_by
          .map(({ field, direction }) => `${field}:${direction}`)
          .sort()
      : [];
    const expectedOrderBy = expected.order_by
      .map(({ field, direction }) => `${field}:${direction}`)
      .sort();
    if (JSON.stringify(actualOrderBy) !== JSON.stringify(expectedOrderBy)) {
      fail("query sort order does not match");
    }
  }
  for (const field of [
    ...actual.measures,
    ...actual.dimensions,
    ...actual.filters.map((item) => item.field),
  ]) {
    if (FORBIDDEN_RESULT_FIELDS.has(field))
      fail("query includes an excluded field");
  }
}

function verifyResult(data, expected) {
  if (!expected) return;
  const rows = Array.isArray(data.rows) ? data.rows : [];
  if (expected.rowCount !== undefined && rows.length !== expected.rowCount) {
    fail("result row count does not match");
  }
  for (const row of rows) {
    for (const field of Object.keys(row)) {
      if (FORBIDDEN_RESULT_FIELDS.has(field))
        fail("answer exposes an excluded field");
    }
  }
  if (expected.partCountSum !== undefined) {
    let sum = 0n;
    try {
      for (const row of rows) sum += BigInt(row.part_count);
    } catch {
      fail("result does not contain numeric part counts");
    }
    if (sum !== BigInt(expected.partCountSum))
      fail("part-count total does not match");
  }
}

function verifyAnswer(data, expected) {
  const allowed = expected.statusAnyOf ?? [expected.status];
  if (!allowed.includes(data?.status)) fail("answer status does not match");

  const queryExpected = expected.query ?? expected.queryByStatus?.[data.status];
  const resultExpected =
    expected.result ?? expected.resultByStatus?.[data.status];
  if (queryExpected) verifyQuery(data.query, queryExpected);
  if (resultExpected) verifyResult(data, resultExpected);
  if (
    data.status !== "answered" &&
    (data.query || (data.rows?.length ?? 0) > 0)
  ) {
    fail("non-answer response included query or result data");
  }
}

async function runCase(testCase, repeat, baseUrl, sessions) {
  const expected = testCase.expected;
  const totals = { passed: 0, failed: 0, skipped: 0 };
  for (let iteration = 1; iteration <= repeat; iteration += 1) {
    const label = repeat > 1 ? `${testCase.id}#${iteration}` : testCase.id;
    const started = performance.now();
    let responseBody;
    try {
      let session;
      if (testCase.context) {
        if (!sessions.has(testCase.context)) {
          const newSession = new ApiSession(baseUrl);
          const signedIn = await newSession.signIn(testCase.context);
          sessions.set(testCase.context, signedIn ? newSession : null);
        }
        session = sessions.get(testCase.context);
        if (!session) {
          console.log(
            `SKIP ${label} (missing local development account settings)`,
          );
          totals.skipped += 1;
          continue;
        }
      } else {
        session = new ApiSession(baseUrl);
      }

      const { response, data } = await session.request("conversation/ask", {
        method: "POST",
        body: {
          question: testCase.question,
          ...(testCase.history ? { history: testCase.history } : {}),
        },
      });
      responseBody = data;
      if (expected.httpStatus !== undefined) {
        if (response.status !== expected.httpStatus) {
          fail(`expected HTTP ${expected.httpStatus}, got ${response.status}`);
        }
      } else {
        if (!response.ok) {
          const errorCode = data?.error?.code;
          fail(
            `API returned HTTP ${response.status}${errorCode ? ` (${errorCode})` : ""}`,
          );
        }
        verifyAnswer(data?.data, expected);
      }
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      const requestId = data?.meta?.requestId;
      console.log(
        `PASS ${label} (${seconds}s${requestId ? `, ${requestId}` : ""})`,
      );
      totals.passed += 1;
    } catch (error) {
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      const answer = responseBody?.data;
      const query = answer?.query;
      const observed = answer
        ? `; observed status=${answer.status}${query ? `, measures=${JSON.stringify(query.measures)}, dimensions=${JSON.stringify(query.dimensions)}, filters=${JSON.stringify(query.filters)}` : ""}`
        : "";
      const requestId = responseBody?.meta?.requestId;
      console.log(
        `FAIL ${label} (${seconds}s): ${error.message}${observed}${requestId ? `, request=${requestId}` : ""}`,
      );
      totals.failed += 1;
    }
  }
  return totals;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();

  const fixtureUrl = new URL(
    "../evaluation/conversation-golden-cases.json",
    import.meta.url,
  );
  const cases = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const selected = options.caseIds.length
    ? cases.filter((testCase) => options.caseIds.includes(testCase.id))
    : cases;
  const unknownIds = options.caseIds.filter(
    (id) => !cases.some((testCase) => testCase.id === id),
  );
  if (unknownIds.length > 0)
    throw new Error(`Unknown case ID(s): ${unknownIds.join(", ")}`);

  console.log(`API: ${options.baseUrl}`);
  console.log(`Cases: ${selected.length}; repetitions: ${options.repeat}`);

  const sessions = new Map();
  const totals = { passed: 0, failed: 0, skipped: 0 };
  for (const testCase of selected) {
    const result = await runCase(
      testCase,
      options.repeat,
      options.baseUrl,
      sessions,
    );
    for (const key of Object.keys(totals)) totals[key] += result[key];
  }
  console.log(
    `Summary: ${totals.passed} passed, ${totals.failed} failed, ${totals.skipped} skipped`,
  );
  if (totals.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Evaluator could not start: ${error.message}`);
  process.exitCode = 1;
});
