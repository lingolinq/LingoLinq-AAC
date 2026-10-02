// Browser check: after switching from Modern to Basic, the Back button walks back through history
// instead of looping (2026-10-02, requested: "fix the back-button loop").
//
// The loop: Modern-only pages visited BEFORE the switch (Caseload, My Boards) are still in the
// browser history. Back to one of them makes its route send a Basic viewer to the Basic landing,
// and that redirect used to ADD a history entry, so the next Back hit the same page again and was
// redirected again -- the user could never get back past it.
//
// Flow (one signed-in session, in-app navigation only, so Back is a real single-page popstate):
// sarah (Modern) home -> Caseload -> My Boards -> Reports, then View menu -> Basic View, then Back
// up to 6 times. Passes when Back gets out past the pages visited
// (to the login page or before), rather than circling between the home page and a Modern-only page.
//
// DATA: sarah's view preference is switched and restored in a finally. Localhost only.
// Usage: node scripts/view-switch-back-loop-qa.mjs [--headed]

import { cliArgs, launch, login } from './qa-helpers.mjs';

const { BASE, HEADED, arg } = cliArgs(process.argv);
const USER = arg('--user', 'sarah_chen_slp');
const PASS = arg('--pass', 'demo2025!');
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error(`REFUSING: --base must be localhost, got ${BASE}`); process.exit(2);
}
const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const path = (page) => page.evaluate(() => location.pathname);
const getView = (page) => page.evaluate(() => window.appState.get('currentUser.preferences.board_view_style'));
const setView = (page, v) => page.evaluate(async (style) => { const u = window.appState.get('currentUser'); u.set('preferences.board_view_style', style); await u.save(); }, v);
const go = (page, route, ...models) => page.evaluate((r, m) => {
  const { getOwner } = window.requirejs('@ember/application');
  getOwner(window.appState).lookup('service:router').transitionTo(r, ...m);
}, route, models);

const { browser, page } = await launch({ HEADED });
let original = null;
try {
  await login(page, { BASE, USER, PASS });
  await page.setViewport({ width: 1280, height: 900 });
  original = await getView(page);
  await setView(page, 'modern');
  await page.goto(`${BASE}/${USER}/home`, { waitUntil: 'networkidle2', timeout: 60000 });
  await wait(3000);
  const start = await path(page);
  for (const [route, ...models] of [['caseload'], ['user.boards', USER], ['user.stats', USER]]) {
    await go(page, route, ...models);
    await wait(2500);
  }
  const before = await path(page);
  record('built the Modern history in-app', before === `/${USER}/stats`, `start ${start}, now ${before}`);

  // Switch with the View menu, as a user would.
  await page.click('.ll-viewswitch__trigger');
  await wait(400);
  await page.evaluate(() => { const b = [...document.querySelectorAll('.ll-viewswitch__item')].find((x) => /Basic View/.test(x.textContent)); b && b.click(); });
  await wait(3500);
  record('switched to Basic', (await getView(page)) === 'classic');

  // Six Back presses, whatever happens. The Basic landing is the home page, the same address the
  // trail started on, so reaching it once proves nothing: the loop shows as Back never getting
  // further back than it. (history.length does not show it: each pushed redirect also discards
  // the forward entries, so the length stays the same.)
  const trail = [{ path: await path(page) }];
  for (let i = 0; i < 6; i++) {
    await page.goBack({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => null);
    await wait(2500);
    const now = await path(page).catch(() => '(left the app)');
    trail.push({ path: now });
    if (!now.startsWith('/' + USER) && now !== '/caseload') { break; }
  }
  console.log('  Back trail:', trail.map((t) => t.path).join('  <-  '));
  const escaped = trail.slice(1).some((t) => !t.path.startsWith('/' + USER) && t.path !== '/caseload');
  record('Back gets past the Modern-only pages within 6 presses', escaped, escaped ? `reached ${trail[trail.length - 1].path}` : 'still inside after 6');
} catch (e) {
  console.error('  harness error:', e && e.message);
  results.push({ name: 'harness', pass: false });
} finally {
  if (original) {
    await setView(page, original).catch(() => {});
    record(`${USER}'s view restored`, (await getView(page).catch(() => null)) === original, original);
  }
  await browser.close();
}
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed} passed / ${failed} failed`);
if (!results.length) { console.log('NO CHECKS RAN, treating as a failure.'); process.exit(1); }
process.exit(failed ? 1 : 0);
