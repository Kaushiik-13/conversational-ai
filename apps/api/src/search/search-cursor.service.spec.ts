import { BadRequestException } from '@nestjs/common';
import type { AuthenticatedSession } from '../auth/auth.types';
import type { SearchRequestDto } from './search.dto';
import { SearchCursorService } from './search-cursor.service';

describe('SearchCursorService', () => {
  const session: AuthenticatedSession = {
    sessionId: '11111111-1111-4111-8111-111111111111',
    userId: '22222222-2222-4222-8222-222222222222',
    email: 'viewer@example.test',
    displayName: 'Viewer',
    authorizationVersion: 3,
    selectedMembershipId: '33333333-3333-4333-8333-333333333333',
    csrfTokenHash: 'not-used-in-this-test',
  };

  beforeEach(() => {
    process.env.ACCESS_TOKEN_SECRET =
      'test-search-cursor-secret-with-at-least-32-bytes';
  });

  it('round-trips a cursor bound to the session and request', () => {
    const service = new SearchCursorService();
    const request = {
      query: 'caliper',
      filters: { regions: ['Europe'] },
      limit: 5,
    } as SearchRequestDto;
    const requestHash = service.requestHash(request);
    const cursor = service.encode(session, requestHash, {
      sortField: 'partNumber',
      sortDirection: 'asc',
      sortValue: 'BRK-0005',
      id: 42,
    });

    expect(service.decode(cursor, session, requestHash)).toMatchObject({
      sortField: 'partNumber',
      sortDirection: 'asc',
      sortValue: 'BRK-0005',
      id: 42,
    });
  });

  it('rejects a tampered cursor', () => {
    const service = new SearchCursorService();
    const requestHash = service.requestHash({
      query: 'caliper',
      limit: 5,
    });
    const cursor = service.encode(session, requestHash, {
      sortField: 'relevance',
      sortDirection: 'desc',
      sortValue: 2.5,
      id: 42,
    });

    expect(() =>
      service.decode(`${cursor.slice(0, -1)}x`, session, requestHash),
    ).toThrow(BadRequestException);
  });
});
