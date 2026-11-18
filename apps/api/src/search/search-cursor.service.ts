import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { AuthenticatedSession } from '../auth/auth.types';
import type { SearchRequestDto } from './search.dto';
import type { SearchCursorPayload } from './search.types';

const CURSOR_TTL_SECONDS = 15 * 60;

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

@Injectable()
export class SearchCursorService {
  private readonly secret: string;

  constructor() {
    const secret = process.env.ACCESS_TOKEN_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error(
        'ACCESS_TOKEN_SECRET must contain at least 32 characters.',
      );
    }
    this.secret = secret;
  }

  requestHash(request: SearchRequestDto): string {
    return createHash('sha256')
      .update(
        stableStringify({
          query: request.query,
          filters: request.filters,
          facets: request.facets,
          sort: request.sort,
        }),
      )
      .digest('base64url');
  }

  encode(
    session: AuthenticatedSession,
    requestHash: string,
    position: Pick<
      SearchCursorPayload,
      'sortField' | 'sortDirection' | 'sortValue' | 'id'
    >,
  ): string {
    const payload: SearchCursorPayload = {
      version: 1,
      userId: session.userId,
      sessionId: session.sessionId,
      authorizationVersion: session.authorizationVersion,
      requestHash,
      ...position,
      expiresAt: Math.floor(Date.now() / 1000) + CURSOR_TTL_SECONDS,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${this.sign(encoded)}`;
  }

  decode(
    cursor: string,
    session: AuthenticatedSession,
    requestHash: string,
  ): SearchCursorPayload {
    const [encoded, suppliedSignature, extra] = cursor.split('.');
    if (!encoded || !suppliedSignature || extra) this.invalidCursor();

    const expectedSignature = this.sign(encoded);
    const expected = Buffer.from(expectedSignature);
    const supplied = Buffer.from(suppliedSignature);
    if (
      expected.length !== supplied.length ||
      !timingSafeEqual(expected, supplied)
    ) {
      this.invalidCursor();
    }

    let payload: SearchCursorPayload;
    try {
      payload = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      ) as SearchCursorPayload;
    } catch {
      this.invalidCursor();
    }

    if (
      payload.version !== 1 ||
      payload.userId !== session.userId ||
      payload.sessionId !== session.sessionId ||
      payload.authorizationVersion !== session.authorizationVersion ||
      payload.requestHash !== requestHash ||
      payload.expiresAt <= Math.floor(Date.now() / 1000) ||
      !Number.isSafeInteger(payload.id)
    ) {
      this.invalidCursor();
    }
    return payload;
  }

  private sign(encoded: string): string {
    return createHmac('sha256', this.secret)
      .update(encoded)
      .digest('base64url');
  }

  private invalidCursor(): never {
    throw new BadRequestException({
      code: 'INVALID_CURSOR',
      message: 'The search cursor is invalid or expired.',
    });
  }
}
