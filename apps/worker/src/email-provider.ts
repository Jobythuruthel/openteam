import type { WorkerEnv } from '@openteam/config';
import type { EmailProvider } from '@openteam/email';
import { SmtpEmailProvider } from '@openteam/email';

/** Chooses the delivery provider from configuration. Add new providers here, not in callers. */
export function createEmailProvider(env: WorkerEnv): EmailProvider {
  switch (env.EMAIL_PROVIDER) {
    case 'smtp':
      return new SmtpEmailProvider({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        user: env.SMTP_USER,
        password: env.SMTP_PASSWORD,
        from: env.EMAIL_FROM,
      });
  }
}
