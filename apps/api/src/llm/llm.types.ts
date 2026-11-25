/**
 * A model provider turns a conversation plus a JSON schema into JSON output.
 * Providers know how to talk to one vendor; they never choose organizations,
 * roles or fields. Selection, retry, logging and error mapping live in
 * LlmService so every provider behaves the same way for the planner.
 */

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmJsonRequest {
  messages: LlmMessage[];
  /** The JSON schema the answer must satisfy. */
  schema: Record<string, unknown>;
}

export interface LlmUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface LlmJsonResult {
  /** The raw model output: a JSON string, or content parts that hold one. */
  content: unknown;
  usage?: LlmUsage;
  model: string;
}

export interface LlmProvider {
  /** Value of CONVERSATION_LLM_PROVIDER that selects this provider. */
  readonly name: string;
  /** True when prompts leave the machine (a cloud service). */
  readonly external: boolean;
  generateJson(request: LlmJsonRequest): Promise<LlmJsonResult>;
}

export const LLM_PROVIDERS = Symbol('LLM_PROVIDERS');

export type LlmFailureKind =
  | 'timeout'
  | 'unavailable'
  | 'rate_limited'
  | 'server_error'
  | 'request_failed';

/** A provider failure, described independently of any vendor. */
export class LlmError extends Error {
  constructor(
    readonly kind: LlmFailureKind,
    readonly provider: string,
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(`${provider}: ${kind}${status ? ` (${status})` : ''}`);
    this.name = 'LlmError';
  }
}
