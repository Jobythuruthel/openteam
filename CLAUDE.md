# Working on Open Team

## Every session

At the start of every session in this repository, before any other work, invoke these skills:

- `superpowers:using-superpowers` (then follow its process skills: brainstorming before new features, test-driven-development, systematic-debugging, verification-before-completion)
- `karpathy-guidelines`
- `fable-mind`
- `llm-council` for decisions where being wrong is expensive (architecture, security models, data model changes). Not for routine questions.

Plugins the maintainer wants in every session: superpowers, i-have-adhd, octo. If one is not available in the session, say so instead of assuming it ran.

## Rules from the project brief

- Build one complete vertical feature at a time, on its own branch, with a pull request targeting `main`.
- Business rules and permission checks live in services, never in controllers or React components.
- Validate all untrusted input on the server. Every schema change ships as a Prisma migration.
- Add tests with every feature. Never claim a command passed unless it was run.
- No new dependencies without approval. No payments, paid verification or candidate scoring.
- Never expose private employer notes or viewer identities.
- Writing style for docs, comments, commits and PRs: plain and human, no em dashes.

## Checks before a pull request

`pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, then with PostgreSQL, Redis and Mailpit running: `pnpm db:migrate`, the Prisma drift check (see `.github/workflows/ci.yml`), `pnpm test:integration` and `pnpm test:e2e`.

See `docs/roadmap.md` for run status and `docs/auth.md` for authentication.
