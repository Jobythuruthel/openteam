import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

/** OWASP 2024 minimum for Argon2id: 19 MiB memory, 2 iterations, 1 lane. */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, ARGON2_OPTIONS);
  }

  /**
   * Burns the same CPU and memory as a real verification. Called when an email is unknown so the
   * response time does not reveal whether an account exists.
   */
  async verifyAgainstDummy(password: string): Promise<false> {
    this.dummyHash ??= this.hash('dummy-password-for-timing-equalisation');
    await this.verify(await this.dummyHash, password);
    return false;
  }
}
