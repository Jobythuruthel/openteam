import type { Job } from 'bullmq';
import type { Logger } from 'pino';
import type { EmailMessageInput, EmailProvider } from '@openteam/email';
import { renderEmail, SEND_EMAIL_JOB } from '@openteam/email';

export interface EmailProcessorDeps {
  provider: EmailProvider;
  logger: Logger;
}

/**
 * Renders and delivers one queued email. Throwing lets BullMQ retry with backoff.
 * Logs carry the template and job id only: no recipient, subject or link.
 */
export function createEmailProcessor({ provider, logger }: EmailProcessorDeps) {
  return async (job: Pick<Job<EmailMessageInput>, 'name' | 'id' | 'data' | 'attemptsMade'>) => {
    if (job.name !== SEND_EMAIL_JOB) throw new Error(`Unknown email job: ${job.name}`);
    const rendered = renderEmail(job.data);
    const { messageId } = await provider.send({ to: job.data.to, ...rendered });
    logger.info(
      {
        jobId: job.id,
        template: job.data.template,
        provider: provider.name,
        attempt: job.attemptsMade + 1,
      },
      'Email delivered',
    );
    return { messageId };
  };
}
