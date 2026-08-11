import { expect, type Locator, type Page } from '@playwright/test';

/** Preferences route: /:user_name/preferences */
export function preferencesPath(username: string): string {
  return `/${username}/preferences`;
}

/** Open the preferences page and wait for the main form shell. */
export async function gotoPreferences(
  page: Page,
  username: string
): Promise<void> {
  await page.goto(preferencesPath(username));
  await expect(page).toHaveURL(new RegExp(`/${username}/preferences/?$`));
  await expect(page.locator('.md-preferences')).toBeVisible({ timeout: 45_000 });
  // Page title h2 is not always exposed in the a11y tree; Basics is always open.
  await expect(
    page.locator('.md-pref-box__title', { hasText: /Basics/i }).first()
  ).toBeVisible();
}

/**
 * Expand a preference-box section by its visible title (e.g. "Styling").
 * Basics is open by default; others start collapsed.
 */
export async function expandPrefSection(
  page: Page,
  title: string | RegExp
): Promise<Locator> {
  const box = page
    .locator('.md-pref-box')
    .filter({ has: page.locator('.md-pref-box__title', { hasText: title }) });
  await expect(box).toBeVisible();

  const header = box.locator('button.md-pref-box__header');
  const expanded = await header.getAttribute('aria-expanded');
  if (expanded !== 'true') {
    await header.click();
  }
  await expect(header).toHaveAttribute('aria-expanded', 'true');
  return box;
}

/** Click Save Preferences and wait until we leave the preferences route. */
export async function savePreferences(page: Page): Promise<void> {
  await dismissBlockingModals(page);

  const save = page
    .locator('.md-preferences__actions')
    .getByRole('button', { name: /save preferences/i });
  await expect(save).toBeVisible();
  await save.click();

  // savePreferences transitions to the user route on success.
  await page.waitForURL((url) => !/\/preferences\/?$/.test(url.pathname), {
    timeout: 60_000,
  });
}

/** Close preference-triggered modals (e.g. enable-logging) that cover Save. */
export async function dismissBlockingModals(page: Page): Promise<void> {
  // enable-logging modal: heading "Logging is Enabled", footer Close
  const loggingDialog = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: /logging is enabled/i }) });
  if (await loggingDialog.isVisible().catch(() => false)) {
    await loggingDialog.locator('button.md-modal-btn--cancel').click();
    await expect(loggingDialog).toHaveCount(0, { timeout: 15_000 });
  }

  // Beta feedback drawer sometimes overlays the page mid-suite
  const hideBeta = page.getByRole('button', { name: /^hide$/i });
  if (await hideBeta.isVisible().catch(() => false)) {
    await hideBeta.click();
  }
}

export async function checkboxById(page: Page, id: string): Promise<Locator> {
  // Some ids appear more than once in the template (e.g. sync_starred_boards).
  return page.locator(`#${id}`).first();
}

export async function readCheckbox(page: Page, id: string): Promise<boolean> {
  return (await checkboxById(page, id)).isChecked();
}

export async function setCheckbox(
  page: Page,
  id: string,
  checked: boolean
): Promise<void> {
  const box = await checkboxById(page, id);
  await expect(box).toBeVisible();
  if ((await box.isChecked()) !== checked) {
    await box.click();
  }
  await expect(box).toBeChecked({ checked });
  // Enabling #logging opens enable-logging modal immediately.
  await dismissBlockingModals(page);
}

/**
 * Custom Ember bound-select: trigger is a button with the given id;
 * options live in a listbox role="option".
 *
 * Note: options with `id: ''` (e.g. notification_frequency "Don't Email Me…")
 * only show their name via an in-memory `_chosenLabel`. After reload,
 * `selectedItem` treats ''/null as unset and the trigger shows "- Select -".
 * Persistence helpers must skip those options (see `isEmptyBoundSelectLabel`).
 */
export async function selectBoundOption(
  page: Page,
  selectId: string,
  optionName: string | RegExp
): Promise<void> {
  const trigger = page.locator(`#${selectId}`);
  await expect(trigger).toBeVisible();
  await trigger.click();

  const list = page.locator('.bound-select__list[role="listbox"]');
  await expect(list).toBeVisible();
  await list.getByRole('option', { name: optionName }).click();
  await expect(list).toHaveCount(0);
}

/**
 * Labels that collapse to the placeholder after reload because the option
 * id is empty string (bound-select.js selectedItem returns null for '').
 */
const EMPTY_ID_OPTION_LABELS: RegExp[] = [
  /^don't email me communicator reports$/i,
];

/** True when the trigger text represents an unset / empty-string selection. */
export function isEmptyBoundSelectLabel(label: string): boolean {
  if (!label || label === '- Select -') return true;
  return EMPTY_ID_OPTION_LABELS.some((re) => re.test(label));
}

/** Compare trigger labels, treating empty-id / placeholder as equivalent. */
export function boundSelectLabelsMatch(expected: string, actual: string): boolean {
  if (expected === actual) return true;
  return isEmptyBoundSelectLabel(expected) && isEmptyBoundSelectLabel(actual);
}

/** Pick any listbox option whose label differs from the current trigger text. */
export async function selectDifferentBoundOption(
  page: Page,
  selectId: string
): Promise<{ previous: string; next: string }> {
  const previous = await readBoundSelectLabel(page, selectId);
  const trigger = page.locator(`#${selectId}`);
  await trigger.click();

  const list = page.locator('.bound-select__list[role="listbox"]');
  await expect(list).toBeVisible();
  const options = list.getByRole('option');
  const count = await options.count();
  expect(count).toBeGreaterThan(1);

  let chosen = '';
  for (let i = 0; i < count; i++) {
    const text = ((await options.nth(i).textContent()) || '').trim();
    if (!text || text === previous) continue;
    // Skip empty-id options — they look selected until reload, then become
    // "- Select -", which is not a durable label change for e2e asserts.
    if (EMPTY_ID_OPTION_LABELS.some((re) => re.test(text))) continue;
    await options.nth(i).click();
    chosen = text;
    break;
  }
  expect(chosen).not.toEqual('');
  await expect(list).toHaveCount(0);
  const next = await readBoundSelectLabel(page, selectId);
  return { previous, next };
}

export async function readBoundSelectLabel(
  page: Page,
  selectId: string
): Promise<string> {
  const trigger = page.locator(`#${selectId}`);
  await expect(trigger).toBeVisible();
  return ((await trigger.locator('.bound-select__trigger-text').textContent()) || '').trim();
}

/**
 * Toggle a preferences checkbox, save, reload preferences, assert value,
 * then restore the original value (also saved) so shared accounts stay clean.
 */
export async function toggleCheckboxAndAssertPersistence(opts: {
  page: Page;
  username: string;
  section: string | RegExp;
  id: string;
}): Promise<void> {
  const { page, username, section, id } = opts;

  await gotoPreferences(page, username);
  await expandPrefSection(page, section);

  const original = await readCheckbox(page, id);
  const next = !original;

  await setCheckbox(page, id, next);
  await savePreferences(page);

  await gotoPreferences(page, username);
  await expandPrefSection(page, section);
  await expect(await checkboxById(page, id)).toBeChecked({ checked: next });

  // Restore
  await setCheckbox(page, id, original);
  await savePreferences(page);

  await gotoPreferences(page, username);
  await expandPrefSection(page, section);
  await expect(await checkboxById(page, id)).toBeChecked({ checked: original });
}

/**
 * Change a bound-select to a different option, save, reload, assert, restore.
 * Pass `pickOther` for a specific alternate label, or omit to pick any other option.
 */
export async function changeSelectAndAssertPersistence(opts: {
  page: Page;
  username: string;
  section: string | RegExp;
  selectId: string;
  pickOther?: (currentLabel: string) => string | RegExp;
}): Promise<void> {
  const { page, username, section, selectId, pickOther } = opts;

  await gotoPreferences(page, username);
  await expandPrefSection(page, section);

  let originalLabel: string;
  let afterChange: string;

  if (pickOther) {
    originalLabel = await readBoundSelectLabel(page, selectId);
    await selectBoundOption(page, selectId, pickOther(originalLabel));
    afterChange = await readBoundSelectLabel(page, selectId);
  } else {
    const picked = await selectDifferentBoundOption(page, selectId);
    originalLabel = picked.previous;
    afterChange = picked.next;
  }

  expect(boundSelectLabelsMatch(afterChange, originalLabel)).toBe(false);
  await savePreferences(page);

  await gotoPreferences(page, username);
  await expandPrefSection(page, section);
  await expect
    .poll(async () => {
      const label = await readBoundSelectLabel(page, selectId);
      return boundSelectLabelsMatch(afterChange, label);
    })
    .toBe(true);

  // Restore prior selection when possible. Unset ("- Select -") cannot always
  // be restored via the UI (no empty-id option), so restore may be skipped.
  const restoreStatus = await restoreBoundSelect(page, selectId, originalLabel);
  if (restoreStatus === 'skipped') {
    return;
  }
  await savePreferences(page);

  await gotoPreferences(page, username);
  await expandPrefSection(page, section);
  await expect
    .poll(async () => {
      const label = await readBoundSelectLabel(page, selectId);
      return boundSelectLabelsMatch(originalLabel, label);
    })
    .toBe(true);
}

/**
 * Restore a bound-select to a prior trigger label.
 * Returns 'restored' when a durable prior value was re-selected, or 'skipped'
 * when the original was unset and there is no empty-id option to put it back.
 */
export async function restoreBoundSelect(
  page: Page,
  selectId: string,
  originalLabel: string
): Promise<'restored' | 'skipped'> {
  if (originalLabel && !isEmptyBoundSelectLabel(originalLabel)) {
    await selectBoundOption(page, selectId, originalLabel);
    return 'restored';
  }

  // Original was unset / empty-string id. Prefer an empty-id option if present
  // (e.g. notification_frequency "Don't Email Me…"); otherwise there is no UI
  // path back to unset (e.g. goal_notifications).
  const trigger = page.locator(`#${selectId}`);
  await trigger.click();
  const list = page.locator('.bound-select__list[role="listbox"]');
  await expect(list).toBeVisible();
  const options = list.getByRole('option');
  const count = await options.count();
  for (let i = 0; i < count; i++) {
    const text = ((await options.nth(i).textContent()) || '').trim();
    if (EMPTY_ID_OPTION_LABELS.some((re) => re.test(text))) {
      await options.nth(i).click();
      await expect(list).toHaveCount(0);
      return 'restored';
    }
  }
  await page.keyboard.press('Escape');
  await expect(list).toHaveCount(0);
  return 'skipped';
}

/**
 * Home-nav "Display Style" control (`.md-display-style__trigger`).
 *
 * Note: this is NOT the Color Tone / `ll-bento-dark-toggle` picker — that
 * control is speak-mode-only or hidden (`display:none` / HTML-commented) on
 * the home dashboard. Display Style opens the Shepherd Dashboard Design
 * modal (Gentle View / Focused View).
 */
export const DISPLAY_STYLE_MODAL = '.shepherd-element.md-ds-modal';

/** Open the home Display Style → Dashboard Design Shepherd modal. */
export async function openThemePicker(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Display Style' });
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  await toggle.click();
  await expect(page.locator(DISPLAY_STYLE_MODAL).first()).toBeVisible({
    timeout: 30_000,
  });
}

/**
 * From an open Display Style modal: advance past welcome if needed, then
 * pick Gentle View or Focused View on the display-style step.
 */
export async function selectThemeMode(
  page: Page,
  layoutLabel: 'Gentle View' | 'Focused View'
): Promise<void> {
  const modal = page.locator(DISPLAY_STYLE_MODAL).first();
  await expect(modal).toBeVisible();

  // Step 1 is welcome ("Get started"); layout cards live on step 2.
  const getStarted = modal.getByRole('button', { name: /get started/i });
  if (await getStarted.isVisible().catch(() => false)) {
    await getStarted.click();
  }

  // Step 2 — "Choose your display style" (Gentle / Focused cards).
  const styleStep = page.locator(DISPLAY_STYLE_MODAL).filter({
    has: page.locator('.md-ds-option'),
  });
  await expect(styleStep).toBeVisible({ timeout: 30_000 });

  const option = styleStep.locator('.md-ds-option', { hasText: layoutLabel });
  await expect(option).toBeVisible();
  await option.click();
  await expect(option).toHaveClass(/is-selected/);
}

/**
 * Finish the Dashboard Design tour after a layout is chosen:
 * step 2 footer "Select" → step 3 customize (checkbox list) → "Done".
 *
 * Steps 2 and 3 both use `md-ds-modal--display` in source, so do not key
 * off that class alone — differentiate by content (.md-ds-option vs
 * .md-ds-sections) and role-based footer buttons.
 */
export async function finishDisplayStyleTour(page: Page): Promise<void> {
  const styleStep = page.locator(DISPLAY_STYLE_MODAL).filter({
    has: page.locator('.md-ds-option'),
  });
  await expect(styleStep).toBeVisible();
  await styleStep.getByRole('button', { name: /^select$/i }).click();

  // Step 3 — "Customize your dashboard" (section checkboxes + Done).
  const customizeStep = page.locator(DISPLAY_STYLE_MODAL).filter({
    has: page.locator('.md-ds-sections'),
  });
  await expect(customizeStep).toBeVisible({ timeout: 30_000 });
  const done = customizeStep.getByRole('button', { name: /^done$/i });
  await expect(done).toBeVisible({ timeout: 30_000 });
  await done.click();
}
