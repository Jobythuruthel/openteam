import { HttpStatus } from '@nestjs/common';
import type { UserStatus } from '@openteam/database';
import { AppError } from '../common/app-errors';

/** Actions the product brief reserves for members with a verified email address. */
export const VERIFIED_ONLY_ACTIONS = [
  'publishContent',
  'submitApplication',
  'createOrganisation',
  'initiateChatRequest',
] as const;

export type VerifiedOnlyAction = (typeof VERIFIED_ONLY_ACTIONS)[number];

export interface PolicySubject {
  status: UserStatus;
  emailVerifiedAt: Date | null;
}

export function isVerifiedMember(user: PolicySubject): boolean {
  return user.status === 'ACTIVE' && user.emailVerifiedAt !== null;
}

export function capabilities(user: PolicySubject): Record<VerifiedOnlyAction, boolean> {
  const allowed = isVerifiedMember(user);
  return Object.fromEntries(VERIFIED_ONLY_ACTIONS.map((action) => [action, allowed])) as Record<
    VerifiedOnlyAction,
    boolean
  >;
}

/**
 * Services for publishing, applications, organisations and chat requests call this before acting.
 * It lives here so every later run enforces the same rule.
 */
export function assertCanPerform(user: PolicySubject, _action: VerifiedOnlyAction): void {
  if (!isVerifiedMember(user)) {
    throw new AppError(
      HttpStatus.FORBIDDEN,
      'email_verification_required',
      'Verify your email address to do this.',
    );
  }
}
