import { describe, expect, it, vi } from 'vitest';
import { hashToken } from './crypto';
import { InvalidTokenError, TokenService } from './token.service';

const now = new Date('2026-10-07T12:00:00Z');

function fakeTx(updateCount: number) {
  const delegate = {
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    create: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: updateCount }),
    findUnique: vi.fn().mockResolvedValue({ userId: 'u1' }),
  };
  return {
    tx: { emailVerificationToken: delegate, passwordResetToken: delegate } as never,
    delegate,
  };
}

describe('TokenService', () => {
  const service = new TokenService(() => now);

  it('issues a token, stores its hash and expiry, and replaces older unused tokens', async () => {
    const { tx, delegate } = fakeTx(1);
    const token = await service.issue(tx, 'passwordReset', 'u1', 60_000);
    expect(delegate.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', consumedAt: null } });
    const data = delegate.create.mock.calls[0]?.[0].data;
    expect(data.tokenHash).toBe(hashToken(token));
    expect(data.expiresAt).toEqual(new Date(now.getTime() + 60_000));
  });

  it('consumes only unexpired, unconsumed tokens in a single conditional update', async () => {
    const { tx, delegate } = fakeTx(1);
    expect(await service.consume(tx, 'emailVerification', 'raw-token')).toBe('u1');
    expect(delegate.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: hashToken('raw-token'), consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
  });

  it('rejects used, expired or unknown tokens with one generic error', async () => {
    const { tx } = fakeTx(0);
    await expect(service.consume(tx, 'emailVerification', 'raw-token')).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });
});
