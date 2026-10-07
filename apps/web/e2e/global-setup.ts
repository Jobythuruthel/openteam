import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { createPrismaClient } from '@openteam/database';
import { Redis } from 'ioredis';
import { e2eEnv } from '../playwright.config';

/** Starts every run from a clean slate and launches the email worker. */
export default async function globalSetup() {
  const prisma = createPrismaClient({ databaseUrl: e2eEnv.DATABASE_URL });
  await prisma.$executeRawUnsafe('TRUNCATE users CASCADE');
  await prisma.$disconnect();
  const redis = new Redis(e2eEnv.REDIS_URL);
  const keys = await redis.keys('rl:*');
  if (keys.length) await redis.del(...keys);
  redis.disconnect();
  const mailpit = process.env.MAILPIT_URL ?? 'http://localhost:8025';
  await fetch(`${mailpit}/api/v1/messages`, { method: 'DELETE' });

  const worker = spawn('node', [resolve(__dirname, '../../worker/dist/main.js')], {
    env: { ...process.env, ...e2eEnv, NODE_ENV: 'test', LOG_LEVEL: 'info' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise<void>((ready, fail) => {
    const timer = setTimeout(() => fail(new Error('Worker did not start within 30s')), 30_000);
    worker.stdout.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('Worker started')) {
        clearTimeout(timer);
        ready();
      }
    });
    worker.on('exit', (code) => fail(new Error(`Worker exited early with code ${code}`)));
  });
  worker.stdout.resume();
  process.env.E2E_WORKER_PID = String(worker.pid);
}
