import { Logger } from '@nestjs/common';
import { LlmService } from './llm.service';
import {
  LlmError,
  type LlmJsonRequest,
  type LlmJsonResult,
  type LlmProvider,
} from './llm.types';

const request: LlmJsonRequest = {
  messages: [{ role: 'user', content: 'a secret question about parts' }],
  schema: { type: 'object' },
};
const ok: LlmJsonResult = {
  content: '{"status":"unsupported"}',
  model: 'm',
  usage: { inputTokens: 10, outputTokens: 5 },
};

function provider(
  name: string,
  external: boolean,
  generate: LlmProvider['generateJson'],
): LlmProvider {
  return { name, external, generateJson: generate };
}

describe('LlmService', () => {
  const saved = { ...process.env };
  let logs: string[];

  beforeEach(() => {
    process.env.CONVERSATION_LLM_PROVIDER = 'local';
    delete process.env.LLM_ALLOW_EXTERNAL;
    logs = [];
    jest.spyOn(Logger.prototype, 'log').mockImplementation((m) => {
      logs.push(String(m));
    });
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((m) => {
      logs.push(String(m));
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    process.env = { ...saved };
  });

  it('calls the configured provider and returns its result', async () => {
    const generate = jest.fn().mockResolvedValue(ok);
    const service = new LlmService([
      provider('other', false, jest.fn()),
      provider('local', false, generate),
    ]);

    await expect(service.generateJson(request)).resolves.toBe(ok);
    expect(generate).toHaveBeenCalledWith(request);
  });

  it('refuses an unknown provider', async () => {
    process.env.CONVERSATION_LLM_PROVIDER = 'nope';
    const service = new LlmService([provider('local', false, jest.fn())]);
    await expect(service.generateJson(request)).rejects.toMatchObject({
      response: { code: 'LLM_PROVIDER_NOT_SUPPORTED' },
      status: 503,
    });
  });

  it('refuses a cloud provider unless it is explicitly allowed', async () => {
    process.env.CONVERSATION_LLM_PROVIDER = 'cloud';
    const generate = jest.fn().mockResolvedValue(ok);
    const service = new LlmService([provider('cloud', true, generate)]);

    await expect(service.generateJson(request)).rejects.toMatchObject({
      response: { code: 'LLM_EXTERNAL_NOT_ALLOWED' },
    });
    expect(generate).not.toHaveBeenCalled();

    process.env.LLM_ALLOW_EXTERNAL = 'true';
    await expect(service.generateJson(request)).resolves.toBe(ok);
  });

  it('does not treat a value other than "true" as consent', async () => {
    process.env.CONVERSATION_LLM_PROVIDER = 'cloud';
    process.env.LLM_ALLOW_EXTERNAL = 'yes';
    const service = new LlmService([provider('cloud', true, jest.fn())]);
    await expect(service.generateJson(request)).rejects.toMatchObject({
      response: { code: 'LLM_EXTERNAL_NOT_ALLOWED' },
    });
  });

  it('retries a rate limit once and honours a short wait', async () => {
    jest.useFakeTimers();
    const generate = jest
      .fn()
      .mockRejectedValueOnce(new LlmError('rate_limited', 'local', 429, 1500))
      .mockResolvedValueOnce(ok);
    const service = new LlmService([provider('local', false, generate)]);

    const pending = service.generateJson(request);
    await jest.advanceTimersByTimeAsync(1500);

    await expect(pending).resolves.toBe(ok);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('caps the wait before a retry', async () => {
    jest.useFakeTimers();
    const generate = jest
      .fn()
      .mockRejectedValueOnce(new LlmError('rate_limited', 'local', 429, 60000))
      .mockResolvedValueOnce(ok);
    const service = new LlmService([provider('local', false, generate)]);

    const pending = service.generateJson(request);
    await jest.advanceTimersByTimeAsync(5000);

    await expect(pending).resolves.toBe(ok);
  });

  it('retries a server error once, then gives up with a clear error', async () => {
    jest.useFakeTimers();
    const generate = jest
      .fn()
      .mockRejectedValue(new LlmError('server_error', 'cloud', 503));
    process.env.CONVERSATION_LLM_PROVIDER = 'cloud';
    process.env.LLM_ALLOW_EXTERNAL = 'true';
    const service = new LlmService([provider('cloud', true, generate)]);

    const pending = service.generateJson(request);
    const settled = expect(pending).rejects.toMatchObject({
      response: { code: 'LLM_REQUEST_FAILED' },
      status: 503,
    });
    await jest.advanceTimersByTimeAsync(5000);
    await settled;
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it.each(['timeout', 'unavailable', 'request_failed'] as const)(
    'does not retry a %s failure',
    async (kind) => {
      const generate = jest
        .fn()
        .mockRejectedValue(new LlmError(kind, 'local', 400));
      const service = new LlmService([provider('local', false, generate)]);
      await expect(service.generateJson(request)).rejects.toBeDefined();
      expect(generate).toHaveBeenCalledTimes(1);
    },
  );

  it('maps failures to API errors with provider-specific codes', async () => {
    const failing = (kind: LlmError['kind']) =>
      new LlmService([
        provider(
          'local',
          false,
          jest.fn().mockRejectedValue(new LlmError(kind, 'ollama')),
        ),
      ]);
    const cloud = (kind: LlmError['kind']) => {
      process.env.CONVERSATION_LLM_PROVIDER = 'cloud';
      process.env.LLM_ALLOW_EXTERNAL = 'true';
      return new LlmService([
        provider(
          'cloud',
          true,
          jest.fn().mockRejectedValue(new LlmError(kind, 'cloud')),
        ),
      ]);
    };

    await expect(
      failing('timeout').generateJson(request),
    ).rejects.toMatchObject({
      response: { code: 'LOCAL_MODEL_TIMEOUT' },
      status: 504,
    });
    await expect(
      failing('unavailable').generateJson(request),
    ).rejects.toMatchObject({
      response: { code: 'LOCAL_MODEL_UNAVAILABLE' },
      status: 503,
    });
    await expect(
      failing('request_failed').generateJson(request),
    ).rejects.toMatchObject({
      response: { code: 'LOCAL_MODEL_REQUEST_FAILED' },
    });
    await expect(cloud('timeout').generateJson(request)).rejects.toMatchObject({
      response: { code: 'LLM_TIMEOUT' },
      status: 504,
    });
    await expect(
      cloud('unavailable').generateJson(request),
    ).rejects.toMatchObject({
      response: { code: 'LLM_UNAVAILABLE' },
    });
    jest.useFakeTimers();
    const limited = expect(
      cloud('rate_limited').generateJson(request),
    ).rejects.toMatchObject({
      response: { code: 'LLM_RATE_LIMITED' },
      status: 429,
    });
    await jest.advanceTimersByTimeAsync(5000);
    await limited;
  });

  it('passes through errors that are not provider failures', async () => {
    const boom = new Error('bug');
    const service = new LlmService([
      provider('local', false, jest.fn().mockRejectedValue(boom)),
    ]);
    await expect(service.generateJson(request)).rejects.toBe(boom);
  });

  it('logs provider, model, latency and tokens but never the prompt', async () => {
    const service = new LlmService([
      provider('local', false, jest.fn().mockResolvedValue(ok)),
    ]);
    await service.generateJson(request);

    const line = logs.join('\n');
    expect(line).toContain('provider=local');
    expect(line).toContain('model=m');
    expect(line).toContain('inputTokens=10');
    expect(line).toContain('outputTokens=5');
    expect(line).not.toContain('secret question');
  });

  it('logs failures without the prompt or any secret', async () => {
    const service = new LlmService([
      provider(
        'local',
        false,
        jest.fn().mockRejectedValue(new LlmError('timeout', 'local')),
      ),
    ]);
    await service.generateJson(request).catch(() => undefined);
    const line = logs.join('\n');
    expect(line).toContain('kind=timeout');
    expect(line).not.toContain('secret question');
  });
});
