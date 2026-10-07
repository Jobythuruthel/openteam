import { Injectable } from '@nestjs/common';
import { PrismaService } from '../infrastructure/prisma.service';
import { RedisService } from '../infrastructure/redis.service';

export type DependencyStatus = 'up' | 'down';

export interface ReadinessReport {
  status: 'ok' | 'degraded';
  checks: { database: DependencyStatus; redis: DependencyStatus };
  durationMs: number;
}

const CHECK_TIMEOUT_MS = 2000;

async function withTimeout(check: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([check().catch(() => false), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  liveness() {
    return { status: 'ok' as const, uptimeSeconds: Math.round(process.uptime()) };
  }

  async readiness(timeoutMs = CHECK_TIMEOUT_MS): Promise<ReadinessReport> {
    const started = performance.now();
    const [database, redis] = await Promise.all([
      withTimeout(() => this.prisma.ping(), timeoutMs),
      withTimeout(() => this.redis.ping(), timeoutMs),
    ]);
    const checks = {
      database: database ? 'up' : 'down',
      redis: redis ? 'up' : 'down',
    } as const;
    return {
      status: database && redis ? 'ok' : 'degraded',
      checks,
      durationMs: Math.round(performance.now() - started),
    };
  }
}
