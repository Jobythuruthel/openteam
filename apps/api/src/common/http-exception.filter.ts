import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { FieldIssue, RateLimitedError } from './app-errors';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string | undefined;
    details?: FieldIssue[];
  };
}

const CODE_BY_STATUS: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'payload_too_large',
  422: 'validation_failed',
  429: 'rate_limited',
  503: 'service_unavailable',
};

/** Converts every error into the standard error envelope and hides internals on 5xx. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: string }>();
    const response = http.getResponse<Response>();

    // Body parser errors (oversized or malformed JSON) carry a status but are not HttpExceptions.
    const parserStatus = (exception as { status?: unknown; type?: unknown })?.type
      ? Number((exception as { status?: unknown }).status)
      : undefined;
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : parserStatus && parserStatus >= 400 && parserStatus < 500
          ? parserStatus
          : HttpStatus.INTERNAL_SERVER_ERROR;

    let code = CODE_BY_STATUS[status] ?? (status >= 500 ? 'internal_error' : 'error');
    let message = 'An unexpected error occurred.';
    let details: FieldIssue[] | undefined;

    if (exception instanceof HttpException && status < 500) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else {
        const typed = body as { code?: unknown; message?: unknown; details?: unknown };
        if (typeof typed.code === 'string') code = typed.code;
        message = typeof typed.message === 'string' ? typed.message : exception.message;
        if (Array.isArray(typed.details)) details = typed.details as FieldIssue[];
      }
      if (exception instanceof RateLimitedError) {
        response.setHeader('Retry-After', String(exception.retryAfterSeconds));
      }
    } else if (parserStatus && status < 500) {
      message = status === 413 ? 'Request body is too large.' : 'Request body is not valid JSON.';
    } else if (status === 503) {
      message = 'Service temporarily unavailable.';
    } else {
      this.logger.error(
        { err: exception, requestId: request.id },
        'Unhandled exception while processing request',
      );
    }

    const payload: ApiErrorBody = {
      error: { code, message, requestId: request.id, ...(details ? { details } : {}) },
    };
    response.status(status).json(payload);
  }
}
