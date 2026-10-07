import { describe, expect, it, vi } from 'vitest';
import { loadApiEnv } from '@openteam/config';
import type { PrismaService } from '../infrastructure/prisma.service';
import { isSessionActive, SessionService, TOUCH_INTERVAL_MS } from './session.service';

const DAY = 86_400_000;
const now = new Date('2026-10-07T12:00:00Z');
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs);

describe('isSessionActive', () => {
  const base = {
    createdAt: at(-DAY),
    lastSeenAt: at(-1000),
    expiresAt: at(29 * DAY),
    revokedAt: null,
  };

  it('accepts a fresh session', () => {
    expect(isSessionActive(base, now, 14 * DAY)).toBe(true);
  });

  it('rejects a revoked session', () => {
    expect(isSessionActive({ ...base, revokedAt: at(-1) }, now, 14 * DAY)).toBe(false);
  });

  it('rejects a session past its absolute expiry, including exactly at expiry', () => {
    expect(isSessionActive({ ...base, expiresAt: now }, now, 14 * DAY)).toBe(false);
    expect(isSessionActive({ ...base, expiresAt: at(-1) }, now, 14 * DAY)).toBe(false);
  });

  it('rejects a session idle for longer than the idle timeout', () => {
    expect(isSessionActive({ ...base, lastSeenAt: at(-14 * DAY) }, now, 14 * DAY)).toBe(false);
    expect(isSessionActive({ ...base, lastSeenAt: at(-14 * DAY + 1) }, now, 14 * DAY)).toBe(true);
  });
});

function fakePrisma(row: unknown) {
  const update = vi.fn().mockResolvedValue(undefined);
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 's1',
    ...data,
  }));
  const prisma = {
    client: { session: { findUnique: vi.fn().mockResolvedValue(row), update, updateMany, create } },
  } as unknown as PrismaService;
  return { prisma, update, updateMany, create };
}

const env = loadApiEnv({
  DATABASE_URL: 'postgresql://x@localhost/x',
  REDIS_URL: 'redis://localhost',
});
const user = { id: 'u1', status: 'ACTIVE' };

describe('SessionService', () => {
  it('creates sessions storing only the token hash, with a 30 day expiry', async () => {
    const { prisma, create } = fakePrisma(null);
    const service = new SessionService(prisma, env, () => now);
    const { token } = await service.create('u1', 'Firefox on Linux');
    const data = create.mock.calls[0]?.[0].data ?? {};
    expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(data)).not.toContain(token);
    expect(data.expiresAt).toEqual(at(30 * DAY));
  });

  it('authenticates an active session without touching it when recently seen', async () => {
    const row = { id: 's1', lastSeenAt: at(-1000), expiresAt: at(DAY), revokedAt: null, user };
    const { prisma, update } = fakePrisma(row);
    const result = await new SessionService(prisma, env, () => now).authenticate('t');
    expect(result?.user.id).toBe('u1');
    expect(update).not.toHaveBeenCalled();
  });

  it('refreshes last seen after the touch interval', async () => {
    const row = {
      id: 's1',
      lastSeenAt: at(-TOUCH_INTERVAL_MS - 1),
      expiresAt: at(DAY),
      revokedAt: null,
      user,
    };
    const { prisma, update } = fakePrisma(row);
    await new SessionService(prisma, env, () => now).authenticate('t');
    expect(update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { lastSeenAt: now } });
  });

  it('rejects expired, revoked and disabled-user sessions', async () => {
    const rows = [
      { id: 's', lastSeenAt: at(-1), expiresAt: at(-1), revokedAt: null, user },
      { id: 's', lastSeenAt: at(-1), expiresAt: at(DAY), revokedAt: at(-1), user },
      {
        id: 's',
        lastSeenAt: at(-1),
        expiresAt: at(DAY),
        revokedAt: null,
        user: { ...user, status: 'DISABLED' },
      },
    ];
    for (const row of rows) {
      const { prisma } = fakePrisma(row);
      expect(await new SessionService(prisma, env, () => now).authenticate('t')).toBeNull();
    }
  });

  it('revokes only sessions owned by the user', async () => {
    const { prisma, updateMany } = fakePrisma(null);
    updateMany.mockResolvedValueOnce({ count: 0 });
    const service = new SessionService(prisma, env, () => now);
    expect(await service.revokeForUser('u1', 'someone-elses', 'USER_REVOKED')).toBe(false);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'someone-elses', userId: 'u1', revokedAt: null },
      data: { revokedAt: now, revokedReason: 'USER_REVOKED' },
    });
  });
});
