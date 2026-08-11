import { test, expect } from '@playwright/test';
import { DEFAULT_BOARD_PATH, loginAs } from './helpers/auth';

/**
 * After login, open a communication board and assert symbols/buttons render.
 *
 * Run (local):
 *   PLAYWRIGHT_BASE_URL=http://localhost:8184 npm run test:e2e -- tests/board-navigation.spec.ts
 *
 * Default board: lingolinq/yesno (seeded Yes/No board with two buttons).
 * Override with PLAYWRIGHT_BOARD_PATH (e.g. lingolinq/keyboard).
 */
test.describe('board navigation', () => {
  test('after login, a board shows communication buttons/symbols', async ({
    page,
  }) => {
    await loginAs(page);

    await page.goto(`/${DEFAULT_BOARD_PATH}`);

    // Board route uses key path username/slug (e.g. /lingolinq/yesno).
    await expect(page).toHaveURL(new RegExp(`/${DEFAULT_BOARD_PATH}/?$`));

    // Speak-mode boards usually render HTML buttons (a.button[data-id]).
    // Some prefs use canvas render (#board_canvas) instead — accept either.
    const boardButtons = page.locator('a.button[data-id], .button[data-id]');
    const boardCanvas = page.locator('#board_canvas');

    await expect
      .poll(
        async () => {
          const buttonCount = await boardButtons.count();
          const canvasVisible = await boardCanvas.isVisible().catch(() => false);
          return buttonCount > 0 || canvasVisible;
        },
        {
          timeout: 45_000,
          message:
            'Expected board buttons (a.button[data-id]) or #board_canvas to appear',
        }
      )
      .toBe(true);

    if ((await boardButtons.count()) > 0) {
      await expect(boardButtons.first()).toBeVisible();

      // Labels come from .button-label in board/index + render_fast_html.
      const labels = page.locator('.button-label');
      await expect(labels.first()).toBeVisible();

      // yesno seed uses Yes / No; other boards still should have non-empty labels.
      if (DEFAULT_BOARD_PATH.endsWith('/yesno')) {
        await expect(page.getByText('Yes', { exact: true }).first()).toBeVisible();
        await expect(page.getByText('No', { exact: true }).first()).toBeVisible();
      }

      // Symbol images use class "symbol" when symbols are not hidden.
      const symbols = page.locator('img.symbol');
      if ((await symbols.count()) > 0) {
        await expect(symbols.first()).toBeVisible();
      }
    } else {
      await expect(boardCanvas).toBeVisible();
    }
  });
});
