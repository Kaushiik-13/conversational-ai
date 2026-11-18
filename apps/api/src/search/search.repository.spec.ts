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
});
