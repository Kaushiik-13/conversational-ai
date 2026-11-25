import { ServiceUnavailableException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AuthenticatedSession } from '../auth/auth.types';
import type { DatabaseService } from '../database/database.service';
import type { ModelDocument } from './model-access';
import { SemanticService } from './semantic.service';

const document = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      '../../../../packages/cube-query/test/fixtures/automotive-model.json',
    ),
    'utf8',
  ),
) as ModelDocument;

const session = { sessionId: 's', userId: 'u' } as AuthenticatedSession;

/** A database stub that answers the three queries the service makes. */
function stub(options: {
  published?: boolean;
  decisions: Record<string, 'allow' | 'omit' | 'mask'>;
}) {
  const queries: string[] = [];
  const client = {
    query: jest.fn((sql: string) => {
      queries.push(sql);
      if (sql.includes('FROM semantic.models')) {
        return Promise.resolve({
          rows:
            options.published === false
              ? []
              : [{ model_id: 'm1', version_id: 'v1', version_number: 3 }],
        });
      }
      if (sql.includes('SELECT document')) {
        return Promise.resolve({ rows: [{ document }] });
      }
      return Promise.resolve({
        rows: Object.entries(options.decisions).map(([field, access]) => ({
          resource_type: 'catalog.part',
          field_name: field,
          access,
        })),
      });
    }),
  };
  const database = {
    withAuthorizationContext: jest.fn(
      (_session: unknown, operation: (c: typeof client) => Promise<unknown>) =>
        operation(client),
    ),
  } as unknown as DatabaseService;
  return { database, client, queries };
}

describe('SemanticService', () => {
  it('returns the published version for an administrator unchanged', async () => {
    const { database } = stub({
      decisions: { costUsd: 'allow', supplierStatus: 'allow' },
    });
    const resolved = await new SemanticService(database).resolveForSession(
      session,
    );

    expect(resolved).toMatchObject({
      modelId: 'm1',
      versionId: 'v1',
      versionNumber: 3,
      hidden: [],
    });
    expect(resolved.document.measures.total_cost_usd).toBeDefined();
  });

  it('removes cost and supplier fields for a role that may not see them', async () => {
    const { database } = stub({
      decisions: { costUsd: 'omit', supplierStatus: 'omit' },
    });
    const resolved = await new SemanticService(database).resolveForSession(
      session,
    );

    expect(resolved.hidden).toEqual(
      expect.arrayContaining(['total_cost_usd', 'cost_usd', 'supplier_status']),
    );
    expect(resolved.document.measures.total_cost_usd).toBeUndefined();
    expect(resolved.document.dimensions.cost_usd).toBeUndefined();
    expect(resolved.document.measures.part_count).toBeDefined();
  });

  it('fetches the immutable document once and reuses the same view object', async () => {
    const { database, queries } = stub({
      decisions: { costUsd: 'omit', supplierStatus: 'allow' },
    });
    const service = new SemanticService(database);

    const first = await service.resolveForSession(session);
    const second = await service.resolveForSession(session);

    expect(second.document).toBe(first.document);
    expect(
      queries.filter((sql) => sql.includes('SELECT document')),
    ).toHaveLength(1);
  });

  it('keeps different views for different decisions', async () => {
    const admin = stub({
      decisions: { costUsd: 'allow', supplierStatus: 'allow' },
    });
    const viewer = stub({
      decisions: { costUsd: 'omit', supplierStatus: 'omit' },
    });
    // One service, two sessions: decisions come from the role in the context.
    const service = new SemanticService(admin.database);
    const adminView = await service.resolveForSession(session);
    (service as unknown as { database: DatabaseService }).database =
      viewer.database;
    const viewerView = await service.resolveForSession(session);

    expect(adminView.document).not.toBe(viewerView.document);
    expect(adminView.hidden).toEqual([]);
    expect(viewerView.hidden.length).toBeGreaterThan(0);
  });

  it('fails clearly when no published model exists', async () => {
    const { database } = stub({ published: false, decisions: {} });
    await expect(
      new SemanticService(database).resolveForSession(session),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
