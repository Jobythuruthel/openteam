import type { INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthController } from '../src/auth/auth.controller';
import { createTestApp } from './helpers';

const METHODS = ['get', 'post', 'put', 'delete', 'patch', 'all', 'options', 'head'];

/** Reads the routes Nest actually registers on AuthController, so the check cannot go stale. */
function controllerRoutes(): string[] {
  const base = Reflect.getMetadata(PATH_METADATA, AuthController) as string;
  // Descriptors, not property reads, so getters on the prototype are never invoked.
  return Object.entries(Object.getOwnPropertyDescriptors(AuthController.prototype))
    .filter(([name]) => name !== 'constructor')
    .map(([, descriptor]) => descriptor.value as unknown)
    .filter(
      (handler): handler is object =>
        typeof handler === 'function' && Reflect.hasMetadata(PATH_METADATA, handler),
    )
    .map((handler) => {
      const path = (Reflect.getMetadata(PATH_METADATA, handler) as string).replace(
        /:(\w+)/g,
        '{$1}',
      );
      const method = METHODS[Reflect.getMetadata(METHOD_METADATA, handler) as number] ?? '?';
      return `${method} /${base}/${path}`;
    })
    .sort();
}

describe('OpenAPI document', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp({ database: true, redis: true });
  });
  afterAll(async () => {
    await app.close();
  });

  it('documents every auth route the controller exposes', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/openapi.json').expect(200);
    const documented = Object.entries(res.body.paths as Record<string, Record<string, unknown>>)
      .flatMap(([path, ops]) => Object.keys(ops).map((method) => `${method} ${path}`))
      .filter((route) => route.includes('/auth/'))
      .sort();
    const routes = controllerRoutes();
    expect(routes).toHaveLength(11);
    expect(documented).toEqual(routes);
  });

  it('documents rate-limit and validation responses on public auth routes', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/openapi.json').expect(200);
    for (const path of [
      '/auth/register',
      '/auth/login',
      '/auth/request-password-reset',
      '/auth/verify-email',
    ]) {
      const responses = res.body.paths[path].post.responses;
      expect(responses['429']).toBeDefined();
      expect(responses['422']).toBeDefined();
    }
    expect(res.body.components.schemas.RegisterRequest.properties.password.minLength).toBe(12);
  });
});
