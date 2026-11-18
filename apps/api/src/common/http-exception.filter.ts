import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorPayload {
  code?: string;
  message?: string | string[];
}

interface DatabaseError {
  code?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const databaseCode = (exception as DatabaseError | undefined)?.code;
    const databaseStatus =
      databaseCode === '23505'
        ? HttpStatus.CONFLICT
        : databaseCode === '23503' || databaseCode === '23514'
          ? HttpStatus.CONFLICT
          : databaseCode === '42501'
            ? HttpStatus.FORBIDDEN
            : undefined;
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : (databaseStatus ?? HttpStatus.INTERNAL_SERVER_ERROR);
    const raw =
      exception instanceof HttpException
        ? (exception.getResponse() as ErrorPayload | string)
        : undefined;
    const payload = typeof raw === 'string' ? { message: raw } : raw;
    const validationMessages = Array.isArray(payload?.message)
      ? payload.message
      : undefined;

    response.status(status).json({
      error: {
        code:
          payload?.code ??
          (databaseCode === '23505'
            ? 'CONFLICT'
            : databaseCode === '23503' || databaseCode === '23514'
              ? 'INVALID_STATE'
              : databaseCode === '42501'
                ? 'ACCESS_DENIED'
                : undefined) ??
          (status === 400
            ? 'VALIDATION_ERROR'
            : status === 500
              ? 'INTERNAL_ERROR'
              : 'REQUEST_FAILED'),
        message:
          status === 500
            ? 'The request could not be completed.'
            : databaseStatus
              ? databaseStatus === HttpStatus.FORBIDDEN
                ? 'You do not have permission to perform this action.'
                : 'The requested change conflicts with the current data.'
              : validationMessages
                ? 'The request contains invalid values.'
                : (payload?.message ?? 'The request could not be completed.'),
        ...(validationMessages
          ? { details: validationMessages.map((reason) => ({ reason })) }
          : {}),
        requestId: request.requestId,
      },
    });
  }
}
