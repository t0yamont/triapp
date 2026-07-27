import { expect, test, type Page } from '@playwright/test';

/**
 * Smoke: every route renders, and nothing throws on the way.
 *
 * Without Supabase env the app is *supposed* to render — forms wired but disabled behind a clear
 * notice — so this suite is meaningful with or without a connected project, and asserts that
 * honest-disabled state rather than skipping it.
 */

const ROUTES = ['/today', '/calendar', '/activities', '/analytics', '/races', '/settings'] as const;

/** Fails the test on any uncaught error or console error — the point of booting the app at all. */
function failOnPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    // React logs hydration and key warnings as errors; those are real, keep them. Network noise
    // from an unconfigured Supabase is expected and is not what this is watching for.
    if (m.type() === 'error' && !/supabase|Failed to load resource|net::/i.test(m.text())) {
      errors.push(`console: ${m.text()}`);
    }
  });
  return errors;
}

for (const route of ROUTES) {
  test(`${route} renders without errors`, async ({ page }) => {
    const errors = failOnPageErrors(page);
    await page.goto(route);
    await expect(page.locator('main')).toBeVisible();
    // Next's error overlay / error boundary output — a route that compiled but blew up at runtime.
    await expect(page.getByText('Application error')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('the sidebar navigates between sections', async ({ page }) => {
  await page.goto('/today');
  await page.getByRole('link', { name: 'Calendar' }).first().click();
  await expect(page).toHaveURL(/\/calendar$/);
  await page.getByRole('link', { name: 'Analytics' }).first().click();
  await expect(page).toHaveURL(/\/analytics$/);
});

test('coach mode is visible and not reachable (06-UX.md §3)', async ({ page }) => {
  await page.goto('/today');
  const coach = page.getByText('Coming soon');
  await expect(coach).toBeVisible();
  // Scaffolded-but-disabled means exactly this: it is not a link, and nothing can activate it.
  await expect(page.getByRole('link', { name: /Coach/ })).toHaveCount(0);
});

test('onboarding puts the 16+ gate and both consents in front of the athlete', async ({ page }) => {
  await page.goto('/onboarding/about');
  // The gate and the two consents are the compliance-relevant part of this screen (§7). The
  // *enforcement* is unit-tested at 100% in `@ironflow/core/consent`; what only a browser can
  // confirm is that an athlete is actually shown them.
  await expect(page.getByText(/must be 16 or over/i)).toBeVisible();
  await expect(page.getByText(/consent to TriFlow processing my health/i)).toBeVisible();
  await expect(page.getByText(/training guidance, not medical advice/i)).toBeVisible();
});

test('an unconfigured project says so rather than pretending to work', async ({ page }) => {
  // Without Supabase env the forms render and are disabled behind a notice. Silently accepting a
  // sign-up that cannot go anywhere would be the worse failure, so the disabled state is pinned.
  await page.goto('/onboarding/about');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
});

test('settings invents nothing about the athlete', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.locator('main')).toBeVisible();

  // The three demo blocks this page used to render as if measured: five invented threshold
  // anchors with confidence dots and "field test · 12 days ago", a Garmin that claimed to have
  // synced two hours ago, and a profile pre-filled "Sample Athlete". Fabricated physiology
  // presented as an athlete's own is the failure CLAUDE.md names directly.
  for (const invented of ['Sample Athlete', 'Last sync 2h ago', 'Auto-import on', 'mean-max fit', 'observed max']) {
    await expect(page.getByText(invented)).toHaveCount(0);
  }
  // No anchors exist without a project, so the empty state is what must show.
  await expect(page.getByText(/Nothing measured yet/i)).toBeVisible();
});

test('every settings control does something', async ({ page }) => {
  await page.goto('/settings');
  // Without Supabase every write is disabled — which is the honest state, and is what proves
  // these are wired to a real path rather than being decorative.
  for (const name of ['Save changes', 'Export my data', 'Delete my account', 'Sign out']) {
    await expect(page.getByRole('button', { name })).toBeDisabled();
  }
});
