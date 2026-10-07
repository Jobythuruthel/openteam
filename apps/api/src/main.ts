import 'reflect-metadata';
import { EnvValidationError, loadApiEnv } from '@openteam/config';
import { createApp } from './app.factory';
import { createLogger } from './common/logger';

async function bootstrap(): Promise<void> {
  let env;
  try {
    env = loadApiEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  const logger = createLogger(env);
  const app = await createApp(env, logger);
  await app.listen(env.API_PORT, env.API_HOST);
  logger.info({ port: env.API_PORT }, 'API listening');
}

void bootstrap();
