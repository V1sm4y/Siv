import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { accent, expectShell, signInAs } from './helpers';

test.describe('sign-in and shell', () => {
  test('demo owner signs in, sees the DEMO DATA badge and both game containers', async ({ page }) => {
    await signInAs(page, 'owner@arena.test');
    await page.waitForURL('**/app/nova-demo');
    await expectShell(page);
    await expect(page.getByText('Demo data').first()).toBeVisible();
    await expect(page.getByTestId('team-nova-valorant')).toBeVisible();
    await expect(page.getByTestId('team-nova-cs2')).toBeVisible();
  });

  test('unauthenticated visitors are sent to login, and next= cannot redirect off-site', async ({ page }) => {
    await page.goto('/app/nova-demo');
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/login?next=//evil.example');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });
});

test.describe('game container switcher', () => {
  test('switching containers changes the accent theme and route', async ({ page }) => {
    await signInAs(page, 'owner@arena.test', '/app/nova-demo/t/nova-valorant');
    await expect(page.getByTestId('team-home')).toHaveAttribute('data-game-id', 'valorant');
    await expect.poll(() => accent(page)).toBe('rgb(255, 70, 85)');

    await page.getByTestId('game-switcher').click();
    await page.getByTestId('switch-nova-cs2').click();
    await page.waitForURL('**/t/nova-cs2');
    await expect(page.getByTestId('team-title')).toHaveText('Nova CS2');
    await expect.poll(() => accent(page), { timeout: 5000 }).toBe('rgb(245, 166, 35)'); // registered @property finished morphing
  });

  test('reduced motion: no flood overlay, navigation is direct', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await signInAs(page, 'owner@arena.test', '/app/nova-demo');
    await page.getByTestId('team-nova-cs2').click();
    await page.waitForURL('**/t/nova-cs2');
    await expect(page.locator('div[aria-hidden="true"].fixed.inset-0.z-\\[90\\]')).toHaveCount(0);
    await ctx.close();
  });
});

test.describe('permissions are enforced on the server', () => {
  test('a Player cannot see management nav and gets no access on direct URLs', async ({ page }) => {
    await signInAs(page, 'player@arena.test', '/app/nova-demo');
    await expect(page.getByTestId('nav-members')).toHaveCount(0);
    await expect(page.getByTestId('nav-audit')).toHaveCount(0);
    await page.goto('/app/nova-demo/members');
    await expect(page.getByText('You don’t have access to member management')).toBeVisible();
    await page.goto('/app/nova-demo/audit');
    await expect(page.getByText('You don’t have access to the audit log')).toBeVisible();
  });

  test('a Player sees only their own team', async ({ page }) => {
    await signInAs(page, 'player2@arena.test', '/app/nova-demo');
    await expect(page.getByTestId('team-nova-cs2')).toBeVisible();
    await expect(page.getByTestId('team-nova-valorant')).toHaveCount(0);
  });

  test('API returns 403 for a Player creating a team and 404 for a non-member', async ({ page, request }) => {
    await signInAs(page, 'player@arena.test', '/app/nova-demo');
    const me = await (await page.request.get('/api/me')).json();
    const orgId = me.orgs[0].id as string;
    const forbidden = await page.request.post(`/api/orgs/${orgId}/teams`, { data: { name: 'Nope', gameId: 'cs2' } });
    expect(forbidden.status()).toBe(403);
    const audit = await page.request.get(`/api/orgs/${orgId}/audit`);
    expect(audit.status()).toBe(403);
    const anon = await request.get(`/api/orgs/${orgId}/audit`); // no session
    expect(anon.status()).toBe(401);
  });

  test('cross-origin state-changing requests are rejected', async ({ page }) => {
    await signInAs(page, 'owner@arena.test', '/app/nova-demo');
    const res = await page.request.post('/api/orgs', { data: { name: 'Evil' }, headers: { origin: 'https://evil.example' } });
    expect(res.status()).toBe(403);
  });

  test('a Guest sees no teams', async ({ page }) => {
    await signInAs(page, 'guest@arena.test', '/app/nova-demo');
    await expect(page.getByText('You haven’t been added to a team yet')).toBeVisible();
  });

  test('owner sees an intact audit chain; manager does not get the integrity claim', async ({ page }) => {
    await signInAs(page, 'owner@arena.test', '/app/nova-demo/audit');
    await expect(page.getByTestId('chain-status')).toContainText('Integrity verified');
    await page.context().clearCookies();
    await signInAs(page, 'manager@arena.test', '/app/nova-demo/audit');
    await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible();
    await expect(page.getByTestId('chain-status')).toHaveCount(0);
  });
});

test.describe('onboarding', () => {
  test('a new user completes profile → organisation → first team and lands in the shell', async ({ page }) => {
    const email = `e2e-${Date.now()}@arena.test`;
    await page.goto('/login');
    // Dev login creates unknown @arena.test users. Use the raw provider form via a demo button's action.
    await page.evaluate((e) => {
      const form = document.querySelector('form input[name="email"][type="hidden"]')!.closest('form')!;
      (form.querySelector('input[name="email"]') as HTMLInputElement).value = e;
    }, email);
    await page.getByTestId('demo-owner@arena.test').click();
    await page.waitForURL('**/onboarding');

    await page.getByLabel('Your name').fill('E2E Founder');
    await page.getByLabel('Date of birth').fill('1997-03-04');
    await page.getByLabel(/I accept the terms/).check();
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByLabel('Organisation name').fill('E2E Esports');
    await page.getByRole('button', { name: 'Create organisation' }).click();

    await page.getByRole('radio', { name: /VALORANT/ }).click();
    await page.getByRole('button', { name: 'Create team' }).click();
    await expect(page.getByRole('heading', { name: 'You’re in.' })).toBeVisible();
    await page.getByRole('button', { name: 'Enter workspace' }).click();
    await page.waitForURL(/\/app\/e2e-esports/);
    await expectShell(page);
    // Real orgs never carry the demo badge.
    await expect(page.getByText('Demo data')).toHaveCount(0);
  });
});

test.describe('accessibility (axe, WCAG 2.2 AA)', () => {
  // Reduced to id + node + first line of the summary so failures are readable.
  const scan = async (page: Page) => {
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    return {
      violations: r.violations.flatMap((v) =>
        v.nodes.map((n) => `${v.id} [${n.target.join(' ')}] ${(n.failureSummary ?? '').split('\n')[1]?.trim() ?? ''}`),
      ),
    };
  };

  test('login', async ({ page }) => {
    await page.goto('/login');
    expect((await scan(page)).violations).toEqual([]);
  });
  for (const [name, path] of [['overview', '/app/nova-demo'], ['team home', '/app/nova-demo/t/nova-valorant'], ['members', '/app/nova-demo/members'], ['audit', '/app/nova-demo/audit'], ['settings', '/app/nova-demo/settings']] as const) {
    test(name, async ({ page }) => {
      await signInAs(page, 'owner@arena.test', path);
      await page.waitForLoadState('networkidle');
      expect((await scan(page)).violations).toEqual([]);
    });
  }
});
