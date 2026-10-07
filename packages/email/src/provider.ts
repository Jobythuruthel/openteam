import nodemailer from 'nodemailer';
import type { RenderedEmail } from './templates';

export interface OutgoingEmail extends RenderedEmail {
  to: string;
}

/** Anything that can deliver a rendered email. Swap implementations through configuration. */
export interface EmailProvider {
  readonly name: string;
  send(email: OutgoingEmail): Promise<{ messageId: string }>;
  close?(): Promise<void> | void;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string | undefined;
  password?: string | undefined;
  from: string;
}

/**
 * SMTP works with Mailpit in development and with any production relay (SES, Postmark, Mailgun,
 * self-hosted Postfix) without code changes.
 */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp';
  private readonly transport: nodemailer.Transporter;

  constructor(private readonly config: SmtpConfig) {
    this.transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      ...(config.user ? { auth: { user: config.user, pass: config.password ?? '' } } : {}),
    });
  }

  async send(email: OutgoingEmail) {
    const info = await this.transport.sendMail({
      from: this.config.from,
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    return { messageId: String(info.messageId) };
  }

  close() {
    this.transport.close();
  }
}

/** Keeps messages in memory. Used by tests only; never selectable through production configuration. */
export class MemoryEmailProvider implements EmailProvider {
  readonly name = 'memory';
  readonly sent: OutgoingEmail[] = [];

  async send(email: OutgoingEmail) {
    this.sent.push(email);
    return { messageId: `memory-${this.sent.length}` };
  }
}
