/** Queue shared by the API (producer) and the worker (consumer). Renaming it orphans queued jobs. */
export const EMAIL_QUEUE = 'email';
export const SEND_EMAIL_JOB = 'send';

export type EmailMessageInput =
  | { template: 'verify-email'; to: string; data: { verifyUrl: string; expiresInHours: number } }
  | { template: 'password-reset'; to: string; data: { resetUrl: string; expiresInMinutes: number } }
  | { template: 'account-exists'; to: string; data: { signInUrl: string; resetUrl: string } };

export type EmailTemplateName = EmailMessageInput['template'];

/** BullMQ settings for email jobs: retry with backoff, and drop job data once done so links do not linger in Redis. */
export const EMAIL_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 30_000 },
  removeOnComplete: true,
  removeOnFail: { age: 24 * 60 * 60 },
};
