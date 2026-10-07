import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence in depth on top of SameSite=Lax cookies. Browsers attach an Origin header to every
 * cross-origin and same-origin state-changing fetch, so a request whose Origin is present but not
 * on the allowlist is rejected. Requests without Origin come from non-browser clients, which cannot
 * carry a victim's cookies.
 */
export function originCheck(allowedOrigins: readonly string[]) {
  const allowed = new Set(allowedOrigins);
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    if (SAFE_METHODS.has(req.method) || origin === undefined || allowed.has(origin)) {
      next();
      return;
    }
    res.status(403).json({
      error: {
        code: 'forbidden_origin',
        message: 'Request origin is not allowed.',
        requestId: (req as Request & { id?: string }).id,
      },
    });
  };
}
