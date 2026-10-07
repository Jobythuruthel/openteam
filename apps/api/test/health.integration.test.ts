import type { INestApplication } from '@nestjs/common';
import { loadApiEnv } from '@openteam/config';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIntegrationApp } from './helpers';

// Requires DATABASE_URL and REDIS_URL pointing at running services (see docker-compose.yml).
describe.runIf(process.env.DATABASE_URL && process.env.REDIS_URL)('health (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createIntegrationApp(loadApiEnv({ ...process.env, NODE_ENV: 'test' }));
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports the real database and Redis as up', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', checks: { database: 'up', redis: 'up' } });
  });
});
