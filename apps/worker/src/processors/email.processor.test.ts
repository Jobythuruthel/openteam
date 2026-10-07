import { MemoryEmailProvider } from '@openteam/email';
import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { createEmailProcessor } from './email.processor';

const job = {
  name: 'send',
  id: '7',
  attemptsMade: 0,
  data: {
    template: 'verify-email' as const,
    to: 'ada@example.com',
    data: { verifyUrl: 'https://openteam.me/verify-email#token=SECRET-TOKEN', expiresInHours: 24 },
  },
};

describe('email processor', () => {
  it('renders and sends the message', async () => {
    const provider = new MemoryEmailProvider();
    await createEmailProcessor({ provider, logger: pino({ level: 'silent' }) })(job);
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]?.to).toBe('ada@example.com');
    expect(provider.sent[0]?.text).toContain('SECRET-TOKEN');
  });

  it('never logs the recipient or the link', async () => {
    const lines: string[] = [];
    const logger = pino({ level: 'info' }, { write: (line: string) => lines.push(line) });
    await createEmailProcessor({ provider: new MemoryEmailProvider(), logger })(job);
    const output = lines.join('');
    expect(output).toContain('Email delivered');
    expect(output).not.toContain('ada@example.com');
    expect(output).not.toContain('SECRET-TOKEN');
  });

  it('propagates provider failures so the job is retried', async () => {
    const provider = { name: 'broken', send: vi.fn().mockRejectedValue(new Error('SMTP down')) };
    await expect(
      createEmailProcessor({ provider, logger: pino({ level: 'silent' }) })(job),
    ).rejects.toThrow('SMTP down');
  });
});
