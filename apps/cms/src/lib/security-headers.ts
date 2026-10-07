export interface SecurityHeaderOptions {
  apiOrigin: string;
  isProduction: boolean;
}

/**
 * Page level headers. Next.js injects inline bootstrap scripts, so script-src allows
 * 'unsafe-inline' until nonce based CSP lands with the first interactive feature.
 * 'unsafe-eval' is only allowed in development, where React Refresh needs it.
 */
export function buildSecurityHeaders({ apiOrigin, isProduction }: SecurityHeaderOptions) {
  const scriptSrc = ["'self'", "'unsafe-inline'", ...(isProduction ? [] : ["'unsafe-eval'"])];
  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${apiOrigin}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');

  return [
    { key: 'Content-Security-Policy', value: csp },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ];
}
