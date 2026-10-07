import { HttpException, HttpStatus } from '@nestjs/common';

export interface FieldIssue {
  field: string;
  message: string;
}

/** HttpException carrying a stable machine readable code for the error envelope. */
export class AppError extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
    readonly details?: FieldIssue[],
  ) {
    super({ code, message, details }, status);
  }
}

export class ValidationFailedError extends AppError {
  constructor(details: FieldIssue[]) {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'validation_failed',
      'Some fields need attention.',
      details,
    );
  }
}

export class RateLimitedError extends AppError {
  constructor(readonly retryAfterSeconds: number) {
    super(HttpStatus.TOO_MANY_REQUESTS, 'rate_limited', 'Too many attempts. Try again later.');
  }
}

export class UnauthenticatedError extends AppError {
  constructor() {
    super(HttpStatus.UNAUTHORIZED, 'unauthenticated', 'Sign in to continue.');
  }
}
