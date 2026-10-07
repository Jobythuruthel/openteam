import { expect, type Page } from '@playwright/test';
import { createPrismaClient } from '@openteam/database';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
export const PASSWORD = 'a long enough passphrase';

let counter = 0;
export function uniqueEmail(label: string): string {
  counter += 1;
  return `${label}-${Date.now()}-${counter}@example.com`;
}

export const db = createPrismaClient({
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://openteam:openteam@localhost:5432/openteam',
});

/** Waits for the worker to deliver a message to Mailpit and returns the app link inside it. */
export async function linkFromEmail(
  to: string,
  path: '/verify-email' | '/reset-password',
): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const search = await fetch(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
        );
        const { messages } = (await search.json()) as {
          messages: { ID: string; Created: string }[];
        };
        for (const message of messages) {
          const full = await fetch(`${MAILPIT}/api/v1/message/${message.ID}`);
          const { Text } = (await full.json()) as { Text: string };
          const match = new RegExp(`http://localhost:3000${path}#token=[A-Za-z0-9_-]{43}`).exec(
            Text,
          );
          if (match) {
            link = match[0];
            return true;
          }
        }
        return false;
      },
      { timeout: 20_000, message: `email to ${to} containing ${path}` },
    )
    .toBe(true);
  return link as string;
}

export async function register(page: Page, email: string, password = PASSWORD) {
  await page.goto('/register');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
}

export async function verify(page: Page, email: string) {
  await page.goto(await linkFromEmail(email, '/verify-email'));
  await expect(
    page.getByRole('status').filter({ hasText: 'Your email address is confirmed.' }),
  ).toBeVisible();
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Account and sessions' })).toBeVisible();
  await expect(page.getByText('Where you are signed in')).toBeVisible();
}

/** Our feedback alert. Next.js renders its own empty role=alert route announcer, which is excluded. */
export function alertOf(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}
