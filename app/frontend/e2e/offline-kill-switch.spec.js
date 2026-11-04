// The offline app shell's kill switch (lib/offline_shell.rb). Run after offline-launch.spec.js, with
// Rails restarted with OFFLINE_APP_SHELL=off: reopens the profile that spec left with the worker and
// its cache installed, loads the app online, and waits for the worker to remove itself.
//
//   OFFLINE_APP_SHELL=off bin/rails s -p 5077
//   cd app/frontend && E2E_BASE_URL=http://localhost:5077 npx playwright test --project=offline-kill-switch

const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { openProfile, profileDir, workerState } = require('./support/offline-shell');

test('switching the setting off removes the worker and its caches on the next online launch', async () => {
  expect(fs.existsSync(profileDir('classic')), 'run offline-launch.spec.js first; it leaves the worker installed').toBe(true);
  const context = await openProfile('classic');
  try {
    const page = context.pages()[0] || await context.newPage();
    await page.goto('/');
    expect(await page.evaluate(() => window.offline_shell_enabled), 'Rails must be running with OFFLINE_APP_SHELL=off').toBe(false);
    // The browser checks /sw.js on navigation, gets the removal worker, and that worker deletes the
    // caches and unregisters. The app's own check (utils/offline_shell.js) removes it too.
    await expect.poll(async () => workerState(page), { timeout: 60_000 }).toEqual({ registrations: [], caches: [] });
  } finally {
    await context.close();
  }
});
