// In Basic, the Home button in speak mode takes the communicator to their home board and keeps them
// in speak mode. Reported 2026-11-09: "in the basic view, when you're in speak mode and press the
// home button, instead of going to your home board, it exits and goes to the site home page". The
// house button on a Basic board page ran "My Boards" (templates/application.hbs, the
// `on_board_or_alt` branch), which left speak mode for the boards page. LOCAL dev stack only.
//
// User: synthetic, from e2e/support/users-basic-speak.rb (a Basic communicator whose home board has
// a folder to a second board):
//   DB_USER=... bin/rails runner app/frontend/e2e/support/users-basic-speak.rb
// Run:
//   cd app/frontend && npx playwright test --project=basic-speak-home

const { test, expect } = require('@playwright/test');
const { assertLocalStack, signIn } = require('./support/local-session');

test.beforeAll(assertLocalStack);

const USER = 'e2e_basic_speak';
const HOME = `${USER}/speak-home`;
const FOLDER = `${USER}/more-words`;

function where(page) {
  return page.evaluate(() => {
    const a = window.LingoLinq.appState;
    return { speak: !!a.get('speak_mode'), board: a.get('currentBoardState.key') || null, route: a.get('current_route') };
  });
}

// Get to the home board in speak mode the way a person does. A communicator opening their home page
// is taken straight there; anyone else gets the Basic dashboard, so: the Home Board row, then the
// header's Speak Mode control ("speak as me" when it is a menu).
async function startSpeakMode(page) {
  await signIn(page, USER, 'users-basic-speak.rb');
  await page.goto(`/${USER}/home`);
  await expect(page.locator('body'), `${USER} should be saved in Basic`).toHaveClass(/ll-view-basic/);
  await expect.poll(async () => {
    const now = await where(page);
    if (now.speak && now.board === HOME) { return 'speaking'; }
    return (await page.locator('a.ch-row--board:visible').count()) ? 'dashboard' : 'loading';
  }, { timeout: 30_000 }).not.toBe('loading');
  if (!(await where(page)).speak) {
    await page.locator('a.ch-row--board:visible').first().click();
    await expect.poll(async () => (await where(page)).board, { timeout: 30_000 }).toBe(HOME);
    await page.locator('#speak_mode:visible').first().click();
    const asMe = page.locator('.dropdown-menu a:visible', { hasText: /speak as me/i });
    if (await asMe.count()) { await asMe.first().click(); }
  }
  await expect.poll(async () => where(page), { timeout: 30_000 }).toEqual(expect.objectContaining({ speak: true, board: HOME }));
}

async function pressHome(page) {
  await page.locator('#home_button:visible').first().click();
}

test.describe('Basic speak mode, Home', () => {
  test.describe.configure({ timeout: 120_000 });

  test('from a folder, Home goes back to the home board and stays in speak mode', async ({ page }) => {
    await startSpeakMode(page);
    await page.locator('.button:visible', { hasText: 'more words' }).first().click();
    await expect.poll(async () => (await where(page)).board, { timeout: 30_000 }).toBe(FOLDER);
    await pressHome(page);
    await expect.poll(async () => (await where(page)).board, { timeout: 30_000 }).toBe(HOME);
    expect((await where(page)).speak, 'still in speak mode').toBe(true);
  });

  test('on the home board, Home stays there in speak mode', async ({ page }) => {
    await startSpeakMode(page);
    await pressHome(page);
    // Give a wrong navigation time to happen before asserting nothing moved.
    await page.waitForTimeout(2_000);
    const now = await where(page);
    expect(now.board, 'still on the home board').toBe(HOME);
    expect(now.speak, 'still in speak mode').toBe(true);
  });
});
