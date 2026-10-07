import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, FakeDependencies } from './helpers';

describe('health routes (HTTP)', () => {
  const state: FakeDependencies = { database: true, redis: true };
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp(state);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health/live returns 200', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });

  it('GET /api/v1/health/ready returns 200 when dependencies are up', async () => {
    state.database = true;
    state.redis = true;
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', checks: { database: 'up', redis: 'up' } });
  });

  it('GET /api/v1/health/ready returns 503 when a dependency is down', async () => {
    state.database = false;
    state.redis = true;
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);
    expect(res.body).toMatchObject({ status: 'degraded', checks: { database: 'down' } });
    state.database = true;
  });

  it('echoes a safe request id and generates one otherwise', async () => {
    const echoed = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('x-request-id', 'client-request-0001');
    expect(echoed.headers['x-request-id']).toBe('client-request-0001');

    const generated = await request(app.getHttpServer()).get('/api/v1/health/live');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sets baseline security headers and hides the framework', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/live');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('returns the standard error envelope for unknown routes', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/does-not-exist')
      .set('x-request-id', 'trace-me-please-1')
      .expect(404);
    expect(res.body).toEqual({
      error: { code: 'not_found', message: expect.any(String), requestId: 'trace-me-please-1' },
    });
  });

  it('does not serve routes outside the version prefix', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(404);
  });

  it('allows configured CORS origins only', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('Origin', 'http://localhost:3000');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');

    const denied = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('Origin', 'https://evil.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
