import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, map } from 'rxjs';

@Injectable()
export class ResponseMetaInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const httpResponse = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map((body: unknown) => {
        if (!body || typeof body !== 'object' || !('data' in body)) return body;
        const response = body as {
          data: unknown;
          meta?: Record<string, unknown>;
        };
        if (
          response.data &&
          typeof response.data === 'object' &&
          'version' in response.data &&
          Number.isInteger((response.data as { version?: unknown }).version)
        ) {
          httpResponse.setHeader(
            'ETag',
            `"${String((response.data as { version: number }).version)}"`,
          );
        }
        return {
          ...response,
          meta: { ...response.meta, requestId: request.requestId },
        };
      }),
    );
  }
}
