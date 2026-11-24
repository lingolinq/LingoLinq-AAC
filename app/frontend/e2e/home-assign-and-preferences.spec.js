// Browser checks for the #1141 review follow-ups, against a LOCAL dev stack only (they click real
// buttons and change the signed-in user's settings).
//
// Users: synthetic, created by e2e/support/users-1141.rb, so the seeded `example` user's
// preferences are never touched:
//   DB_USER=... bin/rails runner app/frontend/e2e/support/users-1141.rb
// Run:
//   cd app/frontend && npx playwright test --project=1141-followups
//
//   1. Basic home, Assign Home Board: a double tap on a board sets ONE home board.
//   2. Speak Mode "Predict": the choice is saved, survives a reload, and a device holding an old
//      copy of the account does not switch AI back on when it saves it.

const { test, expect } = require('@playwright/test');
const { assertLocalStack, signIn: signInAs } = require('./support/local-session');

test.beforeAll(assertLocalStack);

const BASIC = 'e2e_basic_1141';
const MODERN = 'e2e_modern_1141';

function signIn(page, userName) {
  return signInAs(page, userName, 'users-1141.rb');
}

// The signed-in user as the server has it now (the app's own ajax layer adds the token).
async function serverUser(page) {
  return page.evaluate(async () => {
    const res = await window.persistence.ajax('/api/v1/users/self', { type: 'GET' });
    return res.user;
  });
}

// Every PUT to the user record, with its JSON body, while `fn` runs.
async function userPuts(page, fn) {
  const puts = [];
  const listener = (req) => {
    if (req.method() === 'PUT' && /\/api\/v1\/users\//.test(req.url())) {
      let body = null;
      try { body = req.postDataJSON(); } catch (e) { body = req.postData(); }
      puts.push(body);
    }
  };
  page.on('request', listener);
  try {
    await fn();
  } finally {
    page.off('request', listener);
  }
  return puts;
}

test.describe('Basic home: Assign Home Board', () => {
  test('a double tap on a board sets one home board and opens one dialog', async ({ page }) => {
    await signIn(page, BASIC);
    await page.getByText('Boards', { exact: true }).first().click();
    await page.getByText('Mine', { exact: true }).first().click();
    const tile = page.locator('.ch-boards__cell', { hasText: 'E2E Home One' });
    await expect(tile).toBeVisible({ timeout: 30_000 });

    const assign = page.locator('.ch-boards__set-home');
    await assign.click();
    await expect(assign).toHaveAttribute('aria-pressed', 'true');

    const homeUrl = page.url();
    const puts = await userPuts(page, async () => {
      await tile.locator('a, button, [role="button"]').first().dblclick();
      // The owned board is set, then the dialog offers to open it.
      await expect(page.getByRole('dialog')).toHaveCount(1, { timeout: 30_000 });
      await page.waitForTimeout(1500);
    });

    expect(page.url(), 'the second tap did not open the board').toBe(homeUrl);
    await expect(page.getByRole('dialog'), 'one dialog, not two').toHaveCount(1);
    await expect(assign).toHaveAttribute('aria-pressed', 'false');
    const homeSaves = puts.filter((b) => b && b.user && b.user.preferences && b.user.preferences.home_board);
    expect(homeSaves.length, 'the home board was saved once').toBe(1);
    const user = await serverUser(page);
    expect(user.preferences.home_board.key).toBe(`${BASIC}/e2e-home-one`);
  });
});

test.describe('Speak Mode: Predict', () => {
  test('the choice is saved alone, survives a reload, and a stale copy cannot turn AI back on', async ({ page, browser }) => {
    await signIn(page, MODERN);
    await page.goto(`/${MODERN}/e2e-modern-home`);
    const yes = page.locator('.md-board-detail-inline-sidebar__predict-opt').first();
    const no = page.locator('.md-board-detail-inline-sidebar__predict-opt').nth(1);
    await expect(yes).toBeVisible({ timeout: 30_000 });
    // Start from "off" whatever an earlier run left.
    if ((await no.getAttribute('aria-pressed')) !== 'true') {
      await no.click();
      await expect(no).toHaveAttribute('aria-pressed', 'true');
    }

    // Another device (a parent, say) turns AI off. This page keeps its old copy, where AI is on.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signIn(otherPage, MODERN);
    await otherPage.evaluate(async () => {
      await window.persistence.ajax('/api/v1/users/self', { type: 'PUT', data: { user: {
        preferences: { ai_features_enabled: false, ai_word_prediction: false }, preference_keys: ['ai_features_enabled', 'ai_word_prediction']
      } } });
    });
    await other.close();

    const puts = await userPuts(page, async () => {
      await yes.click();
      await expect(yes).toHaveAttribute('aria-pressed', 'true');
      await page.waitForTimeout(2000);
    });
    expect(puts.length, 'one save').toBe(1);
    expect.soft(puts[0].user.preference_keys, 'naming only the key it changed').toEqual(['word_suggestions']);

    const user = await serverUser(page);
    expect(user.preferences.word_suggestions).toBe(true);
    expect(user.preferences.ai_features_enabled, 'AI stays off').toBe(false);

    await page.reload();
    await expect(page.locator('.md-board-detail-inline-sidebar__predict-opt').first()).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
  });
});
