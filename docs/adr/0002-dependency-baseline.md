# ADR 0002: Dependency baseline

Status: accepted

## Decision

Pinned exact versions (no ranges) so installs are reproducible:

| Area       | Choice                                    | Note                                                                                                    |
| ---------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Language   | TypeScript 5.9                            | TypeScript 7 (native compiler) is out; move once NestJS decorator metadata is confirmed to work with it |
| API        | NestJS 11                                 | NestJS 12 exists; upgrade is a follow-up                                                                |
| ORM        | Prisma 6.19                               | Prisma 7 changes client generation and connection config; upgrade is a follow-up                        |
| Web        | Next.js 16, React 19, Tailwind CSS 4      |                                                                                                         |
| Queues     | BullMQ 5, ioredis 5                       |                                                                                                         |
| Validation | Zod 4                                     |                                                                                                         |
| Logging    | pino 10                                   |                                                                                                         |
| Tests      | Vitest 3, Supertest, unplugin-swc         | SWC emits the decorator metadata Nest needs under Vitest                                                |
| Lint       | ESLint 9, typescript-eslint 8, Prettier 3 | ESLint 9 is in maintenance; ESLint 10 upgrade is a follow-up                                            |

Not in the original stack list but added: `tsx` (dev reload), `unplugin-swc` and `@swc/core` (test transform), `supertest` (HTTP tests).

## Consequences

Several majors trail the newest release. Each upgrade is a tracked task with its own PR and CI run, not a drive-by bump.
