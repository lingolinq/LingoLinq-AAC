// The offline app shell's kill switch (lib/offline_shell.rb). Run after offline-launch.spec.js, with
// Rails restarted with OFFLINE_APP_SHELL=off: reopens the profiles that spec left with the worker and
// its cache installed, loads the app online, and waits for the worker and its caches to go. The second
// case keeps the app's own clean-up out of it, so only the removal worker can pass it.
//
//   OFFLINE_APP_SHELL=off bin/rails s -p 5077
//   cd app/frontend && E2E_BASE_URL=http://localhost:5077 npx playwright test --project=offline-kill-switch

const { test, expect } = require('@playwright/test');
const { openProfile, takeInstalledMark, workerState } = require('./support/offline-shell');

test('switching the setting off removes the worker and its caches on the next online launch', async () => {
  // What offline-launch.spec.js left installed in this profile (throws if it left nothing).
  const left = takeInstalledMark('classic');
  expect(left.caches.length).toBe(1);
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

// Added 2026-11-05 (review follow-up): the case above passes even if the removal worker
// (views/offline_shell/kill_switch.js.erb) is broken, because the app removes the worker and its caches
// too. Here the app never sees the page's setting (an init script keeps window.offline_shell_enabled
// unset for it, so utils/offline_shell.js does nothing), so only the removal worker can clear them.
test('the removal worker on its own removes itself and its caches', async () => {
  const left = takeInstalledMark('classic-es');
  expect(left.caches.length).toBe(1);
  const context = await openProfile('classic-es', { locale: 'es-ES' });
  try {
    await context.addInitScript(() => {
      Object.defineProperty(window, 'offline_shell_enabled', {
        configurable: true,
        get: () => undefined,
        set: (value) => { window.__e2e_page_offline_shell_setting = value; },
      });
    });
    const page = context.pages()[0] || await context.newPage();
    await page.goto('/');
    expect(await page.evaluate(() => window.__e2e_page_offline_shell_setting), 'Rails must be running with OFFLINE_APP_SHELL=off').toBe(false);
    expect(await page.evaluate(() => window.offline_shell_enabled), 'the app does not see the setting').toBeUndefined();
    await expect.poll(async () => workerState(page), { timeout: 60_000 }).toEqual({ registrations: [], caches: [] });
  } finally {
    await context.close();
  }
});
