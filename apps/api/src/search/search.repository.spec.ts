import { SearchRepository } from './search.repository';
import type { PoolClient } from 'pg';

describe('SearchRepository', () => {
  it('normalizes the query and filters for bound database functions', () => {
    const repository = new SearchRepository();
    const search = repository.buildSearch("caliper' OR true --", {
      securityDomainIds: [10],
      manufacturerNames: ['Apex Mobility'],
      modelYears: { from: 2020, to: 2026 },
    });

    expect(search.query).toBe("caliper' OR true --");
    expect(search.filters).toEqual({
      securityDomainIds: [10],
      manufacturerNames: ['Apex Mobility'],
      modelYears: { from: 2020, to: 2026 },
    });
  });

  it('removes only the facet own filter when calculating alternative counts', async () => {
    const repository = new SearchRepository();
    const receivedParameters: unknown[][] = [];
    const query = jest.fn((_text: string, parameters?: unknown[]) => {
      receivedParameters.push(parameters ?? []);
      return Promise.resolve({ rows: [] });
    });
    const client = { query } as unknown as PoolClient;
    const search = repository.buildSearch('brake', {
      primaryCategoryIds: [101],
      manufacturerNames: ['Apex Mobility'],
      regions: ['Europe'],
    });

    await repository.facets(client, search, [
      'primaryCategory',
      'manufacturer',
    ]);

    const categoryFilters = JSON.parse(
      receivedParameters[0][1] as string,
    ) as Record<string, unknown>;
    const manufacturerFilters = JSON.parse(
      receivedParameters[1][1] as string,
    ) as Record<string, unknown>;
    expect(categoryFilters).toEqual({
      manufacturerNames: ['Apex Mobility'],
      regions: ['Europe'],
    });
    expect(manufacturerFilters).toEqual({
      primaryCategoryIds: [101],
      regions: ['Europe'],
    });
  });

  it('counts a single group and converts counts to numbers', async () => {
    const repository = new SearchRepository();
    const query = jest.fn(() =>
      Promise.resolve({
        rows: [
          { value: 'Europe', count: '714515' },
          { value: 'Asia', count: '713993' },
        ],
      }),
    );
    const client = { query } as unknown as PoolClient;

    const buckets = await repository.facet(
      client,
      repository.buildSearch('', { regions: ['Europe'] }),
      'region',
    );

    expect(buckets).toEqual([
      { value: 'Europe', count: 714515 },
      { value: 'Asia', count: 713993 },
    ]);
  });

  it('reads the visibility signature from the database', async () => {
    const repository = new SearchRepository();
    const query = jest.fn(() =>
      Promise.resolve({ rows: [{ signature: 'abc123' }] }),
    );
    const client = { query } as unknown as PoolClient;

    await expect(repository.visibilitySignature(client)).resolves.toBe(
      'abc123',
    );
  });
});
