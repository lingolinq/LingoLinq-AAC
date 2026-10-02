// Browser check: switching view (navbar View menu) while on an `obf/...` board leaves the user on a
// working page, not stranded (2026-10-02, requested: "ui test to check that it actually lands on an
// error page").
//
// HOW A USER GETS THERE: Liked Boards opens `obf/stars-<id>` in Speak mode
// (controllers/user/index.js load_starred). Leaving Speak mode keeps that board on screen in the
// legacy board page, whose header carries the View menu (templates/application.hbs). The switcher
// (components/view-switcher.js _apply_view) splits the board key into owner/boardname, so "obf"
// becomes a user name.
//
// FOUND 2026-10-02, both directions: the route becomes `user` while the address stays
// /obf/stars-self, the header is empty (no logo, menu or View button) and the board tiles are left
// unstyled -- no navigation but the browser's Back. This script FAILS until that is fixed.
//
// Passes when, after the switch, the page is either still the board (`board.index`) or a normal page
// whose address matches it -- not `user` at /obf/.... DATA: example's view preference is switched and restored.
// Localhost only. Usage: node scripts/view-switch-obf-board-qa.mjs [--headed]

import { cliArgs, launch, login } from './qa-helpers.mjs';

const { BASE, USER, PASS, HEADED } = cliArgs(process.argv);
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error(`REFUSING: --base must be localhost, got ${BASE}`); process.exit(2);
}
const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const getView = (page) => page.evaluate(() => window.appState.get('currentUser.preferences.board_view_style'));
const setView = (page, v) => page.evaluate(async (style) => { const u = window.appState.get('currentUser'); u.set('preferences.board_view_style', style); await u.save(); }, v);
const state = (page) => page.evaluate(() => ({
  path: location.pathname,
  route: window.appState.get('current_route'),
  speak: !!window.appState.get('speak_mode'),
  switcher: [...document.querySelectorAll('.ll-viewswitch__trigger')].some((b) => b.getClientRects().length)
}));

const { browser, page } = await launch({ HEADED });
let original = null;
try {
  await login(page, { BASE, USER, PASS });
  await page.setViewport({ width: 1280, height: 900 });
  original = await getView(page);
  for (const [from, target] of [['modern', 'Basic View'], ['classic', 'Modern View']]) {
    console.log(`\n${from} -> ${target}`);
    await setView(page, from);
    await page.goto(`${BASE}/${USER}`, { waitUntil: 'networkidle2', timeout: 60000 });
    await wait(3000);
    await page.evaluate(() => window.appState.home_in_speak_mode({ force_board_state: { key: 'obf/stars-self' } }));
    await wait(5000);
    await page.evaluate(() => window.appState.toggle_mode('speak'));
    await wait(4000);
    const before = await state(page);
    record('on Liked Boards, out of Speak mode, View menu offered', before.path === '/obf/stars-self' && !before.speak && before.switcher, JSON.stringify(before));
    if (!before.switcher) { continue; }
    await page.click('.ll-viewswitch__trigger');
    await wait(400);
    await page.evaluate((t) => { const b = [...document.querySelectorAll('.ll-viewswitch__item')].find((x) => x.textContent.includes(t)); b && b.click(); }, target);
    await wait(5000);
    const after = await state(page);
    // Broken state: the router left on `user` while the address is still the obf board.
    const ok = after.route === 'board.index' || !/^\/obf\//.test(after.path);
    record('after switching: still the board, or a real page at a matching address', ok, JSON.stringify(after));
  }
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
