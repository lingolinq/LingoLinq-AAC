// Shared by the specs that sign in as their own synthetic users (seeded by the scripts in
// this folder): the local-stack guard and the sign-in flow.

const { expect } = require('@playwright/test');

// Only ever a local stack: these specs click real buttons and change settings.
function assertLocalStack() {
  const base = process.env.E2E_BASE_URL || 'http://localhost:8184';
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(base)) {
    throw new Error(`refusing to run against ${base}: local stacks only`);
  }
}

// seedScript names the e2e/support script that creates userName, for the failure message.
async function signIn(page, userName, seedScript) {
  await page.goto('/login');
  await expect(page.locator('#identification')).toBeVisible({ timeout: 30_000 });
  await page.locator('#identification').fill(userName);
  await page.locator('#password').fill('password');
  await page.locator('button.login-btn[type="submit"]').click();
  await page.waitForURL(/login\/device|\/home|\/$/, { timeout: 30_000 });
  if (/login\/device/.test(page.url())) {
    await page.getByText('Trust this Device').click();
  }
  await expect(page.locator('#identification'),
    `could not sign in as ${userName}: run e2e/support/${seedScript} against this stack first`).toBeHidden({ timeout: 30_000 });
  // Signed in AND done redirecting, so a page.evaluate below is not cut off by a navigation.
  await page.waitForFunction(() => {
    const s = window.LingoLinq && window.LingoLinq.session;
    return !!(s && s.get && s.get('isAuthenticated') && window.persistence && window.persistence.ajax);
  }, null, { timeout: 30_000 });
  await page.waitForLoadState('networkidle');
}

module.exports = { assertLocalStack, signIn };
