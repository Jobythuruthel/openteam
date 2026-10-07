import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { ApiEnv } from '@openteam/config';
import {
  emailOnlySchema,
  EmailOnlyInput,
  loginSchema,
  LoginInput,
  registerSchema,
  RegisterInput,
  resetPasswordSchema,
  ResetPasswordInput,
  sessionIdSchema,
  verifyEmailSchema,
  VerifyEmailInput,
} from '@openteam/validation';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { API_ENV } from '../config/config.module';
import { AuthService, RequestMeta } from './auth.service';
import { clearSessionCookie, readCookie, sessionCookieName, setSessionCookie } from './cookies';
import { deviceLabel } from './device';
import { AuthContext, SessionService } from './session.service';
import { CurrentAuth, SessionGuard } from './session.guard';

/** One response body for every request that must not reveal whether an account exists. */
const ACCEPTED = {
  message: 'If the address can receive email from us, a message is on its way.',
};

/**
 * HTTP adapter only: parses input, reads and writes cookies, and delegates every decision to
 * AuthService and SessionService.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() req: Request,
  ) {
    await this.auth.register(body, this.meta(req));
    return ACCEPTED;
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailSchema)) body: VerifyEmailInput,
    @Req() req: Request,
  ) {
    await this.auth.verifyEmail(body, this.meta(req));
    return { verified: true };
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  async resendVerification(
    @Body(new ZodValidationPipe(emailOnlySchema)) body: EmailOnlyInput,
    @Req() req: Request,
  ) {
    await this.auth.resendVerification(body, this.meta(req));
    return ACCEPTED;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, token } = await this.auth.login(body, this.meta(req));
    setSessionCookie(res, token, this.cookieConfig);
    return { user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // Idempotent: signing out without a valid session still clears the cookie.
    const token = this.sessionToken(req);
    if (token) await this.auth.logout(token);
    clearSessionCookie(res, this.cookieConfig);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  async logoutAll(@CurrentAuth() auth: AuthContext, @Res({ passthrough: true }) res: Response) {
    await this.auth.logoutAll(auth.user.id);
    clearSessionCookie(res, this.cookieConfig);
  }

  @Post('request-password-reset')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestPasswordReset(
    @Body(new ZodValidationPipe(emailOnlySchema)) body: EmailOnlyInput,
    @Req() req: Request,
  ) {
    await this.auth.requestPasswordReset(body, this.meta(req));
    return ACCEPTED;
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.resetPassword(body, this.meta(req));
    // Every session was revoked, including any in this browser.
    clearSessionCookie(res, this.cookieConfig);
    return { reset: true };
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentAuth() auth: AuthContext) {
    return this.auth.currentAccount(auth.user);
  }

  @Get('sessions')
  @UseGuards(SessionGuard)
  async listSessions(@CurrentAuth() auth: AuthContext) {
    const sessions = await this.sessions.listActive(auth.user.id);
    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        deviceLabel: session.deviceLabel,
        createdAt: session.createdAt.toISOString(),
        lastSeenAt: session.lastSeenAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        current: session.id === auth.session.id,
      })),
    };
  }

  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  async revokeSession(
    @Param('sessionId', new ZodValidationPipe(sessionIdSchema)) sessionId: string,
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Another user's session id gets the same 404 as a missing one.
    const revoked = await this.sessions.revokeForUser(auth.user.id, sessionId, 'USER_REVOKED');
    if (!revoked) throw new NotFoundException('Session not found.');
    if (sessionId === auth.session.id) clearSessionCookie(res, this.cookieConfig);
  }

  private get cookieConfig() {
    return { secure: this.env.COOKIE_SECURE, maxAgeSeconds: this.sessions.maxAgeSeconds };
  }

  private sessionToken(req: Request): string | undefined {
    return readCookie(req, sessionCookieName(this.env.COOKIE_SECURE));
  }

  private meta(req: Request): RequestMeta {
    return {
      ip: req.ip ?? req.socket.remoteAddress ?? 'unknown',
      deviceLabel: deviceLabel(req.headers['user-agent']),
      existingSessionToken: this.sessionToken(req),
    };
  }
}
