import { LlmError } from './llm.types';
import { OllamaProvider } from './ollama.provider';

const request = {
  messages: [{ role: 'user' as const, content: 'How many parts?' }],
  schema: { title: 'plan', type: 'object' },
};

describe('OllamaProvider', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    process.env.OLLAMA_MODEL = 'test-model';
    process.env.OLLAMA_BASE_URL = 'http://ollama.test:11434/';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...saved };
  });

  it('is a local provider', () => {
    const provider = new OllamaProvider();
    expect(provider.name).toBe('ollama');
    expect(provider.external).toBe(false);
  });

  it('sends the conversation with the schema as the output format', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          message: { content: '{"status":"unsupported"}' },
          prompt_eval_count: 12,
          eval_count: 7,
        }),
        { status: 200 },
      ),
    );

    const result = await new OllamaProvider().generateJson(request);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://ollama.test:11434/api/chat');
    const body = JSON.parse((init as RequestInit).body as string) as {
      model: string;
      stream: boolean;
      think: boolean;
      format: unknown;
      options: { temperature: number; num_ctx: number; num_predict: number };
      messages: unknown;
    };
    expect(body).toMatchObject({
      model: 'test-model',
      stream: false,
      think: false,
      format: request.schema,
      options: { temperature: 0, num_ctx: 4096, num_predict: 256 },
      messages: request.messages,
    });
    expect(result).toEqual({
      content: '{"status":"unsupported"}',
      usage: { inputTokens: 12, outputTokens: 7 },
      model: 'test-model',
    });
  });

  it('classifies network and timeout failures', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockRejectedValueOnce(new DOMException('slow', 'TimeoutError'))
      .mockRejectedValueOnce(new DOMException('stopped', 'AbortError'));
    const provider = new OllamaProvider();

    await expect(provider.generateJson(request)).rejects.toMatchObject({
      kind: 'unavailable',
    });
    await expect(provider.generateJson(request)).rejects.toMatchObject({
      kind: 'timeout',
    });
    await expect(provider.generateJson(request)).rejects.toMatchObject({
      kind: 'timeout',
    });
  });

  it('classifies HTTP failures', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('x', { status: 500 }))
      .mockResolvedValueOnce(new Response('x', { status: 404 }));
    const provider = new OllamaProvider();

    const server = await provider
      .generateJson(request)
      .catch((e: unknown) => e);
    expect(server).toBeInstanceOf(LlmError);
    expect(server).toMatchObject({ kind: 'server_error', status: 500 });
    await expect(provider.generateJson(request)).rejects.toMatchObject({
      kind: 'request_failed',
      status: 404,
    });
  });
});
