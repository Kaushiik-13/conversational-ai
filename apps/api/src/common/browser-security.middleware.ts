import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { AuthConfig } from '../auth/auth.config';

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class BrowserSecurityMiddleware implements NestMiddleware {
  constructor(private readonly config: AuthConfig) {}

  use(request: Request, response: Response, next: NextFunction): void {
    if (!unsafeMethods.has(request.method)) {
      next();
      return;
    }

    const origin = request.header('origin');
    if (origin && !this.config.allowedOrigins.has(origin)) {
      response.status(403).json({
        error: {
          code: 'CSRF_FAILED',
          message: 'The request could not be verified.',
          requestId: request.requestId,
        },
      });
      return;
    }

    const contentLength = Number(request.header('content-length') ?? 0);
    if (contentLength > 0 && !request.is('application/json')) {
      response.status(415).json({
        error: {
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: 'Request bodies must use application/json.',
          requestId: request.requestId,
        },
      });
      return;
    }

    next();
  }
}
