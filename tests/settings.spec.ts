import { test, expect } from '@playwright/test';
import { DEFAULT_BOARD_PATH, loginAs } from './helpers/auth';
import {
  changeSelectAndAssertPersistence,
  expandPrefSection,
  finishDisplayStyleTour,
  gotoPreferences,
  openThemePicker,
  readCheckbox,
  savePreferences,
  selectBoundOption,
  selectThemeMode,
  setCheckbox,
  toggleCheckboxAndAssertPersistence,
} from './helpers/preferences';

/**
 * User settings / preferences e2e coverage.
 *
 * Run (local or staging):
 *   PLAYWRIGHT_BASE_URL=http://localhost:8184 npm run test:e2e -- tests/settings.spec.ts
 *
 * ---------------------------------------------------------------------------
 * SETTINGS INVENTORY (Ember frontend)
 * ---------------------------------------------------------------------------
 *
 * A) Home Display Style (nav button "Display Style")
 *    Control: getByRole('button', { name: 'Display Style' })
 *    Opens: Shepherd `.shepherd-element.md-ds-modal` (Dashboard Design)
 *    Options: Gentle View / Focused View → preferences.dashboard_layout
 *             + body.ll-layout-focused when focused
 *    Note: Color Tone / ll-bento-dark-toggle is NOT on the home nav today
 *          (hidden/commented or speak-mode-only).
 *
 * B) /:user/preferences — General Preferences (preference-box sections)
 *
 * Basics (open by default)
 *  - #role (bound-select) Account Type communicator|supporter — changes dashboard role
 *  - #device_role Device Purpose — communicator|supporter device
 *  - #auto_open_speak_mode Start in Speak Mode on launch
 *  - #long_token (advanced) Keep me logged in
 *  - #require_speak_mode_pin + #speak_mode_pin + #hide_pin_hint Speak Mode PIN
 *  - home board clear / #sync_starred_boards
 *  - #locale Preferred Language → i18n locale
 *  - #preferred_symbols Preferred Symbols library
 *  - Preferred Skin Tone (feature flag skin_tones)
 *
 * Notifications
 *  - #notification_frequency Usage Summaries email cadence
 *  - #goal_notifications Goal Updates
 *  - #share_notifications Share Notifications channel
 *
 * Styling
 *  - #board_background Board bg white|black → speak-mode color_* class
 *  - #symbol_background Image bg clear|white|black (+ Fitzgerald scope)
 *  - #hidden_buttons Hidden button display
 *  - #prevent_hide_buttons (feature flag enable_all_buttons)
 *  - #dim_level Dimmed brightness → speak-mode dim class
 *  - #blank_status Status in empty vocalization box
 *  - #word_suggestions + #word_suggestion_position Word prediction
 *  - #word_suggestion_images Keyboard suggestion images
 *  - #high_contrast → board gets .high_contrast (images)
 *  - #dim_header → speak-mode #within_ember.dim_sides
 *  - #stretch_buttons (hidden in UI) Fill empty spaces
 *  - Editing Colors (extra-colors component)
 *
 * Selection Settings
 *  - #vocalize_buttons (+ advanced linked/spelling/click/vibrate/auto_home)
 *  - #highlighted_buttons / #highlighted_popup_text (advanced)
 *  - #device_home Select on press (activation_on_start) — id collision w/ device home
 *  - #swipe_pages Long swipe home/sidebar
 *  - #auto_inflections (feature flag)
 *  - #inflections_overlay Long-press inflections
 *  - #activation_location / #activation_cutoff / #activation_minimum / #debounce
 *
 * Logging and Sync
 *  - #logging Log Speak Mode actions
 *  - #limited_logging / logging PIN / #private_logging / cutoff (when logging on)
 *  - #allow_log_reports / allow_log_publishing / #geo_logging / #never_delete
 *  - #cookies Analytics cookies
 *  - #auto_sync / #sync_starred_boards / #skip_supervisee_sync
 *
 * Startup and Extras
 *  - #speak_mode_edit / #fullscreen (capability) / vocalize clear/repair/interrupt
 *  - #clear_vocalization_history (+ minutes/count)
 *  - #hide_gif / #battery_sounds / #wakelock (capability)
 *  - #speak_on_speak_mode / #board_jump_delay / #external_links
 *  - #sharing / #utterance_core_access / #auto_capitalize
 *  - #external_keyboard / #native_keyboard (flag) / new_index (no id)
 *
 * Core, Phrases and Modeling
 *  - remote_modeling* (feature flag) / core word list / substitutions (advanced)
 *  - #substitute_contractions / #recent_cleared_phrases / #multi_touch_modeling
 *
 * Sidebar and Shortcuts
 *  - #quick_sidebar / #disable_quick_sidebar / #lock_quick_sidebar
 *  - sidebar link editor / NFC tags (advanced)
 *
 * Device Preferences
 *  - Device Layout: #vocalization_height #button_spacing #button_border (adv)
 *    #button_text #button_text_position #utterance_text_only #flipped_* #button_style
 *    #always_show_back #disable_speak_options
 *  - Scanning Settings (advanced): #scanning + modes/keys/intervals
 *  - Dwell/Eye Tracking (advanced): #dwell + dwell_* options
 *  - Voice Settings: voice / alternate_voice pitch volume output
 *
 * C) Board-detail view prefs (/:user/board-detail/:board)
 *  - Light/Dark Mode toggle → .md-board-detail--dark + preferences.board_dark_mode
 *  - soft_borders / shrink_labels_to_fit / hide_speak_bar / folder_display_style
 *  - symbol_background / high_contrast also editable from display panel
 *
 * ---------------------------------------------------------------------------
 * This suite covers settings that are always present for a typical communicator
 * seed user, plus theme + board dark mode + high_contrast visual effect.
 * Capability/advanced/flag-gated controls are inventoried above but skipped
 * unless reliably available without flipping advanced mode.
 * ---------------------------------------------------------------------------
 */

test.describe.configure({ mode: 'serial' });

test.describe('user settings', () => {
  test.setTimeout(120_000);

  let username: string;

  test.beforeEach(async ({ page }) => {
    ({ username } = await loginAs(page));
  });

  test('preferences page is reachable after login', async ({ page }) => {
    await gotoPreferences(page, username);
    await expect(page.locator('#role')).toBeVisible();
    await expect(
      page.locator('.md-preferences__actions').getByRole('button', {
        name: /save preferences/i,
      })
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // A) Home Display Style (Dashboard Design — Gentle / Focused)
  // Color Tone / ll-bento-dark-toggle is not exposed on the home nav today.
  // -------------------------------------------------------------------------

  test('Display Style opens Dashboard Design and Focused View sets body.ll-layout-focused', async ({
    page,
  }) => {
    await page.goto(`/${username}/home`);
    await expect(page).toHaveURL(new RegExp(`/${username}/home/?$`));

    const wasFocused = await page.evaluate(() =>
      document.body.classList.contains('ll-layout-focused')
    );

    await openThemePicker(page);
    await selectThemeMode(page, 'Focused View');
    // Select (style step) → Done (customize step with .md-ds-sections).
    await finishDisplayStyleTour(page);

    // Closing after a change may hard-reload home; wait for Display Style again.
    await expect(page.getByRole('button', { name: 'Display Style' })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.locator('body')).toHaveClass(/ll-layout-focused/);

    // Restore Gentle View if we changed away from the prior layout.
    if (!wasFocused) {
      await openThemePicker(page);
      await selectThemeMode(page, 'Gentle View');
      await finishDisplayStyleTour(page);
      await expect(page.getByRole('button', { name: 'Display Style' })).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.locator('body')).not.toHaveClass(/ll-layout-focused/);
    }
  });

  test('Display Style can select Gentle View (clears focused body class)', async ({
    page,
  }) => {
    await page.goto(`/${username}/home`);

    await openThemePicker(page);
    await selectThemeMode(page, 'Gentle View');

    const option = page
      .locator('.shepherd-element.md-ds-modal')
      .filter({ has: page.locator('.md-ds-option') })
      .locator('.md-ds-option', { hasText: 'Gentle View' })
      .first();
    await expect(option).toHaveClass(/is-selected/);

    // Escape does not cancel this Shepherd tour; finish Select → Done instead.
    await finishDisplayStyleTour(page);
    await expect(page.getByRole('button', { name: 'Display Style' })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.locator('body')).not.toHaveClass(/ll-layout-focused/);
  });

  // -------------------------------------------------------------------------
  // B) Preferences page — checkbox persistence (toggle → save → reload)
  // -------------------------------------------------------------------------

  const checkboxCases: Array<{ id: string; section: string | RegExp }> = [
    { id: 'auto_open_speak_mode', section: /Basics/i },
    { id: 'high_contrast', section: /Styling/i },
    { id: 'dim_header', section: /Styling/i },
    { id: 'blank_status', section: /Styling/i },
    { id: 'word_suggestions', section: /Styling/i },
    { id: 'word_suggestion_images', section: /Styling/i },
    { id: 'vocalize_buttons', section: /Selection Settings/i },
    { id: 'swipe_pages', section: /Selection Settings/i },
    { id: 'inflections_overlay', section: /Selection Settings/i },
    { id: 'logging', section: /Logging and Sync/i },
    { id: 'cookies', section: /Logging and Sync/i },
    // Skip #auto_sync: device-scoped pref with computed default from
    // ever_synced / installed_app (browser_no_autosync). Toggle→save→reload
    // does not reliably show checked on web the way other prefs do.
    { id: 'speak_mode_edit', section: /Startup and Extras/i },
    { id: 'clear_on_vocalize', section: /Startup and Extras/i },
    { id: 'hide_gif', section: /Startup and Extras/i },
    { id: 'sharing', section: /Startup and Extras/i },
    { id: 'auto_capitalize', section: /Startup and Extras/i },
    { id: 'quick_sidebar', section: /Sidebar and Shortcuts/i },
    { id: 'always_show_back', section: /Device Layout/i },
    { id: 'disable_speak_options', section: /Device Layout/i },
  ];

  for (const { id, section } of checkboxCases) {
    test(`checkbox #${id} toggles and persists after Save Preferences`, async ({
      page,
    }) => {
      await toggleCheckboxAndAssertPersistence({
        page,
        username,
        section,
        id,
      });
    });
  }

  // -------------------------------------------------------------------------
  // B) Preferences page — bound-select persistence
  // -------------------------------------------------------------------------

  test('notification_frequency select persists after save', async ({ page }) => {
    await changeSelectAndAssertPersistence({
      page,
      username,
      section: /Notifications/i,
      selectId: 'notification_frequency',
    });
  });

  test('goal_notifications select persists after save', async ({ page }) => {
    await changeSelectAndAssertPersistence({
      page,
      username,
      section: /Notifications/i,
      selectId: 'goal_notifications',
    });
  });

  test('share_notifications select persists after save', async ({ page }) => {
    await changeSelectAndAssertPersistence({
      page,
      username,
      section: /Notifications/i,
      selectId: 'share_notifications',
    });
  });

  test('board_background select persists after save', async ({ page }) => {
    await changeSelectAndAssertPersistence({
      page,
      username,
      section: /Styling/i,
      selectId: 'board_background',
    });
  });

  test('symbol_background select persists after save', async ({ page }) => {
    await changeSelectAndAssertPersistence({
      page,
      username,
      section: /Styling/i,
      selectId: 'symbol_background',
    });
  });

  test('dim_level select persists after save', async ({ page }) => {
    await changeSelectAndAssertPersistence({
      page,
      username,
      section: /Styling/i,
      selectId: 'dim_level',
    });
  });

  test('locale select persists after save', async ({ page }) => {
    await changeSelectAndAssertPersistence({
      page,
      username,
      section: /Basics/i,
      selectId: 'locale',
    });
  });

  // -------------------------------------------------------------------------
  // Observable board effect: high_contrast
  // -------------------------------------------------------------------------

  test('high_contrast preference adds .high_contrast on a board after save', async ({
    page,
  }) => {
    await gotoPreferences(page, username);
    await expandPrefSection(page, /Styling/i);

    const original = await readCheckbox(page, 'high_contrast');
    await setCheckbox(page, 'high_contrast', true);
    await savePreferences(page);

    await page.goto(`/${DEFAULT_BOARD_PATH}`);
    await expect(page).toHaveURL(new RegExp(`/${DEFAULT_BOARD_PATH}/?$`));

    // Board controller appends "high_contrast" to the board class list.
    await expect
      .poll(
        async () => {
          const board = page.locator('#board, .board').first();
          if (!(await board.count())) return false;
          const cls = (await board.getAttribute('class')) || '';
          return /\bhigh_contrast\b/.test(cls);
        },
        {
          timeout: 45_000,
          message: 'Expected #board/.board to include high_contrast class',
        }
      )
      .toBe(true);

    // Restore
    await gotoPreferences(page, username);
    await expandPrefSection(page, /Styling/i);
    await setCheckbox(page, 'high_contrast', original);
    await savePreferences(page);
  });

  // -------------------------------------------------------------------------
  // C) Board-detail light/dark mode
  // -------------------------------------------------------------------------

  test('board-detail dark mode toggle applies md-board-detail--dark', async ({
    page,
  }) => {
    // Light/Dark lives on the edit-mode left panel (Board Display).
    // Speak-mode board-detail collapses the header Edit Board control
    // (board_collapsed), so go straight to the edit subroute.
    const boardSlug = DEFAULT_BOARD_PATH.split('/')[1] || 'yesno';
    await page.goto(`/${username}/board-detail/${boardSlug}/edit`);

    const shell = page.locator('.md-shell--board-detail').first();
    await expect(shell).toBeVisible({ timeout: 60_000 });
    await expect(page).toHaveURL(
      new RegExp(`/${username}/board-detail/${boardSlug}/edit`),
      { timeout: 60_000 }
    );
    await expect(page.locator('.md-board-edit-panel')).toBeVisible({
      timeout: 45_000,
    });

    // Expanded panel: Light/Dark under "Board Display". Collapsed rail
    // (narrow viewport): sun/moon pill with aria-label Toggle light or dark.
    const boardDisplay = page.getByRole('group', { name: /board display/i });
    const lightOpt = boardDisplay.getByRole('button', { name: /^light$/i });
    const darkOpt = boardDisplay.getByRole('button', { name: /^dark$/i });
    const pill = page.getByRole('switch', {
      name: /toggle light or dark mode/i,
    });

    if (await lightOpt.isVisible().catch(() => false)) {
      await darkOpt.click();
      await expect(shell).toHaveClass(/md-board-detail--dark/);
      await lightOpt.click();
      await expect(shell).not.toHaveClass(/md-board-detail--dark/);
      return;
    }

    await expect(pill).toBeVisible({ timeout: 15_000 });
    const wasDark = await shell.evaluate((el) =>
      el.classList.contains('md-board-detail--dark')
    );
    await pill.click();
    if (wasDark) {
      await expect(shell).not.toHaveClass(/md-board-detail--dark/);
    } else {
      await expect(shell).toHaveClass(/md-board-detail--dark/);
    }
    await pill.click();
    if (wasDark) {
      await expect(shell).toHaveClass(/md-board-detail--dark/);
    } else {
      await expect(shell).not.toHaveClass(/md-board-detail--dark/);
    }
  });

  // -------------------------------------------------------------------------
  // Activation-on-start (Select on Press) — uses id=device_home in Selection
  // -------------------------------------------------------------------------

  test('Select on Press (#device_home in Selection Settings) persists', async ({
    page,
  }) => {
    await gotoPreferences(page, username);
    await expandPrefSection(page, /Selection Settings/i);

    // Prefer the checkbox labeled for select-immediately within this section.
    const section = page
      .locator('.md-pref-box')
      .filter({
        has: page.locator('.md-pref-box__title', { hasText: /Selection Settings/i }),
      });
    const box = section.locator('#device_home');
    await expect(box).toBeVisible();

    const original = await box.isChecked();
    await box.click();
    await expect(box).toBeChecked({ checked: !original });
    await savePreferences(page);

    await gotoPreferences(page, username);
    await expandPrefSection(page, /Selection Settings/i);
    await expect(section.locator('#device_home')).toBeChecked({
      checked: !original,
    });

    await section.locator('#device_home').click();
    await expect(section.locator('#device_home')).toBeChecked({
      checked: original,
    });
    await savePreferences(page);
  });

  // -------------------------------------------------------------------------
  // Device layout selects
  // -------------------------------------------------------------------------

  test('button_text_position select persists after save', async ({ page }) => {
    await changeSelectAndAssertPersistence({
      page,
      username,
      section: /Device Layout/i,
      selectId: 'button_text_position',
    });
  });
});
