import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AuthConfig } from './auth.config';

interface AttemptWindow {
  attempts: number;
  resetAt: number;
}

@Injectable()
export class LoginRateLimiter {
  private readonly attempts = new Map<string, AttemptWindow>();

  constructor(private readonly config: AuthConfig) {}

  assertAllowed(key: string): void {
    const now = Date.now();
    const current = this.attempts.get(key);
    if (!current || current.resetAt <= now) {
      this.attempts.delete(key);
      return;
    }
    if (current.attempts >= this.config.loginIpLimit) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Too many sign-in attempts. Try again later.',
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  recordFailure(key: string): void {
    const now = Date.now();
    const current = this.attempts.get(key);
    if (!current || current.resetAt <= now) {
      this.attempts.set(key, {
        attempts: 1,
        resetAt: now + this.config.loginWindowSeconds * 1000,
      });
      return;
    }
    current.attempts += 1;
  }

  clear(key: string): void {
    this.attempts.delete(key);
  }
}
