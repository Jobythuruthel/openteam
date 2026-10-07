import type { CookieOptions, Request, Response } from 'express';

export interface SessionCookieConfig {
  secure: boolean;
  maxAgeSeconds: number;
}

/**
 * The __Host- prefix makes browsers refuse the cookie unless it is Secure, has Path=/ and no
 * Domain, which blocks subdomains from planting or overwriting it. Plain HTTP development
 * cannot use the prefix, so it falls back to a plain name there.
 */
export function sessionCookieName(secure: boolean): string {
  return secure ? '__Host-ot_session' : 'ot_session';
}

function options(config: SessionCookieConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.secure,
    sameSite: 'lax',
    path: '/',
    maxAge: config.maxAgeSeconds * 1000,
  };
}

export function setSessionCookie(res: Response, token: string, config: SessionCookieConfig): void {
  res.cookie(sessionCookieName(config.secure), token, options(config));
}

export function clearSessionCookie(res: Response, config: SessionCookieConfig): void {
  const { maxAge: _maxAge, ...rest } = options(config);
  res.clearCookie(sessionCookieName(config.secure), rest);
}

/** Minimal cookie header parser; avoids a dependency for the one cookie the API reads. */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
