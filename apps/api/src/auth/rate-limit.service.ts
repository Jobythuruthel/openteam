import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppError, RateLimitedError } from '../common/app-errors';
import { RedisService } from '../infrastructure/redis.service';
import {
  RATE_LIMITS,
  RateLimitAction,
  rateLimitKey,
  RateLimitRule,
  RateLimitScope,
} from './rate-limit';

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(private readonly redis: RedisService) {}

  /** Counts an attempt and throws 429 once the fixed window is exhausted. */
  async consume(action: RateLimitAction, scope: RateLimitScope, identifier: string): Promise<void> {
    const rule = this.rule(action, scope);
    const key = rateLimitKey(action, scope, identifier);
    const { count, ttlMs } = await this.run(async () => {
      const result = await this.redis.client
        .multi()
        .incr(key)
        .pexpire(key, rule.windowSeconds * 1000, 'NX')
        .pttl(key)
        .exec();
      if (!result) throw new Error('Rate limit transaction aborted');
      return { count: Number(result[0]?.[1]), ttlMs: Number(result[2]?.[1]) };
    });
    if (count > rule.limit) {
      this.logger.warn({ action, scope }, 'Rate limit exceeded');
      throw new RateLimitedError(Math.max(1, Math.ceil(ttlMs / 1000)));
    }
  }

  /** Throws 429 if the window is already exhausted, without counting this request. */
  async check(action: RateLimitAction, scope: RateLimitScope, identifier: string): Promise<void> {
    const rule = this.rule(action, scope);
    const key = rateLimitKey(action, scope, identifier);
    const [count, ttlMs] = await this.run(async () => {
      const result = await this.redis.client.multi().get(key).pttl(key).exec();
      if (!result) throw new Error('Rate limit transaction aborted');
      return [Number(result[0]?.[1] ?? 0), Number(result[1]?.[1])] as const;
    });
    if (count >= rule.limit) {
      this.logger.warn({ action, scope }, 'Rate limit exceeded');
      throw new RateLimitedError(Math.max(1, Math.ceil(ttlMs / 1000)));
    }
  }

  /** Counts an attempt without rejecting it. Used to record failed logins after the fact. */
  async record(action: RateLimitAction, scope: RateLimitScope, identifier: string): Promise<void> {
    const rule = this.rule(action, scope);
    const key = rateLimitKey(action, scope, identifier);
    await this.run(() =>
      this.redis.client
        .multi()
        .incr(key)
        .pexpire(key, rule.windowSeconds * 1000, 'NX')
        .exec(),
    );
  }

  private rule(action: RateLimitAction, scope: RateLimitScope): RateLimitRule {
    const rules: { ip: RateLimitRule; identifier?: RateLimitRule } = RATE_LIMITS[action];
    const rule = rules[scope];
    if (!rule) throw new Error(`No ${scope} rate limit for ${action}`);
    return rule;
  }

  /**
   * Fails closed: if Redis is unreachable, auth endpoints return 503 rather than running
   * without brute-force protection.
   */
  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      if (this.redis.client.status === 'wait' || this.redis.client.status === 'end') {
        await this.redis.client.connect();
      }
      return await operation();
    } catch (error) {
      this.logger.error({ err: error }, 'Rate limiter unavailable');
      throw new AppError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'service_unavailable',
        'Service temporarily unavailable.',
      );
    }
  }
}
