/*
 * Does the CHROME persist across the primary nav's destinations, the way a single-page app
 * is expected to behave?
 *
 * An earlier probe (pillnav-spa-continuity-qa.mjs) only asked "did the document reload?" and
 * "is a nav present?". Both passed, and both were the wrong question. What the user means by
 * SPA feel is: the left rail and the pill nav STAY PUT, unchanged except for the active pill,
 * while only the region below/right of the rail re-renders — and the nav stays visible when
 * the content scrolls.
 *
 * So this records, per destination:
 *   - is the RAIL present at all (it is the left panel that is supposed to persist)
 *   - is the PILL NAV present, and is it STICKY (does it stay on screen after scrolling)
 *   - the identity of the nav DOM node across transitions, to tell "persisted" from
 *     "destroyed and rebuilt to look the same"
 *
 *   node scripts/spa-chrome-persistence-qa.mjs --user marcus_williams_slp --pass 'demo2025!'
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const args = cliArgs(process.argv);
const BASE = args.arg('--base', 'http://localhost:8184');
const USER = args.arg('--user', 'marcus_williams_slp');
const PASS = args.arg('--pass', 'demo2025!');
const { browser, page } = await launch(args);

// Tag the live nav/rail nodes so we can tell on the next page whether they are the SAME
// elements (persisted) or fresh ones (torn down and rebuilt).
const tag = () => page.evaluate(() => {
  const n = document.querySelector('.md-pillnav');
  const r = document.querySelector('.md-acct-rail');
  if (n && !n.dataset.llTag) { n.dataset.llTag = 'nav-' + Date.now(); }
  if (r && !r.dataset.llTag) { r.dataset.llTag = 'rail-' + Date.now(); }
  return { nav: n ? n.dataset.llTag : null, rail: r ? r.dataset.llTag : null };
});

const probe = () => page.evaluate(() => {
  const vis = (el) => {
    if (!el) { return false; }
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getBoundingClientRect().height > 0;
  };
  const nav = document.querySelector('.md-pillnav');
  const rail = document.querySelector('.md-acct-rail');
  return {
    url: location.pathname + location.search,
    railPresent: vis(rail),
    navPresent: vis(nav),
    navTag: nav ? (nav.dataset.llTag || null) : null,
    railTag: rail ? (rail.dataset.llTag || null) : null,
    navTopBeforeScroll: nav ? Math.round(nav.getBoundingClientRect().top) : null,
    navPosition: nav ? getComputedStyle(nav).position : null
  };
});

const scrollAndCheckSticky = () => page.evaluate(async () => {
  const nav = document.querySelector('.md-pillnav');
  if (!nav) { return { scrolled: 0, navTopAfter: null, stillVisible: false }; }
  const before = Math.round(nav.getBoundingClientRect().top);
  // scroll whichever container actually scrolls
  const cands = [document.scrollingElement, document.getElementById('content'),
    ...Array.from(document.querySelectorAll('div,main,section'))
      .filter((e) => e.scrollHeight - e.clientHeight > 120)];
  let scrolled = 0;
  for (const c of cands) {
    if (!c) { continue; }
    const prev = c.scrollTop; c.scrollTop = prev + 600;
    if (c.scrollTop > prev) { scrolled = c.scrollTop - prev; break; }
  }
  await new Promise((r) => setTimeout(r, 450));
  const after = Math.round(nav.getBoundingClientRect().top);
  const vh = window.innerHeight;
  return { scrolled, navTopBefore: before, navTopAfter: after, stillVisible: after > -5 && after < vh };
});

await page.setViewport({ width: 1440, height: 800 });
await login(page, { BASE, USER, PASS });
await page.goto(`${BASE}/${USER}/home`, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));
await tag();

const rows = [];
async function visit(label) {
  const before = await probe();
  if (label) {
    const pills = await page.$$('.md-pillnav__pill');
    let hit = false;
    for (const el of pills) {
      const t = await page.evaluate((e) => (e.textContent || '').trim(), el);
      if (new RegExp('^' + label, 'i').test(t)) { await el.click(); hit = true; break; }
    }
    if (!hit) { console.log(`\n${label}: pill not found`); return; }
    await new Promise((r) => setTimeout(r, 2800));
  }
  const p = await probe();
  const sticky = await scrollAndCheckSticky();
  rows.push({ label: label || 'Home (start)', ...p, ...sticky, prevNavTag: before.navTag });
  console.log(`\n== ${label || 'Home (start)'} -> ${p.url}`);
  console.log(`   rail present : ${p.railPresent}`);
  console.log(`   nav present  : ${p.navPresent}   css position: ${p.navPosition}`);
  console.log(`   nav node     : ${p.navTag ? 'SAME node persisted' : 'NEW node (rebuilt)'}`);
  console.log(`   on scroll    : scrolled ${sticky.scrolled}px, nav top ${sticky.navTopBefore} -> ${sticky.navTopAfter}, still visible: ${sticky.stillVisible}`);
  await tag();
  await page.evaluate(() => { const c = document.getElementById('content'); if (c) { c.scrollTop = 0; } window.scrollTo(0,0); });
}

await visit(null);
for (const l of ['Caseload', 'Boards', 'Extras', 'Updates', 'Home']) { await visit(l); }

console.log('\n=== AGAINST THE STATED SPA CRITERIA ===');
const nav = rows.filter((r) => r.navPresent).length;
const rail = rows.filter((r) => r.railPresent).length;
const persisted = rows.filter((r) => r.navTag).length;
const sticky = rows.filter((r) => r.stillVisible && r.scrolled > 0).length;
const scrollable = rows.filter((r) => r.scrolled > 0).length;
console.log(`destinations visited        : ${rows.length}`);
console.log(`left rail present           : ${rail}/${rows.length}   <- should be all`);
console.log(`pill nav present            : ${nav}/${rows.length}`);
console.log(`nav SURVIVED the transition : ${persisted}/${rows.length}   <- same DOM node, not a rebuild`);
console.log(`nav stayed visible on scroll: ${sticky}/${scrollable} of the pages that could scroll`);
console.log('\npages MISSING the rail: ' + (rows.filter((r) => !r.railPresent).map((r) => r.label).join(', ') || 'none'));
await browser.close();
