import { lockedResponse } from './lib/access';

/** Runs before every CMS route. Every request is refused until permissions exist. */
export function proxy(): Response {
  return lockedResponse();
}

export const config = {
  // Static build assets are excluded; they hold no data.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
