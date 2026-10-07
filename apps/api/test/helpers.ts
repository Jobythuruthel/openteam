import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ApiEnv, loadApiEnv } from '@openteam/config';
import { configureApp } from '../src/app.factory';
import { AppModule } from '../src/app.module';
import { createLogger } from '../src/common/logger';
import { PrismaService } from '../src/infrastructure/prisma.service';
import { RedisService } from '../src/infrastructure/redis.service';

export interface FakeDependencies {
  database: boolean;
  redis: boolean;
}

export function testEnv(overrides: Record<string, string> = {}): ApiEnv {
  return loadApiEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://openteam:openteam@127.0.0.1:5432/openteam_test',
    REDIS_URL: 'redis://127.0.0.1:6379',
    ...overrides,
  });
}

/** Builds the full HTTP app with dependency pings replaced by controllable fakes. */
export async function createTestApp(state: FakeDependencies, env: ApiEnv = testEnv()) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(env)] })
    .overrideProvider(PrismaService)
    .useValue({ ping: async () => state.database, onModuleDestroy: async () => undefined })
    .overrideProvider(RedisService)
    .useValue({ ping: async () => state.redis, onModuleDestroy: async () => undefined })
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app, env, createLogger(env));
  await app.init();
  return app;
}

/** Builds the full HTTP app wired to the real database and Redis named in the environment. */
export async function createIntegrationApp(env: ApiEnv) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(env)] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app, env, createLogger(env));
  await app.init();
  return app;
}
