import { expect, test } from '@playwright/test';
import {
  alertOf,
  db,
  linkFromEmail,
  PASSWORD,
  register,
  signIn,
  uniqueEmail,
  verify,
} from './helpers';

test.afterAll(async () => {
  await db.$disconnect();
});

test('register, verify by email, sign in and sign out @responsive', async ({ page }) => {
  const email = uniqueEmail('journey');
  await register(page, email);
  await verify(page, email);
  // The token is removed from the address bar once read.
  expect(page.url()).not.toContain('token=');

  await signIn(page, email);
  await expect(page.getByText('Confirmed')).toBeVisible();
  await expect(page.getByText('This device')).toBeVisible();

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.goto('/settings/account');
  await expect(page.getByText('You are signed out.')).toBeVisible();
});

test('registration form works with the keyboard only and reports validation errors', async ({
  page,
}) => {
  await page.goto('/register');
  await page.keyboard.press('Tab'); // skip link
  await page.keyboard.press('Tab'); // "Sign in" link
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Email address')).toBeFocused();
  await page.keyboard.type('not-an-email');
  await page.keyboard.press('Tab');
  await page.keyboard.type('short');
  await page.keyboard.press('Enter');

  await expect(alertOf(page)).toContainText('Some fields need attention.');
  await expect(page.getByLabel('Email address')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  await expect(page.getByText('Use at least 12 characters.')).toBeVisible();
  // Focus moves to the first invalid field.
  await expect(page.getByLabel('Email address')).toBeFocused();
});

test('sign-in errors are generic for unknown accounts and wrong passwords', async ({ page }) => {
  const email = uniqueEmail('generic');
  await register(page, email);
  await verify(page, email);

  for (const [address, password] of [
    [email, 'definitely the wrong password'],
    [uniqueEmail('nobody'), PASSWORD],
  ] as const) {
    await page.goto('/sign-in');
    await page.getByLabel('Email address').fill(address);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(alertOf(page)).toHaveText('Email or password is incorrect.');
  }
});

test('unverified members can sign in but restricted actions stay locked', async ({ page }) => {
  const email = uniqueEmail('pending');
  await register(page, email);
  await signIn(page, email);
  await expect(page.getByText('Not confirmed')).toBeVisible();
  await expect(page.getByText(/Until then those features stay locked/)).toBeVisible();

  const me = await page.request.get('http://localhost:4000/api/v1/auth/me');
  const body = await me.json();
  expect(body.capabilities).toEqual({
    publishContent: false,
    submitApplication: false,
    createOrganisation: false,
    initiateChatRequest: false,
  });

  await page.getByRole('button', { name: 'Resend confirmation email' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'A new confirmation link is on its way.' }),
  ).toBeVisible();
});

test('forgotten password: reset by email signs out every device and the link works once', async ({
  browser,
}) => {
  const email = uniqueEmail('reset');
  const laptop = await browser.newPage();
  await register(laptop, email);
  await verify(laptop, email);
  await signIn(laptop, email);

  const phone = await browser.newPage();
  await phone.goto('/forgot-password');
  await phone.getByLabel('Email address').fill(email);
  await phone.getByRole('button', { name: 'Send reset link' }).click();
  await expect(phone.getByRole('status')).toContainText('a reset link is on its way');

  const link = await linkFromEmail(email, '/reset-password');
  await phone.goto(link);
  await phone.getByLabel('New password').fill('a brand new long passphrase');
  await phone.getByRole('button', { name: 'Change password' }).click();
  await expect(phone.getByRole('status')).toContainText('signed out on every device');

  // The laptop's session was revoked by the reset.
  await laptop.reload();
  await expect(laptop.getByText('You are signed out.')).toBeVisible();

  // Old password fails, new one works.
  await laptop.goto('/sign-in');
  await laptop.getByLabel('Email address').fill(email);
  await laptop.getByLabel('Password').fill(PASSWORD);
  await laptop.getByRole('button', { name: 'Sign in' }).click();
  await expect(alertOf(laptop)).toHaveText('Email or password is incorrect.');
  await signIn(laptop, email, 'a brand new long passphrase');

  // Reusing the link fails.
  await phone.goto(link);
  await phone.getByLabel('New password').fill('yet another long passphrase');
  await phone.getByRole('button', { name: 'Change password' }).click();
  await expect(alertOf(phone)).toContainText('invalid, expired or already used');
});

test('revoking another session from account settings signs that device out', async ({
  browser,
}) => {
  const email = uniqueEmail('sessions');
  const first = await (await browser.newContext()).newPage();
  await register(first, email);
  await verify(first, email);
  await signIn(first, email);

  const second = await (await browser.newContext()).newPage();
  await signIn(second, email);
  const otherRow = second.getByRole('listitem').filter({ hasNotText: 'This device' });
  await expect(second.getByRole('listitem')).toHaveCount(2);
  await otherRow.getByRole('button', { name: /^Sign out/ }).click();
  await expect(second.getByRole('status')).toContainText('Signed out');
  await expect(second.getByRole('listitem')).toHaveCount(1);

  await first.reload();
  await expect(first.getByText('You are signed out.')).toBeVisible();
});

test('invalid verification and reset links show a clear error', async ({ page }) => {
  await page.goto('/verify-email#token=garbage');
  await expect(alertOf(page)).toContainText('incomplete');

  await page.goto(`/verify-email#token=${'A'.repeat(43)}`);
  await expect(alertOf(page)).toContainText('expired or was already used');

  await page.goto('/reset-password');
  await expect(alertOf(page)).toContainText('invalid, expired or already used');
});

test('expired verification links are rejected', async ({ page }) => {
  const email = uniqueEmail('expired');
  await register(page, email);
  const link = await linkFromEmail(email, '/verify-email');
  await db.emailVerificationToken.updateMany({
    where: { user: { email } },
    data: {
      expiresAt: new Date(Date.now() - 1000),
      createdAt: new Date(Date.now() - 2 * 86_400_000),
    },
  });
  await page.goto(link);
  await expect(alertOf(page)).toContainText('expired or was already used');
});
