import { GroqProvider } from './groq.provider';
import { LlmError } from './llm.types';

const request = {
  messages: [
    { role: 'system' as const, content: 'Plan questions.' },
    { role: 'user' as const, content: 'How many parts?' },
  ],
  schema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
  },
};

function ok(content: string | null, finish = 'stop') {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content }, finish_reason: finish }],
      usage: { prompt_tokens: 533, completion_tokens: 126 },
    }),
    { status: 200 },
  );
}

function sentBody(
  mock: jest.SpyInstance<Promise<Response>, Parameters<typeof fetch>>,
): Record<string, unknown> {
  const init = mock.mock.calls[0][1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe('GroqProvider', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    process.env.GROQ_API_KEY = 'secret-test-key';
    process.env.GROQ_BASE_URL = 'https://groq.test/openai/v1/';
    delete process.env.GROQ_MODEL;
    delete process.env.GROQ_REASONING_EFFORT;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...saved };
  });

  it('is an external provider', () => {
    const provider = new GroqProvider();
    expect(provider.name).toBe('groq');
    expect(provider.external).toBe(true);
  });

  it('sends a chat completion with the schema as the response format', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(ok('{}'));

    await new GroqProvider().generateJson(request);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url as string).toBe('https://groq.test/openai/v1/chat/completions');
    expect(url as string).not.toContain('secret-test-key');
    expect(
      (init as RequestInit & { headers: Record<string, string> }).headers
        .authorization,
    ).toBe('Bearer secret-test-key');
    expect(sentBody(fetchMock)).toEqual({
      model: 'openai/gpt-oss-120b',
      temperature: 0,
      max_completion_tokens: 2048,
      reasoning_effort: 'low',
      messages: request.messages,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'plan',
          strict: false,
          schema: { type: 'object' },
        },
      },
    });
  });

  it('uses the configured model and reasoning effort', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() => Promise.resolve(ok('{}')));
    process.env.GROQ_REASONING_EFFORT = 'medium';
    await new GroqProvider().generateJson(request);
    expect(sentBody(fetchMock)).toMatchObject({ reasoning_effort: 'medium' });

    fetchMock.mockClear();
    process.env.GROQ_MODEL = 'qwen/qwen3.8-27b';
    await new GroqProvider().generateJson(request);
    const body = sentBody(fetchMock);
    expect(body.model).toBe('qwen/qwen3.8-27b');
    expect(body).not.toHaveProperty('reasoning_effort');
  });

  it('returns the content with usage', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(ok('{"status":"unsupported"}'));
    await expect(new GroqProvider().generateJson(request)).resolves.toEqual({
      content: '{"status":"unsupported"}',
      usage: { inputTokens: 533, outputTokens: 126 },
      model: 'openai/gpt-oss-120b',
    });
  });

  it('returns no content when the answer was cut off', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(ok('{"sta', 'length'));
    const result = await new GroqProvider().generateJson(request);
    expect(result.content).toBeUndefined();
  });

  it('treats output that broke the schema as an invalid plan, not an outage', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'json_validate_failed', message: 'bad' },
        }),
        { status: 400 },
      ),
    );
    await expect(new GroqProvider().generateJson(request)).resolves.toEqual({
      content: undefined,
      model: 'openai/gpt-oss-120b',
    });
  });

  it('fails clearly without a key and does not call the network', async () => {
    delete process.env.GROQ_API_KEY;
    const fetchMock = jest.spyOn(global, 'fetch');
    await expect(
      new GroqProvider().generateJson(request),
    ).rejects.toMatchObject({ kind: 'unavailable' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('classifies network and timeout failures', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new DOMException('slow', 'TimeoutError'));
    const provider = new GroqProvider();
    await expect(provider.generateJson(request)).rejects.toMatchObject({
      kind: 'unavailable',
    });
    await expect(provider.generateJson(request)).rejects.toMatchObject({
      kind: 'timeout',
    });
  });

  it('classifies HTTP failures', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('x', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 'other' } }), {
          status: 400,
        }),
      )
      .mockResolvedValueOnce(new Response('x', { status: 401 }));
    const provider = new GroqProvider();
    const server = await provider
      .generateJson(request)
      .catch((e: unknown) => e);
    expect(server).toBeInstanceOf(LlmError);
    expect(server).toMatchObject({ kind: 'server_error', status: 503 });
    await expect(provider.generateJson(request)).rejects.toMatchObject({
      kind: 'request_failed',
      status: 400,
    });
    await expect(provider.generateJson(request)).rejects.toMatchObject({
      kind: 'request_failed',
      status: 401,
    });
  });

  it('reads the wait from Retry-After on a rate limit', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response('x', { status: 429, headers: { 'retry-after': '7' } }),
      )
      .mockResolvedValueOnce(new Response('x', { status: 429 }));
    const provider = new GroqProvider();
    await expect(provider.generateJson(request)).rejects.toMatchObject({
      kind: 'rate_limited',
      retryAfterMs: 7000,
    });
    await expect(provider.generateJson(request)).rejects.toMatchObject({
      kind: 'rate_limited',
      retryAfterMs: undefined,
    });
  });
});
