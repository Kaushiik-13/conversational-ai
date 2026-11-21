import { ConcurrencyLimiter } from './concurrency-limiter';

describe('ConcurrencyLimiter', () => {
  it('never runs more tasks at once than the limit', async () => {
    const limiter = new ConcurrencyLimiter(2);
    let running = 0;
    let peak = 0;
    const task = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
    };

    await Promise.all(Array.from({ length: 8 }, () => limiter.run(task)));

    expect(peak).toBe(2);
  });

  it('returns each task result and keeps going after a failure', async () => {
    const limiter = new ConcurrencyLimiter(1);

    await expect(
      limiter.run(() => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    await expect(limiter.run(() => Promise.resolve(42))).resolves.toBe(42);
  });
});
