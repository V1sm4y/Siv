import { expect, type Page } from '@playwright/test';

/** The signature intro plays once per session; every test except the intro test skips it. */
export async function skipIntro(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem('arena.intro', 'seen'));
}

export async function signInAs(page: Page, email: string, next = '/') {
  await skipIntro(page);
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
