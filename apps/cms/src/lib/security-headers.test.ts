import { describe, expect, it } from 'vitest';
import { buildSecurityHeaders } from './security-headers';

function csp(isProduction: boolean) {
  const headers = buildSecurityHeaders({ apiOrigin: 'https://api.openteam.me', isProduction });
  return headers.find((header) => header.key === 'Content-Security-Policy')?.value ?? '';
}

describe('buildSecurityHeaders', () => {
  it('blocks framing and plugins', () => {
    expect(csp(true)).toContain("frame-ancestors 'none'");
    expect(csp(true)).toContain("object-src 'none'");
  });

  it('allows the API origin for fetches', () => {
    expect(csp(true)).toContain("connect-src 'self' https://api.openteam.me");
  });

  it('only allows eval outside production', () => {
    expect(csp(true)).not.toContain('unsafe-eval');
    expect(csp(false)).toContain('unsafe-eval');
  });
});
