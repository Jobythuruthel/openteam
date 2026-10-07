import { EMAIL_JOB_OPTIONS, EMAIL_QUEUE, SEND_EMAIL_JOB, SmtpEmailProvider } from '@openteam/email';
import { Queue, QueueEvents, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import { afterAll, describe, expect, it } from 'vitest';
import { createEmailProcessor } from '../src/processors/email.processor';

// Requires Redis and a Mailpit instance (SMTP on MAILPIT_SMTP_PORT, API on MAILPIT_URL).
const mailpitUrl = process.env.MAILPIT_URL;
const enabled = Boolean(process.env.REDIS_URL && mailpitUrl);

describe.runIf(enabled)('email delivery through BullMQ and SMTP (integration)', () => {
  const queueName = `${EMAIL_QUEUE}-test-${Date.now()}`;
  const connection = new Redis(process.env.REDIS_URL ?? '', { maxRetriesPerRequest: null });
  const provider = new SmtpEmailProvider({
    host: '127.0.0.1',
    port: Number(process.env.MAILPIT_SMTP_PORT ?? 1025),
    secure: false,
    from: 'Open Team <no-reply@openteam.me>',
  });
  const queue = new Queue(queueName, { connection, defaultJobOptions: EMAIL_JOB_OPTIONS });
  const events = new QueueEvents(queueName, { connection: connection.duplicate() });
  const worker = new Worker(
    queueName,
    createEmailProcessor({ provider, logger: pino({ level: 'silent' }) }),
    {
      connection: connection.duplicate(),
    },
  );

  afterAll(async () => {
    await worker.close();
    await events.close();
    await queue.obliterate({ force: true });
    await queue.close();
    provider.close();
    connection.disconnect();
  });

  it('delivers a queued verification email to the SMTP server and removes the job', async () => {
    const to = `delivery-${Date.now()}@example.com`;
    await events.waitUntilReady();
    const job = await queue.add(SEND_EMAIL_JOB, {
      template: 'verify-email',
      to,
      data: { verifyUrl: 'http://localhost:3000/verify-email#token=abc', expiresInHours: 24 },
    });
    await job.waitUntilFinished(events, 20_000);

    const search = await fetch(
      `${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
    );
    const body = (await search.json()) as { messages: { Subject: string }[] };
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]?.Subject).toBe('Confirm your Open Team email');
    // removeOnComplete keeps links out of Redis once delivered.
    expect(await queue.getJob(job.id ?? '')).toBeUndefined();
  });
});
