// create-board-new — page-level behavior: the create-method chooser, the live
// preview, and the sentence bar controls.

const { test, expect } = require('@playwright/test');
const { ROUTE, sel, gotoCreateOwn, seedLabels } = require('./helpers');

test.describe('create-board-new / create-method chooser', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE);
    await expect(page.locator(sel.chooser)).toBeVisible();
  });

  test('promotes exactly two methods to buttons and demotes the rest to links', async ({ page }) => {
    const chooser = page.locator(sel.chooser);

    await expect(chooser.locator(sel.chooserOwn)).toBeVisible();
    await expect(chooser.locator(sel.chooserAi)).toBeVisible();

    // Two buttons only: one OR between them, one after the pair.
    await expect(chooser.locator('.nb-create-chooser__btn')).toHaveCount(2);
    await expect(chooser.locator('.nb-create-chooser__or')).toHaveCount(2);

    // Import Board(s) always renders as a link; Paste HTML + JSON bundle join it
    // only when the paste_html_import feature flag is on, so assert the floor.
    const links = chooser.locator(sel.chooserAltLink);
    await expect(links.first()).toBeVisible();
    expect(await links.count()).toBeGreaterThanOrEqual(1);

    // Demoted methods must be real buttons, not <a> — they fire actions.
    for (const el of await links.elementHandles()) {
      expect(await el.evaluate((n) => n.tagName)).toBe('BUTTON');
    }
  });

  test('demoted links render at 14px in slate gray', async ({ page }) => {
    const link = page.locator(sel.chooserAltLink).first();
    const style = await link.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { fontSize: cs.fontSize, color: cs.color };
    });
    expect(style.fontSize).toBe('14px');
    // $brand-slate-blue #5A6A85
    expect(style.color).toBe('rgb(90, 106, 133)');
  });

  test('"Create My Own Board" dismisses the chooser and reveals the form + preview', async ({ page }) => {
    await page.locator(sel.chooserOwn).click();
    await expect(page.locator(sel.chooser)).toBeHidden();
    await expect(page.locator(sel.previewStage)).toBeVisible();
    await expect(page.locator(sel.previewGrid)).toBeVisible();
    await expect(page.locator(sel.rail)).toBeVisible();
  });

  test('"Generate with AI" enters AI mode, or stops at the AI gate', async ({ page }) => {
    // This USED to assert that AI mode always opened. It does not any more, and
    // the spec was failing against correct code: `choose_ai` now routes through
    // `_requestEnterAiMode` -> `aiFeatureGate.boardGenerationEntry()`
    // (utils/ai_feature_gate.js:125), which returns 'allowed' only when the user
    // has EXPLICITLY opted in -- `prefs.ai_features_enabled === true` AND
    // `prefs.ai_board_generation === true`. A freshly seeded `example` user has
    // neither, so it returns 'needs_opt_in' and a modal opens instead.
    //
    // So both outcomes below are CORRECT product behaviour, and which one you get
    // depends on the seeded user's prefs, the `ai_board_generation` feature flag,
    // COPPA status, and EU consent state. Asserting only the first made a
    // consent gate working properly look like a regression.
    await page.locator(sel.chooserAi).click();

    // The chooser closing proves nothing on its own: create-board-new.js:347
    // hides it BEFORE opening any system modal, precisely so the modal is not
    // painted behind the z-index 6000 overlay. It closes on both paths.
    await expect(page.locator(sel.chooser)).toBeHidden();

    const aiMode = page.locator('.nb-create-header__intro .la-checklist');
    const gate = page.locator('.md-modal-title');
    await expect(
      aiMode.or(gate).first(),
      'clicking Generate with AI neither entered AI mode nor raised the AI gate modal'
    ).toBeVisible();

    // Say which path ran, so a failure elsewhere is diagnosable rather than a
    // mystery about how the dev stack happens to be configured.
    if (await aiMode.isVisible()) {
      await expect(page.locator(sel.previewStage)).toBeVisible();
    } else {
      // Gated: the modal must be dismissible and must restore the chooser,
      // otherwise the user is stranded on a page with no way back.
      await page.locator('.la-modal-close').first().click();
      await expect(page.locator(sel.chooser)).toBeVisible();
    }
  });

  test('close returns the user off the create page', async ({ page }) => {
    await page.locator(sel.chooserClose).click();
    await expect(page).not.toHaveURL(new RegExp(`${ROUTE}$`));
  });
});

test.describe('create-board-new / live preview', () => {
  test.beforeEach(async ({ page }) => gotoCreateOwn(page));

  test('renders the preview grid with the sentence bar above it', async ({ page }) => {
    const bar = page.locator(sel.sentenceBar);
    await expect(bar).toBeVisible();
    await expect(page.locator(sel.sentencePlaceholder)).toBeVisible();
    await expect(page.locator(sel.homeBtn)).toBeVisible();

    // Sentence bar sits above the grid.
    const barBox = await bar.boundingBox();
    const gridBox = await page.locator(sel.previewGrid).boundingBox();
    expect(barBox.y).toBeLessThan(gridBox.y);
  });

  test('speak-bar controls are present and operable', async ({ page }) => {
    // These speak/clear a preview utterance; safe on the mockup, and they are
    // exactly the controls a user relies on, so they get pressed.
    // Scope to the bar: once labels exist the rail also renders "Clear all
    // labels", which a loose /clear/i would match too.
    const bar = page.locator(sel.sentenceBar);
    for (const name of [/speak sentence/i, /backspace/i, /^clear$/i]) {
      const btn = bar.getByRole('button', { name });
      await expect(btn).toBeVisible();
      await btn.click();
    }
    // Nothing was tapped, so the placeholder must still be showing afterward.
    await expect(page.locator(sel.sentencePlaceholder)).toBeVisible();
  });

  test('tapping a preview button puts a word in the sentence bar; clear empties it', async ({ page }) => {
    // A fresh board has 0 labels, so every cell is empty and inert — seed first.
    await seedLabels(page);
    const cells = page.locator(`${sel.previewGrid} ${sel.previewButton}`);
    await cells.first().click();

    // Either a text word chip or a symbol chip, depending on the user's
    // utterance_text_only preference — both mean the tap registered.
    const filled = page.locator(
      `${sel.sentenceWord}, .md-board-detail-sentence-bar__chip`
    );
    await expect(filled.first()).toBeVisible();

    await page.locator(sel.sentenceBar).getByRole('button', { name: /^clear$/i }).click();
    await expect(page.locator(sel.sentencePlaceholder)).toBeVisible();
  });
});
