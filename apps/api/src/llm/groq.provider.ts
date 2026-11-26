import { Injectable } from '@nestjs/common';
import {
  LlmError,
  type LlmJsonRequest,
  type LlmJsonResult,
  type LlmProvider,
} from './llm.types';

const REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const DEFAULT_REASONING_EFFORT = 'low';
const MAX_OUTPUT_TOKENS = 2048;

interface GroqResponse {
  choices?: {
    message?: { content?: string | null };
    finish_reason?: string;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Groq through its OpenAI-style chat completions API. Prompts leave the
 * machine, so LlmService only calls this when LLM_ALLOW_EXTERNAL=true.
 *
 * Structured output runs in best-effort mode: strict mode rejects a schema
 * with a top-level `oneOf`, which the plan schema has. The plan is validated
 * by trusted code afterwards either way.
 */
@Injectable()
export class GroqProvider implements LlmProvider {
  readonly name = 'groq';
  readonly external = true;

  async generateJson(request: LlmJsonRequest): Promise<LlmJsonResult> {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) throw new LlmError('unavailable', this.name);
    const model = process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL;
    const baseUrl = (
      process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1'
    ).replace(/\/$/, '');

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: JSON.stringify(this.body(model, request)),
      });
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')
      ) {
        throw new LlmError('timeout', this.name);
      }
      throw new LlmError('unavailable', this.name);
    }

    if (!response.ok) {
      // The model produced JSON that broke the schema. That is a bad plan,
      // not a service failure, so hand back no content and let the planner
      // treat it like any other invalid plan.
      if (response.status === 400 && (await this.isSchemaFailure(response))) {
        return { content: undefined, model };
      }
      throw this.failure(response);
    }

    const payload = (await response.json()) as GroqResponse;
    const choice = payload.choices?.[0];
    return {
      content:
        choice?.finish_reason === 'stop'
          ? (choice.message?.content ?? undefined)
          : undefined,
      usage: {
        inputTokens: payload.usage?.prompt_tokens,
        outputTokens: payload.usage?.completion_tokens,
      },
      model,
    };
  }

  private body(model: string, request: LlmJsonRequest) {
    const reasoningModel = model.startsWith('openai/gpt-oss');
    return {
      model,
      temperature: 0,
      max_completion_tokens: MAX_OUTPUT_TOKENS,
      ...(reasoningModel && {
        reasoning_effort:
          process.env.GROQ_REASONING_EFFORT?.trim() || DEFAULT_REASONING_EFFORT,
      }),
      messages: request.messages,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'plan',
          strict: false,
          schema: this.withoutMetaKeys(request.schema),
        },
      },
    };
  }

  /** Groq rejects the `$schema` keyword; the rest of the schema is kept. */
  private withoutMetaKeys(schema: Record<string, unknown>) {
    const copy = { ...schema };
    delete copy.$schema;
    return copy;
  }

  private async isSchemaFailure(response: Response): Promise<boolean> {
    try {
      const body = (await response.json()) as { error?: { code?: string } };
      return body.error?.code === 'json_validate_failed';
    } catch {
      return false;
    }
  }

  private failure(response: Response): LlmError {
    if (response.status === 429) {
      const seconds = Number.parseFloat(
        response.headers.get('retry-after') ?? '',
      );
      return new LlmError(
        'rate_limited',
        this.name,
        429,
        Number.isFinite(seconds) && seconds > 0
          ? Math.round(seconds * 1000)
          : undefined,
      );
    }
    return new LlmError(
      response.status >= 500 ? 'server_error' : 'request_failed',
      this.name,
      response.status,
    );
  }
}
