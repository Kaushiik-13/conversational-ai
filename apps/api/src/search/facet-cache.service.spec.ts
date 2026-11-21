import { FacetCacheService } from './facet-cache.service';
import type { SearchFacets } from './search.types';

const counts = (value: string): SearchFacets => ({
  region: [{ value, count: 1 }],
});

describe('FacetCacheService', () => {
  afterEach(() => {
    jest.useRealTimers();
    delete process.env.FACET_CACHE_TTL_SECONDS;
    delete process.env.FACET_CACHE_MAX_ENTRIES;
  });

  it('builds the same key regardless of ordering', () => {
    const cache = new FacetCacheService();
    const first = cache.key(
      'sig',
      ' brake ',
      { regions: ['Europe', 'Asia'], modelYears: { to: 2026, from: 2020 } },
      ['region', 'material'],
    );
    const second = cache.key(
      'sig',
      'brake',
      { modelYears: { from: 2020, to: 2026 }, regions: ['Asia', 'Europe'] },
      ['material', 'region'],
    );
    expect(first).toBe(second);
  });

  it('never shares a key between different visibility signatures', () => {
    const cache = new FacetCacheService();
    const filters = { regions: ['Europe'] };
    expect(cache.key('org-a-admin', '', filters, ['region'])).not.toBe(
      cache.key('org-b-restricted', '', filters, ['region']),
    );
  });

  it('computes once, then serves the saved result', async () => {
    const cache = new FacetCacheService();
    const compute = jest.fn(() => Promise.resolve(counts('Europe')));

    const first = await cache.getOrCompute('k', compute);
    const second = await cache.getOrCompute('k', compute);

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.value).toEqual(counts('Europe'));
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('shares one computation between identical requests made at once', async () => {
    const cache = new FacetCacheService();
    let release: (value: SearchFacets) => void = () => undefined;
    const compute = jest.fn(
      () =>
        new Promise<SearchFacets>((resolve) => {
          release = resolve;
        }),
    );

    const a = cache.getOrCompute('k', compute);
    const b = cache.getOrCompute('k', compute);
    release(counts('Asia'));

    const [first, second] = await Promise.all([a, b]);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(first.value).toEqual(second.value);
  });

  it('expires entries after the time limit', async () => {
    process.env.FACET_CACHE_TTL_SECONDS = '10';
    jest.useFakeTimers();
    const cache = new FacetCacheService();
    const compute = jest.fn(() => Promise.resolve(counts('Europe')));

    await cache.getOrCompute('k', compute);
    jest.advanceTimersByTime(11_000);
    const again = await cache.getOrCompute('k', compute);

    expect(again.cached).toBe(false);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('forgets everything after a catalog write', async () => {
    const cache = new FacetCacheService();
    const compute = jest.fn(() => Promise.resolve(counts('Europe')));

    await cache.getOrCompute('k', compute);
    cache.clear();
    const again = await cache.getOrCompute('k', compute);

    expect(again.cached).toBe(false);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('does not store a result that started before a catalog write', async () => {
    const cache = new FacetCacheService();
    let release: (value: SearchFacets) => void = () => undefined;
    const slow = jest.fn(
      () =>
        new Promise<SearchFacets>((resolve) => {
          release = resolve;
        }),
    );

    const running = cache.getOrCompute('k', slow);
    cache.clear(); // a part is written while the counts are being computed
    release(counts('stale'));
    await running;

    expect(cache.size).toBe(0);
  });

  it('keeps only the most recently used entries', async () => {
    process.env.FACET_CACHE_MAX_ENTRIES = '2';
    const cache = new FacetCacheService();
    await cache.getOrCompute('a', () => Promise.resolve(counts('a')));
    await cache.getOrCompute('b', () => Promise.resolve(counts('b')));
    await cache.getOrCompute('a', () => Promise.resolve(counts('a'))); // touch a
    await cache.getOrCompute('c', () => Promise.resolve(counts('c')));

    expect(cache.size).toBe(2);
    const compute = jest.fn(() => Promise.resolve(counts('b2')));
    const b = await cache.getOrCompute('b', compute); // b was evicted
    expect(b.cached).toBe(false);
  });

  it('does not keep failed computations', async () => {
    const cache = new FacetCacheService();
    await expect(
      cache.getOrCompute('k', () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');

    const retry = await cache.getOrCompute('k', () =>
      Promise.resolve(counts('ok')),
    );
    expect(retry.cached).toBe(false);
  });
});
