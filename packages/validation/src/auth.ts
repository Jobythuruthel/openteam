import { z } from 'zod';

/** Limits shared by the API and the web forms. */
export const PASSWORD_MIN_LENGTH = 12;
// Argon2 cost grows with input length, so an upper bound stops very long passwords being used for DoS.
export const PASSWORD_MAX_LENGTH = 128;
export const EMAIL_MAX_LENGTH = 254;

/**
 * Normalises an email for storage and comparison: trims whitespace and lowercases it.
 * Lowercasing the local part is technically lossy under RFC 5321, but every mainstream provider
 * treats it as case-insensitive, and the database column is citext regardless.
 * Provider specific rewrites (dots or plus tags in Gmail) are deliberately not applied.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const emailSchema = z
  .string({ error: 'Enter your email address.' })
  .trim()
  .min(1, 'Enter your email address.')
  .max(EMAIL_MAX_LENGTH, 'Email address is too long.')
  .pipe(z.email({ error: 'Enter a valid email address.' }))
  .transform(normaliseEmail);

export const passwordSchema = z
  .string({ error: 'Enter a password.' })
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`)
  .refine((value) => value.trim().length > 0, 'Password cannot be only spaces.');

/** Login accepts any non-empty password up to the max so older passwords never get locked out by policy changes. */
export const loginPasswordSchema = z
  .string({ error: 'Enter your password.' })
  .min(1, 'Enter your password.')
  .max(PASSWORD_MAX_LENGTH, 'Email or password is incorrect.');

/** Opaque tokens are 32 random bytes encoded as unpadded base64url (43 characters). */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const tokenSchema = z
  .string({ error: 'This link is invalid.' })
  .regex(TOKEN_PATTERN, 'This link is invalid.');

export const sessionIdSchema = z.uuid({ error: 'Invalid session id.' });

export const registerSchema = z.object({ email: emailSchema, password: passwordSchema }).strict();
export const loginSchema = z.object({ email: emailSchema, password: loginPasswordSchema }).strict();
export const emailOnlySchema = z.object({ email: emailSchema }).strict();
export const verifyEmailSchema = z.object({ token: tokenSchema }).strict();
export const resetPasswordSchema = z
  .object({ token: tokenSchema, password: passwordSchema })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type EmailOnlyInput = z.infer<typeof emailOnlySchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Field errors keyed by top level field name, first message wins. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_');
    result[key] ??= issue.message;
  }
  return result;
}
