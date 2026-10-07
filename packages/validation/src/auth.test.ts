import { describe, expect, it } from 'vitest';
import {
  emailSchema,
  fieldErrors,
  loginSchema,
  normaliseEmail,
  passwordSchema,
  registerSchema,
  sessionIdSchema,
  tokenSchema,
} from './auth';

describe('email normalisation', () => {
  it('trims and lowercases', () => {
    expect(normaliseEmail('  Ada.Lovelace@Example.COM ')).toBe('ada.lovelace@example.com');
    expect(emailSchema.parse(' Ada@Example.com')).toBe('ada@example.com');
  });

  it('keeps plus tags and dots, which some providers treat as distinct', () => {
    expect(emailSchema.parse('a.b+tag@example.com')).toBe('a.b+tag@example.com');
  });

  it('rejects invalid and oversized addresses', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
    expect(emailSchema.safeParse('').success).toBe(false);
    expect(emailSchema.safeParse(`${'a'.repeat(250)}@x.io`).success).toBe(false);
  });
});

describe('password policy', () => {
  it('requires 12 to 128 characters', () => {
    expect(passwordSchema.safeParse('short').success).toBe(false);
    expect(passwordSchema.safeParse('a'.repeat(12)).success).toBe(true);
    expect(passwordSchema.safeParse('a'.repeat(129)).success).toBe(false);
  });

  it('rejects whitespace only passwords', () => {
    expect(passwordSchema.safeParse(' '.repeat(20)).success).toBe(false);
  });

  it('allows unicode passphrases', () => {
    expect(passwordSchema.safeParse('correct horse ünïcode 🐎').success).toBe(true);
  });
});

describe('token and session id formats', () => {
  it('accepts 43 character base64url tokens only', () => {
    expect(tokenSchema.safeParse('A'.repeat(43)).success).toBe(true);
    expect(tokenSchema.safeParse('A'.repeat(42)).success).toBe(false);
    expect(tokenSchema.safeParse(`${'A'.repeat(42)}=`).success).toBe(false);
    expect(tokenSchema.safeParse(`${'A'.repeat(42)}/`).success).toBe(false);
  });

  it('accepts UUIDs as session ids', () => {
    expect(sessionIdSchema.safeParse('6f1c1d0e-6a3b-4f6a-9c1a-2b3c4d5e6f70').success).toBe(true);
    expect(sessionIdSchema.safeParse('1; DROP TABLE sessions').success).toBe(false);
  });
});

describe('request schemas', () => {
  it('rejects unknown fields', () => {
    expect(
      registerSchema.safeParse({ email: 'a@b.co', password: 'x'.repeat(12), role: 'admin' })
        .success,
    ).toBe(false);
  });

  it('login does not enforce the registration policy', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'old' }).success).toBe(true);
  });

  it('collects the first error per field', () => {
    const result = registerSchema.safeParse({ email: 'bad', password: 'short' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(fieldErrors(result.error)).sort()).toEqual(['email', 'password']);
    }
  });
});
