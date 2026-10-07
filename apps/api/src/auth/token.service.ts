import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@openteam/database';
import { AppError } from '../common/app-errors';
import { CLOCK, Clock } from '../common/clock';
import { generateToken, hashToken } from './crypto';

export type EmailTokenKind = 'emailVerification' | 'passwordReset';

type Tx = Prisma.TransactionClient;

export class InvalidTokenError extends AppError {
  constructor() {
    // One message for unknown, used and expired tokens: callers learn nothing about which it was.
    super(
      HttpStatus.BAD_REQUEST,
      'invalid_or_expired_token',
      'This link is invalid or has expired.',
    );
  }
}

/** Issues and consumes single-use, expiring email tokens. Only SHA-256 hashes are stored. */
@Injectable()
export class TokenService {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  /** Replaces any outstanding token of this kind, so only the newest emailed link works. */
  async issue(tx: Tx, kind: EmailTokenKind, userId: string, ttlMs: number): Promise<string> {
    const token = generateToken();
    const now = this.clock();
    const data = {
      userId,
      tokenHash: hashToken(token),
      createdAt: now,
      expiresAt: new Date(now.getTime() + ttlMs),
    };
    if (kind === 'emailVerification') {
      await tx.emailVerificationToken.deleteMany({ where: { userId, consumedAt: null } });
      await tx.emailVerificationToken.create({ data });
    } else {
      await tx.passwordResetToken.deleteMany({ where: { userId, consumedAt: null } });
      await tx.passwordResetToken.create({ data });
    }
    return token;
  }

  /**
   * Marks the token consumed and returns its user id. The conditional update is atomic, so two
   * concurrent requests with the same token cannot both succeed.
   */
  async consume(tx: Tx, kind: EmailTokenKind, token: string): Promise<string> {
    const now = this.clock();
    const where = { tokenHash: hashToken(token), consumedAt: null, expiresAt: { gt: now } };
    const delegate =
      kind === 'emailVerification' ? tx.emailVerificationToken : tx.passwordResetToken;
    // The two delegates share this shape; the cast avoids a union call signature TypeScript cannot resolve.
    const tokens = delegate as unknown as Tx['emailVerificationToken'];
    const updated = await tokens.updateMany({ where, data: { consumedAt: now } });
    if (updated.count !== 1) throw new InvalidTokenError();
    const row = await tokens.findUnique({ where: { tokenHash: where.tokenHash } });
    if (!row) throw new InvalidTokenError();
    return row.userId;
  }
}
