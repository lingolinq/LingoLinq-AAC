// Shared locators + flows for the create-board-new specs.
//
// Selector policy: prefer semantics (role, aria-expanded, aria-checked) and the
// `data-section-id` hooks the rail already renders. Class selectors are used only
// where the markup offers no semantic handle — each one is named here once so a
// markup change breaks in a single place rather than across every spec.

const { expect } = require('@playwright/test');

const ROUTE = '/create-board-new';

// The seven Edit Tools sections, from `create_rail_sections`
// (components/create-board-new.js). `skin` is intentionally absent — it is
// commented out in that list pending dropdown-positioning rework, so a spec that
// expected it would fail against correct code.
const EDIT_TOOL_SECTIONS = [
  { id: 'background', label: 'Background' },
  { id: 'layout', label: 'Board Layout' },
  { id: 'symbols', label: 'Board Symbols' },
  { id: 'paint', label: 'Paint' },
  { id: 'shape', label: 'Shape & Border' },
  { id: 'speakbar', label: 'Speak Bar' },
  { id: 'text', label: 'Text Settings' },
];

const sel = {
  chooser: '.nb-create-chooser',
  chooserOwn: '.nb-create-chooser__btn--own',
  chooserAi: '.nb-create-chooser__btn--ai',
  chooserAltLink: '.nb-create-chooser__alt-link',
  chooserClose: '.nb-create-chooser__close',

  previewStage: '.nb-preview-stage',
  previewWrap: '.new-board-mockup-wrap',
  previewGrid: '.md-board-detail-grid--preview',
  // A cell holding a real button. Empty cells carry --empty and are inert, so
  // tapping one is a no-op rather than a failure.
  previewButton: '[role="gridcell"]:not(.md-board-detail-grid__cell--empty)',
  themeToggle: '.new-board-mockup-toggle',

  sentenceRow: '.nb-preview-sentence-row',
  sentenceBar: '.md-board-detail-sentence-bar',
  sentenceText: '.md-board-detail-sentence-bar__text',
  sentencePlaceholder: '.nb-preview-sentence-bar__placeholder',
  sentenceWord: '.nb-preview-sentence-bar__word',
  homeBtn: '.md-board-detail-home-btn',

  rail: '.nb-create-rail',
  section: (id) => `.md-board-edit-right-panel__section[data-section-id="${id}"]`,
  sectionToggle: (id) =>
    `.md-board-edit-right-panel__section[data-section-id="${id}"] .md-board-edit-right-panel__section-toggle`,
};

// Open the page and dismiss the create-method chooser via "Create My Own Board",
// which is the entry point into the form + live preview the specs exercise.
async function gotoCreateOwn(page) {
  await page.goto(ROUTE);
  const chooser = page.locator(sel.chooser);
  await expect(chooser).toBeVisible();
  await page.locator(sel.chooserOwn).click();
  await expect(chooser).toBeHidden();
  await expect(page.locator(sel.previewStage)).toBeVisible();
}

// A fresh create-board-new board has "0 labels", so its preview grid renders
// empty cells with nothing to tap and several prefs have no visible subject.
// Seed a few labels through the real labels input (type + Enter) so the preview
// has actual buttons — the same thing a user does first.
async function seedLabels(page, words = ['hello', 'more', 'stop']) {
  const input = page.getByPlaceholder(/type a word or group of words/i);
  await expect(input).toBeVisible();
  for (const w of words) {
    await input.fill(w);
    await input.press('Enter');
  }
  // Buttons appear in the preview once the labels register.
  await expect(page.locator(`${sel.previewGrid} ${sel.previewButton}`).first()).toBeVisible();
}

// The theme toggle is a real switch: aria-checked is the source of truth for
// which mode the preview is in, so tests assert on it rather than on colors.
async function setPreviewMode(page, mode) {
  const toggle = page.locator(sel.themeToggle);
  const want = mode === 'dark' ? 'true' : 'false';
  if ((await toggle.getAttribute('aria-checked')) !== want) {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute('aria-checked', want);
}

// Resolved background-color of an element, for the light/dark parity checks.
function bgColor(locator) {
  return locator.evaluate((el) => getComputedStyle(el).backgroundColor);
}

function parseRgb(str) {
  const m = str.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
  if (!m) return null;
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
}

module.exports = {
  ROUTE, EDIT_TOOL_SECTIONS, sel,
  gotoCreateOwn, seedLabels, setPreviewMode, bgColor, parseRgb,
};
