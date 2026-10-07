# Architecture

Open Team is a modular monolith. One API process holds every domain module, one worker process runs background jobs, and two Next.js apps serve the public site and the CMS. Splitting anything into a separate service needs an approved decision record first.

## Runtime components

```
browser ──> web (Next.js :3000) ──┐
browser ──> cms (Next.js :3001) ──┼──> api (NestJS :4000, /api/v1) ──> PostgreSQL
                                  │                                └──> Redis <── worker (BullMQ)
                                  └── static assets                               └──> PostgreSQL
```

## Rules every module follows

- Business rules live in services, never in controllers or React components.
- Permission checks run in services, so every entry point (HTTP, WebSocket, jobs) gets them.
- All untrusted input is validated on the server.
- Every schema change ships as a Prisma migration. Applied migrations are never edited.
- Errors use one envelope: `{ "error": { "code", "message", "requestId" } }`. Server errors never leak internals.
- Every request carries an `x-request-id`. A safe caller supplied value is kept, otherwise one is generated, and it is echoed back and logged.

## Configuration

`packages/config` validates environment variables with Zod at startup. A bad or missing value stops the process with a list of variable names and reasons. Values are never printed, because they may be secrets.

## Health checks

| Route                      | Meaning                                                              |
| -------------------------- | -------------------------------------------------------------------- |
| `GET /api/v1/health/live`  | The process is up. Never touches dependencies.                       |
| `GET /api/v1/health/ready` | PostgreSQL and Redis answer within 2 seconds. Returns 503 otherwise. |

The worker records a heartbeat in the `system_info` table every 60 seconds through a BullMQ job scheduler, which proves the full queue path (Redis, worker, database) works.

## Logging

Structured JSON logs through pino. Authorisation headers, cookies, and any `password` or `token` field are redacted. Successful health probes are not logged.
