import { expect, type Page } from '@playwright/test';

export async function signInAs(page: Page, email: string, next = '/') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByTestId(`demo-${email}`).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

/** Computed accent on the element that carries data-game (or :root when there is none). */
export const accent = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.querySelector('[data-game]') ?? document.documentElement).getPropertyValue('--accent').trim());

export async function expectShell(page: Page) {
  await expect(page.getByRole('navigation', { name: 'Primary' }).first()).toBeVisible();
}
