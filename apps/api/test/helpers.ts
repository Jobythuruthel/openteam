import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ApiEnv, loadApiEnv } from '@openteam/config';
import type { EmailMessageInput } from '@openteam/email';
import { configureApp } from '../src/app.factory';
import { AppModule } from '../src/app.module';
import { EmailDispatcher } from '../src/auth/email.dispatcher';
import { CLOCK, Clock } from '../src/common/clock';
import { createLogger } from '../src/common/logger';
import { PrismaService } from '../src/infrastructure/prisma.service';
import { RedisService } from '../src/infrastructure/redis.service';

export interface FakeDependencies {
  database: boolean;
  redis: boolean;
}

/** Captures messages instead of queueing them, so tests can read the emailed links. */
export class CapturingEmailDispatcher extends EmailDispatcher {
  readonly messages: EmailMessageInput[] = [];

  async dispatch(message: EmailMessageInput): Promise<void> {
    this.messages.push(message);
  }

  lastFor(to: string, template?: EmailMessageInput['template']): EmailMessageInput | undefined {
    return [...this.messages]
      .reverse()
      .find((m) => m.to === to && (!template || m.template === template));
  }
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
    .overrideProvider(EmailDispatcher)
    .useValue(new CapturingEmailDispatcher())
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
    bodyParser: false,
  });
  configureApp(app, env, createLogger(env));
  await app.init();
  return app;
}

export interface IntegrationOptions {
  clock?: Clock;
  email?: EmailDispatcher;
}

/** Builds the full HTTP app wired to the real database and Redis named in the environment. */
export async function createIntegrationApp(env: ApiEnv, options: IntegrationOptions = {}) {
  let builder = Test.createTestingModule({ imports: [AppModule.forRoot(env)] });
  if (options.email) builder = builder.overrideProvider(EmailDispatcher).useValue(options.email);
  if (options.clock) builder = builder.overrideProvider(CLOCK).useValue(options.clock);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
    bodyParser: false,
  });
  configureApp(app, env, createLogger(env));
  await app.init();
  return app;
}

/** Pulls the raw token out of an emailed link (it travels in the URL fragment). */
export function tokenFromUrl(url: string): string {
  const match = /#token=([A-Za-z0-9_-]+)$/.exec(url);
  if (!match?.[1]) throw new Error(`No token in ${url}`);
  return match[1];
}
