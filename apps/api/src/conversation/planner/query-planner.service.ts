import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface ConversationPlan {
  status: 'query' | 'clarification' | 'unsupported';
  cube_query: unknown;
  message: string;
}

export interface ConversationHistoryItem {
  question: string;
  query?: unknown;
  assistantMessage?: string;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface SemanticField {
  description?: string;
  type?: string;
  groupable?: boolean;
  filterable?: boolean;
  known_values?: string[];
  synonyms?: Record<string, string>;
  aliases?: string[];
}

/** The semantic model document (already filtered to what the user may see). */
export interface SemanticModel {
  model: string;
  description: string;
  measures: Record<string, { description?: string }>;
  dimensions: Record<string, SemanticField>;
  lookup_fields: Record<string, SemanticField>;
  record_fields?: Record<string, SemanticField>;
  excluded_fields: string[];
  limits: {
    max_dimensions_per_query: number;
    max_filters_per_query: number;
    max_result_limit: number;
    max_record_fields?: number;
  };
}

@Injectable()
export class QueryPlannerService {
  private schemaPromise?: Promise<Record<string, unknown>>;

  async plan(
    question: string,
    history: ConversationHistoryItem[],
    semantic: SemanticModel,
  ): Promise<ConversationPlan> {
    const deterministicPlan = this.planExactSupportedQuestion(
      question,
      semantic,
    );
    if (deterministicPlan) return this.validatePlan(deterministicPlan);

    const recognizedAnalytics = this.planRecognizedAnalyticsQuestion(
      question,
      semantic,
    );
    if (recognizedAnalytics) return this.validatePlan(recognizedAnalytics);

    const explicitPartDetails = this.planExplicitPartDetailQuestion(
      question,
      semantic,
    );
    if (explicitPartDetails) return this.validatePlan(explicitPartDetails);

    const schema = await this.loadPlanSchema();

    const initialPlan = await this.requestPlan(
      this.buildMessages(question, history, semantic),
      schema,
    );
    if (initialPlan.status !== 'query') {
      const recognizedPlan = this.planRecognizedAnalyticsQuestion(
        question,
        semantic,
      );
      if (recognizedPlan) return this.validatePlan(recognizedPlan);
      return initialPlan;
    }
    return this.repairOmittedExplicitFilters(
      question,
      history,
      initialPlan,
      semantic,
    );
  }

  private async repairOmittedExplicitFilters(
    question: string,
    history: ConversationHistoryItem[],
    plan: ConversationPlan,
    semantic: SemanticModel,
  ): Promise<ConversationPlan> {
    if (plan.status !== 'query') return plan;
    const missing = this.missingExplicitFilters(
      question,
      plan.cube_query,
      semantic,
    );
    if (missing.length === 0) return plan;

    const repaired = await this.repairInvalidQuery(
      question,
      plan.cube_query,
      {
        code: 'EXPLICIT_FILTER_OMITTED',
        message:
          'The query omitted one or more explicit filters from the user question.',
        required_filters: missing,
      },
      history,
      semantic,
    );
    if (repaired.status !== 'query') return repaired;

    const stillMissing = this.missingExplicitFilters(
      question,
      repaired.cube_query,
      semantic,
    );
    if (stillMissing.length === 0) return repaired;
    const names = stillMissing
      .map(({ field, value }) => `“${value}” for ${field.replaceAll('_', ' ')}`)
      .join(', ');
    return {
      status: 'clarification',
      cube_query: null,
      message: `I couldn't safely apply ${names}. Please restate the filter and try again.`,
    };
  }

  private missingExplicitFilters(
    question: string,
    cubeQuery: unknown,
    semantic: SemanticModel,
  ): Array<{
    field: string;
    operator: 'equals';
    value: string | number | boolean;
  }> {
    if (!cubeQuery || typeof cubeQuery !== 'object' || Array.isArray(cubeQuery))
      return [];
    const query = cubeQuery as Record<string, unknown>;
    const filters = Array.isArray(query.filters) ? query.filters : [];
    const normalizedQuestion = question.toLocaleLowerCase();
    const expected: Array<{
      field: string;
      operator: 'equals';
      value: string | number | boolean;
    }> = [];
    for (const [field, definition] of [
      ...Object.entries(semantic.dimensions),
      ...Object.entries(semantic.lookup_fields),
    ]) {
      if (!definition.filterable) continue;
      for (const value of definition.known_values ?? []) {
        if (
          field === 'lifecycle_status' &&
          value.toLocaleLowerCase() === 'active' &&
          !/\blifecycle\s+status\s+(?:is\s+)?active\b/i.test(question)
        )
          continue;
        const aliases = Object.entries(definition.synonyms ?? {})
          .filter(
            ([, canonical]) =>
              canonical.toLocaleLowerCase() === value.toLocaleLowerCase(),
          )
          .map(([alias]) => alias);
        if (
          [value, ...aliases].some((term) =>
            this.questionContainsTerm(normalizedQuestion, term),
          )
        ) {
          expected.push({ field, operator: 'equals', value });
        }
      }
    }
    if (/\binactive\b(?=.*\b(?:parts?|items?|records?)\b)/i.test(question)) {
      expected.push({ field: 'active', operator: 'equals', value: false });
    } else if (
      /\bactive\b(?=.*\b(?:parts?|items?|records?)\b)/i.test(question)
    ) {
      expected.push({ field: 'active', operator: 'equals', value: true });
    }
    const year = this.extractModelYear(question);
    if (year !== undefined) {
      expected.push({ field: 'model_year', operator: 'equals', value: year });
    }
    const manufacturer = this.extractManufacturerName(question);
    const manufacturerIsAnotherKnownValue = Object.entries(
      semantic.dimensions,
    ).some(
      ([field, definition]) =>
        field !== 'manufacturer' &&
        definition.known_values?.some(
          (value) =>
            value.toLocaleLowerCase() === manufacturer?.toLocaleLowerCase(),
        ),
    );
    if (manufacturer && !manufacturerIsAnotherKnownValue) {
      expected.push({
        field: 'manufacturer',
        operator: 'equals',
        value: manufacturer,
      });
    }
    for (const [field, definition] of [
      ...Object.entries(semantic.dimensions),
      ...Object.entries(semantic.lookup_fields),
    ]) {
      if (
        !definition.filterable ||
        ['number', 'integer', 'timestamp'].includes(definition.type ?? '') ||
        field === 'active'
      )
        continue;
      const value = this.extractFieldValue(question, field, definition);
      if (value) expected.push({ field, operator: 'equals', value });
    }

    return expected.filter(
      (candidate) =>
        !filters.some((rawFilter) => {
          if (
            !rawFilter ||
            typeof rawFilter !== 'object' ||
            Array.isArray(rawFilter)
          )
            return false;
          const filter = rawFilter as Record<string, unknown>;
          if (filter.field !== candidate.field) return false;
          const values =
            filter.operator === 'in' && Array.isArray(filter.value)
              ? filter.value
              : [filter.value];
          return values.some((actual) => {
            if (
              typeof actual === 'string' &&
              typeof candidate.value === 'string'
            ) {
              const normalizedActual = actual.toLocaleLowerCase();
              const normalizedExpected = candidate.value.toLocaleLowerCase();
              return filter.operator === 'contains'
                ? normalizedActual.includes(normalizedExpected)
                : ['equals', 'in'].includes(String(filter.operator)) &&
                    normalizedActual === normalizedExpected;
            }
            return (
              ['equals', 'in'].includes(String(filter.operator)) &&
              actual === candidate.value
            );
          });
        }),
    );
  }

  private extractModelYear(question: string): number | undefined {
    const match =
      question.match(
        /\bmodel[\s-]?year\s*(?:is|of|=|:|for|in)?\s*(19\d{2}|20\d{2})\b/i,
      ) ??
      question.match(/\b(19\d{2}|20\d{2})\s+model[\s-]?year\b/i) ??
      question.match(/\bparts?\s+(?:from|for)\s+(19\d{2}|20\d{2})\b/i);
    const value = match?.[1] ?? match?.[2];
    return value ? Number(value) : undefined;
  }

  private extractManufacturerName(question: string): string | undefined {
    const clauseBoundary =
      '(?=\\s+(?:in|with|where|during|from model year|for model year)\\b|[?.!,;]|$)';
    const patterns = [
      /\bparts?\s+does\s+(.+?)\s+have\b/i,
      new RegExp(
        `\\bparts?\\s+(?:under|beneath)\\s+(.+?)${clauseBoundary}`,
        'i',
      ),
      new RegExp(
        `\\bparts?\\s+(?:for|of)\\s+manufacturer\\s+(.+?)${clauseBoundary}`,
        'i',
      ),
      new RegExp(
        `\\bmanufacturer\\s+(?:named|called|equals?|is)\\s+(.+?)${clauseBoundary}`,
        'i',
      ),
      new RegExp(
        `\\b(?:made|manufactured)\\s+by\\s+(.+?)${clauseBoundary}`,
        'i',
      ),
      new RegExp(
        `\\bfrom\\s+((?:\\p{Lu}[\\p{L}'’-]*\\s+){1,3}\\p{Lu}[\\p{L}'’-]*)${clauseBoundary}`,
        'u',
      ),
    ];
    for (const pattern of patterns) {
      const value = question.match(pattern)?.[1]?.trim();
      if (value && /\b(?:and|or)\b/i.test(value)) continue;
      if (
        value &&
        value.length <= 120 &&
        /\p{L}/u.test(value) &&
        !/^(?:the\s+)?(?:catalog|database|dataset|manufacturer)$/i.test(value)
      ) {
        return value.replace(/[?.!,;]+$/, '').trim();
      }
    }
    return undefined;
  }

  private questionContainsTerm(question: string, term: string): boolean {
    const escaped = term
      .toLocaleLowerCase()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(
      `(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`,
      'u',
    ).test(question);
  }

  private extractFieldValue(
    question: string,
    field: string,
    definition: SemanticField,
  ): string | undefined {
    const aliases = [field.replaceAll('_', ' '), ...(definition.aliases ?? [])];
    for (const alias of aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = question.match(
        new RegExp(
          `\\b${escaped}\\b(?:\\s+(?:is|equals?|named|called|of|=|:))?\\s+(?!in\\b|by\\b|with\\b|for\\b|from\\b|and\\b|each\\b)(.+?)(?=\\s+(?:in|with|where|during|and|for|from|by|using|made of)\\b|[,;?.!]|$)`,
          'i',
        ),
      );
      const value = match?.[1]?.trim().replace(/^['"]|['"]$/g, '');
      if (
        value &&
        value.length <= 256 &&
        !/^(?:the|all|each|any|parts?|items?|records?)$/i.test(value)
      )
        return value;
    }
    return undefined;
  }

  private planExplicitPartDetailQuestion(
    question: string,
    model: SemanticModel,
  ): Record<string, unknown> | undefined {
    if (
      !/^\s*(?:show|list|fetch|find|get|give|retrieve|display|return)\b/i.test(
        question,
      ) ||
      !/\bparts?\b/i.test(question) ||
      /\b(?:how many|count|number of|top\s+\d+|breakdown|group(?:ed)? by)\b/i.test(
        question,
      ) ||
      !/\b(?:with|details?|records?|fields?|part number|part name|sku)\b/i.test(
        question,
      )
    )
      return undefined;

    const recordFields = model.record_fields ?? {};
    const requestedFields = Object.keys(recordFields).filter((field) => {
      const definition = model.dimensions[field] ?? model.lookup_fields[field];
      const aliases = [
        field.replaceAll('_', ' '),
        ...(definition?.aliases ?? []),
      ];
      return aliases.some((alias) =>
        this.questionContainsTerm(question.toLocaleLowerCase(), alias),
      );
    });
    const filters = this.missingExplicitFilters(
      question,
      { filters: [] },
      model,
    );
    if (!requestedFields.length && !filters.length) return undefined;

    const numberWords: Record<string, number> = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
    };
    const limitMatch =
      question.match(
        /\b(?:show|list|fetch|find|get|give(?:\s+me)?|retrieve|display|return)\s+(?:me\s+)?(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten)\s+parts?\b/i,
      ) ??
      question.match(
        /\b(?:top|first)\s+(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten)\s+parts?\b/i,
      );
    const limitToken = limitMatch?.[1]?.toLocaleLowerCase();
    const limit = limitToken
      ? Number(limitToken) || numberWords[limitToken]
      : 50;
    if (limit > 100) {
      return {
        status: 'clarification',
        cube_query: null,
        message:
          'I can return up to 100 part records at a time. Would you like the first 100, or a narrower search?',
      };
    }

    const fields = requestedFields.length
      ? requestedFields
      : [
          'part_number',
          'part_name',
          'manufacturer',
          'commodity',
          'region',
          'model_year',
        ].filter((field) => field in recordFields);
    return {
      status: 'query',
      cube_query: {
        version: 1,
        model: model.model,
        mode: 'records',
        measures: [],
        dimensions: [],
        fields,
        filters,
        limit,
      },
      message: 'Here are the matching automotive catalog parts.',
    };
  }

  private planRecognizedAnalyticsQuestion(
    question: string,
    model: SemanticModel,
  ): Record<string, unknown> | undefined {
    if (this.hasUnresolvedNamedFilterValue(question)) return undefined;
    const asksForPartCount =
      /\b(?:part counts?|count(?:ing)? parts?|how many parts?|number of parts?)\b/i.test(
        question,
      );
    const asksForManufacturerCount =
      /\b(?:manufacturer counts?|count(?:ing)? manufacturers?|how many manufacturers?|number of manufacturers?)\b/i.test(
        question,
      );
    if (!asksForPartCount && !asksForManufacturerCount) return undefined;
    // Leave expressions that need richer reasoning to Ollama instead of
    // silently answering a simpler count while dropping their conditions.
    if (
      /\b(?:less than|more than|greater than|fewer than|at least|at most|above|below|under|over|between|except|excluding|without|unless)\b|[<>]=?|\b(?:cheaper|more expensive|heavier|lighter)\b/i.test(
        question,
      )
    )
      return undefined;
    const dimensions = this.requestedGroupDimensions(question, model);
    const measure = this.requestedMeasure(question);
    const topLimit = this.requestedTopLimit(
      question,
      model.limits.max_result_limit,
    );
    const isAggregation =
      /\b(?:how many|count|counts|number of|part counts?)\b/i.test(question) ||
      (dimensions.length > 0 && /\b(?:show|compare|list)\b/i.test(question));
    if (!isAggregation && topLimit === undefined) return undefined;

    const explicitFilters = this.missingExplicitFilters(
      question,
      { filters: [] },
      model,
    );
    const lifecycleFilters = explicitFilters.filter(
      (filter) => filter.field === 'lifecycle_status',
    );
    if (
      lifecycleFilters.length > 1 &&
      !dimensions.includes('lifecycle_status')
    ) {
      dimensions.push('lifecycle_status');
    }

    const filters: Array<{ field: string; operator: string; value: unknown }> =
      [];
    const lifecycleValues = [
      ...new Set(lifecycleFilters.map(({ value }) => value)),
    ];
    for (const filter of explicitFilters) {
      if (filter.field === 'lifecycle_status' && lifecycleValues.length > 1)
        continue;
      filters.push(filter);
    }
    if (lifecycleValues.length > 1) {
      filters.push({
        field: 'lifecycle_status',
        operator: 'in',
        value: lifecycleValues,
      });
    }

    const statusList = this.extractLifecycleStatusList(question, model);
    if (statusList.length > 1) {
      const existing = filters.find(
        (filter) => filter.field === 'lifecycle_status',
      );
      if (existing) existing.value = statusList;
      else
        filters.push({
          field: 'lifecycle_status',
          operator: 'in',
          value: statusList,
        });
      if (!dimensions.includes('lifecycle_status'))
        dimensions.push('lifecycle_status');
    }

    if (dimensions.length > model.limits.max_dimensions_per_query)
      return undefined;
    const asksForCatalogTotal =
      /\btotal\b/i.test(question) ||
      /\b(?:in|within|across)\s+(?:the\s+)?(?:catalog|database|dataset)\b/i.test(
        question,
      );
    if (!dimensions.length) {
      const directCount =
        /^\s*(?:how many|count|get me count|what is the number of|show me the number of)\b/i.test(
          question,
        );
      if (!asksForCatalogTotal && (!filters.length || !directCount))
        return undefined;
    }

    const query: Record<string, unknown> = {
      version: 1,
      model: model.model,
      measures: [measure],
      dimensions,
      filters,
      limit: topLimit ?? 100,
    };
    if (topLimit !== undefined) {
      query.order_by = [
        {
          field: measure,
          direction: /\b(?:bottom|least|fewest|smallest|lowest)\b/i.test(
            question,
          )
            ? 'asc'
            : 'desc',
        },
      ];
    }
    return {
      status: 'query',
      cube_query: query,
      message: 'Here are the matching automotive catalog results.',
    };
  }

  private requestedMeasure(question: string): string {
    return /\b(?:how many|count(?:\s+of)?|number of)\s+(?:distinct\s+)?manufacturers?\b|\bmanufacturer count\b/i.test(
      question,
    )
      ? 'manufacturer_count'
      : 'part_count';
  }

  private requestedGroupDimensions(
    question: string,
    model: SemanticModel,
  ): string[] {
    const groupAliases: Record<string, string[]> = {
      manufacturer: ['manufacturer', 'manufacturers'],
      commodity: ['commodity', 'commodities'],
      sub_commodity: [
        'sub-commodity',
        'sub commodity',
        'sub-commodities',
        'sub commodities',
      ],
      vehicle_program: ['vehicle program', 'vehicle programs'],
      region: ['region', 'regions'],
      country: ['country', 'countries'],
      plant: ['plant', 'plants'],
      model_year: ['model year', 'model years'],
      lifecycle_status: ['lifecycle status', 'lifecycle statuses'],
      category: ['category', 'categories'],
    };
    const segments: string[] = [];
    const cue =
      /\bin each\b|\bby\b|\bper\b|\bgroup(?:ed)? by\b|\bbreakdown by\b/gi;
    for (const match of question.matchAll(cue)) {
      const start = (match.index ?? 0) + match[0].length;
      let tail = question.slice(start);
      const stop = tail.search(
        /[?.!;]|\b(?:in|for|from|with|where|during|after|before)\b/i,
      );
      if (stop >= 0) tail = tail.slice(0, stop);
      segments.push(tail);
    }

    const topEntity = question.match(
      /\b(?:top\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)|which\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten))\s+(manufacturers?|commodities?|regions?|categories?)\b/i,
    )?.[1];
    if (topEntity) segments.push(topEntity);

    const matches: Array<{ field: string; index: number }> = [];
    for (const [field, aliases] of Object.entries(groupAliases)) {
      if (!model.dimensions[field]?.groupable) continue;
      for (const segment of segments) {
        const positions = aliases
          .map((alias) => ({
            alias,
            index: segment.toLocaleLowerCase().indexOf(alias),
          }))
          .filter(({ index }) => index >= 0)
          .sort((left, right) => left.index - right.index);
        if (positions[0]) matches.push({ field, index: positions[0].index });
      }
    }
    const ordered = [...new Set(matches.map(({ field }) => field))];
    // The dimension count is small; preserve the order in the user's grouping phrase.
    return ordered.sort((left, right) => {
      const position = (field: string) => {
        for (const segment of segments) {
          const indexes = (groupAliases[field] ?? [])
            .map((alias) => segment.toLocaleLowerCase().indexOf(alias))
            .filter((index) => index >= 0);
          if (indexes.length) return indexes[0];
        }
        return Number.MAX_SAFE_INTEGER;
      };
      return position(left) - position(right);
    });
  }

  private hasUnresolvedNamedFilterValue(question: string): boolean {
    if (this.extractManufacturerName(question)) return false;
    return /\b(?:does|from|for|by|named|called)\s+[A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+)+/u.test(
      question,
    );
  }

  private requestedTopLimit(
    question: string,
    maximum: number,
  ): number | undefined {
    const numbers: Record<string, number> = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
    };
    const match =
      question.match(
        /\btop\s+(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten)\b/i,
      ) ??
      question.match(
        /\bwhich\s+(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:manufacturers?|commodities?|regions?|categories?)\b/i,
      );
    if (!match) return undefined;
    const value = Number(match[1]) || numbers[match[1].toLocaleLowerCase()];
    return value && value <= maximum ? value : undefined;
  }

  private extractLifecycleStatusList(
    question: string,
    model: SemanticModel,
  ): string[] {
    const statuses = model.dimensions.lifecycle_status?.known_values ?? [];
    return statuses.filter(
      (status) =>
        status.toLocaleLowerCase() !== 'active' &&
        this.questionContainsTerm(question.toLocaleLowerCase(), status),
    );
  }

  async repairInvalidQuery(
    question: string,
    invalidCubeQuery: unknown,
    validationErrors: unknown,
    history: ConversationHistoryItem[],
    semantic: SemanticModel,
  ): Promise<ConversationPlan> {
    const schema = await this.loadPlanSchema();
    const messages = this.buildMessages(question, history, semantic);
    messages.push(
      {
        role: 'assistant',
        content: JSON.stringify({
          status: 'query',
          cube_query: invalidCubeQuery,
        }),
      },
      {
        role: 'user',
        content: [
          'The proposed Cube Query failed server validation.',
          `Validation feedback: ${JSON.stringify(validationErrors).slice(0, 2000)}`,
          'Re-read the original question and produce one corrected plan that follows the system rules and supplied JSON schema.',
          'Keep the user intent, change only what validation requires, and do not produce SQL.',
        ].join('\n'),
      },
    );
    return this.requestPlan(messages, schema);
  }

  private async requestPlan(
    messages: ChatMessage[],
    schema: Record<string, unknown>,
  ): Promise<ConversationPlan> {
    const provider = (process.env.CONVERSATION_LLM_PROVIDER ?? 'ollama')
      .trim()
      .toLowerCase();
    if (provider !== 'ollama') {
      throw new ServiceUnavailableException({
        code: 'LLM_PROVIDER_NOT_SUPPORTED',
        message:
          'The configured conversational model provider is not supported.',
      });
    }
    return this.requestOllamaPlan(
      messages,
      schema,
      process.env.OLLAMA_MODEL ?? 'qwen3.5:2b',
    );
  }

  private async requestOllamaPlan(
    messages: ChatMessage[],
    schema: Record<string, unknown>,
    model: string,
  ): Promise<ConversationPlan> {
    const baseUrl = (
      process.env.OLLAMA_BASE_URL ?? 'http://ollama:11434'
    ).replace(/\/$/, '');
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(120_000),
        body: JSON.stringify({
          model,
          stream: false,
          think: false,
          format: schema,
          options: { temperature: 0, num_ctx: 4096, num_predict: 256 },
          messages,
        }),
      });
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')
      ) {
        throw new GatewayTimeoutException({
          code: 'LOCAL_MODEL_TIMEOUT',
          message:
            'The local model took too long to plan this question. Try again with a shorter or simpler question.',
        });
      }
      throw new ServiceUnavailableException({
        code: 'LOCAL_MODEL_UNAVAILABLE',
        message:
          'The local conversational model is unavailable. Check that the Ollama service is running.',
      });
    }

    if (!response.ok) {
      throw new ServiceUnavailableException({
        code: 'LOCAL_MODEL_REQUEST_FAILED',
        message:
          'The local conversational model could not complete the request.',
      });
    }

    const payload = (await response.json()) as {
      message?: { content?: unknown };
    };
    return this.parseAndValidateModelPlan(payload.message?.content);
  }

  private parseAndValidateModelPlan(rawContent: unknown): ConversationPlan {
    if (Array.isArray(rawContent)) {
      rawContent = rawContent
        .filter(
          (part): part is { type: string; text: string } =>
            Boolean(part) &&
            typeof part === 'object' &&
            (part as { type?: unknown }).type === 'text' &&
            typeof (part as { text?: unknown }).text === 'string',
        )
        .map((part) => part.text)
        .join('');
    }
    if (typeof rawContent !== 'string') throw this.invalidPlan();
    let content: unknown;
    try {
      content = JSON.parse(rawContent);
    } catch {
      throw this.invalidPlan();
    }
    return this.validatePlan(content);
  }

  private buildMessages(
    question: string,
    history: ConversationHistoryItem[],
    semantic: SemanticModel,
  ): ChatMessage[] {
    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt(semantic) },
    ];
    const recentHistory = Array.isArray(history) ? history.slice(-4) : [];
    for (const turn of recentHistory) {
      if (!turn || typeof turn.question !== 'string') continue;
      messages.push({ role: 'user', content: turn.question.slice(0, 1000) });
      const query = this.sanitizeHistoryQuery(turn.query, semantic);
      if (query) {
        messages.push({
          role: 'assistant',
          content: JSON.stringify({
            status: 'query',
            cube_query: query,
            message: 'Prior interpreted query for conversation context.',
          }),
        });
      } else if (typeof turn.assistantMessage === 'string') {
        messages.push({
          role: 'assistant',
          content: `Prior clarification or response (conversation context only): ${turn.assistantMessage.slice(0, 500)}`,
        });
      }
    }
    messages.push({ role: 'user', content: question });
    return messages;
  }

  private sanitizeHistoryQuery(
    value: unknown,
    model: SemanticModel,
  ): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return undefined;
    const query = value as Record<string, unknown>;
    const mode = query.mode === 'records' ? 'records' : 'aggregate';
    const fields = Array.isArray(query.fields)
      ? query.fields
          .filter(
            (field): field is string =>
              typeof field === 'string' && field in (model.record_fields ?? {}),
          )
          .slice(0, model.limits.max_record_fields ?? 20)
      : [];
    const measures = Array.isArray(query.measures)
      ? query.measures.filter(
          (field): field is string =>
            typeof field === 'string' && field in model.measures,
        )
      : [];
    const dimensions = Array.isArray(query.dimensions)
      ? query.dimensions
          .filter(
            (field): field is string =>
              typeof field === 'string' &&
              Boolean(model.dimensions[field]?.groupable),
          )
          .slice(0, model.limits.max_dimensions_per_query)
      : [];
    const filterFields = new Set([
      ...Object.entries(model.dimensions)
        .filter(([, field]) => field.filterable)
        .map(([field]) => field),
      ...Object.entries(model.lookup_fields)
        .filter(([, field]) => field.filterable)
        .map(([field]) => field),
    ]);
    const filters = Array.isArray(query.filters)
      ? query.filters
          .filter(
            (filter): filter is Record<string, unknown> =>
              Boolean(filter) && typeof filter === 'object',
          )
          .filter(
            (filter) =>
              typeof filter.field === 'string' &&
              filterFields.has(filter.field) &&
              typeof filter.operator === 'string' &&
              ['equals', 'contains', 'in', 'gt', 'gte', 'lt', 'lte'].includes(
                filter.operator,
              ) &&
              (['string', 'number', 'boolean'].includes(typeof filter.value) ||
                (Array.isArray(filter.value) &&
                  filter.value.length <= 20 &&
                  filter.value.every((item) =>
                    ['string', 'number', 'boolean'].includes(typeof item),
                  ))),
          )
          .slice(0, model.limits.max_filters_per_query)
          .map(({ field, operator, value: filterValue }) => ({
            field,
            operator,
            value: filterValue,
          }))
      : [];
    if (mode === 'records' ? !fields.length : !measures.length)
      return undefined;
    return {
      version: 1,
      model: model.model,
      mode,
      measures: mode === 'records' ? [] : measures.slice(0, 1),
      dimensions: mode === 'records' ? [] : dimensions,
      ...(mode === 'records' ? { fields } : {}),
      filters,
      ...(Number.isInteger(query.limit) &&
      Number(query.limit) >= 1 &&
      Number(query.limit) <= model.limits.max_result_limit
        ? { limit: query.limit }
        : {}),
    };
  }

  private systemPrompt(model: SemanticModel): string {
    const fields = (source: Record<string, SemanticField>) =>
      Object.fromEntries(
        Object.entries(source).map(([name, field]) => [
          name,
          {
            ...(field.type ? { type: field.type } : {}),
            ...(field.filterable ? { filter: true } : {}),
            ...(field.groupable ? { group: true } : {}),
            ...(field.aliases ? { aliases: field.aliases } : {}),
            ...(field.synonyms ? { synonyms: field.synonyms } : {}),
            ...(field.known_values ? { values: field.known_values } : {}),
          },
        ]),
      );
    const contract = {
      model: model.model,
      measures: Object.keys(model.measures),
      dimensions: fields(model.dimensions),
      filters: fields(model.lookup_fields),
      records: fields(model.record_fields ?? {}),
      limits: model.limits,
    };
    return [
      'Convert the current natural-language question into a read-only catalog query plan. Understand paraphrases and all clauses; the field names and aliases below describe the available data.',
      'Return only JSON matching the supplied response schema. Never write SQL or choose an organization, user, role, tenant, or security context. The server enforces access.',
      'Use only fields and measures in the catalog contract. Include every requested constraint as a filter and every requested grouping as a dimension. Map known synonyms/values to canonical values. Do not invent fields or silently drop conditions.',
      'For individual part records use mode=records, measures=[], dimensions=[], and only requested record fields; include part_number as an identifier when useful. For counts, totals, rankings, comparisons, or breakdowns use mode=aggregate and the appropriate measure/dimensions.',
      'For top/bottom N, sort the requested measure in the requested direction and set limit N. Use the reviewed category field for category questions; category membership is many-to-many and the server handles it safely.',
      'Use conversation history only to resolve follow-up references. If a required value is ambiguous, return one concise clarification instead of guessing. If the requested information is unavailable, return unsupported with a brief explanation.',
      `Catalog contract: ${JSON.stringify(contract)}`,
    ].join('\n');
  }

  private planExactSupportedQuestion(
    question: string,
    model: SemanticModel,
  ): Record<string, unknown> | undefined {
    const normalized = question.trim();
    const topMatch = normalized.match(
      /^(?:show|get|give me) the top\s+(\d{1,3})\s+commodities?\s+by\s+part count\s+in\s+(Africa|Asia|Europe|Middle East|North America|Oceania|South America)[?.!]*$/i,
    );
    if (topMatch) {
      const limit = Number(topMatch[1]);
      const region = topMatch[2];
      if (
        limit >= 1 &&
        limit <= 100 &&
        model.dimensions.commodity?.groupable &&
        model.dimensions.region?.filterable
      ) {
        return {
          status: 'query',
          cube_query: {
            version: 1,
            model: model.model,
            measures: ['part_count'],
            dimensions: ['commodity'],
            filters: [{ field: 'region', operator: 'equals', value: region }],
            order_by: [{ field: 'part_count', direction: 'desc' }],
            limit,
          },
          message: 'Here are the matching automotive catalog results.',
        };
      }
    }
    if (
      /^(?:how many parts are there in total|what is the total number of parts|count parts in total)[?.!]*$/i.test(
        normalized,
      )
    ) {
      return {
        status: 'query',
        cube_query: {
          version: 1,
          model: model.model,
          measures: ['part_count'],
          dimensions: [],
          filters: [],
          limit: 100,
        },
        message: 'Here are the matching automotive catalog results.',
      };
    }

    const partNumberMatch = normalized.match(
      /^(?:how many parts match part number|count parts with part number|find part number)\s+([A-Z0-9][A-Z0-9-]*)[?.!]*$/i,
    );
    if (partNumberMatch && model.lookup_fields.part_number?.filterable) {
      return {
        status: 'query',
        cube_query: {
          version: 1,
          model: model.model,
          measures: ['part_count'],
          dimensions: [],
          filters: [
            {
              field: 'part_number',
              operator: 'equals',
              value: partNumberMatch[1],
            },
          ],
          limit: 100,
        },
        message: 'Here are the matching automotive catalog results.',
      };
    }

    const breakdownMatch = normalized.match(
      /^(?:how many parts are there|count parts|show parts)\s+(?:in each|by|per)\s+(sub[- ]commodity|lifecycle status|category|manufacturer|region)(?:\s+in\s+(Africa|Asia|Europe|Middle East|North America|Oceania|South America))?[?.!]*$/i,
    );
    if (!breakdownMatch) return undefined;

    const requestedDimension = breakdownMatch[1]
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace('sub-', 'sub_');
    const dimension =
      requestedDimension === 'sub_commodity'
        ? 'sub_commodity'
        : requestedDimension;
    if (!model.dimensions[dimension]?.groupable) return undefined;

    const region = breakdownMatch[2];
    if (region && !model.dimensions.region?.filterable) return undefined;
    return {
      status: 'query',
      cube_query: {
        version: 1,
        model: model.model,
        measures: ['part_count'],
        dimensions: [dimension],
        filters: region
          ? [{ field: 'region', operator: 'equals', value: region }]
          : [],
        limit: 100,
      },
      message: 'Here are the matching automotive catalog results.',
    };
  }

  private validatePlan(value: unknown): ConversationPlan {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw this.invalidPlan();
    const plan = value as Record<string, unknown>;
    const isQuery = plan.status === 'query';
    const message =
      typeof plan.message === 'string' && plan.message.trim().length > 0
        ? plan.message.trim()
        : isQuery
          ? 'Here are the matching automotive catalog results.'
          : plan.status === 'clarification'
            ? 'Could you clarify what you want to know?'
            : plan.status === 'unsupported'
              ? 'I cannot answer that with the fields available in the automotive catalog model.'
              : '';
    if (
      !['query', 'clarification', 'unsupported'].includes(
        String(plan.status),
      ) ||
      message.length === 0 ||
      message.length > 500
    )
      throw this.invalidPlan();
    if (plan.status === 'query') {
      if (
        !plan.cube_query ||
        typeof plan.cube_query !== 'object' ||
        Array.isArray(plan.cube_query)
      )
        throw this.invalidPlan();
    } else if (plan.cube_query !== null) {
      throw this.invalidPlan();
    }
    return {
      status: plan.status as ConversationPlan['status'],
      cube_query: plan.cube_query,
      message,
    };
  }

  private invalidPlan(): BadGatewayException {
    return new BadGatewayException({
      code: 'INVALID_MODEL_PLAN',
      message:
        'The model returned a plan that the application could not safely use.',
    });
  }

  private loadPlanSchema(): Promise<Record<string, unknown>> {
    this.schemaPromise ??= readFile(
      process.env.CONVERSATION_PLAN_SCHEMA_PATH ??
        resolve(
          process.cwd(),
          '../../packages/cube-query/conversation-plan.v1.schema.json',
        ),
      'utf8',
    ).then((source) => JSON.parse(source) as Record<string, unknown>);
    return this.schemaPromise;
  }
}
