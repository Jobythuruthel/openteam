import { INestApplication, LoggerService } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { ApiEnv } from '@openteam/config';
import type { Logger } from 'pino';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { createHttpLogger } from './common/logger';
import { originCheck } from './common/origin-check';
import { securityHeaders } from './common/security-headers';

export const API_PREFIX = 'api/v1';
/** Auth payloads are tiny; a small limit cheaply rejects oversized bodies before parsing. */
export const JSON_BODY_LIMIT = '16kb';

/** Applies the middleware, prefix and error handling shared by production and tests. */
export function configureApp(app: NestExpressApplication, env: ApiEnv, logger: Logger): void {
  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', 1);
  app.use(createHttpLogger(logger));
  app.use(securityHeaders);
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.use(originCheck(env.CORS_ORIGINS));
  // Callers must create the app with bodyParser: false so this is the only JSON parser.
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
}

export function nestLoggerFrom(logger: Logger): LoggerService {
  return {
    log: (message: unknown, context?: string) => logger.info({ context }, String(message)),
    error: (message: unknown, trace?: string, context?: string) =>
      logger.error({ context, trace }, String(message)),
    warn: (message: unknown, context?: string) => logger.warn({ context }, String(message)),
    debug: (message: unknown, context?: string) => logger.debug({ context }, String(message)),
    verbose: (message: unknown, context?: string) => logger.trace({ context }, String(message)),
  };
}

export async function createApp(env: ApiEnv, logger: Logger): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env), {
    logger: nestLoggerFrom(logger),
    bufferLogs: false,
    bodyParser: false,
  });
  configureApp(app, env, logger);
  return app;
}
