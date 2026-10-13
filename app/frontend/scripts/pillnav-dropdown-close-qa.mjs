/*
 * Collapsed primary nav (UserPillNav's <details> dropdown): does it close once you are done
 * with it, and does it swap with the pill row at the 640px breakpoint?
 *
 * Written for the PR #1108 follow-up: "the collapsed nav dropdown stays open after you choose
 * a page (open is still true on /caseload after choosing Caseload)". Also automates that PR's
 * manual click-test request (600px dropdown replaces the pills, a choice navigates, 641px
 * brings the pills back).
 *
 * Checks, each reported PASS/FAIL, exit code 1 on any FAIL:
 *   1. 600px: the pill row is hidden and the dropdown is shown.
 *   2. Choosing an option navigates to that page AND leaves the dropdown closed.
 *   3. Escape closes an open dropdown.
 *   4. A click outside closes an open dropdown.
 *   5. 641px: the pill row is back and the dropdown is hidden.
 *
 *   node scripts/pillnav-dropdown-close-qa.mjs --user marcus_williams_slp --pass 'demo2025!'
 *   node scripts/pillnav-dropdown-close-qa.mjs --user example --pass password
 */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const args = cliArgs(process.argv);
const { browser, page } = await launch(args);
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };
const settle = (ms) => new Promise(r => setTimeout(r, ms));

// The primary-nav dropdown, NOT the org switcher (which carries --fit) or the account nav.
const DD = 'details.md-pillnav-dropdown--primary';

const state = () => page.evaluate((sel) => {
  const shown = el => { if (!el) { return false; } const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.height > 0; };
  const dd = document.querySelector(sel);
  const pills = Array.from(document.querySelectorAll('.md-pillnav__pill')).filter(shown);
  return { path: location.pathname, ddShown: shown(dd), ddOpen: !!(dd && dd.open), pills: pills.length };
}, DD);

// Start from a known CLOSED state so a dropdown left open by the previous step cannot turn
// this click into a close.
const openDropdown = async () => {
  await page.evaluate((sel) => { const d = document.querySelector(sel); if (d) { d.open = false; } }, DD);
  await page.click(`${DD} > summary`);
  await settle(300);
};

try {
  await login(page, args);
  await page.setViewport({ width: 600, height: 900 });
  await page.goto(args.BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector(DD, { timeout: 30000 });
  await settle(1500);

  let s = await state();
  check('600px: dropdown shown, pill row hidden', s.ddShown && s.pills === 0, `dropdown shown=${s.ddShown}, visible pills=${s.pills}`);

  // 2. Choose an option that is not the current page and confirm navigation + closed.
  await openDropdown();
  s = await state();
  const target = await page.evaluate((sel) => {
    const opts = Array.from(document.querySelectorAll(`${sel} .md-pillnav-dropdown__option`));
    const pick = opts.find(o => !o.classList.contains('is-active') && /\/boards$/.test(o.getAttribute('href') || '')) || opts.find(o => !o.classList.contains('is-active'));
    if (!pick) { return null; }
    pick.setAttribute('data-qa-pick', '1');
    return pick.getAttribute('href');
  }, DD);
  const before = s.path;
  await page.click(`${DD} [data-qa-pick="1"]`);
  await page.waitForFunction((t) => location.pathname === t, { timeout: 15000 }, target).catch(() => {});
  await settle(1000);
  s = await state();
  check('choosing an option navigates', !!target && s.path === target && s.path !== before, `from ${before} to ${s.path}, expected ${target}`);
  check('choosing an option leaves the dropdown closed', !s.ddOpen, `open=${s.ddOpen}`);

  // 3. Escape closes.
  await openDropdown();
  const openedForEsc = (await state()).ddOpen;
  await page.keyboard.press('Escape');
  await settle(300);
  s = await state();
  check('Escape closes the dropdown', openedForEsc && !s.ddOpen, `opened=${openedForEsc}, open after Escape=${s.ddOpen}`);

  // 4. Outside click closes. Click a point well below the header, outside the dropdown.
  await openDropdown();
  const openedForOutside = (await state()).ddOpen;
  await page.mouse.click(300, 860);
  await settle(300);
  s = await state();
  check('clicking outside closes the dropdown', openedForOutside && !s.ddOpen, `opened=${openedForOutside}, open after outside click=${s.ddOpen}`);

  // 5. Above the breakpoint the pills come back.
  await page.setViewport({ width: 641, height: 900 });
  await settle(800);
  s = await state();
  check('641px: pill row shown, dropdown hidden', !s.ddShown && s.pills > 0, `dropdown shown=${s.ddShown}, visible pills=${s.pills}`);
} finally {
  await browser.close();
}

const failed = results.filter(ok => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
