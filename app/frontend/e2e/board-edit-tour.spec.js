// Board page EDIT tour — the real UI, end to end (requested 2026-10-12: "create a ui test for the edit
// tour", after the tour was cut to 4 steps: "the board page edit tour should be only 4 steps total").
//
// Opens one of the signed-in user's own boards in edit mode, starts the tour from its trigger at the
// end of Board Actions (templates/user/board-detail.hbs, `.md-board-edit-panel__tour`; Board Actions
// starts COLLAPSED, so it is expanded first), and walks it: welcome, the board's buttons, the editing
// bar, finish — each spotlight on its element. The tour only reads; nothing is saved or cancelled.
//
// Board: E2E_EDIT_BOARD, else the seeded example user's home board.

const { test, expect } = require('@playwright/test');

const BOARD = process.env.E2E_EDIT_BOARD || 'example/communikate-home';

const sel = {
  session: '.md-board-edit-session',
  actionsToggle: '[data-bd-action="toggle_board_actions"]',
  tourTrigger: '.md-board-edit-panel__tour .md-tour__trigger',
  step: '.shepherd-element:not([hidden])',
  stepTitle: '.shepherd-element:not([hidden]) .shepherd-title',
  next: '.shepherd-element:not([hidden]) .md-tour__btn--primary',
  target: '.shepherd-target',
};

// The four steps, in order: the title each shows, and the element it spotlights (null = a centred card).
const STEPS = [
  { title: /board|edit/i, target: null },
  { title: "Your board's buttons", target: '.md-board-detail-grid' },
  { title: "You're in edit mode", target: '.md-board-edit-session' },
  { title: /./, target: null },
];

test.describe('board page / edit tour', () => {
  test('runs exactly 4 steps, each on its element', async ({ page }) => {
    const [user, ...rest] = BOARD.split('/');
    await page.goto(`/${user}/board-detail/${rest.join('/')}/edit`);
    await expect(page.locator(sel.session), 'the board did not open in edit mode').toBeVisible({ timeout: 30_000 });

    // Dialogs a seeded account can carry (terms, premium reminder) sit over the page; the tour is not what
    // they are about, so close them as a user would before reaching for the trigger.
    await page.keyboard.press('Escape');

    const toggle = page.locator(sel.actionsToggle);
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    }
    await page.locator(sel.tourTrigger).click();

    const seen = [];
    for (let i = 0; i < STEPS.length; i++) {
      await expect(page.locator(sel.step)).toBeVisible();
      const expected = STEPS[i];
      const title = page.locator(sel.stepTitle);
      if (typeof expected.title === 'string') {
        await expect(title).toContainText(expected.title);
      } else {
        await expect(title).toHaveText(expected.title);
      }
      if (expected.target) {
        // Shepherd marks the spotlighted element with .shepherd-target.
        await expect(page.locator(`${expected.target}${sel.target}`)).toHaveCount(1);
      }
      seen.push((await title.innerText()).replace(/\s+/g, ' ').trim());
      await page.locator(sel.next).last().click();
    }

    // The finish button ends it: no fifth step.
    await expect(page.locator(sel.step)).toHaveCount(0);
    expect(seen).toHaveLength(4);
  });
});
