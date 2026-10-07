/**
 * The CMS stays closed until Run 2 adds roles and permissions. Being signed in is not enough:
 * there is no rule yet that says who may moderate, so nobody may.
 */
export const CMS_LOCKED_BODY = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Open Team CMS</title></head><body style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem"><main><h1>Access unavailable</h1><p>The Open Team CMS opens once roles and permissions are in place. Signing in does not grant access.</p></main></body></html>`;

export function lockedResponse(): Response {
  return new Response(CMS_LOCKED_BODY, {
    status: 403,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
