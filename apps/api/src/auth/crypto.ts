import { createHash, randomBytes } from 'node:crypto';

/** 32 random bytes as unpadded base64url: 43 characters, 256 bits of entropy. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Tokens are high entropy, so a fast unsalted hash is enough to make a database leak useless
 * while still allowing an indexed lookup. Passwords use Argon2id instead.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
