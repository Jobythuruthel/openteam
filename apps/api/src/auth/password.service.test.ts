import argon2 from 'argon2';
import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const passwords = new PasswordService();

  it('hashes with Argon2id and the configured cost', async () => {
    const hash = await passwords.hash('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).toMatch(/m=19456/);
    expect(hash).toMatch(/t=2/);
    expect(hash).toMatch(/p=1/);
    expect(hash).not.toContain('correct horse');
  });

  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await passwords.hash('correct horse battery staple');
    expect(await passwords.verify(hash, 'correct horse battery staple')).toBe(true);
    expect(await passwords.verify(hash, 'Correct horse battery staple')).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await passwords.hash('same password here')).not.toBe(
      await passwords.hash('same password here'),
    );
  });

  it('returns false for a malformed hash instead of throwing', async () => {
    expect(await passwords.verify('not-a-hash', 'whatever')).toBe(false);
  });

  it('flags weaker hashes for rehashing', async () => {
    const weak = await argon2.hash('pw', { type: argon2.argon2id, memoryCost: 4096, timeCost: 1 });
    expect(passwords.needsRehash(weak)).toBe(true);
    expect(passwords.needsRehash(await passwords.hash('pw'))).toBe(false);
  });

  it('dummy verification always fails', async () => {
    expect(await passwords.verifyAgainstDummy('dummy-password-for-timing-equalisation')).toBe(
      false,
    );
  });
});
