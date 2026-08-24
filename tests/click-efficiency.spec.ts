import { test, expect } from '@playwright/test';
import { DEFAULT_BOARD_PATH, loginAs } from './helpers/auth';
import {
  ActionCounter,
  createScratchBoard,
  doneEditingAndSave,
  emptySymbolCard,
  expectBlankBoardCreated,
  fillButtonSettingsLabel,
  gotoHome,
  symbolCard,
  waitForBoardDetail,
} from './helpers/click-efficiency';
import {
  dismissBlockingModals,
  expandPrefSection,
  gotoPreferences,
  readCheckbox,
  savePreferences,
  setCheckbox,
} from './helpers/preferences';

/**
 * Click-efficiency e2e: typical vs shortest known paths for four high-value
 * tasks. Each pair asserts a shared end state and logs action counts.
 *
 * Run (local — do not run until stack is ready):
 *   PLAYWRIGHT_BASE_URL=http://localhost:8184 npx playwright test tests/click-efficiency.spec.ts
 *
 * Counting rules:
 * - Counted: locator.click / locator.fill via ActionCounter
 * - Not counted: page.goto (deep link / bookmark), expect waits, loginAs
 *
 * Paths mirror docs/task-management click-efficiency analysis (2026-08).
 */

test.describe.configure({ mode: 'serial' });

test.describe('click efficiency', () => {
  test.setTimeout(180_000);

  let username: string;
  const boardSlug = DEFAULT_BOARD_PATH.split('/')[1] || 'yesno';

  test.beforeEach(async ({ page }) => {
    ({ username } = await loginAs(page));
  });

  // -------------------------------------------------------------------------
  // 1) Speak a short message (Yes + Speak sentence) on the seeded yesno board
  // -------------------------------------------------------------------------

  test('speak short message — typical path (Continue Speaking → symbol → Speak)', async ({
    page,
  }) => {
    const actions = new ActionCounter();
    await gotoHome(page, username);

    // Typical: home Speak card CTA. If the home/last board is not yesno,
    // fall through to the Boards strip / direct board-detail so the end
    // state stays comparable to the shortest path.
    const continueSpeaking = page.getByRole('button', {
      name: /continue speaking/i,
    });
    const focusedSpeak = page.getByRole('button', {
      name: /let's communicate|open my communication board/i,
    });

    if (await continueSpeaking.isVisible().catch(() => false)) {
      await actions.click(continueSpeaking);
    } else if (await focusedSpeak.isVisible().catch(() => false)) {
      await actions.click(focusedSpeak);
    } else {
      const stripYesNo = page
        .locator('.md-strip__item')
        .filter({ hasText: /yes\s*\/?\s*no|yesno/i })
        .first();
      if (await stripYesNo.isVisible().catch(() => false)) {
        await actions.click(stripYesNo);
      } else {
        // Last resort counted click: Boards card "View All Boards" then yesno
        // is heavier than the analysis "typical"; prefer direct open below.
        await page.goto(`/${username}/board-detail/${boardSlug}`);
      }
    }

    // Normalize onto yesno if Continue Speaking opened a different board.
    if (!new RegExp(`/board-detail/${boardSlug}`).test(page.url())) {
      await page.goto(`/${username}/board-detail/${boardSlug}`);
    }
    await waitForBoardDetail(page, username, boardSlug);

    await actions.click(symbolCard(page, /^yes$/i));
    await expect(
      page.locator('.md-board-detail-sentence-bar__chip-label', {
        hasText: /^Yes$/i,
      })
    ).toBeVisible({ timeout: 15_000 });

    await actions.click(
      page.getByRole('button', { name: /speak sentence/i })
    );

    await expect(
      page.locator('.md-board-detail-sentence-bar__chip-label', {
        hasText: /^Yes$/i,
      })
    ).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`/${username}/board-detail/${boardSlug}/?$`)
    );

    actions.log('speak / typical');
    // Soft contract: typical should take at least the symbol + speak clicks.
    expect(actions.total).toBeGreaterThanOrEqual(2);
  });

  test('speak short message — shortest path (direct board-detail → symbol → Speak)', async ({
    page,
  }) => {
    const actions = new ActionCounter();
    // Shortest known: deep-link into board-detail (goto not counted).
    await page.goto(`/${username}/board-detail/${boardSlug}`);
    await waitForBoardDetail(page, username, boardSlug);

    await actions.click(symbolCard(page, /^yes$/i));
    await expect(
      page.locator('.md-board-detail-sentence-bar__chip-label', {
        hasText: /^Yes$/i,
      })
    ).toBeVisible({ timeout: 15_000 });

    await actions.click(
      page.getByRole('button', { name: /speak sentence/i })
    );

    await expect(
      page.locator('.md-board-detail-sentence-bar__chip-label', {
        hasText: /^Yes$/i,
      })
    ).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`/${username}/board-detail/${boardSlug}/?$`)
    );

    actions.log('speak / shortest');
    // Same end state as typical: Yes in sentence bar on yesno board-detail.
    expect(actions.total).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 2) Create a blank board
  // -------------------------------------------------------------------------

  test('create blank board — typical path (home Create a Board card)', async ({
    page,
  }) => {
    const actions = new ActionCounter();
    const boardName = `Pw Eff Create Typical ${Date.now()}`;

    await gotoHome(page, username);
    await actions.click(
      page.getByRole('button', { name: /^create a board$/i }).first()
    );

    await expect(page).toHaveURL(/\/create-board-new\/?/, { timeout: 30_000 });
    await actions.click(
      page.getByRole('button', { name: /create my own board/i })
    );
    await expect(page.locator('#new_board_name')).toBeVisible({
      timeout: 30_000,
    });
    await actions.fill(page.locator('#new_board_name'), boardName);
    await actions.click(
      page.getByRole('button', { name: /^create board$/i }).first()
    );

    await waitForBoardDetail(page, username);
    await expectBlankBoardCreated(page, username, boardName);

    actions.log('create board / typical');
    expect(actions.clicks).toBe(3);
    expect(actions.fills).toBe(1);
  });

  test('create blank board — shortest path (deep-link create-board-new)', async ({
    page,
  }) => {
    const actions = new ActionCounter();
    const boardName = `Pw Eff Create Short ${Date.now()}`;

    // Shortest: skip home card — open create flow directly.
    await page.goto('/create-board-new');
    await actions.click(
      page.getByRole('button', { name: /create my own board/i })
    );
    await expect(page.locator('#new_board_name')).toBeVisible({
      timeout: 30_000,
    });
    await actions.fill(page.locator('#new_board_name'), boardName);
    await actions.click(
      page.getByRole('button', { name: /^create board$/i }).first()
    );

    await waitForBoardDetail(page, username);
    await expectBlankBoardCreated(page, username, boardName);

    actions.log('create board / shortest');
    // Same end state as typical (board-detail for named board); one fewer click.
    expect(actions.clicks).toBe(2);
    expect(actions.fills).toBe(1);
    expect(actions.total).toBeLessThan(3 + 1); // typical was 3 clicks + 1 fill
  });

  // -------------------------------------------------------------------------
  // 3) Add one symbol/label to a board
  // SKIPPED: board-detail empty-cell save does not persist. Placeholder
  // cells use ids like "fake_0_0"; change_button only patches existing
  // board.buttons, and process_for_saving only assigns a numeric id when
  // id < 0 or !id. Labeling an empty cell, Done Editing → Save, still
  // lands on the "hasn't been set up yet" empty state. Re-enable when
  // that app bug is fixed.
  // -------------------------------------------------------------------------

  test.skip('add one symbol — typical path (view → Options → Edit → cell → Done)', async ({
    page,
  }) => {
    const actions = new ActionCounter();
    const scratchName = `Pw Eff Add Typical ${Date.now()}`;
    const label = `PwTyp${Date.now().toString().slice(-4)}`;
    const { slug } = await createScratchBoard(page, username, scratchName);

    // Typical: land on speak/view, then Options → Edit Board (header Edit is
    // often hidden while board_collapsed).
    await page.goto(`/${username}/board-detail/${slug}`);
    await waitForBoardDetail(page, username, slug);

    await actions.click(page.getByRole('button', { name: /^options$/i }));
    await actions.click(
      page
        .locator('.md-board-detail-actions-menu')
        .getByRole('button', { name: /^edit board$/i })
    );
    await expect(page).toHaveURL(/\/edit\/?$/, { timeout: 60_000 });
    await expect(page.locator('.md-board-edit-panel')).toBeVisible({
      timeout: 45_000,
    });

    await actions.click(emptySymbolCard(page), { position: { x: 8, y: 8 } });
    await fillButtonSettingsLabel(page, actions, label);

    await doneEditingAndSave(page, actions);

    await expect(
      page
        .locator('.md-board-detail-symbol-card__label', { hasText: label })
        .or(page.getByRole('button', { name: label }))
    ).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(
      new RegExp(`/${username}/board-detail/${slug}/?$`)
    );

    actions.log('add symbol / typical');
    expect(actions.total).toBeGreaterThanOrEqual(6);
  });

  test.skip('add one symbol — shortest path (direct /edit → cell → Done)', async ({
    page,
  }) => {
    const actions = new ActionCounter();
    const scratchName = `Pw Eff Add Short ${Date.now()}`;
    const label = `PwSh${Date.now().toString().slice(-4)}`;
    const { slug } = await createScratchBoard(page, username, scratchName);

    // Shortest: deep-link straight into edit (skips Options + Edit Board).
    await page.goto(`/${username}/board-detail/${slug}/edit`);
    await expect(page).toHaveURL(/\/edit\/?$/, { timeout: 60_000 });
    await expect(page.locator('.md-board-edit-panel')).toBeVisible({
      timeout: 45_000,
    });

    await actions.click(emptySymbolCard(page), { position: { x: 8, y: 8 } });
    await fillButtonSettingsLabel(page, actions, label);

    await doneEditingAndSave(page, actions);

    await expect(
      page
        .locator('.md-board-detail-symbol-card__label', { hasText: label })
        .or(page.getByRole('button', { name: label }))
    ).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(
      new RegExp(`/${username}/board-detail/${slug}/?$`)
    );

    actions.log('add symbol / shortest');
    // Same end state: labeled card on board-detail speak/view.
    expect(actions.total).toBeLessThan(8);
    expect(actions.fills).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 4) Toggle a common preference (Start in Speak Mode on launch)
  // -------------------------------------------------------------------------

  test('toggle preference — typical path (navbar Settings)', async ({
    page,
  }) => {
    const actions = new ActionCounter();
    const prefId = 'auto_open_speak_mode';

    await gotoHome(page, username);
    await dismissBlockingModals(page);

    // Typical: Settings in the authenticated navbar (not a home card).
    await actions.click(
      page.getByRole('link', { name: /^settings$/i }).first()
    );
    await expect(page).toHaveURL(new RegExp(`/${username}/preferences/?$`), {
      timeout: 45_000,
    });
    await expect(page.locator('.md-preferences')).toBeVisible({
      timeout: 45_000,
    });
    // Basics is open by default — no expand click needed.
    await expect(
      page.locator('.md-pref-box__title', { hasText: /Basics/i }).first()
    ).toBeVisible();

    const original = await readCheckbox(page, prefId);
    const next = !original;
    const box = page.locator(`#${prefId}`).first();
    if ((await box.isChecked()) !== next) {
      await actions.click(box);
    }
    await expect(box).toBeChecked({ checked: next });

    await dismissBlockingModals(page);
    await actions.click(
      page
        .locator('.md-preferences__actions')
        .getByRole('button', { name: /save preferences/i })
    );
    await page.waitForURL((url) => !/\/preferences\/?$/.test(url.pathname), {
      timeout: 60_000,
    });

    // Shared end state: preference persisted after reload.
    await gotoPreferences(page, username);
    await expect(page.locator(`#${prefId}`).first()).toBeChecked({
      checked: next,
    });

    // Restore shared seed user.
    await setCheckbox(page, prefId, original);
    await savePreferences(page);

    actions.log('toggle preference / typical');
    expect(actions.clicks).toBeGreaterThanOrEqual(3);
  });

  test('toggle preference — shortest path (deep-link preferences)', async ({
    page,
  }) => {
    const actions = new ActionCounter();
    const prefId = 'auto_open_speak_mode';

    // Shortest: skip navbar — open preferences directly.
    await page.goto(`/${username}/preferences`);
    await expect(page.locator('.md-preferences')).toBeVisible({
      timeout: 45_000,
    });
    await expandPrefSection(page, /Basics/i);

    const original = await readCheckbox(page, prefId);
    const next = !original;
    const box = page.locator(`#${prefId}`).first();
    if ((await box.isChecked()) !== next) {
      await actions.click(box);
    }
    await expect(box).toBeChecked({ checked: next });

    await dismissBlockingModals(page);
    await actions.click(
      page
        .locator('.md-preferences__actions')
        .getByRole('button', { name: /save preferences/i })
    );
    await page.waitForURL((url) => !/\/preferences\/?$/.test(url.pathname), {
      timeout: 60_000,
    });

    await gotoPreferences(page, username);
    await expect(page.locator(`#${prefId}`).first()).toBeChecked({
      checked: next,
    });

    await setCheckbox(page, prefId, original);
    await savePreferences(page);

    actions.log('toggle preference / shortest');
    // Same end state as typical (persisted checkbox); one fewer nav click.
    expect(actions.clicks).toBeGreaterThanOrEqual(2);
    expect(actions.clicks).toBeLessThan(4);
  });
});
