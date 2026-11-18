import { Injectable } from '@nestjs/common';

function requiredSecret(name: string): string {
  const value = process.env[name];
  if (!value || Buffer.byteLength(value, 'utf8') < 32) {
    throw new Error(`${name} must contain at least 32 bytes.`);
  }
  return value;
}

function integerSetting(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be an integer from ${minimum} to ${maximum}.`,
    );
  }
  return value;
}

@Injectable()
export class AuthConfig {
  readonly accessTokenSecret = requiredSecret('ACCESS_TOKEN_SECRET');
  readonly refreshTokenSecret = requiredSecret('REFRESH_TOKEN_SECRET');
  readonly accessTokenTtlSeconds = integerSetting(
    'ACCESS_TOKEN_TTL_SECONDS',
    900,
    60,
    3600,
  );
  readonly refreshIdleTtlSeconds = integerSetting(
    'REFRESH_IDLE_TTL_SECONDS',
    604_800,
    3600,
    2_592_000,
  );
  readonly refreshAbsoluteTtlSeconds = integerSetting(
    'REFRESH_ABSOLUTE_TTL_SECONDS',
    2_592_000,
    86_400,
    7_776_000,
  );
  readonly loginAccountLimit = integerSetting('LOGIN_ACCOUNT_LIMIT', 5, 2, 20);
  readonly loginIpLimit = integerSetting('LOGIN_IP_LIMIT', 20, 5, 200);
  readonly loginWindowSeconds = integerSetting(
    'LOGIN_WINDOW_SECONDS',
    900,
    60,
    86_400,
  );
  readonly cookieSecure = process.env.COOKIE_SECURE === 'true';
  readonly allowedOrigins = new Set(
    (process.env.ALLOWED_ORIGINS ?? 'http://localhost:4200')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );

  constructor() {
    if (this.refreshAbsoluteTtlSeconds < this.refreshIdleTtlSeconds) {
      throw new Error(
        'REFRESH_ABSOLUTE_TTL_SECONDS must be at least REFRESH_IDLE_TTL_SECONDS.',
      );
    }
    if (this.allowedOrigins.size === 0) {
      throw new Error('ALLOWED_ORIGINS must contain at least one origin.');
    }
  }
}
