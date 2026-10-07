# ADR 0003: Authentication dependencies

Status: accepted (approved by the maintainer before Run 1)

## Decision

| Package                 | Where            | Why                                                                                                                                                     |
| ----------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `argon2` 0.45           | API              | Argon2id is required by the brief and Node has no built-in implementation. Ships prebuilt binaries.                                                     |
| `nodemailer` 8          | `packages/email` | SMTP delivery for Mailpit and any production relay. Writing SMTP by hand is not worth the risk.                                                         |
| `@playwright/test` 1.56 | web (dev)        | Browser end-to-end tests. Playwright is in the original stack. 1.56 matches the Chromium build available in the project's cloud development containers. |

Deliberately not added: `@nestjs/swagger` (the OpenAPI document is generated from the Zod schemas with Zod's built-in JSON Schema export), `cookie-parser` (the API reads one cookie), any rate limiting library (fixed windows on Redis are a few lines), React Hook Form and TanStack Query (the auth forms are small; they can come in when a form or data view needs them).
