import {
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  LLM_PROVIDERS,
  LlmError,
  type LlmJsonRequest,
  type LlmJsonResult,
  type LlmProvider,
} from './llm.types';

const MAX_RETRY_WAIT_MS = 5_000;
const DEFAULT_RETRY_WAIT_MS = 800;

/**
 * The single entry point the planner uses to reach a model. It picks the
 * provider from configuration, refuses cloud providers unless they are
 * explicitly allowed, retries a transient failure once, logs every call
 * without prompt text, and turns provider failures into API errors.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(
    @Inject(LLM_PROVIDERS) private readonly providers: LlmProvider[],
  ) {}

  async generateJson(request: LlmJsonRequest): Promise<LlmJsonResult> {
    const provider = this.selectProvider();
    const started = Date.now();
    try {
      const result = await this.callWithRetry(provider, request);
      this.logger.log(
        `llm call ok provider=${provider.name} model=${result.model} latencyMs=${Date.now() - started}` +
          ` inputTokens=${result.usage?.inputTokens ?? '-'} outputTokens=${result.usage?.outputTokens ?? '-'}`,
      );
      return result;
    } catch (error) {
      if (error instanceof LlmError) {
        this.logger.warn(
          `llm call failed provider=${provider.name} kind=${error.kind} status=${error.status ?? '-'} latencyMs=${Date.now() - started}`,
        );
        throw this.toHttpException(error);
      }
      throw error;
    }
  }

  private selectProvider(): LlmProvider {
    const name = (process.env.CONVERSATION_LLM_PROVIDER ?? 'ollama')
      .trim()
      .toLowerCase();
    const provider = this.providers.find(
      (candidate) => candidate.name === name,
    );
    if (!provider) {
      throw new ServiceUnavailableException({
        code: 'LLM_PROVIDER_NOT_SUPPORTED',
        message:
          'The configured conversational model provider is not supported.',
      });
    }
    if (provider.external && process.env.LLM_ALLOW_EXTERNAL !== 'true') {
      throw new ServiceUnavailableException({
        code: 'LLM_EXTERNAL_NOT_ALLOWED',
        message:
          'A cloud model provider is configured, but sending questions to it has not been allowed. Set LLM_ALLOW_EXTERNAL=true to allow it.',
      });
    }
    return provider;
  }

  /** One retry, only for rate limits and server errors, never for timeouts. */
  private async callWithRetry(
    provider: LlmProvider,
    request: LlmJsonRequest,
  ): Promise<LlmJsonResult> {
    try {
      return await provider.generateJson(request);
    } catch (error) {
      const retryable =
        error instanceof LlmError &&
        (error.kind === 'rate_limited' || error.kind === 'server_error');
      if (!retryable) throw error;
      const wait = Math.min(
        error.retryAfterMs ?? DEFAULT_RETRY_WAIT_MS,
        MAX_RETRY_WAIT_MS,
      );
      this.logger.warn(
        `llm call retrying provider=${provider.name} kind=${error.kind} waitMs=${wait}`,
      );
      await new Promise((resolve) => setTimeout(resolve, wait));
      return provider.generateJson(request);
    }
  }

  private toHttpException(error: LlmError): HttpException {
    // Ollama keeps its original codes; the web app already understands them.
    const local = error.provider === 'ollama';
    switch (error.kind) {
      case 'timeout':
        return new GatewayTimeoutException({
          code: local ? 'LOCAL_MODEL_TIMEOUT' : 'LLM_TIMEOUT',
          message: local
            ? 'The local model took too long to plan this question. Try again with a shorter or simpler question.'
            : 'The model took too long to plan this question. Try again with a shorter or simpler question.',
        });
      case 'unavailable':
        return new ServiceUnavailableException({
          code: local ? 'LOCAL_MODEL_UNAVAILABLE' : 'LLM_UNAVAILABLE',
          message: local
            ? 'The local conversational model is unavailable. Check that the Ollama service is running.'
            : 'The conversational model service is unavailable. Try again shortly.',
        });
      case 'rate_limited':
        return new HttpException(
          {
            code: 'LLM_RATE_LIMITED',
            message:
              'The model service is busy right now. Try again in a moment.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      default:
        return new ServiceUnavailableException({
          code: local ? 'LOCAL_MODEL_REQUEST_FAILED' : 'LLM_REQUEST_FAILED',
          message: local
            ? 'The local conversational model could not complete the request.'
            : 'The conversational model could not complete the request.',
        });
    }
  }
}
