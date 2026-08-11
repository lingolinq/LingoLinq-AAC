import { expect, type Page } from '@playwright/test';

/**
 * Dev seed credentials (see db/seeds.rb / lib/beta_seed.rb):
 * - lingolinq / password          (always seeded content user)
 * - lingolinq_admin / admin2025!  (always seeded admin)
 * - example / password            (only when SEED_DEMO_DATA=1)
 *
 * Override with PLAYWRIGHT_USERNAME / PLAYWRIGHT_PASSWORD.
 */
export const DEFAULT_USERNAME = process.env.PLAYWRIGHT_USERNAME || 'lingolinq';
export const DEFAULT_PASSWORD = process.env.PLAYWRIGHT_PASSWORD || 'password';

/** Public system board from beta seed: Yes/No with two symbol buttons. */
export const DEFAULT_BOARD_PATH =
  process.env.PLAYWRIGHT_BOARD_PATH || 'lingolinq/yesno';

/**
 * Log in via the Ember login form at /login.
 * Handles the optional "Trust this Device" follow-up, then waits for /:user/home.
 */
export async function loginAs(
  page: Page,
  opts: { username?: string; password?: string } = {}
): Promise<{ username: string }> {
  const username = opts.username ?? DEFAULT_USERNAME;
  const password = opts.password ?? DEFAULT_PASSWORD;

  await page.goto('/login');

  const identification = page.locator('#identification');
  const passwordField = page.locator('#password');
  await expect(identification).toBeVisible();
  await expect(passwordField).toBeVisible();

  await identification.fill(username);
  await passwordField.fill(password);

  // Submit stays disabled until the browser/client token is ready ("Initializing...").
  const signIn = page.locator('#login_form').getByRole('button', { name: /sign in/i });
  await expect(signIn).toBeEnabled({ timeout: 30_000 });
  await signIn.click();

  // Fresh browser contexts usually hit the device-trust step after auth succeeds.
  const trustDevice = page.getByRole('button', { name: /trust this device/i });
  const isHome = (url: URL) => /\/[^/]+\/home\/?$/.test(url.pathname);

  await Promise.race([
    trustDevice.waitFor({ state: 'visible', timeout: 60_000 }),
    page.waitForURL(isHome, { timeout: 60_000 }),
  ]);

  if (await trustDevice.isVisible().catch(() => false)) {
    await trustDevice.click();
  }

  await page.waitForURL(isHome, { timeout: 60_000 });

  return { username };
}
