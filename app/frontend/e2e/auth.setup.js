// Logs in once against the LOCAL dev stack and saves storage state for the other
// projects. Credentials default to the `rails db:seed` example user; override with
// E2E_USERNAME / E2E_PASSWORD. Never point this at production — the specs it
// enables click real buttons.

const { test: setup, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const STATE = path.join(__dirname, '.auth', 'user.json');
const USERNAME = process.env.E2E_USERNAME || 'example';
const PASSWORD = process.env.E2E_PASSWORD || 'password';

setup('authenticate', async ({ page }) => {
  fs.mkdirSync(path.dirname(STATE), { recursive: true });

  // `/` is the marketing landing page — its "Sign In" links to the `login` route
  // (router.js:66), so go straight there rather than clicking through chrome that
  // differs between the desktop navbar and the mobile drawer.
  await page.goto('/login');

  const username = page.locator('#identification');
  // `#identification` / `#password` are the login-form field ids
  // (components/login-form.hbs) — LowercaseTextField / PasswordField pass @id
  // straight through to the rendered input.
  await expect(
    username,
    'login form did not render — is the dev stack up (bin/fresh_start) at the configured E2E_BASE_URL?'
  ).toBeVisible();

  await username.fill(USERNAME);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('button.login-btn[type="submit"]').click();

  // Landing route varies (user home vs. setup prompts), so assert on the thing
  // that actually proves the session took: the login form is gone and the app
  // shell rendered.
  await expect(page.locator('#identification')).toBeHidden({ timeout: 20_000 });
  await expect(
    page.locator('.md-shell, #home_board, .app-navbar').first(),
    `logged in as "${USERNAME}" but no authenticated shell appeared — check the seeded user`
  ).toBeVisible({ timeout: 20_000 });

  await page.context().storageState({ path: STATE });
});
