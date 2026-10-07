import { describe, expect, it } from 'vitest';
import { RATE_LIMITS, rateLimitKey } from './rate-limit';

describe('rateLimitKey', () => {
  it('namespaces by action and scope', () => {
    const key = rateLimitKey('login', 'identifier', 'ada@example.com');
    expect(key).toMatch(/^rl:login:identifier:[0-9a-f]{32}$/);
    expect(rateLimitKey('register', 'identifier', 'ada@example.com')).not.toBe(key);
    expect(rateLimitKey('login', 'ip', 'ada@example.com')).not.toBe(key);
  });

  it('never contains the raw identifier', () => {
    expect(rateLimitKey('login', 'identifier', 'ada@example.com')).not.toContain('ada');
    expect(rateLimitKey('login', 'ip', '203.0.113.7')).not.toContain('203.0.113.7');
  });

  it('treats case and surrounding whitespace as the same identifier', () => {
    expect(rateLimitKey('login', 'identifier', ' Ada@Example.com ')).toBe(
      rateLimitKey('login', 'identifier', 'ada@example.com'),
    );
  });

  it('defines an IP rule for every action', () => {
    for (const rules of Object.values(RATE_LIMITS)) expect(rules.ip.limit).toBeGreaterThan(0);
  });
});
