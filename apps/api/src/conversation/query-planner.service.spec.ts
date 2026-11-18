import { QueryPlannerService } from './query-planner.service';
import { resolve } from 'node:path';

interface CapturedOllamaRequest {
  model: string;
  think: boolean;
  options: { num_predict: number };
  format: { title: string };
  messages: Array<{ role: string; content: string }>;
}

describe('QueryPlannerService', () => {
  const previousSemanticPath = process.env.SEMANTIC_MODEL_PATH;
  const previousSchemaPath = process.env.CONVERSATION_PLAN_SCHEMA_PATH;
  const previousModel = process.env.OLLAMA_MODEL;
  const previousBaseUrl = process.env.OLLAMA_BASE_URL;
  const previousProvider = process.env.CONVERSATION_LLM_PROVIDER;

  beforeAll(() => {
    process.env.SEMANTIC_MODEL_PATH = resolve(
      __dirname,
      '../../../../semantic/automotive/catalog.yaml',
    );
    process.env.CONVERSATION_PLAN_SCHEMA_PATH = resolve(
      __dirname,
      '../../../../packages/cube-query/conversation-plan.v1.schema.json',
    );
    process.env.OLLAMA_MODEL = 'qwen3.5:2b';
    process.env.OLLAMA_BASE_URL = 'http://ollama:11434/';
    process.env.CONVERSATION_LLM_PROVIDER = 'ollama';
  });

  afterEach(() => {
    process.env.CONVERSATION_LLM_PROVIDER = 'ollama';
  });

  afterAll(() => {
    if (previousSemanticPath === undefined)
      delete process.env.SEMANTIC_MODEL_PATH;
    else process.env.SEMANTIC_MODEL_PATH = previousSemanticPath;
    if (previousSchemaPath === undefined)
      delete process.env.CONVERSATION_PLAN_SCHEMA_PATH;
    else process.env.CONVERSATION_PLAN_SCHEMA_PATH = previousSchemaPath;
    if (previousModel === undefined) delete process.env.OLLAMA_MODEL;
    else process.env.OLLAMA_MODEL = previousModel;
    if (previousBaseUrl === undefined) delete process.env.OLLAMA_BASE_URL;
    else process.env.OLLAMA_BASE_URL = previousBaseUrl;
    if (previousProvider === undefined)
      delete process.env.CONVERSATION_LLM_PROVIDER;
    else process.env.CONVERSATION_LLM_PROVIDER = previousProvider;
  });

  it.each([
    {
      question: 'How many parts are there in total?',
      dimensions: [],
      filters: [],
    },
    {
      question: 'How many parts are there in each region?',
      dimensions: ['region'],
      filters: [],
    },
    {
      question: 'Count parts by manufacturer in Europe.',
      dimensions: ['manufacturer'],
      filters: [{ field: 'region', operator: 'equals', value: 'Europe' }],
    },
    {
      question: 'How many parts are there in each sub-commodity?',
      dimensions: ['sub_commodity'],
      filters: [],
    },
    {
      question: 'How many parts are there by lifecycle status?',
      dimensions: ['lifecycle_status'],
      filters: [],
    },
    {
      question: 'How many parts are there in each category?',
      dimensions: ['category'],
      filters: [],
    },
  ])(
    'builds a safe plan for the clear breakdown: $question',
    async ({ question, dimensions, filters }) => {
      const fetchMock = jest
        .spyOn(global, 'fetch')
        .mockRejectedValue(new Error('unexpected local model request'));
      const result = await new QueryPlannerService().plan(question);
      expect(result).toMatchObject({
        status: 'query',
        cube_query: {
          version: 1,
          model: 'automotive_catalog',
          measures: ['part_count'],
          dimensions,
          filters,
          limit: 100,
        },
      });
      expect(fetchMock).not.toHaveBeenCalled();
      fetchMock.mockRestore();
    },
  );

  it('plans the common top commodities request without calling Ollama', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('unexpected local model request'));
    const result = await new QueryPlannerService().plan(
      'Show the top 5 commodities by part count in Europe.',
    );
    expect(result).toMatchObject({
      status: 'query',
      cube_query: {
        measures: ['part_count'],
        dimensions: ['commodity'],
        filters: [{ field: 'region', operator: 'equals', value: 'Europe' }],
        order_by: [{ field: 'part_count', direction: 'desc' }],
        limit: 5,
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it('uses an exact part-number filter without asking the model to reinterpret it', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('unexpected local model request'));
    const result = await new QueryPlannerService().plan(
      'How many parts match part number BRK-0000001?',
    );
    expect(result).toMatchObject({
      status: 'query',
      cube_query: {
        measures: ['part_count'],
        dimensions: [],
        filters: [
          {
            field: 'part_number',
            operator: 'equals',
            value: 'BRK-0000001',
          },
        ],
        limit: 100,
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it.each([
    {
      question: 'Get me count of manufacturers who does brake pads.',
      measures: ['manufacturer_count'],
      dimensions: [],
      filters: [{ field: 'category', operator: 'equals', value: 'brake-pads' }],
    },
    {
      question: 'How many manufacturers make brake pads?',
      measures: ['manufacturer_count'],
      dimensions: [],
      filters: [{ field: 'category', operator: 'equals', value: 'brake-pads' }],
    },
    {
      question: 'How many parts are in the catalog?',
      measures: ['part_count'],
      dimensions: [],
      filters: [],
    },
    {
      question: 'How many prototype, superseded, and obsolete parts are there?',
      measures: ['part_count'],
      dimensions: ['lifecycle_status'],
      filters: [
        {
          field: 'lifecycle_status',
          operator: 'in',
          value: ['prototype', 'superseded', 'obsolete'],
        },
      ],
    },
    {
      question: 'How many parts are for model year 2025?',
      measures: ['part_count'],
      dimensions: [],
      filters: [{ field: 'model_year', operator: 'equals', value: 2025 }],
    },
    {
      question: 'How many parts does Zephyr Powertrain have?',
      measures: ['part_count'],
      dimensions: [],
      filters: [
        {
          field: 'manufacturer',
          operator: 'equals',
          value: 'Zephyr Powertrain',
        },
      ],
    },
    {
      question: 'Count parts under Zephyr Powertrain.',
      measures: ['part_count'],
      dimensions: [],
      filters: [
        {
          field: 'manufacturer',
          operator: 'equals',
          value: 'Zephyr Powertrain',
        },
      ],
    },
    {
      question: 'For 2025 model-year parts, show counts by commodity.',
      measures: ['part_count'],
      dimensions: ['commodity'],
      filters: [{ field: 'model_year', operator: 'equals', value: 2025 }],
    },
    {
      question: 'How many active parts are in each region?',
      measures: ['part_count'],
      dimensions: ['region'],
      filters: [{ field: 'active', operator: 'equals', value: true }],
    },
    {
      question:
        'Show counts by region, commodity, and lifecycle status for active parts.',
      measures: ['part_count'],
      dimensions: ['region', 'commodity', 'lifecycle_status'],
      filters: [{ field: 'active', operator: 'equals', value: true }],
    },
  ])(
    'understands common automotive wording: $question',
    async ({ question, measures, dimensions, filters }) => {
      const fetchMock = jest
        .spyOn(global, 'fetch')
        .mockRejectedValue(new Error('unexpected local model request'));
      const result = await new QueryPlannerService().plan(question);
      expect(result).toMatchObject({
        status: 'query',
        cube_query: {
          version: 1,
          model: 'automotive_catalog',
          measures,
          dimensions,
          filters,
          limit: 100,
        },
      });
      expect(fetchMock).not.toHaveBeenCalled();
      fetchMock.mockRestore();
    },
  );

  it('sends the question and curated semantic context to Ollama and parses a plan', async () => {
    const topFivePlan = {
      version: 1,
      model: 'automotive_catalog',
      measures: ['part_count'],
      dimensions: ['commodity'],
      filters: [{ field: 'region', operator: 'equals', value: 'Europe' }],
      order_by: [{ field: 'part_count', direction: 'desc' }],
      limit: 5,
    };
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              status: 'query',
              cube_query: topFivePlan,
            }),
          },
        }),
        { status: 200 },
      ),
    );

    const result = await new QueryPlannerService().plan(
      'Show the part count for the most common commodity in Europe.',
    );
    expect(result.status).toBe('query');
    expect(result.cube_query).toEqual(topFivePlan);
    expect(result.message).toBe(
      'Here are the matching automotive catalog results.',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://ollama:11434/api/chat',
      expect.objectContaining({ method: 'POST' }),
    );
    const init = fetchMock.mock.calls[0]?.[1];
    if (typeof init?.body !== 'string')
      throw new Error('Expected JSON request body.');
    const request = JSON.parse(init.body) as CapturedOllamaRequest;
    expect(request.model).toBe('qwen3.5:2b');
    expect(request.think).toBe(false);
    expect(request.options.num_predict).toBe(256);
    expect(request.format.title).toContain('query plan');
    expect(request.messages[1]).toEqual({
      role: 'user',
      content: 'Show the part count for the most common commodity in Europe.',
    });
    const prompt = request.messages[0].content;
    expect(prompt).toContain('manufacturer');
    expect(prompt).toContain('part_count can be grouped');
    expect(prompt).toContain(
      'For "active parts", add the boolean filter active equals true.',
    );
    expect(prompt).toContain('use model_year with an integer value');
    expect(prompt).toContain('use part_number with operator equals');
    expect(prompt).toContain(
      'order_by [{"field":"part_count","direction":"desc"}]',
    );
    expect(prompt).toContain('Do not add filter-only fields as dimensions.');
    expect(prompt).not.toContain('part_catalog');
    expect(prompt).not.toContain('part.id');
    fetchMock.mockRestore();
  });

  it('repairs a missing explicit commodity filter before returning a plan', async () => {
    const firstPlan = {
      version: 1,
      model: 'automotive_catalog',
      measures: ['part_count'],
      dimensions: ['manufacturer'],
      filters: [
        { field: 'region', operator: 'equals', value: 'Europe' },
        { field: 'active', operator: 'equals', value: true },
      ],
      order_by: [{ field: 'part_count', direction: 'desc' }],
      limit: 5,
    };
    const correctedPlan = {
      ...firstPlan,
      filters: [
        { field: 'commodity', operator: 'equals', value: 'Braking' },
        ...firstPlan.filters,
      ],
    };
    const response = (plan: unknown) =>
      new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({ status: 'query', cube_query: plan }),
          },
        }),
        { status: 200 },
      );
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response(firstPlan))
      .mockResolvedValueOnce(response(correctedPlan));

    const result = await new QueryPlannerService().plan(
      'I need five manufacturers serving Europe with the most active Braking parts.',
    );

    expect(result).toMatchObject({
      status: 'query',
      cube_query: correctedPlan,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const repairInit = fetchMock.mock.calls[1]?.[1];
    if (typeof repairInit?.body !== 'string')
      throw new Error('Expected JSON repair request body.');
    const repairRequest = JSON.parse(repairInit.body) as CapturedOllamaRequest;
    expect(repairRequest.messages.at(-1)?.content).toContain(
      'EXPLICIT_FILTER_OMITTED',
    );
    expect(repairRequest.messages.at(-1)?.content).toContain('Braking');
    fetchMock.mockRestore();
  });

  it('does not return a misleading query when the repair still omits a stated filter', async () => {
    const incompletePlan = {
      version: 1,
      model: 'automotive_catalog',
      measures: ['part_count'],
      dimensions: ['manufacturer'],
      filters: [{ field: 'region', operator: 'equals', value: 'Europe' }],
      order_by: [{ field: 'part_count', direction: 'desc' }],
      limit: 5,
    };
    const response = () =>
      new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              status: 'query',
              cube_query: incompletePlan,
            }),
          },
        }),
        { status: 200 },
      );
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response());

    const result = await new QueryPlannerService().plan(
      'I need five manufacturers serving Europe with the most active Braking parts.',
    );
    expect(result.status).toBe('clarification');
    expect(result.cube_query).toBeNull();
    expect(result.message).toContain('Braking');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockRestore();
  });

  it('uses prior interpreted grouping and filters to plan a short follow-up', async () => {
    const expectedPlan = {
      version: 1,
      model: 'automotive_catalog',
      measures: ['part_count'],
      dimensions: ['manufacturer'],
      filters: [{ field: 'region', operator: 'equals', value: 'Europe' }],
      order_by: [{ field: 'part_count', direction: 'desc' }],
      limit: 5,
    };
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              status: 'query',
              cube_query: expectedPlan,
            }),
          },
        }),
        { status: 200 },
      ),
    );

    await expect(
      new QueryPlannerService().plan('Show just the top five', [
        {
          question: 'Count parts by manufacturer in Europe.',
          query: {
            version: 1,
            model: 'automotive_catalog',
            measures: ['part_count'],
            dimensions: ['manufacturer'],
            filters: [
              { field: 'region', operator: 'equals', value: 'Europe' },
              { field: 'company_id', operator: 'equals', value: 'secret' },
            ],
            limit: 100,
          },
        },
      ]),
    ).resolves.toMatchObject({ cube_query: expectedPlan });

    const init = fetchMock.mock.calls[0]?.[1];
    if (typeof init?.body !== 'string')
      throw new Error('Expected JSON request body.');
    const request = JSON.parse(init.body) as CapturedOllamaRequest;
    expect(request.messages[1]).toEqual({
      role: 'user',
      content: 'Count parts by manufacturer in Europe.',
    });
    expect(request.messages[2]?.role).toBe('assistant');
    expect(request.messages[2]?.content).toContain('manufacturer');
    expect(request.messages[2]?.content).toContain('Europe');
    expect(request.messages[2]?.content).not.toContain('company_id');
    expect(request.messages[3]).toEqual({
      role: 'user',
      content: 'Show just the top five',
    });
    fetchMock.mockRestore();
  });

  it('asks the local model to correct a query rejected by server validation', async () => {
    const correctedPlan = {
      version: 1,
      model: 'automotive_catalog',
      measures: ['part_count'],
      dimensions: ['manufacturer'],
      filters: [{ field: 'region', operator: 'equals', value: 'Europe' }],
      order_by: [{ field: 'part_count', direction: 'desc' }],
      limit: 5,
    };
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              status: 'query',
              cube_query: correctedPlan,
            }),
          },
        }),
        { status: 200 },
      ),
    );

    const result = await new QueryPlannerService().repairInvalidQuery(
      'Count parts by manufacturer in Europe and get me top 5 alone.',
      { version: 1, model: 'automotive_catalog', filters: [] },
      [{ path: 'dimensions', message: 'manufacturer is required' }],
    );

    expect(result).toMatchObject({
      status: 'query',
      cube_query: correctedPlan,
    });
    const init = fetchMock.mock.calls[0]?.[1];
    if (typeof init?.body !== 'string')
      throw new Error('Expected JSON request body.');
    const request = JSON.parse(init.body) as CapturedOllamaRequest;
    expect(request.messages.at(-1)?.content).toContain(
      'manufacturer is required',
    );
    fetchMock.mockRestore();
  });

  it('rejects malformed model plans', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ message: { content: '{"status":"query"}' } }),
          { status: 200 },
        ),
      );
    await expect(
      new QueryPlannerService().plan('Count parts'),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_MODEL_PLAN' },
    });
    fetchMock.mockRestore();
  });

  it('reports Ollama timeouts separately from service failures', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockRejectedValueOnce(
        new DOMException('request timed out', 'TimeoutError'),
      );
    await expect(
      new QueryPlannerService().plan(
        'Give me a comparative insight into parts.',
      ),
    ).rejects.toMatchObject({
      response: { code: 'LOCAL_MODEL_UNAVAILABLE' },
    });
    await expect(
      new QueryPlannerService().plan(
        'Give me a comparative insight into parts.',
      ),
    ).rejects.toMatchObject({
      response: { code: 'LOCAL_MODEL_TIMEOUT' },
      status: 504,
    });
    fetchMock.mockRestore();
  });

  it('fills a safe default message when an unsupported plan has no text', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          message: { content: '{"status":"unsupported","cube_query":null}' },
        }),
        { status: 200 },
      ),
    );
    const result = await new QueryPlannerService().plan(
      'Tell me the cost of every part.',
    );
    expect(result).toEqual({
      status: 'unsupported',
      cube_query: null,
      message:
        'I cannot answer that with the fields available in the automotive catalog model.',
    });
    fetchMock.mockRestore();
  });
});
