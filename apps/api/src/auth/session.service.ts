import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnv } from '@openteam/config';
import type { Session, SessionRevocationReason, User } from '@openteam/database';
import { CLOCK, Clock } from '../common/clock';
import { API_ENV } from '../config/config.module';
import { PrismaService } from '../infrastructure/prisma.service';
import { generateToken, hashToken } from './crypto';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Avoid a database write on every request: refresh last_seen_at at most this often. */
export const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export interface AuthContext {
  user: User;
  session: Session;
}

export interface SessionTimes {
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

/** Pure expiry rule: revoked, past the absolute lifetime, or idle too long all end a session. */
export function isSessionActive(session: SessionTimes, now: Date, idleTimeoutMs: number): boolean {
  if (session.revokedAt) return false;
  if (session.expiresAt.getTime() <= now.getTime()) return false;
  return now.getTime() - session.lastSeenAt.getTime() < idleTimeoutMs;
}

@Injectable()
export class SessionService {
  private readonly ttlMs: number;
  private readonly idleMs: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(API_ENV) env: ApiEnv,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.ttlMs = env.SESSION_TTL_DAYS * DAY_MS;
    this.idleMs = env.SESSION_IDLE_TIMEOUT_DAYS * DAY_MS;
  }

  get maxAgeSeconds(): number {
    return Math.floor(this.ttlMs / 1000);
  }

  /** Creates a fresh session with a server generated token. Returns the raw token for the cookie. */
  async create(userId: string, deviceLabel: string): Promise<{ token: string; session: Session }> {
    const token = generateToken();
    const now = this.clock();
    const session = await this.prisma.client.session.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        deviceLabel,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + this.ttlMs),
      },
    });
    return { token, session };
  }

  /** Resolves a raw cookie token to an active session and its user, refreshing last seen. */
  async authenticate(token: string): Promise<AuthContext | null> {
    const now = this.clock();
    const session = await this.prisma.client.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!session || !isSessionActive(session, now, this.idleMs)) return null;
    if (session.user.status === 'DISABLED') return null;

    const { user, ...bare } = session;
    if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.client.session.update({
        where: { id: session.id },
        data: { lastSeenAt: now },
      });
      bare.lastSeenAt = now;
    }
    return { user, session: bare };
  }

  async revokeByToken(token: string, reason: SessionRevocationReason): Promise<void> {
    await this.prisma.client.session.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: this.clock(), revokedReason: reason },
    });
  }

  /** Revokes one of the user's sessions. Returns false when it does not exist or is not theirs. */
  async revokeForUser(
    userId: string,
    sessionId: string,
    reason: SessionRevocationReason,
  ): Promise<boolean> {
    const result = await this.prisma.client.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: this.clock(), revokedReason: reason },
    });
    return result.count === 1;
  }

  async revokeAllForUser(userId: string, reason: SessionRevocationReason): Promise<number> {
    const result = await this.prisma.client.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: this.clock(), revokedReason: reason },
    });
    return result.count;
  }

  async listActive(userId: string): Promise<Session[]> {
    const now = this.clock();
    const sessions = await this.prisma.client.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { lastSeenAt: 'desc' },
    });
    return sessions.filter((session) => isSessionActive(session, now, this.idleMs));
  }
}
