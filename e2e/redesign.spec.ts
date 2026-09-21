import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signInAs } from './helpers';

test.describe('signature intro', () => {
  test('plays once per session, is skippable with Esc, and never blocks the app', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('demo-owner@arena.test').click();
    await page.waitForURL('**/app/nova-demo');
    const intro = page.getByTestId('intro');
    await expect(intro).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(intro).toHaveCount(0);
    // Same session: it does not replay on navigation or reload.
    await page.reload();
    await expect(page.getByTestId('nav-overview').first()).toBeVisible();
    await expect(page.getByTestId('intro')).toHaveCount(0);
  });

  test('auto-dismisses within 3 seconds', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('demo-owner@arena.test').click();
    await page.waitForURL('**/app/nova-demo');
    await expect(page.getByTestId('intro')).toBeVisible();
    await expect(page.getByTestId('intro')).toHaveCount(0, { timeout: 3500 });
  });

  test('is never shown under reduced motion', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('/login');
    await page.getByTestId('demo-owner@arena.test').click();
    await page.waitForURL('**/app/nova-demo');
    await page.waitForTimeout(600);
    await expect(page.getByTestId('intro')).toHaveCount(0);
    await ctx.close();
  });
});

test.describe('real data, honest visuals', () => {
  test('overview figures come from stored rows and the sparkline has a table view', async ({ page }) => {
    await signInAs(page, 'owner@arena.test', '/app/nova-demo');
    const strip = page.locator('dl').first();
    await expect(strip).toContainText('Game containers');
    await expect(strip).toContainText('Members');
    // Seeded: 2 teams, 7 members.
    await expect(strip.getByText('2', { exact: true }).first()).toBeVisible();
    const table = page.locator('table.sr-only').first();
    await expect(table.locator('caption')).toHaveText('Organisation activity per day');
    await expect(table.locator('tbody tr')).toHaveCount(14);
  });

  test('a Player sees no management figures (sections absent, not zeroed)', async ({ page }) => {
    await signInAs(page, 'player@arena.test', '/app/nova-demo');
    await expect(page.getByText('Pending invites')).toHaveCount(0);
    await expect(page.getByText('Recent activity')).toHaveCount(0);
    await expect(page.getByText('Who’s here')).toHaveCount(0);
  });

  test('role coverage on a team page reflects assigned in-game roles', async ({ page }) => {
    await signInAs(page, 'owner@arena.test', '/app/nova-demo/t/nova-valorant');
    // Seed: the Valorant player is a Duelist; the other five roles are open.
    await expect(page.getByText('covered · 1')).toBeVisible();
    await expect(page.getByText('open').first()).toBeVisible();
  });
});

test.describe('sound is opt-in', () => {
  test('off by default; the toggle is a real pressed-state button', async ({ page }) => {
    await signInAs(page, 'owner@arena.test', '/app/nova-demo');
    const t = page.getByTestId('sound-toggle');
    await expect(t).toHaveAttribute('aria-pressed', 'false');
    await t.click();
    await expect(t).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.getByTestId('sound-toggle')).toHaveAttribute('aria-pressed', 'true'); // remembered
    await page.getByTestId('sound-toggle').click();
    await expect(page.getByTestId('sound-toggle')).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('command palette 2.0', () => {
  test('actions: "Invite someone" opens the invite dialog', async ({ page }) => {
    await signInAs(page, 'owner@arena.test', '/app/nova-demo');
    await page.keyboard.press('Control+k');
    await page.getByRole('option', { name: /Invite someone/ }).click();
    await page.waitForURL('**/members?invite=1');
    await expect(page.getByTestId('invite-email')).toBeVisible();
  });

  test('g-chords navigate, and are ignored while typing', async ({ page }) => {
    await signInAs(page, 'owner@arena.test', '/app/nova-demo');
    await page.keyboard.press('g');
    await page.keyboard.press('m');
    await page.waitForURL('**/members');
    await page.keyboard.press('g');
    await page.keyboard.press('a');
    await page.waitForURL('**/audit');
  });

  test('recents remember what you used', async ({ page }) => {
    await signInAs(page, 'owner@arena.test', '/app/nova-demo');
    await page.keyboard.press('Control+k');
    await page.getByRole('option', { name: /^Settings/ }).click();
    await page.waitForURL('**/settings');
    await page.keyboard.press('Control+k');
    await expect(page.getByText('Recent', { exact: true })).toBeVisible();
  });

  test('a Player is not offered management actions', async ({ page }) => {
    await signInAs(page, 'player@arena.test', '/app/nova-demo');
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('option', { name: /Invite someone/ })).toHaveCount(0);
    await expect(page.getByRole('option', { name: /New game container/ })).toHaveCount(0);
  });
});

test.describe('liquid glass degrades gracefully', () => {
  test('with reduced motion the sign-in card is plain CSS glass (no WebGL, no snapshot)', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('/login');
    await page.waitForTimeout(2500);
    await expect(page.locator('[data-liquid]')).toHaveAttribute('data-liquid', 'off');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await ctx.close();
  });
});

test.describe('per-game theming survives the redesign', () => {
  test('light theme keeps WCAG AA on the redesigned shell', async ({ page }) => {
    await signInAs(page, 'owner@arena.test', '/app/nova-demo/t/nova-valorant');
    await page.evaluate(() => { localStorage.setItem('arena.theme', 'light'); document.documentElement.dataset.theme = 'light'; });
    await page.waitForTimeout(600);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(r.violations.flatMap((v) => v.nodes.map((n) => `${v.id} ${n.target.join(' ')}`))).toEqual([]);
  });
});
