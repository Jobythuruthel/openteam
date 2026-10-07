import { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { ValidationFailedError } from './app-errors';

/** Validates and transforms untrusted input with a Zod schema; failures become a 422 envelope. */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value ?? {});
    if (result.success) return result.data;
    throw new ValidationFailedError(
      result.error.issues.map((issue) => ({
        field: issue.path.length ? issue.path.join('.') : '_',
        // Unknown-key errors list the offending keys, which is fine to echo; values are never echoed.
        message: issue.message,
      })),
    );
  }
}
