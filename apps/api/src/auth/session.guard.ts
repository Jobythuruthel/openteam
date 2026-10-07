import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { ApiEnv } from '@openteam/config';
import type { Request } from 'express';
import { UnauthenticatedError } from '../common/app-errors';
import { API_ENV } from '../config/config.module';
import { readCookie, sessionCookieName } from './cookies';
import { AuthContext, SessionService } from './session.service';

export type AuthenticatedRequest = Request & { auth?: AuthContext; sessionToken?: string };

/** Requires a valid session cookie and attaches the user and session to the request. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readCookie(req, sessionCookieName(this.env.COOKIE_SECURE));
    if (!token) throw new UnauthenticatedError();
    const auth = await this.sessions.authenticate(token);
    if (!auth) throw new UnauthenticatedError();
    req.auth = auth;
    req.sessionToken = token;
    return true;
  }
}

export const CurrentAuth = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!req.auth) throw new UnauthenticatedError();
  return req.auth;
});
