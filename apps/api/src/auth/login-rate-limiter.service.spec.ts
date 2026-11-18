import { HttpException } from '@nestjs/common';
import { AuthConfig } from './auth.config';
import { LoginRateLimiter } from './login-rate-limiter.service';

describe('LoginRateLimiter', () => {
  const config = {
    loginIpLimit: 2,
    loginWindowSeconds: 900,
  } as AuthConfig;

  it('blocks a key after the configured number of failures', () => {
    const limiter = new LoginRateLimiter(config);
    limiter.recordFailure('test-ip');
    limiter.recordFailure('test-ip');

    try {
      limiter.assertAllowed('test-ip');
      throw new Error('Expected the rate limiter to reject the key.');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
    }
  });

  it('allows a key after it is cleared', () => {
    const limiter = new LoginRateLimiter(config);
    limiter.recordFailure('test-ip');
    limiter.recordFailure('test-ip');
    limiter.clear('test-ip');

    expect(() => limiter.assertAllowed('test-ip')).not.toThrow();
  });
});
