import {
  emailOnlySchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@openteam/validation';
import { z } from 'zod';
import { RATE_LIMITS } from '../auth/rate-limit';

/**
 * OpenAPI 3.1 document built from the same Zod schemas the API validates with, so the contract
 * cannot drift from the implementation. Served at GET /api/v1/openapi.json.
 */
function jsonSchema(schema: z.ZodType) {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, {
    io: 'input',
    unrepresentable: 'any',
  }) as Record<string, unknown>;
  return rest;
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object) => ({ 'application/json': { schema } });
const error = (description: string) => ({ description, content: json(ref('Error')) });

const SESSION_COOKIE =
  'Session cookie `__Host-ot_session` (production) or `ot_session` (plain HTTP development). HttpOnly, SameSite=Lax, Path=/, Secure in production.';

const common = {
  '422': error('Request body failed validation. `error.details` lists field messages.'),
  '429': {
    description: 'Rate limit exceeded. Retry after the number of seconds in `Retry-After`.',
    headers: { 'Retry-After': { schema: { type: 'integer' } } },
    content: json(ref('Error')),
  },
  '503': error('A dependency (database or Redis) is unavailable. Auth fails closed.'),
};

function limits(action: keyof typeof RATE_LIMITS): string {
  const rules: Record<string, { limit: number; windowSeconds: number }> = RATE_LIMITS[action];
  return Object.entries(rules)
    .map(
      ([scope, rule]) =>
        `${rule.limit} per ${rule.windowSeconds / 60} min per ${scope === 'ip' ? 'IP address' : 'email address'}`,
    )
    .join('; ');
}

const accepted = {
  description:
    'Accepted. The same response is returned whether or not the address is registered, so it cannot be used to discover accounts.',
  content: json(ref('Accepted')),
};

const cookieAuth = [{ sessionCookie: [] }];

export function buildOpenApiDocument() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Open Team API',
      version: '0.1.0',
      license: { name: 'AGPL-3.0-or-later', identifier: 'AGPL-3.0-or-later' },
      description:
        'All errors use `{ "error": { "code", "message", "requestId", "details?" } }`. Every response carries `x-request-id`. State-changing requests from browsers must come from an allowed Origin.',
    },
    servers: [{ url: '/api/v1' }],
    components: {
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'ot_session',
          description: SESSION_COOKIE,
        },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: {
                  type: 'string',
                  examples: ['validation_failed', 'invalid_credentials', 'rate_limited'],
                },
                message: { type: 'string' },
                requestId: { type: 'string' },
                details: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { field: { type: 'string' }, message: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
        Accepted: { type: 'object', properties: { message: { type: 'string' } } },
        User: {
          type: 'object',
          required: ['id', 'email', 'emailVerified', 'status', 'createdAt'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            emailVerified: { type: 'boolean' },
            status: { type: 'string', enum: ['pending_verification', 'active', 'disabled'] },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Capabilities: {
          type: 'object',
          description:
            'Actions reserved for verified members. All false until the email is verified.',
          properties: {
            publishContent: { type: 'boolean' },
            submitApplication: { type: 'boolean' },
            createOrganisation: { type: 'boolean' },
            initiateChatRequest: { type: 'boolean' },
          },
        },
        Session: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            deviceLabel: { type: 'string', examples: ['Firefox on Linux'] },
            createdAt: { type: 'string', format: 'date-time' },
            lastSeenAt: { type: 'string', format: 'date-time' },
            expiresAt: { type: 'string', format: 'date-time' },
            current: { type: 'boolean' },
          },
        },
        RegisterRequest: jsonSchema(registerSchema),
        LoginRequest: jsonSchema(loginSchema),
        EmailRequest: jsonSchema(emailOnlySchema),
        VerifyEmailRequest: jsonSchema(verifyEmailSchema),
        ResetPasswordRequest: jsonSchema(resetPasswordSchema),
      },
    },
    paths: {
      '/auth/register': {
        post: {
          tags: ['auth'],
          summary: 'Create an account and send a verification email',
          description: `Rate limits: ${limits('register')}. If the address is already registered, its owner receives a notice instead and the response is identical.`,
          requestBody: { required: true, content: json(ref('RegisterRequest')) },
          responses: { '202': accepted, ...common },
        },
      },
      '/auth/verify-email': {
        post: {
          tags: ['auth'],
          summary: 'Confirm an email address with a single-use token',
          description: `Rate limit: ${limits('tokenVerification')}. Unknown, used and expired tokens all return the same 400.`,
          requestBody: { required: true, content: json(ref('VerifyEmailRequest')) },
          responses: {
            '200': {
              description: 'Verified.',
              content: json({ type: 'object', properties: { verified: { const: true } } }),
            },
            '400': error('`invalid_or_expired_token`'),
            ...common,
          },
        },
      },
      '/auth/resend-verification': {
        post: {
          tags: ['auth'],
          summary: 'Send a new verification link; previous links stop working',
          description: `Rate limits: ${limits('resendVerification')}.`,
          requestBody: { required: true, content: json(ref('EmailRequest')) },
          responses: { '202': accepted, ...common },
        },
      },
      '/auth/login': {
        post: {
          tags: ['auth'],
          summary: 'Sign in and receive a new session cookie',
          description: `Rate limits: ${limits('login')} (the email limit counts failed attempts only). Any session cookie sent with the request is revoked and replaced.`,
          requestBody: { required: true, content: json(ref('LoginRequest')) },
          responses: {
            '200': {
              description: 'Signed in.',
              headers: {
                'Set-Cookie': { description: SESSION_COOKIE, schema: { type: 'string' } },
              },
              content: json({ type: 'object', properties: { user: ref('User') } }),
            },
            '401': error(
              '`invalid_credentials`. Same message for unknown email, wrong password and disabled accounts.',
            ),
            ...common,
          },
        },
      },
      '/auth/logout': {
        post: {
          tags: ['auth'],
          summary: 'Revoke the current session and clear the cookie',
          description: 'Idempotent. Succeeds without a session.',
          responses: {
            '204': { description: 'Signed out. `Set-Cookie` expires the session cookie.' },
          },
        },
      },
      '/auth/logout-all': {
        post: {
          tags: ['auth'],
          summary: 'Revoke every session for the current user',
          security: cookieAuth,
          responses: {
            '204': { description: 'All sessions revoked; cookie cleared.' },
            '401': error('`unauthenticated`'),
          },
        },
      },
      '/auth/request-password-reset': {
        post: {
          tags: ['auth'],
          summary: 'Email a single-use password reset link',
          description: `Rate limits: ${limits('passwordResetRequest')}.`,
          requestBody: { required: true, content: json(ref('EmailRequest')) },
          responses: { '202': accepted, ...common },
        },
      },
      '/auth/reset-password': {
        post: {
          tags: ['auth'],
          summary: 'Set a new password with a reset token; revokes all sessions',
          description: `Rate limit: ${limits('tokenVerification')}.`,
          requestBody: { required: true, content: json(ref('ResetPasswordRequest')) },
          responses: {
            '200': {
              description: 'Password changed. Every session is revoked and the cookie cleared.',
            },
            '400': error('`invalid_or_expired_token`'),
            ...common,
          },
        },
      },
      '/auth/me': {
        get: {
          tags: ['auth'],
          summary: 'Current account and what it may do',
          security: cookieAuth,
          responses: {
            '200': {
              description: 'Current account.',
              content: json({
                type: 'object',
                properties: { user: ref('User'), capabilities: ref('Capabilities') },
              }),
            },
            '401': error('`unauthenticated`'),
          },
        },
      },
      '/auth/sessions': {
        get: {
          tags: ['auth'],
          summary: 'Active sessions for the current user',
          security: cookieAuth,
          responses: {
            '200': {
              description: 'Active sessions, most recently used first.',
              content: json({
                type: 'object',
                properties: { sessions: { type: 'array', items: ref('Session') } },
              }),
            },
            '401': error('`unauthenticated`'),
          },
        },
      },
      '/auth/sessions/{sessionId}': {
        delete: {
          tags: ['auth'],
          summary: 'Revoke one of your sessions',
          security: cookieAuth,
          parameters: [
            {
              name: 'sessionId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '204': { description: 'Revoked. Revoking the current session also clears the cookie.' },
            '401': error('`unauthenticated`'),
            '404': error('`not_found`. Also returned for sessions that belong to someone else.'),
            '422': error('`validation_failed`. The id is not a UUID.'),
          },
        },
      },
    },
  };
}
