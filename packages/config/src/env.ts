import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const port = z.coerce.number().int().min(1).max(65535);

const nodeEnv = z.enum(['development', 'test', 'production']).default('development');
const logLevel = z
  .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
  .default('info');

const postgresUrl = z
  .string()
  .url()
  .refine(
    (value) => /^postgres(ql)?:\/\//.test(value),
    'must be a postgres:// or postgresql:// URL',
  );

const redisUrl = z
  .string()
  .url()
  .refine((value) => /^rediss?:\/\//.test(value), 'must be a redis:// or rediss:// URL');

export const apiEnvSchema = z
  .object({
    NODE_ENV: nodeEnv,
    LOG_LEVEL: logLevel,
    API_HOST: z.string().min(1).default('0.0.0.0'),
    API_PORT: port.default(4000),
    APP_URL: z.string().url().default('http://localhost:3000'),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:3000,http://localhost:3001')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.string().url())),
    DATABASE_URL: postgresUrl,
    REDIS_URL: redisUrl,
    TRUST_PROXY: booleanString.default(false),
    // Auth. Cookies must be Secure in production; the refinement below enforces it.
    COOKIE_SECURE: booleanString.default(false),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    SESSION_IDLE_TIMEOUT_DAYS: z.coerce.number().int().min(1).max(90).default(14),
    EMAIL_VERIFICATION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(240).default(60),
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.COOKIE_SECURE, {
    path: ['COOKIE_SECURE'],
    message: 'must be true in production',
  })
  .refine((env) => env.SESSION_IDLE_TIMEOUT_DAYS <= env.SESSION_TTL_DAYS, {
    path: ['SESSION_IDLE_TIMEOUT_DAYS'],
    message: 'must not exceed SESSION_TTL_DAYS',
  });

export const workerEnvSchema = z.object({
  NODE_ENV: nodeEnv,
  LOG_LEVEL: logLevel,
  DATABASE_URL: postgresUrl,
  REDIS_URL: redisUrl,
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),
  // Email. SMTP covers Mailpit in development and any production relay.
  EMAIL_PROVIDER: z.enum(['smtp']).default('smtp'),
  EMAIL_FROM: z.string().min(3).default('Open Team <no-reply@openteam.me>'),
  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: port.default(1025),
  SMTP_SECURE: booleanString.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(
      `Invalid environment configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`,
    );
    this.name = 'EnvValidationError';
  }
}

type EnvSource = Record<string, string | undefined>;

function parseEnv<T extends z.ZodType>(schema: T, source: EnvSource): z.infer<T> {
  // Treat empty strings as missing so defaults apply and required values fail loudly.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ''),
  );
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    // Report the variable name and reason only. Values are never echoed, since they may be secrets.
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  return result.data;
}

export function loadApiEnv(source: EnvSource = process.env): ApiEnv {
  return parseEnv(apiEnvSchema, source);
}

export function loadWorkerEnv(source: EnvSource = process.env): WorkerEnv {
  return parseEnv(workerEnvSchema, source);
}
