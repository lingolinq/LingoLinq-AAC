// create-board-new — the Edit Tools rail. One generated block per section in
// `create_rail_sections`, plus per-tool checks that each section's controls
// actually drive the live preview (not just that the panel opens).

const { test, expect } = require('@playwright/test');
const { EDIT_TOOL_SECTIONS, sel, gotoCreateOwn, seedLabels } = require('./helpers');

// STATE WARNING: the rail writes the signed-in user's REAL device preferences,
// and those persist server-side across runs. Tests here must therefore be
// order- and history-independent: never assert "value becomes X" for a fixed X,
// and never click a fixed stepper direction. Pick whatever is currently
// unselected/enabled and assert that state MOVED.

test.describe('create-board-new / Edit Tools rail', () => {
  test.beforeEach(async ({ page }) => {
    await gotoCreateOwn(page);
    // Prefs act on buttons; an empty board gives them nothing to change, so the
    // "did the preview react" assertions need a seeded board to be meaningful.
    await seedLabels(page);
  });

  test('renders every configured section, and only those', async ({ page }) => {
    const sections = page.locator('.md-board-edit-right-panel__section[data-section-id]');
    await expect(sections).toHaveCount(EDIT_TOOL_SECTIONS.length);

    for (const s of EDIT_TOOL_SECTIONS) {
      await expect(page.locator(sel.section(s.id))).toBeVisible();
    }
    // `skin` is commented out of create_rail_sections pending rework — if it comes
    // back, this fails and the list in helpers.js needs updating alongside it.
    await expect(page.locator(sel.section('skin'))).toHaveCount(0);
  });

  // Every section: opens, exposes controls, and closes. aria-expanded is the
  // contract, so a section that visually opens without updating it still fails.
  for (const s of EDIT_TOOL_SECTIONS) {
    test(`section "${s.label}" opens, exposes controls, and closes`, async ({ page }) => {
      const toggle = page.locator(sel.sectionToggle(s.id));
      const section = page.locator(sel.section(s.id));

      await expect(toggle).toHaveAttribute('aria-expanded', 'false');

      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(section).toHaveClass(/md-board-edit-right-panel__section--open/);

      // An open section must offer at least one real control, otherwise it is an
      // empty drawer that looks functional.
      const controls = section.locator('button, select, input, [role="button"]').filter({
        hasNot: page.locator('.md-board-edit-right-panel__section-toggle'),
      });
      expect(await controls.count()).toBeGreaterThan(0);

      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });
  }

  test('opening one section closes the previously open one', async ({ page }) => {
    const [first, second] = EDIT_TOOL_SECTIONS;
    await page.locator(sel.sectionToggle(first.id)).click();
    await expect(page.locator(sel.sectionToggle(first.id))).toHaveAttribute('aria-expanded', 'true');

    await page.locator(sel.sectionToggle(second.id)).click();
    await expect(page.locator(sel.sectionToggle(second.id))).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator(sel.sectionToggle(first.id))).toHaveAttribute('aria-expanded', 'false');
  });


  // ── Per-tool effect on the live preview ────────────────────────────────────
  // The rail exists to change the preview, so each tool is driven through its REAL
  // control and asserted on the thing that control owns. Selectors come from the
  // section bodies in create-board-new.hbs, which use three consistent patterns:
  //   radiogroup  -> role="radio" + aria-checked   (shape, text, speakbar mode)
  //   dropdown    -> .md-settings-select--trigger then role="option" + aria-selected
  //                                                (background, symbols, speakbar size)
  //   stepper     -> aria-label'd +/- buttons      (layout rows/cols, grid gap)
  // Paint is its own shape: a palette trigger that opens swatches.

  const body = (section) => section.locator('.md-board-edit-right-panel__section-body');

  async function openSection(page, id) {
    await page.locator(sel.sectionToggle(id)).click();
    await expect(page.locator(sel.sectionToggle(id))).toHaveAttribute('aria-expanded', 'true');
    return page.locator(sel.section(id));
  }

  // Click whichever half of a +/- stepper pair is still enabled. Stepper buttons
  // carry `disabled` at the pref's min/max, and because these specs write the
  // user's PERSISTED prefs, a fixed direction eventually lands on the disabled
  // end and silently does nothing.
  async function stepEitherWay(section, incName, decName) {
    const inc = body(section).getByRole('button', { name: incName });
    const dec = body(section).getByRole('button', { name: decName });
    const target = (await inc.isEnabled()) ? inc : dec;
    expect(await target.isEnabled(), 'both ends of the stepper are disabled').toBe(true);
    await target.click();
  }

  const gridState = (page) =>
    page.locator(sel.previewGrid).evaluate((el) => el.className + '|' + (el.getAttribute('style') || ''));

  // Click the first radio in `section` that is not already checked, and assert the
  // group actually moved. Returns nothing; callers assert the preview separately.
  async function pickUncheckedRadio(section) {
    const unchecked = body(section).locator('[role="radio"][aria-checked="false"]');
    expect(await unchecked.count(), 'no unselected radio to switch to').toBeGreaterThan(0);

    // Re-locate by aria-label before clicking: `[aria-checked="false"]` is a
    // DYNAMIC selector, so the element drops out of it the instant the click
    // works — asserting on the original locator could never pass.
    const label = await unchecked.first().getAttribute('aria-label');
    const target = body(section).locator(`[role="radio"][aria-label="${label}"]`);
    await target.click();
    await expect(target).toHaveAttribute('aria-checked', 'true');
    return label;
  }

  // Open the section's dropdown and choose the first option that is not selected.
  async function pickUnselectedOption(section, optionId) {
    await body(section).locator('.md-settings-select--trigger').first().click();
    const menu = body(section).locator('[role="listbox"]');
    await expect(menu).toBeVisible();
    const target = optionId
      ? menu.locator(`[role="option"]`).filter({ hasText: optionId }).first()
      : menu.locator('[role="option"][aria-selected="false"]').first();
    await expect(target).toBeVisible();
    const label = (await target.innerText()).trim();
    await target.click();
    return label;
  }

  test('Background: choosing a background updates the preview', async ({ page }) => {
    const section = await openSection(page, 'background');
    const before = await gridState(page);
    await pickUnselectedOption(section);
    await expect
      .poll(() => gridState(page), { message: 'Background did not change the preview' })
      .not.toBe(before);
  });

  test('Board Layout: adding a row adds a row of cells to the preview', async ({ page }) => {
    const section = await openSection(page, 'layout');
    const grid = page.locator(sel.previewGrid);
    const cellsBefore = await grid.locator('[role="gridcell"]').count();
    const rowsBefore = await grid.locator('[role="row"]').count();

    const inc = body(section).getByRole('button', { name: /increase rows/i });
    const dec = body(section).getByRole('button', { name: /decrease rows/i });
    const grow = await inc.isEnabled();
    await (grow ? inc : dec).click();

    await expect
      .poll(() => grid.locator('[role="row"]').count(), {
        message: 'the rows stepper did not change the preview row count',
      })
      .toBe(rowsBefore + (grow ? 1 : -1));
    const cellsAfter = await grid.locator('[role="gridcell"]').count();
    expect(grow ? cellsAfter > cellsBefore : cellsAfter < cellsBefore).toBe(true);
  });

  test('Board Layout: grid gap stepper changes the preview spacing', async ({ page }) => {
    const section = await openSection(page, 'layout');
    const before = await gridState(page);
    await stepEitherWay(section, /looser/i, /tighter/i);
    await expect
      .poll(() => gridState(page), { message: 'Grid Gap did not change the preview' })
      .not.toBe(before);
  });

  test('Board Symbols: switching the symbol library takes effect', async ({ page }) => {
    const section = await openSection(page, 'symbols');
    const trigger = body(section).locator('.md-settings-select--trigger').first();
    const before = (await trigger.innerText()).trim();

    const chosen = await pickUnselectedOption(section);

    // The library choice shows on the trigger; that is the tool's own state, and
    // symbol swaps are async image loads so the grid class is not the contract.
    await expect
      .poll(async () => (await trigger.innerText()).trim(), {
        message: 'Board Symbols selection did not stick',
      })
      .not.toBe(before);
    expect(chosen.length).toBeGreaterThan(0);
  });

  test('Paint: choosing a swatch arms paint mode on the grid', async ({ page }) => {
    const section = await openSection(page, 'paint');

    // The palette button is a TRIGGER — it only opens the swatch list. The swatches
    // inside it are what call set_paint_mode.
    await body(section).locator('.md-board-edit-right-panel__palette').first().click();
    // The swatches live in .paint-grid as .paint-pill buttons. (Do NOT reach for
    // `.filter({hasNot})` here — that excludes elements CONTAINING the locator, so
    // it leaves the palette trigger itself in and the "swatch" click just closes
    // the dropdown again.)
    const swatch = body(section).locator('.md-board-edit-right-panel__paint-pill').first();
    await expect(swatch).toBeVisible();
    await swatch.click();

    await expect(section).toHaveClass(/md-board-edit-right-panel__section--paint-armed/);
    await expect(page.locator(sel.previewGrid)).toHaveClass(/md-board-detail-grid--paint-mode/);
  });

  test('Shape & Border: switching shape updates the preview shape class', async ({ page }) => {
    const section = await openSection(page, 'shape');
    const before = await gridState(page);
    await pickUncheckedRadio(section);
    await expect
      .poll(() => gridState(page), { message: 'Shape & Border did not change the preview' })
      .not.toBe(before);
  });

  test('Speak Bar: changing the size resizes the preview speak bar', async ({ page }) => {
    const section = await openSection(page, 'speakbar');
    const bar = page.locator(sel.sentenceBar);
    const before = (await bar.boundingBox()).height;

    // voice_height_options: Small 90 / Medium 100 / Large 150 / Huge 200.
    // Deliberately NOT hardcoded to "Huge" — see the state note at the top of this
    // file: a fixed target is already selected on the second run, so the click
    // becomes a no-op. Take whatever is unselected and assert the height MOVED.
    await pickUnselectedOption(section);

    await expect
      .poll(async () => (await bar.boundingBox()).height, {
        message: 'Speak Bar size did not resize the preview bar',
      })
      .not.toBe(before);
  });

  test('Speak Bar: words-only mode drops symbols from the bar', async ({ page }) => {
    const section = await openSection(page, 'speakbar');
    const row = page.locator(sel.sentenceRow);

    const before = await row.getAttribute('class');
    await pickUncheckedRadio(section);
    // The row carries --words-only while utterance_text_only is true, so switching
    // modes must add or remove that class.
    await expect
      .poll(() => row.getAttribute('class'), { message: 'Speak Bar mode did not change the bar' })
      .not.toBe(before);
    expect(await row.count()).toBe(1);
  });

  test('Text Settings: changing text position updates the preview', async ({ page }) => {
    const section = await openSection(page, 'text');
    const before = await gridState(page);
    await pickUncheckedRadio(section);
    await expect
      .poll(() => gridState(page), { message: 'Text Settings did not change the preview' })
      .not.toBe(before);
  });

  test('Text Settings: the text-size stepper changes the preview', async ({ page }) => {
    const section = await openSection(page, 'text');
    const before = await gridState(page);
    await stepEitherWay(section, /larger/i, /smaller/i);
    await expect
      .poll(() => gridState(page), { message: 'Text size stepper did not change the preview' })
      .not.toBe(before);
  });
});
