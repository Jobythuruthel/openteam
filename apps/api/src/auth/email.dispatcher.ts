import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { ApiEnv } from '@openteam/config';
import { EMAIL_JOB_OPTIONS, EMAIL_QUEUE, EmailMessageInput, SEND_EMAIL_JOB } from '@openteam/email';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { API_ENV } from '../config/config.module';

/** Hands messages to the delivery pipeline. Tests replace it; production enqueues for the worker. */
export abstract class EmailDispatcher {
  abstract dispatch(message: EmailMessageInput): Promise<void>;
}

@Injectable()
export class QueueEmailDispatcher extends EmailDispatcher implements OnModuleDestroy {
  private readonly logger = new Logger(QueueEmailDispatcher.name);
  private readonly queue: Queue;
  private readonly connection: Redis;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    super();
    this.connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
    this.connection.on('error', (error: Error) =>
      this.logger.warn(`Email queue Redis error: ${error.message}`),
    );
    this.queue = new Queue(EMAIL_QUEUE, {
      connection: this.connection,
      defaultJobOptions: EMAIL_JOB_OPTIONS,
    });
  }

  async dispatch(message: EmailMessageInput): Promise<void> {
    const job = await this.queue.add(SEND_EMAIL_JOB, message);
    // Log the template and job only. Recipients and links stay out of the logs.
    this.logger.log({ template: message.template, jobId: job.id }, 'Email queued');
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
