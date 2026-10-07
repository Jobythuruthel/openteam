import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import { EnvValidationError, loadWorkerEnv } from '@openteam/config';
import { createPrismaClient } from '@openteam/database';
import { EMAIL_QUEUE } from '@openteam/email';
import { createEmailProvider } from './email-provider';
import { createEmailProcessor } from './processors/email.processor';
import { createSystemProcessor } from './processors/system.processor';
import { HEARTBEAT_INTERVAL_MS, QUEUES, SYSTEM_JOBS } from './queues';

async function main(): Promise<void> {
  let env;
  try {
    env = loadWorkerEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  const logger = pino({
    level: env.LOG_LEVEL,
    base: { service: 'worker' },
    timestamp: pino.stdTimeFunctions.isoTime,
  });

  // BullMQ workers need blocking commands, which require maxRetriesPerRequest to be null.
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  connection.on('error', (error: Error) => logger.warn({ err: error }, 'Redis connection error'));

  const prisma = createPrismaClient({ databaseUrl: env.DATABASE_URL });

  const systemQueue = new Queue(QUEUES.system, { connection });
  await systemQueue.upsertJobScheduler(
    SYSTEM_JOBS.heartbeat,
    { every: HEARTBEAT_INTERVAL_MS },
    { name: SYSTEM_JOBS.heartbeat, opts: { removeOnComplete: 100, removeOnFail: 500 } },
  );

  const systemWorker = new Worker(
    QUEUES.system,
    createSystemProcessor({ systemInfo: prisma.systemInfo, logger }),
    { connection, concurrency: env.WORKER_CONCURRENCY },
  );
  systemWorker.on('failed', (job, error) =>
    logger.error({ err: error, jobId: job?.id, queue: QUEUES.system }, 'Job failed'),
  );

  const emailProvider = createEmailProvider(env);
  const emailWorker = new Worker(
    EMAIL_QUEUE,
    createEmailProcessor({ provider: emailProvider, logger }),
    {
      connection,
      concurrency: env.WORKER_CONCURRENCY,
    },
  );
  emailWorker.on('failed', (job, error) =>
    // The error message from SMTP never includes the message body, so it is safe to log.
    logger.error(
      { err: error, jobId: job?.id, queue: EMAIL_QUEUE, attempts: job?.attemptsMade },
      'Email job failed',
    ),
  );

  logger.info(
    { queues: [...Object.values(QUEUES), EMAIL_QUEUE], emailProvider: emailProvider.name },
    'Worker started',
  );

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Worker shutting down');
    // Let in-flight jobs finish before closing connections.
    await systemWorker.close();
    await emailWorker.close();
    await emailProvider.close?.();
    await systemQueue.close();
    await prisma.$disconnect();
    connection.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();
