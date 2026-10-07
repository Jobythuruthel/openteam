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

describe('loadWorkerEnv', () => {
  it('validates concurrency bounds', () => {
    expect(loadWorkerEnv(valid).WORKER_CONCURRENCY).toBe(4);
    expect(() => loadWorkerEnv({ ...valid, WORKER_CONCURRENCY: '0' })).toThrow(
      /WORKER_CONCURRENCY/,
    );
  });
});
