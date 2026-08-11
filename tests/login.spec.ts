import { test, expect } from '@playwright/test';
import { DEFAULT_PASSWORD, DEFAULT_USERNAME, loginAs } from './helpers/auth';

/**
 * Authenticated login against a local/dev server.
 *
 * Run (local):
 *   PLAYWRIGHT_BASE_URL=http://localhost:8184 npm run test:e2e -- tests/login.spec.ts
 *
 * Credentials default to the always-seeded content user (lingolinq / password).
 * Override with PLAYWRIGHT_USERNAME / PLAYWRIGHT_PASSWORD if needed.
 */
test.describe('login', () => {
  test('signs in with valid credentials and lands on the user home dashboard', async ({
    page,
  }) => {
    const { username } = await loginAs(page, {
      username: DEFAULT_USERNAME,
      password: DEFAULT_PASSWORD,
    });

    // Post-login SPA dispatch ends at /:user_name/home (routes/index -> user.home).
    await expect(page).toHaveURL(new RegExp(`/${username}/home/?$`));

    // Authenticated navbar exposes the identity menu (id from app-navbar templates).
    await expect(page.locator('#identity_button')).toBeVisible();

    // Login form should be gone.
    await expect(page.locator('#login_form')).toHaveCount(0);
  });
});
