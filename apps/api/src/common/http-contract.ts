import { BadRequestException, HttpException } from '@nestjs/common';

export function parseIfMatch(value: string | undefined): number {
  if (!value) {
    throw new HttpException(
      {
        code: 'IF_MATCH_REQUIRED',
        message: 'The If-Match header is required.',
      },
      428,
    );
  }
  const match = /^(?:W\/)?"([1-9][0-9]*)"$/.exec(value.trim());
  if (!match) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'If-Match must contain a quoted positive integer version.',
    });
  }
  return Number(match[1]);
}

export function requireIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key || key.length < 8 || key.length > 200) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Idempotency-Key must contain between 8 and 200 characters.',
    });
  }
  return key;
}
