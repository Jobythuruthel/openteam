import { describe, expect, it } from 'vitest';
import { EnvValidationError, loadApiEnv, loadWorkerEnv } from './env';

const valid = {
  DATABASE_URL: 'postgresql://openteam:secret@localhost:5432/openteam',
  REDIS_URL: 'redis://localhost:6379',
};

describe('loadApiEnv', () => {
  it('applies defaults for optional values', () => {
    const env = loadApiEnv(valid);
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(4000);
    expect(env.TRUST_PROXY).toBe(false);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000', 'http://localhost:3001']);
  });

  it('coerces and splits values', () => {
    const env = loadApiEnv({
      ...valid,
      API_PORT: '8080',
      TRUST_PROXY: 'true',
      CORS_ORIGINS: 'https://openteam.me, https://cms.openteam.me',
    });
    expect(env.API_PORT).toBe(8080);
    expect(env.TRUST_PROXY).toBe(true);
    expect(env.CORS_ORIGINS).toEqual(['https://openteam.me', 'https://cms.openteam.me']);
  });

  it('rejects missing required values and names them', () => {
    expect(() => loadApiEnv({})).toThrow(EnvValidationError);
    try {
      loadApiEnv({});
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('DATABASE_URL');
      expect(message).toContain('REDIS_URL');
    }
  });

  it('treats empty strings as missing', () => {
    expect(() => loadApiEnv({ ...valid, DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
  });

  it('rejects the wrong URL scheme without echoing the value', () => {
    const secret = 'mysql://user:supersecretpassword@db/app';
    try {
      loadApiEnv({ ...valid, DATABASE_URL: secret });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain('DATABASE_URL');
      expect((error as Error).message).not.toContain('supersecretpassword');
    }
  });

  it('rejects an out-of-range port', () => {
    expect(() => loadApiEnv({ ...valid, API_PORT: '70000' })).toThrow(/API_PORT/);
  });
});

describe('auth settings', () => {
  it('defaults to sane session and token lifetimes', () => {
    const env = loadApiEnv(valid);
    expect(env.SESSION_TTL_DAYS).toBe(30);
    expect(env.SESSION_IDLE_TIMEOUT_DAYS).toBe(14);
    expect(env.EMAIL_VERIFICATION_TTL_HOURS).toBe(24);
    expect(env.PASSWORD_RESET_TTL_MINUTES).toBe(60);
    expect(env.COOKIE_SECURE).toBe(false);
  });

  it('refuses insecure cookies in production', () => {
    expect(() => loadApiEnv({ ...valid, NODE_ENV: 'production' })).toThrow(/COOKIE_SECURE/);
    expect(
      loadApiEnv({ ...valid, NODE_ENV: 'production', COOKIE_SECURE: 'true' }).COOKIE_SECURE,
    ).toBe(true);
  });

  it('refuses an idle timeout longer than the session lifetime', () => {
    expect(() =>
      loadApiEnv({ ...valid, SESSION_TTL_DAYS: '7', SESSION_IDLE_TIMEOUT_DAYS: '14' }),
    ).toThrow(/SESSION_IDLE_TIMEOUT_DAYS/);
  });
});

describe('loadWorkerEnv', () => {
  it('defaults email delivery to local Mailpit', () => {
    const env = loadWorkerEnv(valid);
    expect(env.EMAIL_PROVIDER).toBe('smtp');
    expect(env.SMTP_HOST).toBe('localhost');
    expect(env.SMTP_PORT).toBe(1025);
  });

  it('rejects unknown email providers', () => {
    expect(() => loadWorkerEnv({ ...valid, EMAIL_PROVIDER: 'carrier-pigeon' })).toThrow(
      /EMAIL_PROVIDER/,
    );
  });

  it('validates concurrency bounds', () => {
    expect(loadWorkerEnv(valid).WORKER_CONCURRENCY).toBe(4);
    expect(() => loadWorkerEnv({ ...valid, WORKER_CONCURRENCY: '0' })).toThrow(
      /WORKER_CONCURRENCY/,
    );
  });
});
