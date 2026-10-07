# ADR 0001: Start as a modular monolith

Status: accepted

## Context

The product spans profiles, organisations, content, feeds, jobs, applications, messaging, notifications, media and moderation. The team is small and the project must be easy to self-host.

## Decision

Ship one NestJS API, one BullMQ worker, and two Next.js apps in a pnpm monorepo. Domain modules stay inside the API with clear module boundaries. PostgreSQL is the system of record, Redis backs queues and rate limits.

## Consequences

Self-hosting needs four app containers plus PostgreSQL, Redis and object storage. Module boundaries must be enforced by review, since nothing at runtime stops one module calling another's tables. Extracting a service later requires a new ADR.
