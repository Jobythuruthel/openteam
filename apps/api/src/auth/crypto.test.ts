import { describe, expect, it } from 'vitest';
import { TOKEN_PATTERN } from '@openteam/validation';
import { generateToken, hashToken } from './crypto';

describe('token generation', () => {
  it('produces 43 character base64url tokens matching the shared format', () => {
    const token = generateToken();
    expect(token).toMatch(TOKEN_PATTERN);
  });

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateToken));
    expect(tokens.size).toBe(1000);
  });

  it('hashes deterministically to 64 hex characters that differ from the token', () => {
    const token = generateToken();
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
    expect(hashToken(generateToken())).not.toBe(hashToken(token));
  });
});
