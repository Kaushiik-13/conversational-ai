import { GeminiProvider } from './gemini.provider';
import { LlmError } from './llm.types';

const request = {
  messages: [
    { role: 'system' as const, content: 'Plan questions.' },
    { role: 'user' as const, content: 'How many parts?' },
    { role: 'assistant' as const, content: '{"status":"ok"}' },
    { role: 'user' as const, content: 'By category' },
  ],
  schema: { type: 'object' },
};

function ok(parts: unknown[], finishReason = 'STOP') {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts }, finishReason }],
      usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 29 },
    }),
    { status: 200 },
  );
}

describe('GeminiProvider', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'secret-test-key';
    process.env.GEMINI_BASE_URL = 'https://gemini.test/v1beta/';
    delete process.env.GEMINI_MODEL;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...saved };
  });

  it('is an external provider', () => {
    const provider = new GeminiProvider();
    expect(provider.name).toBe('gemini');
    expect(provider.external).toBe(true);
  });

  it('sends the key in a header, never in the URL', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(ok([{ text: '{"status":"ok"}' }]));

    await new GeminiProvider().generateJson(request);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url as string).toBe(
      'https://gemini.test/v1beta/models/gemini-3.1-flash-lite:generateContent',
    );
    expect(url as string).not.toContain('secret-test-key');
    expect(
      (init as RequestInit & { headers: Record<string, string> }).headers[
        'x-goog-api-key'
      ],
    ).toBe('secret-test-key');
  });

  it('maps messages and schema to the Gemini request', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(ok([{ text: '{}' }]));
    process.env.GEMINI_MODEL = 'gemini-custom';

    await new GeminiProvider().generateJson(request);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url as string).toContain('/models/gemini-custom:generateContent');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      systemInstruction: { parts: [{ text: 'Plan questions.' }] },
      contents: [
        { role: 'user', parts: [{ text: 'How many parts?' }] },
        { role: 'model', parts: [{ text: '{"status":"ok"}' }] },
        { role: 'user', parts: [{ text: 'By category' }] },
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
        responseJsonSchema: request.schema,
      },
    });
  });

  it('returns the visible text, skipping reasoning parts, with usage', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        ok([
          { text: 'thinking...', thought: true },
          { text: '{"status":' },
          { text: '"ok"}' },
        ]),
      );

    await expect(new GeminiProvider().generateJson(request)).resolves.toEqual({
      content: '{"status":"ok"}',
      usage: { inputTokens: 15, outputTokens: 29 },
      model: 'gemini-3.1-flash-lite',
    });
  });

  it('returns no content when the model did not finish normally', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(ok([{ text: '{"status":' }], 'MAX_TOKENS'));
    const result = await new GeminiProvider().generateJson(request);
    expect(result.content).toBeUndefined();
  });

  it('fails clearly without a key and does not call the network', async () => {
    delete process.env.GEMINI_API_KEY;
    const fetchMock = jest.spyOn(global, 'fetch');
    await expect(
      new GeminiProvider().generateJson(request),
    ).rejects.toMatchObject({ kind: 'unavailable' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('classifies network and timeout failures', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new DOMException('slow', 'TimeoutError'));
    const provider = new GeminiProvider();
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
      .mockResolvedValueOnce(new Response('x', { status: 400 }));
    const provider = new GeminiProvider();
    const server = await provider
      .generateJson(request)
      .catch((e: unknown) => e);
    expect(server).toBeInstanceOf(LlmError);
    expect(server).toMatchObject({ kind: 'server_error', status: 503 });
    await expect(provider.generateJson(request)).rejects.toMatchObject({
      kind: 'request_failed',
      status: 400,
    });
  });

  it('reads the wait from Retry-After on a rate limit', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response('x', { status: 429, headers: { 'retry-after': '3' } }),
      );
    await expect(
      new GeminiProvider().generateJson(request),
    ).rejects.toMatchObject({ kind: 'rate_limited', retryAfterMs: 3000 });
  });

  it('reads the wait from the error details on a rate limit', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            details: [
              {
                '@type': 'type.googleapis.com/google.rpc.RetryInfo',
                retryDelay: '12s',
              },
            ],
          },
        }),
        { status: 429 },
      ),
    );
    await expect(
      new GeminiProvider().generateJson(request),
    ).rejects.toMatchObject({ kind: 'rate_limited', retryAfterMs: 12000 });
  });

  it('still reports a rate limit when the body has no wait', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('not json', { status: 429 }));
    await expect(
      new GeminiProvider().generateJson(request),
    ).rejects.toMatchObject({ kind: 'rate_limited', retryAfterMs: undefined });
  });
});
