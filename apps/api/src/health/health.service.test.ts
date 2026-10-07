import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../infrastructure/prisma.service';
import type { RedisService } from '../infrastructure/redis.service';
import { HealthService } from './health.service';

function service(database: () => Promise<boolean>, redis: () => Promise<boolean>) {
  return new HealthService(
    { ping: database } as unknown as PrismaService,
    { ping: redis } as unknown as RedisService,
  );
}

const up = () => Promise.resolve(true);
const down = () => Promise.resolve(false);

describe('HealthService', () => {
  it('reports ok when every dependency is up', async () => {
    const report = await service(up, up).readiness();
    expect(report.status).toBe('ok');
    expect(report.checks).toEqual({ database: 'up', redis: 'up' });
  });

  it('reports degraded when one dependency is down', async () => {
    const report = await service(up, down).readiness();
    expect(report.status).toBe('degraded');
    expect(report.checks).toEqual({ database: 'up', redis: 'down' });
  });

  it('treats a throwing check as down', async () => {
    const report = await service(() => Promise.reject(new Error('boom')), up).readiness();
    expect(report.checks.database).toBe('down');
  });

  it('treats a hanging check as down after the timeout', async () => {
    const hang = () => new Promise<boolean>(() => undefined);
    const report = await service(hang, up).readiness(20);
    expect(report.checks.database).toBe('down');
    expect(report.status).toBe('degraded');
  });

  it('liveness never touches dependencies', () => {
    const throwing = () => {
      throw new Error('should not be called');
    };
    expect(service(throwing, throwing).liveness().status).toBe('ok');
  });
});
