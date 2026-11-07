// A board made in another language opens and speaks in that language, in Basic and in Modern,
// without Switch Languages. LOCAL dev stack only: these click real buttons.
//
// Users: synthetic, from e2e/support/users-language.rb:
//   DB_USER=... bin/rails runner app/frontend/e2e/support/users-language.rb
// Run:
//   cd app/frontend && npx playwright test --project=board-language
//
// The English lookup is answered here, so no words leave for Google. The device voices are
// faked so the spoken voice can be asserted: headless Chrome has none.

const { test, expect } = require('@playwright/test');
const { assertLocalStack, signIn } = require('./support/local-session');
const { ROUTE, seedLabels, sel } = require('./helpers');

test.beforeAll(assertLocalStack);

const VOICES = [
  { voiceURI: 'english', name: 'English Voice', lang: 'en-US', localService: true, default: true },
  { voiceURI: 'spanish', name: 'Spanish Voice', lang: 'es-ES', localService: true, default: false },
];

async function setUpDevice(page, voices) {
  await page.addInitScript((list) => {
    window.__spoken = [];
    const synth = window.speechSynthesis;
    synth.getVoices = () => list;
    synth.speak = (utterance) => {
      window.__spoken.push({ text: utterance.text.toLowerCase(), lang: utterance.lang });
      setTimeout(() => utterance.onend && utterance.onend({}), 0);
    };
  }, voices);
  const lookups = { count: 0 };
  await page.route('**/api/v1/users/self/translate', (route) => {
    lookups.count += 1;
    return route.fulfill({ json: { translations: { sombrero: 'hat', gato: 'cat', Sombreros: 'Hats' } } });
  });
  return lookups;
}

function language(page) {
  return page.evaluate(() => ({
    label: window.LingoLinq.appState.get('label_locale'),
    speak: window.LingoLinq.appState.get('vocalization_locale'),
  }));
}

async function pickLanguage(page, name) {
  await page.locator('button#locale').click();
  await page.getByRole('option', { name, exact: true }).click();
}

async function fillBasics(page, boardName) {
  await page.goto(ROUTE);
  await page.locator(sel.chooserOwn).click();
  await page.locator('#new_board_name').fill(boardName);
  await pickLanguage(page, 'Spanish');
  await expect(page.locator('[data-test-translation-notice]')).toBeVisible();
}

async function finishWizard(page) {
  const next = page.locator('.nb-wizard__next');
  while (await next.isVisible()) { await next.click(); }
}

async function save(page) {
  await page.getByRole('button', { name: 'Save Board' }).click();
  // A grid with empty cells asks first; the buttons differ by how empty it is.
  const confirm = page.locator('.md-modal-btn').filter({ hasText: /^\s*(Save blank board|Save board|Keep .* and save)\s*$/ }).first();
  await confirm.click({ timeout: 5000 }).catch(() => {});
  await page.waitForURL((url) => !/create-board-new/.test(url.pathname), { timeout: 30_000 });
  await page.waitForLoadState('networkidle');
}

async function serverBoard(page) {
  await page.waitForFunction(() => window.LingoLinq.appState.get('currentBoardState.key'));
  return page.evaluate(async () => {
    const key = window.LingoLinq.appState.get('currentBoardState.key');
    return (await window.persistence.ajax(`/api/v1/boards/${key}`, { type: 'GET' })).board;
  });
}

for (const user of ['e2e_basic_lang', 'e2e_modern_lang']) {
  test.describe(user, () => {
    let lookups;
    test.beforeEach(async ({ page }) => {
      lookups = await setUpDevice(page, VOICES);
      await signIn(page, user, 'users-language.rb');
    });

    test('a board with labels saves, opens and speaks in Spanish, and stays Spanish after Home', async ({ page }) => {
      await fillBasics(page, `Sombreros ${Date.now()}`);
      await finishWizard(page);
      await seedLabels(page, ['sombrero', 'gato']);
      await save(page);

      // The stub answered, so these words never reached the real translate endpoint.
      expect(lookups.count).toBeGreaterThan(0);
      const board = await serverBoard(page);
      expect(board.locale).toBe('es');
      expect(board.translated_locales).toEqual(expect.arrayContaining(['es', 'en']));
      expect(await language(page)).toEqual({ label: 'es', speak: 'es' });

      const url = page.url();
      await page.evaluate(() => window.LingoLinq.appState.jump_to_root_board());
      await page.waitForLoadState('networkidle');
      await page.goto(url);
      await page.waitForFunction(() => window.LingoLinq && window.LingoLinq.appState && window.LingoLinq.appState.get('vocalization_locale'));
      expect(await language(page)).toEqual({ label: 'es', speak: 'es' });
    });

    test('tapping a button speaks the Spanish word in a Spanish voice', async ({ page }) => {
      await fillBasics(page, `Hablar ${Date.now()}`);
      await finishWizard(page);
      await seedLabels(page, ['sombrero', 'gato']);
      await save(page);
      await serverBoard(page);
      // Modern opens ready to tap; Basic has to enter Speak Mode first.
      if (user === 'e2e_basic_lang') {
        await page.evaluate(() => window.LingoLinq.appState.toggle_speak_mode());
        await page.waitForFunction(() => window.LingoLinq.appState.get('speak_mode'));
      }
      const box = await page.getByText('sombrero', { exact: true }).filter({ visible: true }).last().boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { delay: 120 });
      await page.waitForFunction(() => window.__spoken.length > 0);
      expect(await page.evaluate(() => window.__spoken[window.__spoken.length - 1])).toEqual({ text: 'sombrero', lang: 'es-ES' });
    });

    test('a blank board stays Spanish', async ({ page }) => {
      await fillBasics(page, `Vacio ${Date.now()}`);
      await finishWizard(page);
      await save(page);
      const board = await serverBoard(page);
      expect(board.locale).toBe('es');
    });
  });
}

test('the picker says so when the device has no voice for the language', async ({ page }) => {
  await setUpDevice(page, [VOICES[0]]);
  await signIn(page, 'e2e_modern_lang', 'users-language.rb');
  await fillBasics(page, 'Sin voz');
  await expect(page.locator('[data-test-no-voice-notice]')).toBeVisible();
});

test('a board made for a Spanish communicator says so, with its notice, and saves in Spanish', async ({ page }) => {
  await setUpDevice(page, VOICES);
  await signIn(page, 'e2e_supporter_lang', 'users-language.rb');
  await page.goto(ROUTE);
  await page.locator(sel.chooserOwn).click();
  await page.locator('#new_board_name').fill(`Para Comm ${Date.now()}`);
  const forSomeoneElse = page.getByRole('switch', { name: /creating this board for someone else/i });
  const next = page.locator('.nb-wizard__next');
  while (!(await forSomeoneElse.isVisible())) { await next.click(); }
  await forSomeoneElse.click();
  await page.locator('button#new_board_for_user').click();
  await page.getByRole('option', { name: /e2e/i }).first().click();
  await expect(page.locator('[data-test-owner-language]')).toContainText('Spanish');
  await expect(page.locator('[data-test-translation-notice]')).toBeVisible();
  await finishWizard(page);
  await seedLabels(page, ['sombrero', 'gato']);
  await save(page);
  const board = await serverBoard(page);
  expect(board.locale).toBe('es');
  expect(board.key.split('/')[0]).toBe('e2e_comm_es');
});
