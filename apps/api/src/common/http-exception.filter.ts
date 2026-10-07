import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string | undefined;
  };
}

const CODE_BY_STATUS: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
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

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = 'An unexpected error occurred.';
    if (exception instanceof HttpException && status < 500) {
      const body = exception.getResponse();
      message =
        typeof body === 'string'
          ? body
          : typeof (body as { message?: unknown }).message === 'string'
            ? (body as { message: string }).message
            : exception.message;
    } else if (exception instanceof HttpException && status === 503) {
      message = 'Service temporarily unavailable.';
    } else {
      this.logger.error(
        { err: exception, requestId: request.id },
        'Unhandled exception while processing request',
      );
    }

    const payload: ApiErrorBody = {
      error: {
        code: CODE_BY_STATUS[status] ?? (status >= 500 ? 'internal_error' : 'error'),
        message,
        requestId: request.id,
      },
    };
    response.status(status).json(payload);
  }
}
