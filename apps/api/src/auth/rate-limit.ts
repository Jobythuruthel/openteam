import { createHash } from 'node:crypto';

export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

/**
 * Selected limits. Each action has an IP rule (stops one source spraying many accounts) and,
 * where the request names an account, an identifier rule (stops many sources hammering one
 * account). Identifier rules apply whether or not the account exists, so hitting a limit says
 * nothing about registration. See docs/auth.md for the reasoning behind each number.
 */
export const RATE_LIMITS = {
  register: {
    ip: { limit: 10, windowSeconds: 3600 },
    identifier: { limit: 5, windowSeconds: 3600 },
  },
  login: { ip: { limit: 50, windowSeconds: 900 }, identifier: { limit: 10, windowSeconds: 900 } },
  resendVerification: {
    ip: { limit: 10, windowSeconds: 3600 },
    identifier: { limit: 3, windowSeconds: 3600 },
  },
  passwordResetRequest: {
    ip: { limit: 10, windowSeconds: 3600 },
    identifier: { limit: 3, windowSeconds: 3600 },
  },
  tokenVerification: { ip: { limit: 20, windowSeconds: 900 } },
} as const satisfies Record<string, { ip: RateLimitRule; identifier?: RateLimitRule }>;

export type RateLimitAction = keyof typeof RATE_LIMITS;
export type RateLimitScope = 'ip' | 'identifier';

/**
 * Redis key for a counter. Identifiers (IP addresses, emails) are hashed so Redis never holds
 * personal data in clear text, and keys have a fixed length whatever the input.
 */
export function rateLimitKey(
  action: RateLimitAction,
  scope: RateLimitScope,
  identifier: string,
): string {
  const digest = createHash('sha256')
    .update(identifier.trim().toLowerCase())
    .digest('hex')
    .slice(0, 32);
  return `rl:${action}:${scope}:${digest}`;
}
