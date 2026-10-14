// Browser check: switching Basic -> Modern from the Basic home lands on the Modern page for the tab
// you were on (2026-10-02, requested: "switching from basic to modern -> implement it").
//
// Per case: Basic home, put the page in that state with its own controls (tab click, Extras card,
// a communicator's Extras button), switch with the View menu, record where it lands, then switch
// back to Basic for the next case.
//   Communicators (a card expanded) -> /caseload?supervisee=<that communicator>
//   Boards -> /<me>/boards          Updates -> /<me>/logs?type=note&nav=home (Updates pill on)
//   Actions with the Extras drawer open -> /<me>/extras          Actions -> stays on /<me>/home
//
// DATA: the user's view preference is switched and restored in a finally. Opening Updates marks
// notifications read, as a click on that tab always does. Localhost only.
// Usage: node scripts/view-switch-modern-landing-qa.mjs [--user sarah_chen_slp --pass demo2025!] [--headed]

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
const getView = (page) => page.evaluate(() => window.appState.get('currentUser.preferences.board_view_style'));
const setView = (page, v) => page.evaluate(async (style) => { const u = window.appState.get('currentUser'); u.set('preferences.board_view_style', style); await u.save(); }, v);
const here = (page) => page.evaluate(() => location.pathname + location.search);
const clickTab = (page, label) => page.evaluate((l) => { const b = [...document.querySelectorAll('.ch-tabs .ch-tab')].find((x) => x.textContent.trim().startsWith(l)); if (b) { b.click(); } return !!b; }, label);
const switchTo = async (page, label) => {
  await page.click('.ll-viewswitch__trigger');
  await wait(400);
  await page.evaluate((t) => { const b = [...document.querySelectorAll('.ll-viewswitch__item')].find((x) => x.textContent.includes(t)); b && b.click(); }, label);
  await wait(4500);
};

const CASES = [
  { name: 'Communicators, a card expanded', expect: (p) => p.startsWith('/caseload?supervisee='), setup: async (page) => {
    await clickTab(page, 'Communicators'); await wait(1500);
    return page.evaluate(() => { const b = document.querySelector('.ch-comm [aria-controls^="ch-extras-"], .ch-comm button[aria-expanded]'); if (b) { b.click(); } return !!b; });
  } },
  { name: 'Boards', expect: (p) => p === `/${USER}/boards`, setup: (page) => clickTab(page, 'Boards') },
  { name: 'Updates', expect: (p) => p.startsWith(`/${USER}/logs`) && p.includes('nav=home') && p.includes('type=note'), setup: (page) => clickTab(page, 'Updates') },
  { name: 'Actions, Extras drawer open', expect: (p) => p === `/${USER}/extras`, setup: async (page) => {
    await clickTab(page, 'Actions'); await wait(1000);
    return page.evaluate(() => { const b = [...document.querySelectorAll('button, a')].find((x) => /Extras/.test(x.textContent) && x.getClientRects().length && /toggle|ch-tile|extras/i.test(x.className + (x.getAttribute('aria-controls') || ''))); if (b) { b.click(); } return !!b; });
  } },
  { name: 'Actions', expect: (p) => p === `/${USER}/home`, setup: (page) => clickTab(page, 'Actions') }
];

const { browser, page } = await launch({ HEADED });
let original = null;
try {
  await login(page, { BASE, USER, PASS });
  await page.setViewport({ width: 1280, height: 900 });
  original = await getView(page);
  for (const c of CASES) {
    await setView(page, 'classic');
    await page.goto(`${BASE}/${USER}/home`, { waitUntil: 'networkidle2', timeout: 60000 });
    await wait(3500);
    const ready = await c.setup(page);
    await wait(1200);
    const place = await page.evaluate(() => JSON.stringify(window.appState.get('basic_home_place')));
    await switchTo(page, 'Modern View');
    const landed = await here(page);
    record(`${c.name} -> ${landed}`, ready !== false && c.expect(landed), `place ${place}`);
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
