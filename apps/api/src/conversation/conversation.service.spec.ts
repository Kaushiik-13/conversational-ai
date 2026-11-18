import type { AuthenticatedSession } from '../auth/auth.types';
import { ApplicationAuditService } from '../common/application-audit.service';
import { DatabaseService } from '../database/database.service';
import { ConversationService } from './conversation.service';
import { QueryPlannerService } from './query-planner.service';

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
    const service = new ConversationService(database, audit, planner);

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
    const service = new ConversationService(database, audit, planner);
    const validationError = Object.assign(new Error('Invalid Cube Query.'), {
      name: 'CubeQueryValidationError',
      errors: [{ path: 'measures', message: 'Unknown measure.' }],
    });
    (
      service as unknown as {
        loadCubeQueryModule: jest.Mock;
      }
    ).loadCubeQueryModule = jest.fn().mockResolvedValue({
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
    );
    expect(withAuthorizationContext).not.toHaveBeenCalled();
  });
});
