import { Injectable } from '@nestjs/common';
import {
  LlmError,
  type LlmJsonRequest,
  type LlmJsonResult,
  type LlmMessage,
  type LlmProvider,
} from './llm.types';

const REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MODEL = 'gemini-3.1-flash-lite';
const MAX_OUTPUT_TOKENS = 2048;

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
  }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

/**
 * Google Gemini through the generateContent REST API. Prompts leave the
 * machine, so LlmService only calls this when LLM_ALLOW_EXTERNAL=true.
 *
 * The key travels in a header, never in the URL, and is never logged.
 * Gemini ignores some schema keywords (for example `const`), so the plan is
 * still validated by trusted code after it comes back.
 */
@Injectable()
export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';
  readonly external = true;

  async generateJson(request: LlmJsonRequest): Promise<LlmJsonResult> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) throw new LlmError('unavailable', this.name);
    const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
    const baseUrl = (
      process.env.GEMINI_BASE_URL ??
      'https://generativelanguage.googleapis.com/v1beta'
    ).replace(/\/$/, '');

    let response: Response;
    try {
      response = await fetch(
        `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          body: JSON.stringify(this.body(request)),
        },
      );
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')
      ) {
        throw new LlmError('timeout', this.name);
      }
      throw new LlmError('unavailable', this.name);
    }

    if (!response.ok) throw await this.failure(response);

    const payload = (await response.json()) as GeminiResponse;
    const candidate = payload.candidates?.[0];
    // Skip reasoning parts; the JSON answer is the visible text.
    const text = (candidate?.content?.parts ?? [])
      .filter((part) => part.thought !== true && typeof part.text === 'string')
      .map((part) => part.text)
      .join('');
    return {
      content: candidate?.finishReason === 'STOP' ? text : undefined,
      usage: {
        inputTokens: payload.usageMetadata?.promptTokenCount,
        outputTokens: payload.usageMetadata?.candidatesTokenCount,
      },
      model,
    };
  }

  private body(request: LlmJsonRequest) {
    const system = request.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    return {
      ...(system && { systemInstruction: { parts: [{ text: system }] } }),
      contents: request.messages
        .filter((m): m is LlmMessage => m.role !== 'system')
        .map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
      generationConfig: {
        temperature: 0,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        responseMimeType: 'application/json',
        responseJsonSchema: request.schema,
      },
    };
  }

  private async failure(response: Response): Promise<LlmError> {
    if (response.status === 429) {
      return new LlmError(
        'rate_limited',
        this.name,
        429,
        await this.retryDelayMs(response),
      );
    }
    return new LlmError(
      response.status >= 500 ? 'server_error' : 'request_failed',
      this.name,
      response.status,
    );
  }

  /** Reads the server's suggested wait from the header or the error details. */
  private async retryDelayMs(response: Response): Promise<number | undefined> {
    const header = Number(response.headers.get('retry-after'));
    if (Number.isFinite(header) && header > 0) return header * 1000;
    try {
      const body = (await response.json()) as {
        error?: { details?: { retryDelay?: string }[] };
      };
      const delay = body.error?.details?.find((d) => d.retryDelay)?.retryDelay;
      const seconds = delay ? Number.parseFloat(delay) : NaN;
      return Number.isFinite(seconds) && seconds > 0
        ? Math.round(seconds * 1000)
        : undefined;
    } catch {
      return undefined;
    }
  }
}
