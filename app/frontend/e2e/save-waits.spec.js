// Board Save while a picture or recording is still uploading (PR #1354): Save shows the waiting
// dialog and saves by itself once the upload lands; "Back to editing" keeps the upload; a failed
// upload cancels the save; "Save without it" appears after 15 seconds and saves without it.
// LOCAL dev stack only.
//
// Users: synthetic, from e2e/support/users-save-waits.rb (a Modern and a Basic user, each with a
// "Save Waits" board of four empty buttons). Run the seed before every run of this file:
//   DB_USER=... bin/rails runner app/frontend/e2e/support/users-save-waits.rb
// Run:
//   cd app/frontend && npx playwright test --project=save-waits
//
// Uploads: the image and sound records are created by the real local Rails, but the two calls that
// reach S3 are answered here, because a local stack has no S3 credentials: the browser's POST of
// the file to the bucket (held until the test opens its gate, or failed on purpose) and Rails'
// upload_success check (answered "confirmed"). Everything the change is about, the waiting, the
// dialog and the board save, runs for real, and the saved board is read back from the server.

const { test, expect } = require('@playwright/test');
const { assertLocalStack, signIn } = require('./support/local-session');

test.beforeAll(assertLocalStack);

// A 1x1 PNG and a few samples of WAV. Made up.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const WAV = Buffer.from('UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA', 'base64');
const CONFIRMED_IMAGE_URL = 'http://localhost:8184/images/square.svg';


// The bucket POST is held until gate.open() (or failed with gate.fail()); upload_success says yes.
async function controlUploads(page) {
  const gate = {};
  gate.ready = new Promise((resolve, reject) => { gate.open = resolve; gate.fail = () => reject(new Error('fail')); });
  gate.ready.catch(() => {});
  gate.posts = 0;
  await page.route(/amazonaws\.com/, async (route) => {
    if (route.request().method() !== 'POST') { return route.continue(); }
    gate.posts++;
    try {
      await gate.ready;
      await route.fulfill({ status: 204, body: '' });
    } catch (e) {
      await route.abort('failed');
    }
  });
  await page.route(/\/upload_success/, (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ confirmed: true, url: CONFIRMED_IMAGE_URL }),
  }));
  return gate;
}

// The board as the server has it.
function savedButton(page, boardKey, id) {
  return page.evaluate(async ({ key, id }) => {
    const res = await window.persistence.ajax(`/api/v1/boards/${key}`, { type: 'GET' });
    const btn = (res.board.buttons || []).find((b) => String(b.id) === String(id)) || {};
    return { image_id: btn.image_id || null, sound_id: btn.sound_id || null };
  }, { key: boardKey, id });
}

// The two board pages, each with its own way into edit mode, into a button's settings and to Save.
const VIEWS = [
  {
    name: 'Modern',
    user: 'e2e_save_waits_modern',
    async openEdit(page) {
      await page.goto(`/${this.user}/board-detail/save-waits/edit`);
      await expect(page.locator('.md-board-edit-session'), 'the board did not open in edit mode').toBeVisible({ timeout: 60_000 });
      await expect(page.locator(this.button(1))).toBeVisible({ timeout: 90_000 });
    },
    button: (id) => `.md-board-detail-symbol-card[data-id="${id}"]`,
    // Button settings opens when the card is clicked anywhere but its label field.
    settingsClick: { x: 12, y: 12 },
    // The header Save asks "Save and Exit" first (components/confirm-leave-edit); its Save button
    // starts the save, the real path a person takes.
    async save(page) {
      await page.locator('.md-board-edit-session button', { hasText: /^\s*Save\s*$/ }).first().click();
      const confirm = page.locator('.modal', { hasText: /save your changes/i });
      await expect(confirm).toBeVisible({ timeout: 10_000 });
      await confirm.getByRole('button', { name: 'Save', exact: true }).click();
    },
    editing: (page) => page.locator('.md-board-edit-session'),
    // Picked in button settings, which then close while the upload is still running.
    pictureHow: 'settings',
  },
  {
    name: 'Basic',
    user: 'e2e_save_waits_basic',
    async openEdit(page) {
      await page.goto(`/${this.user}/board/save-waits`);
      // This board is the user's home board, so a fresh sign-in opens it in speak mode; leave it
      // the way a person does (identity menu, Exit Speak Mode), then Edit Board.
      const editBoard = page.locator('a:visible', { hasText: 'Edit Board' });
      await expect.poll(async () => (await editBoard.count()) || (await page.evaluate(() => !!window.LingoLinq.appState.get('speak_mode'))),
        { timeout: 60_000 }).toBeTruthy();
      if (!(await editBoard.count())) {
        await page.locator('#identity_button').click();
        await page.locator('.dropdown-menu a', { hasText: 'Exit Speak Mode' }).click();
      }
      await editBoard.first().click();
      await expect(this.editing(page)).toBeVisible({ timeout: 60_000 });
      await expect(page.locator(this.button(1))).toBeVisible({ timeout: 90_000 });
    },
    button: (id) => `.button[data-id="${id}"]`,
    // Below the label field that runs across the top of each button.
    settingsClick: { x: 40, y: 200 },
    async save(page) {
      await page.locator('button.btn-primary', { hasText: /^\s*Save\s*$/ }).first().click();
    },
    editing: (page) => page.locator('button.btn-primary', { hasText: /^\s*Save\s*$/ }),
    // In Basic, button settings do not close until a picked picture has saved (button-settings.js
    // close waits on contentGrabbers.save_pending), so a picture still uploading at Save comes
    // from a drop onto the button.
    pictureHow: 'drop',
  },
];

const sel = {
  waiting: '[data-test-save-waiting-message]',
  back: '[data-test-save-waiting-back]',
  without: '[data-test-save-waiting-without]',
};

async function openSettings(page, view, id) {
  await page.locator(view.button(id)).click({ position: view.settingsClick });
  await expect(page.locator('#image_upload')).toBeAttached({ timeout: 20_000 });
}

async function settingsTab(page, name) {
  await page.locator('[role="dialog"] a', { hasText: new RegExp(`^\\s*${name}\\s*$`) }).first().click();
}

async function closeSettings(page) {
  // The dialog's own header close button (button-settings.hbs, .la-modal-close), not another "Close"
  // elsewhere on the page (Basic's header has a sidebar close button).
  await page.locator('.modal.in button.la-modal-close, .modal.in button[aria-label="Close"]').first().click();
  await expect(page.locator('#image_upload')).toHaveCount(0, { timeout: 20_000 });
}

async function pickPicture(page) {
  await settingsTab(page, 'Picture');
  await page.locator('#image_upload').setInputFiles({ name: 'test-picture.png', mimeType: 'image/png', buffer: PNG });
  await page.getByRole('button', { name: 'Use This', exact: true }).click();
}

async function pickSound(page) {
  await settingsTab(page, 'Sound');
  await page.locator('#sound_upload').setInputFiles({ name: 'test-sound.wav', mimeType: 'audio/wav', buffer: WAV });
  await page.getByRole('button', { name: 'Use This', exact: true }).last().click();
}

// Drops a picture file onto the button, as a drag from the desktop does: the document's drop
// listener (services/content-grabbers.js) uploads it and applies it with no settings dialog.
async function dropPicture(page, view, id) {
  await page.locator(view.button(id)).evaluate((el, b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([bytes], 'test-picture.png', { type: 'image/png' }));
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  }, PNG.toString('base64'));
}

// Starts an upload that is held at the bucket, then presses Save: the moment the change is about.
async function saveWhileUploading(page, view, gate, id, kind) {
  await view.openEdit(page);
  if (kind === 'picture' && view.pictureHow === 'drop') {
    await dropPicture(page, view, id);
    await expect.poll(() => gate.posts, { timeout: 30_000 }).toBeGreaterThan(0);
  } else {
    await openSettings(page, view, id);
    await (kind === 'sound' ? pickSound : pickPicture)(page);
    await expect.poll(() => gate.posts, { timeout: 30_000 }).toBeGreaterThan(0);
    await closeSettings(page);
  }
  await view.save(page);
  await expect(page.locator(sel.waiting), 'the waiting dialog shows').toBeVisible();
}

for (const view of VIEWS) {
  test.describe(`${view.name}: Save waits for uploads`, () => {
    test.describe.configure({ timeout: 180_000 });
    const BOARD = `${view.user}/save-waits`;

    test.beforeEach(async ({ page }) => {
      await signIn(page, view.user, 'users-save-waits.rb');
    });

    test('Save during a first picture upload waits, then saves with the picture', async ({ page }) => {
      const gate = await controlUploads(page);
      await saveWhileUploading(page, view, gate, 1, 'picture');
      await expect(page.locator(sel.without), 'not before 15 seconds').toHaveCount(0);
      expect((await savedButton(page, BOARD, 1)).image_id, 'nothing saved yet').toBeNull();

      gate.open();
      await expect(page.locator(sel.waiting), 'the dialog closes by itself').toHaveCount(0, { timeout: 30_000 });
      await expect.poll(async () => (await savedButton(page, BOARD, 1)).image_id, { timeout: 30_000 }).not.toBeNull();
    });

    test('Back to editing keeps the upload, and the next Save includes it', async ({ page }) => {
      const gate = await controlUploads(page);
      await saveWhileUploading(page, view, gate, 2, 'picture');
      await page.locator(sel.back).click();
      await expect(page.locator(sel.waiting)).toHaveCount(0);
      await expect(view.editing(page), 'still editing').toBeVisible();

      gate.open();
      // The upload lands on the button by itself, and landing does not save by itself.
      await page.waitForTimeout(3000);
      expect((await savedButton(page, BOARD, 2)).image_id, 'landing did not save by itself').toBeNull();
      await view.save(page);
      await expect.poll(async () => (await savedButton(page, BOARD, 2)).image_id, { timeout: 30_000 }).not.toBeNull();
    });

    test('a failed upload cancels the save and says so', async ({ page }) => {
      const gate = await controlUploads(page);
      const dialogs = [];
      page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
      await saveWhileUploading(page, view, gate, 3, 'picture');

      gate.fail();
      await expect(page.locator(sel.waiting)).toHaveCount(0, { timeout: 60_000 });
      await expect(page.getByText('A picture or recording did not upload, so the board was not saved.')).toBeVisible({ timeout: 20_000 });
      await expect(view.editing(page), 'still editing').toBeVisible();
      // A failed pick in settings also shows the browser's upload-failed alert. A failed drop's own
      // "Upload failed" error shares the one error slot (utils/modal.js flash) with the message
      // above, which replaces it and says the same thing.
      if (view.pictureHow !== 'drop') {
        expect(dialogs.some((m) => /upload failed/i.test(m)), 'the upload-failed alert showed').toBe(true);
      }
      expect((await savedButton(page, BOARD, 3)).image_id).toBeNull();
    });

    test('after 15 seconds, Save without it saves without the picture, and it never lands', async ({ page }) => {
      const gate = await controlUploads(page);
      await saveWhileUploading(page, view, gate, 4, 'picture');
      await expect(page.locator(sel.without)).toBeVisible({ timeout: 25_000 });

      await page.locator(sel.without).click();
      await expect(page.locator(sel.waiting)).toHaveCount(0);
      gate.open();
      // Saved without it, and the late upload does not reach the saved board.
      await page.waitForTimeout(3000);
      expect((await savedButton(page, BOARD, 4)).image_id).toBeNull();
    });

    test('Save during a recording upload waits, then saves with the sound', async ({ page }) => {
      const gate = await controlUploads(page);
      if (view.pictureHow === 'drop') {
        // Basic: button settings stay open until the recording has saved (close waits on
        // contentGrabbers.save_pending), so Save cannot be pressed while it uploads. Check that,
        // and that the recording is then saved with the board.
        await view.openEdit(page);
        await openSettings(page, view, 1);
        await pickSound(page);
        await expect.poll(() => gate.posts, { timeout: 30_000 }).toBeGreaterThan(0);
        await page.locator('.modal.in button.la-modal-close, .modal.in button[aria-label="Close"]').first().click();
        await page.waitForTimeout(2000);
        await expect(page.locator('#sound_upload'), 'settings wait for the recording').toBeAttached();
        gate.open();
        await expect(page.locator('#sound_upload')).toHaveCount(0, { timeout: 30_000 });
        await view.save(page);
        await expect.poll(async () => (await savedButton(page, BOARD, 1)).sound_id, { timeout: 30_000 }).not.toBeNull();
        return;
      }
      await saveWhileUploading(page, view, gate, 1, 'sound');
      gate.open();
      await expect(page.locator(sel.waiting)).toHaveCount(0, { timeout: 30_000 });
      await expect.poll(async () => (await savedButton(page, BOARD, 1)).sound_id, { timeout: 30_000 }).not.toBeNull();
    });
  });
}
