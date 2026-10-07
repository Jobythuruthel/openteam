import { describe, expect, it } from 'vitest';
import { escapeHtml, renderEmail } from './templates';

describe('email templates', () => {
  it('renders the verification email with the link in both parts', () => {
    const url = 'https://openteam.me/verify-email#token=abc';
    const email = renderEmail({
      template: 'verify-email',
      to: 'a@b.co',
      data: { verifyUrl: url, expiresInHours: 24 },
    });
    expect(email.subject).toContain('Confirm');
    expect(email.text).toContain(url);
    expect(email.html).toContain('href="https://openteam.me/verify-email#token=abc"');
    expect(email.text).toContain('24 hours');
  });

  it('renders the password reset email', () => {
    const email = renderEmail({
      template: 'password-reset',
      to: 'a@b.co',
      data: { resetUrl: 'https://openteam.me/reset-password#token=x', expiresInMinutes: 60 },
    });
    expect(email.text).toContain('60 minutes');
    expect(email.text).toContain('signs you out everywhere');
  });

  it('renders the account exists notice without any token', () => {
    const email = renderEmail({
      template: 'account-exists',
      to: 'a@b.co',
      data: {
        signInUrl: 'https://openteam.me/sign-in',
        resetUrl: 'https://openteam.me/forgot-password',
      },
    });
    expect(email.text).toContain('already exists');
    expect(email.html).not.toContain('token=');
  });

  it('escapes HTML in interpolated values', () => {
    expect(escapeHtml('<script>"x"&\'y\'</script>')).toBe(
      '&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;',
    );
    const email = renderEmail({
      template: 'verify-email',
      to: 'a@b.co',
      data: { verifyUrl: 'https://x.io/"><script>', expiresInHours: 1 },
    });
    expect(email.html).not.toContain('<script>');
  });
});
