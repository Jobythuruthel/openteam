import { describe, expect, it } from 'vitest';
import { toFailure } from './api';

describe('toFailure', () => {
  it('maps field details to a field error record', () => {
    const failure = toFailure(
      422,
      {
        error: {
          code: 'validation_failed',
          message: 'Fix',
          details: [{ field: 'email', message: 'Bad' }],
        },
      },
      null,
    );
    expect(failure.fieldErrors).toEqual({ email: 'Bad' });
    expect(failure.code).toBe('validation_failed');
  });

  it('turns Retry-After into a human message', () => {
    expect(toFailure(429, { error: { code: 'rate_limited' } }, '600').message).toBe(
      'Too many attempts. Try again in 10 minutes.',
    );
    expect(toFailure(429, null, '5').message).toBe('Too many attempts. Try again in 1 minute.');
  });

  it('hides server error details', () => {
    expect(toFailure(500, { error: { message: 'stack trace' } }, null).message).not.toContain(
      'stack',
    );
  });
});
