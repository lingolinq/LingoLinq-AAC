// create-board-new — light/dark parity between the live preview and the real
// board-detail page.
//
// This is the regression guard for the styling fix: board-detail's LIGHT-mode
// speak treatment is scoped to a `.md-shell--board-detail` ancestor which the
// preview does not have, so the preview silently fell back to the base
// dark-canvas bar styling. Those selectors now also list a
// `.new-board-mockup-wrap:not(.md-board-detail--dark)` scope. If someone
// re-scopes them to the shell alone, these fail.
//
// Assertions are on RESOLVED colors rather than class names, because the bug
// being guarded was precisely "right classes, wrong computed style".

const { test, expect } = require('@playwright/test');
const { sel, gotoCreateOwn, setPreviewMode, bgColor, parseRgb } = require('./helpers');

test.describe('create-board-new / preview theme parity', () => {
  test.beforeEach(async ({ page }) => gotoCreateOwn(page));

  test('the theme toggle switches the preview between light and dark', async ({ page }) => {
    const wrap = page.locator(sel.previewWrap);

    await setPreviewMode(page, 'light');
    await expect(wrap).not.toHaveClass(/md-board-detail--dark/);

    await setPreviewMode(page, 'dark');
    await expect(wrap).toHaveClass(/md-board-detail--dark/);
    await expect(wrap).toHaveClass(/new-board-mockup-wrap--dark/);

    await setPreviewMode(page, 'light');
    await expect(wrap).not.toHaveClass(/md-board-detail--dark/);
  });

  test('LIGHT: preview canvas is board-detail\'s charcoal board surface', async ({ page }) => {
    await setPreviewMode(page, 'light');
    // $brand-charcoal-dark #374151 — matches .md-board-detail-main in light mode.
    // Regression shape: a light recessed panel gradient (near-white).
    expect(await bgColor(page.locator(sel.previewWrap))).toBe('rgb(55, 65, 81)');
  });

  test('LIGHT: sentence bar uses the glass surface, not the dark-canvas slab', async ({ page }) => {
    await setPreviewMode(page, 'light');
    const bar = page.locator(sel.sentenceBar);

    const style = await bar.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundImage, color: cs.color, filter: cs.backdropFilter };
    });

    // glass-bar-surface is a gradient; the buggy fallback was a flat
    // rgba(110,122,140,.32) background-color with no background-image.
    expect(style.bg).toContain('gradient');
    // The mixin also brings navy text; the fallback left it #fff.
    expect(style.color).toBe('rgb(27, 54, 93)');
    expect(style.filter).toContain('blur');
  });

  test('LIGHT: home + tool buttons get the translucent-white treatment', async ({ page }) => {
    await setPreviewMode(page, 'light');

    const home = await page.locator(sel.homeBtn).evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundImage, color: cs.color };
    });
    expect(home.bg).toContain('gradient');
    expect(home.color).toBe('rgb(27, 54, 93)'); // $la-navy

    const tool = page.locator('.md-board-detail-sentence-bar__tool-btn').first();
    const toolBg = parseRgb(await bgColor(tool));
    expect(toolBg, 'tool button background did not resolve').not.toBeNull();
    // rgba(255,255,255,.55) — white, translucent.
    expect(toolBg.r).toBe(255);
    expect(toolBg.g).toBe(255);
    expect(toolBg.b).toBe(255);
  });

  // Regression: the empty-cell placeholder has THREE variants — a navy wash (base,
  // for light surfaces), a white wash for dark mode, and a white wash for
  // speak-LIGHT that was shell-scoped. Once the preview canvas became the dark
  // charcoal board surface, the base navy wash made blank cards invisible against
  // it. Both modes must therefore use a LIGHT wash here, never the navy one.
  for (const mode of ['light', 'dark']) {
    test(`${mode.toUpperCase()}: blank board cards stay visible against the canvas`, async ({ page }) => {
      await setPreviewMode(page, mode);

      const blank = page.locator(`${sel.previewGrid} .md-board-detail-symbol-card--empty`).first();
      await expect(blank, 'no empty cards in the preview grid').toBeVisible();

      const c = parseRgb(await bgColor(blank));
      expect(c, 'empty card background did not resolve').not.toBeNull();
      // White-ish wash: all channels at the top of the range. The broken navy wash
      // is rgba(27, 54, 93, .04), which fails this on every channel.
      expect(c.r).toBeGreaterThan(200);
      expect(c.g).toBeGreaterThan(200);
      expect(c.b).toBeGreaterThan(200);
      // ...and actually painted, not fully transparent.
      expect(c.a).toBeGreaterThan(0);

      // Layer stack: dot texture (radial) + top-lit sheen (linear) over that wash.
      const img = await blank.evaluate((el) => getComputedStyle(el).backgroundImage);
      expect(img, 'blank card lost its dot texture').toContain('radial-gradient');
      expect(img, 'blank card lost its gradient sheen').toContain('linear-gradient');
    });
  }

  test('DARK: preview canvas matches board-detail\'s translucent navy main', async ({ page }) => {
    await setPreviewMode(page, 'dark');
    const wrap = page.locator(sel.previewWrap);

    const style = await wrap.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundImage, filter: cs.backdropFilter };
    });

    // linear-gradient(180deg, rgba(25,32,47,.74), rgba(19,25,38,.66)) + blur(10px).
    // Regression shape: the page-canvas radial halos it used to paint (several
    // `radial-gradient` layers) instead of the board surface.
    expect(style.bg).toContain('linear-gradient');
    expect(style.bg).not.toContain('radial-gradient');
    expect(style.filter).toContain('blur');
  });

  test('DARK: sentence bar + word chips stay readable', async ({ page }) => {
    await setPreviewMode(page, 'dark');

    const bar = await page.locator(sel.sentenceBar).evaluate(
      (el) => getComputedStyle(el).backgroundImage
    );
    expect(bar).toContain('gradient');

    // Tap a cell so a word chip exists, then check it is light-on-dark rather
    // than the light-mode navy-on-navy pair.
    const cells = page.locator(`${sel.previewGrid} [role="gridcell"]`);
    if (await cells.count()) {
      await cells.first().click();
      const word = page.locator(sel.sentenceWord).first();
      if (await word.count()) {
        const c = parseRgb(await word.evaluate((el) => getComputedStyle(el).color));
        // Light text: every channel well above mid.
        expect(c.r + c.g + c.b).toBeGreaterThan(400);
      }
    }
  });
});
