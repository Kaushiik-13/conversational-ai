import type { AuthenticatedSession } from '../auth/auth.types';
import { ApplicationAuditService } from '../common/application-audit.service';
import { DatabaseService } from '../database/database.service';
import { ConversationService } from './conversation.service';
import { QueryPlannerService } from './planner/query-planner.service';
import { SemanticService } from '../semantic/semantic.service';

describe('ConversationService natural-language planning', () => {
  const session: AuthenticatedSession = {
    sessionId: 'session',
    userId: 'user',
    email: 'analyst@example.test',
    displayName: 'Analyst',
    authorizationVersion: 1,
    selectedMembershipId: 'membership',
    csrfTokenHash: 'hash',
  };
  const requestId = 'request';

  const semanticFor = (hidden: string[] = []) =>
    ({
      resolveForSession: jest.fn().mockResolvedValue({
        modelId: 'model',
        versionId: 'version',
        versionNumber: 1,
        document: { model: 'automotive_catalog' },
        hidden,
      }),
    }) as unknown as SemanticService;

  it('returns clarification without opening an authorized database query', async () => {
    const withAuthorizationContext = jest.fn();
    const database = {
      withAuthorizationContext,
    } as unknown as DatabaseService;
    const audit = { record: jest.fn() } as unknown as ApplicationAuditService;
    const planner = {
      plan: jest.fn().mockResolvedValue({
        status: 'clarification',
        cube_query: null,
        message: 'Which region?',
      }),
    } as unknown as QueryPlannerService;
    const service = new ConversationService(
      database,
      audit,
      planner,
      semanticFor(),
    );

    await expect(
      service.ask(session, 'Count parts', requestId),
    ).resolves.toEqual({
      status: 'clarification',
      message: 'Which region?',
    });
    expect(withAuthorizationContext).not.toHaveBeenCalled();
  });

  it('asks the model to repair a query rejected by Cube Query validation', async () => {
    const invalidCubeQuery = {
      version: 1,
      model: 'automotive_catalog',
      measures: ['not_a_measure'],
      dimensions: [],
      filters: [],
      limit: 5,
    };
    const withAuthorizationContext = jest.fn();
    const database = {
      withAuthorizationContext,
    } as unknown as DatabaseService;
    const audit = { record: jest.fn() } as unknown as ApplicationAuditService;
    const repairInvalidQuery = jest.fn().mockResolvedValue({
      status: 'clarification',
      cube_query: null,
      message: 'Could you clarify the grouping?',
    });
    const planner = {
      plan: jest.fn().mockResolvedValue({
        status: 'query',
        cube_query: invalidCubeQuery,
        message: 'Initial proposal.',
      }),
      repairInvalidQuery,
    } as unknown as QueryPlannerService;
    const service = new ConversationService(
      database,
      audit,
      planner,
      semanticFor(),
    );
    const validationError = Object.assign(new Error('Invalid Cube Query.'), {
      name: 'CubeQueryValidationError',
      errors: [{ path: 'measures', message: 'Unknown measure.' }],
    });
    const internals = service as unknown as {
      loadCubeQueryModule: jest.Mock;
    };
    internals.loadCubeQueryModule = jest.fn().mockResolvedValue({
      compileCubeQuery: jest.fn(() => {
        throw validationError;
      }),
    });
    const history = [
      {
        question: 'Count parts by manufacturer in Europe.',
        query: { measures: ['part_count'], dimensions: ['manufacturer'] },
      },
    ];

    await expect(
      service.ask(session, 'Show the top five.', requestId, history),
    ).resolves.toEqual({
      status: 'clarification',
      message: 'Could you clarify the grouping?',
    });
    expect(repairInvalidQuery).toHaveBeenCalledWith(
      'Show the top five.',
      invalidCubeQuery,
      expect.any(Array),
      history,
      { model: 'automotive_catalog' },
    );
    expect(withAuthorizationContext).not.toHaveBeenCalled();
  });
  it('refuses a plan that names a field hidden from the role, without asking the model to rewrite it', async () => {
    const costQuery = {
      version: 1,
      model: 'automotive_catalog',
      measures: ['total_cost_usd'],
      dimensions: ['manufacturer'],
      filters: [],
      limit: 5,
    };
    const withAuthorizationContext = jest.fn();
    const database = {
      withAuthorizationContext,
    } as unknown as DatabaseService;
    const audit = { record: jest.fn() } as unknown as ApplicationAuditService;
    const repairInvalidQuery = jest.fn();
    const planner = {
      plan: jest.fn().mockResolvedValue({
        status: 'query',
        cube_query: costQuery,
        message: 'Total cost by manufacturer.',
      }),
      repairInvalidQuery,
    } as unknown as QueryPlannerService;
    const service = new ConversationService(
      database,
      audit,
      planner,
      semanticFor(['cost_usd', 'total_cost_usd']),
    );
    const internals = service as unknown as { loadCubeQueryModule: jest.Mock };
    internals.loadCubeQueryModule = jest.fn().mockResolvedValue({
      compileCubeQuery: jest.fn(() => {
        throw Object.assign(new Error('Invalid'), {
          name: 'CubeQueryValidationError',
          errors: [{ path: '$.measures', code: 'UNKNOWN_MEASURE' }],
        });
      }),
    });

    const result = await service.ask(
      session,
      'Total cost by manufacturer',
      requestId,
    );

    expect(result.status).toBe('unsupported');
    expect(result.message).toContain('total cost usd');
    expect(result.message).toContain('does not have access');
    expect(repairInvalidQuery).not.toHaveBeenCalled();
    expect(withAuthorizationContext).not.toHaveBeenCalled();
  });

  it('plans and compiles against the model resolved for this session', async () => {
    const semantic = semanticFor();
    const resolveForSession = jest.spyOn(semantic, 'resolveForSession');
    const plan = jest.fn().mockResolvedValue({
      status: 'clarification',
      cube_query: null,
      message: 'Which region?',
    });
    const service = new ConversationService(
      { withAuthorizationContext: jest.fn() } as unknown as DatabaseService,
      { record: jest.fn() } as unknown as ApplicationAuditService,
      { plan } as unknown as QueryPlannerService,
      semantic,
    );

    await service.ask(session, 'Count parts', requestId, []);

    expect(resolveForSession).toHaveBeenCalledWith(session);
    expect(plan).toHaveBeenCalledWith('Count parts', [], {
      model: 'automotive_catalog',
    });
  });
});
