import type { INestApplication } from '@nestjs/common';
import { loadApiEnv } from '@openteam/config';
import { createPrismaClient } from '@openteam/database';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CapturingEmailDispatcher, createIntegrationApp, tokenFromUrl } from './helpers';

// Requires DATABASE_URL and REDIS_URL pointing at running services with migrations applied.
const enabled = Boolean(process.env.DATABASE_URL && process.env.REDIS_URL);

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'a long enough passphrase';
const NEW_PASSWORD = 'an even longer new passphrase';
const COOKIE = 'ot_session';

describe.runIf(enabled)('auth endpoints (integration, real PostgreSQL and Redis)', () => {
  const env = loadApiEnv({ ...process.env, NODE_ENV: 'test' });
  const prisma = createPrismaClient({ databaseUrl: env.DATABASE_URL });
  const redis = new Redis(env.REDIS_URL);
  const email = new CapturingEmailDispatcher();
  let offsetMs = 0;
  const clock = () => new Date(Date.now() + offsetMs);
  let app: INestApplication;

  const http = () => request(app.getHttpServer());
  const post = (path: string, body: object) =>
    http().post(`/api/v1/auth/${path}`).set('Origin', ORIGIN).send(body);

  function sessionCookie(res: request.Response): string {
    const header = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const cookie = header.find((c) => c.startsWith(`${COOKIE}=`));
    if (!cookie) throw new Error('No session cookie set');
    return cookie.split(';')[0] as string;
  }

  async function register(address: string) {
    await post('register', { email: address, password: PASSWORD }).expect(202);
    const message = email.lastFor(address.toLowerCase(), 'verify-email');
    if (message?.template !== 'verify-email') throw new Error('No verification email');
    return tokenFromUrl(message.data.verifyUrl);
  }

  async function verifiedUser(address: string) {
    await post('verify-email', { token: await register(address) }).expect(200);
  }

  async function signIn(
    address: string,
    password = PASSWORD,
    userAgent = 'Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0',
  ) {
    const res = await post('login', { email: address, password })
      .set('User-Agent', userAgent)
      .expect(200);
    return { res, cookie: sessionCookie(res) };
  }

  beforeAll(async () => {
    app = await createIntegrationApp(env, { email, clock });
  });

  beforeEach(async () => {
    offsetMs = 0;
    email.messages.length = 0;
    await prisma.$executeRawUnsafe('TRUNCATE users CASCADE');
    const keys = await redis.keys('rl:*');
    if (keys.length) await redis.del(...keys);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    redis.disconnect();
  });

  describe('POST /auth/register', () => {
    it('creates an unverified user with an Argon2id hash and emails a fragment link', async () => {
      const res = await post('register', {
        email: ' New.Member@Example.com ',
        password: PASSWORD,
      }).expect(202);
      expect(res.body.message).toMatch(/message is on its way/);
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: 'new.member@example.com' },
      });
      expect(user.status).toBe('PENDING_VERIFICATION');
      expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);
      const message = email.lastFor('new.member@example.com', 'verify-email');
      expect(message?.template).toBe('verify-email');
      if (message?.template === 'verify-email') {
        expect(message.data.verifyUrl).toMatch(
          /^http:\/\/localhost:3000\/verify-email#token=[A-Za-z0-9_-]{43}$/,
        );
        // Only the hash is stored.
        const stored = await prisma.emailVerificationToken.findFirstOrThrow({
          where: { userId: user.id },
        });
        expect(stored.tokenHash).not.toBe(tokenFromUrl(message.data.verifyUrl));
      }
    });

    it('gives an identical response for an existing email and notifies the owner instead', async () => {
      await register('taken@example.com');
      const res = await post('register', { email: 'TAKEN@example.com', password: PASSWORD }).expect(
        202,
      );
      expect(res.body).toEqual({ message: expect.stringMatching(/message is on its way/) });
      expect(email.lastFor('taken@example.com')?.template).toBe('account-exists');
      expect(await prisma.user.count()).toBe(1);
    });

    it('rejects weak passwords and bad emails with field details', async () => {
      const res = await post('register', { email: 'nope', password: 'short' }).expect(422);
      expect(res.body.error.code).toBe('validation_failed');
      expect(res.body.error.details.map((d: { field: string }) => d.field).sort()).toEqual([
        'email',
        'password',
      ]);
      expect(JSON.stringify(res.body)).not.toContain('short');
    });

    it('rate limits by email address', async () => {
      for (let i = 0; i < 5; i++)
        await post('register', { email: 'spam@example.com', password: PASSWORD }).expect(202);
      const res = await post('register', { email: 'spam@example.com', password: PASSWORD }).expect(
        429,
      );
      expect(res.body.error.code).toBe('rate_limited');
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  describe('POST /auth/verify-email', () => {
    it('verifies once and rejects reuse', async () => {
      const token = await register('verify@example.com');
      await post('verify-email', { token }).expect(200, { verified: true });
      const user = await prisma.user.findUniqueOrThrow({ where: { email: 'verify@example.com' } });
      expect(user.status).toBe('ACTIVE');
      expect(user.emailVerifiedAt).not.toBeNull();
      const reuse = await post('verify-email', { token }).expect(400);
      expect(reuse.body.error.code).toBe('invalid_or_expired_token');
    });

    it('rejects expired tokens', async () => {
      const token = await register('late@example.com');
      offsetMs = 24 * 3_600_000 + 1000;
      const res = await post('verify-email', { token }).expect(400);
      expect(res.body.error.code).toBe('invalid_or_expired_token');
    });

    it('rejects unknown and malformed tokens', async () => {
      await post('verify-email', { token: 'A'.repeat(43) }).expect(400);
      await post('verify-email', { token: 'not-a-token' }).expect(422);
    });

    it('rate limits token guessing by IP', async () => {
      for (let i = 0; i < 20; i++)
        await post('verify-email', { token: 'B'.repeat(43) }).expect(400);
      await post('verify-email', { token: 'B'.repeat(43) }).expect(429);
    });
  });

  describe('POST /auth/resend-verification', () => {
    it('issues a new link and invalidates the previous one', async () => {
      const first = await register('resend@example.com');
      await post('resend-verification', { email: 'resend@example.com' }).expect(202);
      const message = email.lastFor('resend@example.com', 'verify-email');
      const second =
        message?.template === 'verify-email' ? tokenFromUrl(message.data.verifyUrl) : '';
      expect(second).not.toBe(first);
      await post('verify-email', { token: first }).expect(400);
      await post('verify-email', { token: second }).expect(200);
    });

    it('responds identically for unknown and already verified addresses without sending', async () => {
      await verifiedUser('done@example.com');
      email.messages.length = 0;
      const a = await post('resend-verification', { email: 'done@example.com' }).expect(202);
      const b = await post('resend-verification', { email: 'ghost@example.com' }).expect(202);
      expect(a.body).toEqual(b.body);
      expect(email.messages).toHaveLength(0);
    });
  });

  describe('POST /auth/login', () => {
    it('sets a hardened session cookie and returns the public user only', async () => {
      await verifiedUser('login@example.com');
      const { res } = await signIn('login@example.com');
      const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).join(';');
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Lax/);
      expect(cookie).toMatch(/Path=\//);
      expect(res.body.user).toMatchObject({
        email: 'login@example.com',
        emailVerified: true,
        status: 'active',
      });
      expect(JSON.stringify(res.body)).not.toMatch(/argon2|passwordHash|tokenHash/);
    });

    it('uses one generic error for unknown emails and wrong passwords', async () => {
      await verifiedUser('real@example.com');
      const wrong = await post('login', {
        email: 'real@example.com',
        password: 'wrong password!!',
      }).expect(401);
      const unknown = await post('login', {
        email: 'nobody@example.com',
        password: 'wrong password!!',
      }).expect(401);
      expect(wrong.body.error.code).toBe('invalid_credentials');
      expect(wrong.body.error.message).toBe(unknown.body.error.message);
    });

    it('rotates the session: a cookie sent at login is revoked and replaced', async () => {
      await verifiedUser('rotate@example.com');
      const first = await signIn('rotate@example.com');
      const second = await post('login', { email: 'rotate@example.com', password: PASSWORD })
        .set('Cookie', first.cookie)
        .expect(200);
      expect(sessionCookie(second)).not.toBe(first.cookie);
      await http().get('/api/v1/auth/me').set('Cookie', first.cookie).expect(401);
      await http().get('/api/v1/auth/me').set('Cookie', sessionCookie(second)).expect(200);
    });

    it('locks an email after 10 failed attempts, even with the right password', async () => {
      await verifiedUser('brute@example.com');
      for (let i = 0; i < 10; i++)
        await post('login', { email: 'brute@example.com', password: `guess number ${i}` }).expect(
          401,
        );
      await post('login', { email: 'brute@example.com', password: PASSWORD }).expect(429);
    });

    it('rejects disabled accounts with the generic error', async () => {
      await verifiedUser('off@example.com');
      await prisma.user.update({
        where: { email: 'off@example.com' },
        data: { status: 'DISABLED' },
      });
      const res = await post('login', { email: 'off@example.com', password: PASSWORD }).expect(401);
      expect(res.body.error.code).toBe('invalid_credentials');
    });
  });

  describe('GET /auth/me and unverified restrictions', () => {
    it('requires a session', async () => {
      const res = await http().get('/api/v1/auth/me').expect(401);
      expect(res.body.error.code).toBe('unauthenticated');
    });

    it('reports no restricted capabilities for an unverified member', async () => {
      await register('pending@example.com');
      const { cookie } = await signIn('pending@example.com');
      const res = await http().get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
      expect(res.body.user.emailVerified).toBe(false);
      expect(res.body.capabilities).toEqual({
        publishContent: false,
        submitApplication: false,
        createOrganisation: false,
        initiateChatRequest: false,
      });
    });

    it('grants capabilities once verified', async () => {
      await verifiedUser('member@example.com');
      const { cookie } = await signIn('member@example.com');
      const res = await http().get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
      expect(Object.values(res.body.capabilities).every(Boolean)).toBe(true);
    });

    it('expires idle sessions', async () => {
      await verifiedUser('idle@example.com');
      const { cookie } = await signIn('idle@example.com');
      offsetMs = 15 * 86_400_000;
      await http().get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
    });
  });

  describe('POST /auth/logout and /auth/logout-all', () => {
    it('logout revokes the session and clears the cookie', async () => {
      await verifiedUser('out@example.com');
      const { cookie } = await signIn('out@example.com');
      const res = await http()
        .post('/api/v1/auth/logout')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(204);
      expect(([] as string[]).concat(res.headers['set-cookie'] ?? []).join()).toMatch(
        /ot_session=;.*Expires=Thu, 01 Jan 1970/,
      );
      await http().get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
      const session = await prisma.session.findFirstOrThrow();
      expect(session.revokedReason).toBe('LOGOUT');
    });

    it('logout without a session is a harmless no-op', async () => {
      await http().post('/api/v1/auth/logout').set('Origin', ORIGIN).expect(204);
    });

    it('logout-all revokes every session of the user only', async () => {
      await verifiedUser('many@example.com');
      await verifiedUser('other@example.com');
      const a = await signIn('many@example.com');
      const b = await signIn('many@example.com');
      const other = await signIn('other@example.com');
      await http()
        .post('/api/v1/auth/logout-all')
        .set('Origin', ORIGIN)
        .set('Cookie', a.cookie)
        .expect(204);
      await http().get('/api/v1/auth/me').set('Cookie', b.cookie).expect(401);
      await http().get('/api/v1/auth/me').set('Cookie', other.cookie).expect(200);
    });

    it('logout-all requires a session', async () => {
      await http().post('/api/v1/auth/logout-all').set('Origin', ORIGIN).expect(401);
    });
  });

  describe('password reset', () => {
    it('emails a link only for real accounts but responds identically', async () => {
      await verifiedUser('reset@example.com');
      email.messages.length = 0;
      const a = await post('request-password-reset', { email: 'reset@example.com' }).expect(202);
      const b = await post('request-password-reset', { email: 'ghost@example.com' }).expect(202);
      expect(a.body).toEqual(b.body);
      expect(email.messages.map((m) => m.template)).toEqual(['password-reset']);
    });

    it('resets the password once, revokes all sessions and rejects the old password', async () => {
      await verifiedUser('reset2@example.com');
      const s1 = await signIn('reset2@example.com');
      const s2 = await signIn('reset2@example.com');
      await post('request-password-reset', { email: 'reset2@example.com' }).expect(202);
      const message = email.lastFor('reset2@example.com', 'password-reset');
      const token =
        message?.template === 'password-reset' ? tokenFromUrl(message.data.resetUrl) : '';

      await post('reset-password', { token, password: NEW_PASSWORD }).expect(200, { reset: true });
      await http().get('/api/v1/auth/me').set('Cookie', s1.cookie).expect(401);
      await http().get('/api/v1/auth/me').set('Cookie', s2.cookie).expect(401);
      const revoked = await prisma.session.findMany();
      expect(revoked.every((s) => s.revokedReason === 'PASSWORD_RESET')).toBe(true);

      await post('login', { email: 'reset2@example.com', password: PASSWORD }).expect(401);
      await signIn('reset2@example.com', NEW_PASSWORD);
      const reuse = await post('reset-password', { token, password: NEW_PASSWORD }).expect(400);
      expect(reuse.body.error.code).toBe('invalid_or_expired_token');
    });

    it('rejects expired reset tokens', async () => {
      await verifiedUser('slow@example.com');
      await post('request-password-reset', { email: 'slow@example.com' }).expect(202);
      const message = email.lastFor('slow@example.com', 'password-reset');
      const token =
        message?.template === 'password-reset' ? tokenFromUrl(message.data.resetUrl) : '';
      offsetMs = 61 * 60_000;
      await post('reset-password', { token, password: NEW_PASSWORD }).expect(400);
    });

    it('enforces the password policy on the new password', async () => {
      await post('reset-password', { token: 'C'.repeat(43), password: 'short' }).expect(422);
    });
  });

  describe('sessions', () => {
    it('lists active sessions with device labels and marks the current one', async () => {
      await verifiedUser('list@example.com');
      await signIn(
        'list@example.com',
        PASSWORD,
        'Mozilla/5.0 (Windows NT 10.0) Chrome/128.0 Safari/537.36',
      );
      const { cookie } = await signIn('list@example.com');
      const res = await http().get('/api/v1/auth/sessions').set('Cookie', cookie).expect(200);
      expect(res.body.sessions).toHaveLength(2);
      expect(res.body.sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
      expect(res.body.sessions.map((s: { deviceLabel: string }) => s.deviceLabel).sort()).toEqual([
        'Chrome on Windows',
        'Firefox on Linux',
      ]);
      expect(JSON.stringify(res.body)).not.toMatch(/token/i);
    });

    it('revokes another of my sessions', async () => {
      await verifiedUser('rev@example.com');
      const other = await signIn('rev@example.com');
      const { cookie } = await signIn('rev@example.com');
      const list = await http().get('/api/v1/auth/sessions').set('Cookie', cookie).expect(200);
      const target = list.body.sessions.find((s: { current: boolean }) => !s.current);
      await http()
        .delete(`/api/v1/auth/sessions/${target.id}`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(204);
      await http().get('/api/v1/auth/me').set('Cookie', other.cookie).expect(401);
      await http().get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
    });

    it("returns 404 for someone else's session and 422 for a malformed id", async () => {
      await verifiedUser('a@example.com');
      await verifiedUser('b@example.com');
      const a = await signIn('a@example.com');
      const b = await signIn('b@example.com');
      const bSessions = await http()
        .get('/api/v1/auth/sessions')
        .set('Cookie', b.cookie)
        .expect(200);
      const bId = bSessions.body.sessions[0].id;
      await http()
        .delete(`/api/v1/auth/sessions/${bId}`)
        .set('Origin', ORIGIN)
        .set('Cookie', a.cookie)
        .expect(404);
      await http().get('/api/v1/auth/me').set('Cookie', b.cookie).expect(200);
      await http()
        .delete('/api/v1/auth/sessions/not-a-uuid')
        .set('Origin', ORIGIN)
        .set('Cookie', a.cookie)
        .expect(422);
    });

    it('requires a session', async () => {
      await http().get('/api/v1/auth/sessions').expect(401);
    });
  });

  describe('request hardening', () => {
    it('rejects state-changing requests from foreign origins', async () => {
      const res = await http()
        .post('/api/v1/auth/logout')
        .set('Origin', 'https://evil.example')
        .expect(403);
      expect(res.body.error.code).toBe('forbidden_origin');
    });

    it('rejects oversized bodies', async () => {
      const res = await post('login', {
        email: 'x@example.com',
        password: 'p'.repeat(20_000),
      }).expect(413);
      expect(res.body.error.code).toBe('payload_too_large');
    });

    it('rejects malformed JSON with the error envelope', async () => {
      const res = await http()
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"email":')
        .expect(400);
      expect(res.body.error.code).toBe('bad_request');
    });
  });
});
