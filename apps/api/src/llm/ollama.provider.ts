import { Injectable } from '@nestjs/common';
import {
  LlmError,
  type LlmJsonRequest,
  type LlmJsonResult,
  type LlmProvider,
} from './llm.types';

const REQUEST_TIMEOUT_MS = 120_000;

/** A local Ollama server. Prompts stay on the machine. */
@Injectable()
export class OllamaProvider implements LlmProvider {
  readonly name = 'ollama';
  readonly external = false;

  async generateJson(request: LlmJsonRequest): Promise<LlmJsonResult> {
    const model = process.env.OLLAMA_MODEL ?? 'qwen3.5:2b';
    const baseUrl = (
      process.env.OLLAMA_BASE_URL ?? 'http://ollama:11434'
    ).replace(/\/$/, '');

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          model,
          stream: false,
          think: false,
          format: request.schema,
          options: { temperature: 0, num_ctx: 4096, num_predict: 256 },
          messages: request.messages,
        }),
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
      throw new LlmError(
        response.status >= 500 ? 'server_error' : 'request_failed',
        this.name,
        response.status,
      );
    }

    const payload = (await response.json()) as {
      message?: { content?: unknown };
      prompt_eval_count?: number;
      eval_count?: number;
    };
    return {
      content: payload.message?.content,
      usage: {
        inputTokens: payload.prompt_eval_count,
        outputTokens: payload.eval_count,
      },
      model,
    };
  }
}
