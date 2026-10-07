import { describe, expect, it } from 'vitest';
import { resolveRequestId } from './logger';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('resolveRequestId', () => {
  it('keeps a safe caller supplied id', () => {
    expect(resolveRequestId('req_abc-123.XYZ')).toBe('req_abc-123.XYZ');
  });

  it('generates an id when none is supplied', () => {
    expect(resolveRequestId(undefined)).toMatch(UUID);
  });

  it('replaces ids that could inject into logs', () => {
    expect(resolveRequestId('abc\ninjected log line')).toMatch(UUID);
    expect(resolveRequestId('x'.repeat(500))).toMatch(UUID);
    expect(resolveRequestId('short')).toMatch(UUID);
  });

  it('uses the first value of a repeated header', () => {
    expect(resolveRequestId(['first-id-123', 'second-id-456'])).toBe('first-id-123');
  });
});
