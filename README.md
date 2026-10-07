# Open Team

Open Team ([openteam.me](https://openteam.me)) is a free, open-source community, portfolio and specialist jobs platform for AI creators, game developers, interactive developers, full-stack and mobile developers, technical artists, studios and employers.

Core community features stay free. There is no paid verification and no pay-to-win visibility. The whole system can be self-hosted.

> Status: early development. The repository foundation is in place. Product features land one vertical slice at a time, starting with authentication. See [docs/roadmap.md](docs/roadmap.md).

## Repository layout

| Path                         | What it is                                     |
| ---------------------------- | ---------------------------------------------- |
| `apps/api`                   | NestJS REST API, served under `/api/v1`        |
| `apps/worker`                | BullMQ background worker                       |
| `apps/web`                   | Next.js public site and member app             |
| `apps/cms`                   | Next.js moderation and administration app      |
| `packages/config`            | Environment validation shared by every service |
| `packages/database`          | Prisma schema, migrations and client factory   |
| `packages/typescript-config` | Strict shared `tsconfig` presets               |
| `packages/eslint-config`     | Shared ESLint flat config                      |
| `infrastructure/docker`      | Production Dockerfiles                         |
| `docs`                       | Architecture notes and decision records        |

More packages from the architecture plan (`ui`, `validation`, `types`, `permissions`, `analytics`, `testing`) get created when the first feature needs them, not before.

## Quick start (development)

Requirements: Node.js 22.12 or newer, pnpm 10 (`corepack enable`), Docker with Compose.

```bash
cp .env.example .env              # then set POSTGRES_PASSWORD and DATABASE_URL to match
docker compose up -d postgres redis
pnpm install
pnpm build                        # builds shared packages the apps import
pnpm db:migrate
pnpm dev                          # api :4000, web :3000, cms :3001, worker
```

Check the API: `curl http://localhost:4000/api/v1/health/ready`

## Common commands

| Command                 | Purpose                                                               |
| ----------------------- | --------------------------------------------------------------------- |
| `pnpm lint`             | ESLint across the monorepo, warnings fail                             |
| `pnpm format:check`     | Prettier check                                                        |
| `pnpm typecheck`        | Strict TypeScript in every workspace                                  |
| `pnpm test`             | Unit and HTTP tests, no external services needed                      |
| `pnpm test:integration` | Tests against real PostgreSQL and Redis (`DATABASE_URL`, `REDIS_URL`) |
| `pnpm db:migrate:dev`   | Create a new migration after editing `schema.prisma`                  |
| `pnpm db:migrate`       | Apply pending migrations                                              |

## Running the full stack in containers

```bash
docker compose --profile app up -d --build
```

This runs migrations once, then starts the API, worker, web and CMS on localhost. Full self-hosting and production guidance arrives with the release documentation.

## Licence

[AGPL-3.0-or-later](LICENSE). The licence choice follows the project brief and is still subject to legal review.
