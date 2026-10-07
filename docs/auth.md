# Authentication

Run 1 adds email and password accounts, email verification, sessions and password reset.

## Flows

| Journey             | Route                                                           | Notes                                                                                                                                |
| ------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Register            | `POST /api/v1/auth/register`                                    | Always `202` with the same body. New address: verification email. Existing address: an "account already exists" notice to its owner. |
| Verify email        | `POST /api/v1/auth/verify-email`                                | Single-use token, 24 hour expiry. Sets the account active.                                                                           |
| Resend verification | `POST /api/v1/auth/resend-verification`                         | Always `202`. Issuing a new link invalidates older ones.                                                                             |
| Sign in             | `POST /api/v1/auth/login`                                       | New session every time. Any session cookie sent along is revoked (fixation).                                                         |
| Sign out            | `POST /api/v1/auth/logout`                                      | Revokes the current session, clears the cookie. Idempotent.                                                                          |
| Sign out everywhere | `POST /api/v1/auth/logout-all`                                  | Revokes every session of the user.                                                                                                   |
| Forgot password     | `POST /api/v1/auth/request-password-reset`                      | Always `202`. Single-use token, 60 minute expiry.                                                                                    |
| Reset password      | `POST /api/v1/auth/reset-password`                              | Changes the password and revokes every session in one transaction.                                                                   |
| Current account     | `GET /api/v1/auth/me`                                           | User plus `capabilities` for verified-only actions.                                                                                  |
| Sessions            | `GET /api/v1/auth/sessions`, `DELETE /api/v1/auth/sessions/:id` | Another user's session id gets the same `404` as a missing one.                                                                      |

The full contract, including cookies and error responses, is served at `GET /api/v1/openapi.json`.

Web pages: `/register`, `/sign-in`, `/verify-email`, `/verify-email/resend`, `/forgot-password`, `/reset-password`, `/settings/account`.

## Secrets at rest

| Secret                        | Stored as                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| Password                      | Argon2id, 19 MiB memory, 2 iterations, 1 lane (OWASP minimum). Rehashed on login if parameters change. |
| Session token                 | SHA-256 hex digest. The raw 256-bit token exists only in the cookie.                                   |
| Verification and reset tokens | SHA-256 hex digest. The raw token exists only in the emailed link.                                     |

A fast hash is enough for tokens because they carry 256 bits of randomness; it still makes a database leak useless.

Emailed links put the token in the URL fragment (`/verify-email#token=...`). Browsers never send fragments to servers, so tokens stay out of access logs, proxies and `Referer` headers. The page reads the token, removes it from the address bar, and posts it to the API.

## Sessions

- Cookie: `__Host-ot_session` over HTTPS, `ot_session` on plain HTTP development. `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when `COOKIE_SECURE=true`. The API refuses to start in production without `COOKIE_SECURE=true`.
- Absolute lifetime `SESSION_TTL_DAYS` (30). Idle timeout `SESSION_IDLE_TIMEOUT_DAYS` (14). `last_seen_at` is refreshed at most every 5 minutes.
- Stored device information is a coarse label such as "Firefox on Linux". The full user agent and the IP address are not stored.
- Disabled accounts lose access immediately: their sessions stop authenticating.

## Account enumeration

Register, resend and reset-request return identical `202` responses for known and unknown addresses. Login uses one message ("Email or password is incorrect.") for unknown emails, wrong passwords and disabled accounts, and verifies against a dummy Argon2 hash when the email is unknown so response time is similar. Invalid, used and expired tokens share one error.

Known residual signal: for an existing address, register and reset do slightly more database work than for an unknown one. Email delivery is queued, so the gap is small. Closing it fully would need constant-time padding and is left for a later hardening pass.

## Rate limits

Fixed windows in Redis. Keys hash the IP or email, so Redis never holds them in clear text. Limits apply whether or not the account exists. Exceeding one returns `429` with `Retry-After`.

| Action                                | Per IP      | Per email          | Why                                                                                                                                                                                                                               |
| ------------------------------------- | ----------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Register                              | 10 / hour   | 5 / hour           | Sign-ups are rare; stops scripted account creation and inbox flooding.                                                                                                                                                            |
| Login                                 | 50 / 15 min | 10 failed / 15 min | IP limit allows shared networks (offices, campuses). The email limit counts failures only, so it caps password guessing on one account without letting an attacker lock out a user who knows their password once the window ends. |
| Resend verification                   | 10 / hour   | 3 / hour           | Each call sends email; protects recipients from being spammed through us.                                                                                                                                                         |
| Password reset request                | 10 / hour   | 3 / hour           | Same as above.                                                                                                                                                                                                                    |
| Token verification (verify and reset) | 20 / 15 min | n/a                | Tokens are unguessable; this bounds wasted work and noisy probing.                                                                                                                                                                |

If Redis is unreachable the auth endpoints return `503` rather than run without brute-force protection (fail closed).

## Unverified accounts

Unverified members can sign in and manage their sessions, but `capabilities` reports `false` for `publishContent`, `submitApplication`, `createOrganisation` and `initiateChatRequest`. Later runs must call `assertCanPerform(user, action)` from `apps/api/src/auth/account-policy.ts` in their services before acting.

## CSRF

`SameSite=Lax` cookies plus an Origin check: any `POST`, `PUT`, `PATCH` or `DELETE` that carries an `Origin` header not in `CORS_ORIGINS` is rejected with `403 forbidden_origin`.

## Email delivery

The API enqueues `{ template, to, data }` on the BullMQ `email` queue. The worker renders the template and sends it through the configured provider. Jobs retry 5 times with exponential backoff from 30 seconds; completed jobs are deleted immediately so links do not linger in Redis, and failed jobs are kept for 24 hours.

Providers live behind `EmailProvider` in `packages/email`. `EMAIL_PROVIDER=smtp` covers Mailpit in development and any SMTP relay in production (SES, Postmark, Mailgun, Postfix). To add an API-based provider, implement `EmailProvider` and add a case in `apps/worker/src/email-provider.ts`.

Logs never contain passwords, cookies, tokens, recipients or links: the API logs the template and job id, the worker logs template, job id, provider and attempt.

## CMS

The CMS answers `403 Access unavailable` for every route. Being signed in does not grant access. Run 2 replaces this with role and permission checks.

## Testing locally

```bash
docker compose up -d postgres redis mailpit
pnpm build && pnpm db:migrate
DATABASE_URL=... REDIS_URL=... MAILPIT_URL=http://localhost:8025 pnpm test:integration
DATABASE_URL=... REDIS_URL=... MAILPIT_URL=http://localhost:8025 pnpm test:e2e
```
