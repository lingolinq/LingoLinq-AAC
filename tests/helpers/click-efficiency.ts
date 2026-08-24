import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Counts Playwright user actions (clicks + fills) for click-efficiency
 * comparisons. Navigation (`page.goto`) is intentionally not counted —
 * it models a deep link / bookmark, not a UI click.
 */
export class ActionCounter {
  clicks = 0;
  fills = 0;

  get total(): number {
    return this.clicks + this.fills;
  }

  async click(target: Locator, opts?: Parameters<Locator['click']>[0]): Promise<void> {
    this.clicks += 1;
    await target.click(opts);
  }

  async fill(target: Locator, value: string): Promise<void> {
    this.fills += 1;
    await target.fill(value);
  }

  /** Structured log for CI / local runs comparing typical vs shortest. */
  log(label: string): void {
    // eslint-disable-next-line no-console
    console.log(
      `[click-efficiency] ${label}: ${this.clicks} click(s), ${this.fills} fill(s), ${this.total} total`
    );
  }

  snapshot(): { clicks: number; fills: number; total: number } {
    return { clicks: this.clicks, fills: this.fills, total: this.total };
  }
}

export async function gotoHome(page: Page, username: string): Promise<void> {
  await page.goto(`/${username}/home`);
  await expect(page).toHaveURL(new RegExp(`/${username}/home/?$`));
  await expect(page.locator('#identity_button')).toBeVisible({ timeout: 45_000 });
}

/** Board-detail symbol card (speak mode role=button). */
export function symbolCard(page: Page, name: string | RegExp): Locator {
  return page.getByRole('button', { name }).first();
}

/** Empty cell cards in edit mode (class hook; role is group while editing). */
export function emptySymbolCard(page: Page): Locator {
  return page.locator('.md-board-detail-symbol-card--empty').first();
}

/**
 * Open Button Settings (already clicked the empty cell) and set Label.
 *
 * `#label` lives on the General tab, which is `class="hidden"` while Help
 * is selected. Seed users without `preferences.disable_button_help` always
 * open on Help (`button-settings.js` opening()). Do not click "Skip this
 * help in the future" — that persists on the shared seed user.
 *
 * Playwright `fill()` alone often does not fire Ember's `model.label`
 * observer (`labelChanged` → `editManager.change_button`). Blur + input
 * events are required so the ordered_buttons cell actually gets the text
 * before save.
 */
export async function fillButtonSettingsLabel(
  page: Page,
  actions: ActionCounter,
  label: string
): Promise<void> {
  const dialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: /button settings/i }),
  });
  await expect(dialog).toBeVisible({ timeout: 30_000 });

  const labelInput = dialog.locator('#label');
  if (!(await labelInput.isVisible())) {
    const changeLabel = dialog.getByRole('button', {
      name: /change this button's label/i,
    });
    if (await changeLabel.isVisible().catch(() => false)) {
      await actions.click(changeLabel);
    } else {
      await actions.click(dialog.getByRole('tab', { name: /^general$/i }));
    }
  }
  await expect(labelInput).toBeVisible({ timeout: 15_000 });
  await labelInput.click();
  await labelInput.press('Control+A');
  // Real key events so Ember's Input @value two-way binding + labelChanged
  // observer run. locator.fill() sets the DOM value without updating
  // model.label, so editManager never sees the text.
  await labelInput.pressSequentially(label, { delay: 20 });
  actions.fills += 1;
  await labelInput.press('Tab');
  await expect(labelInput).toHaveValue(label);
  await expect(dialog.locator('h3')).toContainText(label, { timeout: 10_000 });

  await actions.click(dialog.getByRole('button', { name: /^close$/i }).first());
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

/** After Button Settings closes, the labeled cell must already be on the edit grid. */
export async function expectLabelOnEditGrid(
  page: Page,
  label: string
): Promise<void> {
  const inline = page.locator('.md-board-detail-symbol-card__label-input');
  const spoken = page.locator('.md-board-detail-symbol-card__label', {
    hasText: label,
  });
  await expect(inline.or(spoken)).toBeVisible({ timeout: 15_000 });
  if (await inline.isVisible().catch(() => false)) {
    await expect(inline).toHaveValue(label);
  }
}

/**
 * Board-detail is ready when either:
 * - the symbol grid is visible (boards with at least one visible button), or
 * - the blank-board empty state is visible (no visible buttons).
 *
 * Freshly created boards take the empty-state branch
 * (`nothing_visible_not_edit` in board-detail.hbs) and never mount the grid.
 * The empty-state locator is scoped to `.md-board-detail-empty-board` so the
 * confirm-edit-board modal's "Edit this Board" button does not count.
 */
export function boardDetailReady(page: Page): Locator {
  const symbolGrid = page.getByRole('grid', { name: /symbol board/i });
  const blankBoardEmptyState = page
    .locator('.md-board-detail-empty-board')
    .filter({
      has: page.getByText(
        /this board hasn't been set up yet, or doesn't have any visible buttons/i
      ),
    })
    .filter({
      has: page.getByRole('button', { name: /edit this board/i }),
    });
  return symbolGrid.or(blankBoardEmptyState);
}

export async function waitForBoardDetail(
  page: Page,
  username: string,
  boardSlug?: string
): Promise<void> {
  const slug = boardSlug ? `${boardSlug}` : '[^/]+';
  await expect(page).toHaveURL(
    new RegExp(`/${username}/board-detail/${slug}(/edit)?/?$`),
    { timeout: 60_000 }
  );
  await expect(boardDetailReady(page)).toBeVisible({
    timeout: 60_000,
  });
}

/**
 * End state for a freshly created blank board on speak/view.
 *
 * The header title (`.md-board-detail-header__title`) is in the DOM with the
 * name, but speak mode sets `board_collapsed` so the header is `display: none`.
 * Assert the visible empty-state instead of toBeVisible() on that title.
 */
export async function expectBlankBoardCreated(
  page: Page,
  username: string,
  boardName: string
): Promise<void> {
  await expect(page).toHaveURL(
    new RegExp(`/${username}/board-detail/[^/]+/?$`),
    { timeout: 30_000 }
  );
  await expect(page).not.toHaveURL(/\/edit\/?$/);
  await expect(
    page.getByText(
      /this board hasn't been set up yet, or doesn't have any visible buttons/i
    )
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole('button', { name: /edit this board/i })
  ).toBeVisible();

  const title = page.locator('.md-board-detail-header__title');
  await expect(title).toBeAttached({ timeout: 15_000 });
  expect((await title.textContent())?.trim()).toBe(boardName);
}

/**
 * Seed a throwaway blank board for add-button paths. Actions here are NOT
 * part of the efficiency counter — they are setup only.
 */
export async function createScratchBoard(
  page: Page,
  username: string,
  name: string
): Promise<{ slug: string }> {
  await page.goto('/create-board-new');
  await expect(
    page.getByRole('button', { name: /create my own board/i })
  ).toBeVisible({ timeout: 45_000 });
  await page.getByRole('button', { name: /create my own board/i }).click();
  await expect(page.locator('#new_board_name')).toBeVisible({ timeout: 30_000 });
  await page.locator('#new_board_name').fill(name);
  await page.getByRole('button', { name: /^create board$/i }).first().click();
  await waitForBoardDetail(page, username);
  const match = page.url().match(/board-detail\/([^/?#]+)/);
  const slug = match?.[1] || name.toLowerCase().replace(/\s+/g, '-');
  return { slug };
}

/** Confirm leave-edit modal → Save (lands back in speak/view). */
export async function doneEditingAndSave(page: Page, actions: ActionCounter): Promise<void> {
  const done = page.getByRole('button', { name: /done editing/i }).first();
  await expect(done).toBeVisible({ timeout: 30_000 });
  await actions.click(done);

  const saveConfirm = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: /save and exit/i }) })
    .getByRole('button', { name: /^save$/i });
  await expect(saveConfirm).toBeVisible({ timeout: 30_000 });
  await actions.click(saveConfirm);

  await expect(page).toHaveURL(/\/board-detail\/[^/]+\/?$/, { timeout: 60_000 });
  await expect(page).not.toHaveURL(/\/edit\/?$/);
}
