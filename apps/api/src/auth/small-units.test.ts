import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { assertCanPerform, capabilities } from './account-policy';
import { readCookie, sessionCookieName } from './cookies';
import { deviceLabel } from './device';

describe('deviceLabel', () => {
  it('reduces user agents to browser and OS', () => {
    expect(
      deviceLabel('Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0'),
    ).toBe('Firefox on Linux');
    expect(
      deviceLabel(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
      ),
    ).toBe('Chrome on macOS');
    expect(
      deviceLabel(
        'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/128.0 Safari/537.36 Edg/128.0',
      ),
    ).toBe('Edge on Windows');
    expect(deviceLabel(undefined)).toBe('Unknown device');
    expect(deviceLabel('curl/8.0')).toBe('Unknown device');
  });
});

describe('cookies', () => {
  it('uses the __Host- prefix only when secure', () => {
    expect(sessionCookieName(true)).toBe('__Host-ot_session');
    expect(sessionCookieName(false)).toBe('ot_session');
  });

  it('reads one cookie out of a header', () => {
    const req = { headers: { cookie: 'a=1; ot_session=abc%2Ddef; b=2' } } as Request;
    expect(readCookie(req, 'ot_session')).toBe('abc-def');
    expect(readCookie(req, 'missing')).toBeUndefined();
    expect(readCookie({ headers: {} } as Request, 'ot_session')).toBeUndefined();
    expect(
      readCookie({ headers: { cookie: 'ot_session=%E0%A4%A' } } as Request, 'ot_session'),
    ).toBeUndefined();
  });
});

describe('account policy', () => {
  const unverified = { status: 'PENDING_VERIFICATION' as const, emailVerifiedAt: null };
  const verified = { status: 'ACTIVE' as const, emailVerifiedAt: new Date() };
  const disabled = { status: 'DISABLED' as const, emailVerifiedAt: new Date() };

  it('blocks unverified and disabled members from restricted actions', () => {
    for (const subject of [unverified, disabled]) {
      expect(() => assertCanPerform(subject, 'publishContent')).toThrow(/Verify your email/);
      expect(Object.values(capabilities(subject)).every((v) => v === false)).toBe(true);
    }
  });

  it('allows verified members', () => {
    expect(() => assertCanPerform(verified, 'initiateChatRequest')).not.toThrow();
    expect(capabilities(verified)).toEqual({
      publishContent: true,
      submitApplication: true,
      createOrganisation: true,
      initiateChatRequest: true,
    });
  });
});
