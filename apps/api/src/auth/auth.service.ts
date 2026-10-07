import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { ApiEnv } from '@openteam/config';
import { Prisma, User } from '@openteam/database';
import type {
  EmailOnlyInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from '@openteam/validation';
import { AppError } from '../common/app-errors';
import { CLOCK, Clock } from '../common/clock';
import { API_ENV } from '../config/config.module';
import { PrismaService } from '../infrastructure/prisma.service';
import { capabilities } from './account-policy';
import { EmailDispatcher } from './email.dispatcher';
import { PasswordService } from './password.service';
import { RateLimitService } from './rate-limit.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

export interface RequestMeta {
  ip: string;
  deviceLabel: string;
  /** Raw token from an existing session cookie, if the browser sent one. */
  existingSessionToken?: string | undefined;
}

export interface PublicUser {
  id: string;
  email: string;
  emailVerified: boolean;
  status: 'pending_verification' | 'active' | 'disabled';
  createdAt: string;
}

export const GENERIC_LOGIN_ERROR = 'Email or password is incorrect.';

const STATUS_NAMES = {
  PENDING_VERIFICATION: 'pending_verification',
  ACTIVE: 'active',
  DISABLED: 'disabled',
} as const;

/** The only shape in which a user leaves the API. Hashes and secrets are never included. */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    status: STATUS_NAMES[user.status],
    createdAt: user.createdAt.toISOString(),
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
    private readonly rateLimits: RateLimitService,
    private readonly email: EmailDispatcher,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Always resolves the same way whether or not the email is taken. A new address gets a
   * verification link; an existing one gets a notice instead, so the owner learns about the attempt
   * and nobody else learns the address is registered.
   */
  async register(input: RegisterInput, meta: RequestMeta): Promise<void> {
    await this.rateLimits.consume('register', 'ip', meta.ip);
    await this.rateLimits.consume('register', 'identifier', input.email);

    // Hash first, unconditionally, so both paths cost the same.
    const passwordHash = await this.passwords.hash(input.password);
    try {
      const token = await this.prisma.client.$transaction(async (tx) => {
        const user = await tx.user.create({ data: { email: input.email, passwordHash } });
        return this.tokens.issue(tx, 'emailVerification', user.id, this.verificationTtlMs);
      });
      await this.email.dispatch({
        template: 'verify-email',
        to: input.email,
        data: {
          verifyUrl: this.link('/verify-email', token),
          expiresInHours: this.env.EMAIL_VERIFICATION_TTL_HOURS,
        },
      });
      this.logger.log('Account registered');
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'))
        throw error;
      await this.email.dispatch({
        template: 'account-exists',
        to: input.email,
        data: {
          signInUrl: `${this.env.APP_URL}/sign-in`,
          resetUrl: `${this.env.APP_URL}/forgot-password`,
        },
      });
      this.logger.log('Registration attempted for an existing account');
    }
  }

  async verifyEmail(input: VerifyEmailInput, meta: RequestMeta): Promise<void> {
    await this.rateLimits.consume('tokenVerification', 'ip', meta.ip);
    const now = this.clock();
    await this.prisma.client.$transaction(async (tx) => {
      const userId = await this.tokens.consume(tx, 'emailVerification', input.token);
      // A disabled account stays disabled; verification only records the address as confirmed.
      await tx.user.updateMany({
        where: { id: userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: now },
      });
      await tx.user.updateMany({
        where: { id: userId, status: 'PENDING_VERIFICATION' },
        data: { status: 'ACTIVE' },
      });
    });
    this.logger.log('Email verified');
  }

  async resendVerification(input: EmailOnlyInput, meta: RequestMeta): Promise<void> {
    await this.rateLimits.consume('resendVerification', 'ip', meta.ip);
    await this.rateLimits.consume('resendVerification', 'identifier', input.email);
    const user = await this.prisma.client.user.findUnique({ where: { email: input.email } });
    if (!user || user.emailVerifiedAt || user.status === 'DISABLED') return;
    const token = await this.prisma.client.$transaction((tx) =>
      this.tokens.issue(tx, 'emailVerification', user.id, this.verificationTtlMs),
    );
    await this.email.dispatch({
      template: 'verify-email',
      to: user.email,
      data: {
        verifyUrl: this.link('/verify-email', token),
        expiresInHours: this.env.EMAIL_VERIFICATION_TTL_HOURS,
      },
    });
  }

  /**
   * Signs in and always issues a brand new session. Any session token the browser already had is
   * revoked first, so a token planted before login can never become authenticated (fixation).
   */
  async login(input: LoginInput, meta: RequestMeta): Promise<{ user: PublicUser; token: string }> {
    await this.rateLimits.consume('login', 'ip', meta.ip);
    // Only failed attempts count against an account, so an attacker cannot lock a real user out
    // by hammering it with correct-looking traffic, while guessing still hits the ceiling.
    await this.rateLimits.check('login', 'identifier', input.email);

    const user = await this.prisma.client.user.findUnique({ where: { email: input.email } });
    const valid = user
      ? await this.passwords.verify(user.passwordHash, input.password)
      : await this.passwords.verifyAgainstDummy(input.password);

    if (!user || !valid || user.status === 'DISABLED') {
      await this.rateLimits.record('login', 'identifier', input.email);
      this.logger.warn('Failed login attempt');
      throw new AppError(HttpStatus.UNAUTHORIZED, 'invalid_credentials', GENERIC_LOGIN_ERROR);
    }

    if (this.passwords.needsRehash(user.passwordHash)) {
      const passwordHash = await this.passwords.hash(input.password);
      await this.prisma.client.user.update({ where: { id: user.id }, data: { passwordHash } });
    }
    if (meta.existingSessionToken) {
      await this.sessions.revokeByToken(meta.existingSessionToken, 'ROTATED');
    }
    const { token } = await this.sessions.create(user.id, meta.deviceLabel);
    this.logger.log({ userId: user.id }, 'Signed in');
    return { user: toPublicUser(user), token };
  }

  async logout(token: string): Promise<void> {
    await this.sessions.revokeByToken(token, 'LOGOUT');
  }

  async logoutAll(userId: string): Promise<void> {
    const count = await this.sessions.revokeAllForUser(userId, 'LOGOUT_ALL');
    this.logger.log({ userId, count }, 'Signed out of all sessions');
  }

  async requestPasswordReset(input: EmailOnlyInput, meta: RequestMeta): Promise<void> {
    await this.rateLimits.consume('passwordResetRequest', 'ip', meta.ip);
    await this.rateLimits.consume('passwordResetRequest', 'identifier', input.email);
    const user = await this.prisma.client.user.findUnique({ where: { email: input.email } });
    if (!user || user.status === 'DISABLED') return;
    const token = await this.prisma.client.$transaction((tx) =>
      this.tokens.issue(tx, 'passwordReset', user.id, this.env.PASSWORD_RESET_TTL_MINUTES * 60_000),
    );
    await this.email.dispatch({
      template: 'password-reset',
      to: user.email,
      data: {
        resetUrl: this.link('/reset-password', token),
        expiresInMinutes: this.env.PASSWORD_RESET_TTL_MINUTES,
      },
    });
  }

  /** Sets the new password and revokes every session in the same transaction. */
  async resetPassword(input: ResetPasswordInput, meta: RequestMeta): Promise<void> {
    await this.rateLimits.consume('tokenVerification', 'ip', meta.ip);
    const passwordHash = await this.passwords.hash(input.password);
    const now = this.clock();
    const userId = await this.prisma.client.$transaction(async (tx) => {
      const id = await this.tokens.consume(tx, 'passwordReset', input.token);
      await tx.user.update({ where: { id }, data: { passwordHash, passwordChangedAt: now } });
      // Receiving the reset email proves the address belongs to this person.
      await tx.user.updateMany({
        where: { id, emailVerifiedAt: null },
        data: { emailVerifiedAt: now },
      });
      await tx.user.updateMany({
        where: { id, status: 'PENDING_VERIFICATION' },
        data: { status: 'ACTIVE' },
      });
      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'PASSWORD_RESET' },
      });
      return id;
    });
    this.logger.log({ userId }, 'Password reset; all sessions revoked');
  }

  currentAccount(user: User) {
    return { user: toPublicUser(user), capabilities: capabilities(user) };
  }

  private get verificationTtlMs(): number {
    return this.env.EMAIL_VERIFICATION_TTL_HOURS * 3_600_000;
  }

  /**
   * Tokens travel in the URL fragment. Fragments are never sent to servers, so the token stays out
   * of access logs, proxies and Referer headers; the page reads it and posts it to the API.
   */
  private link(path: string, token: string): string {
    return `${this.env.APP_URL}${path}#token=${token}`;
  }
}
