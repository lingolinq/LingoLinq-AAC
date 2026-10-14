/*
 * Does moving between the primary nav's destinations feel like ONE app?
 *
 * The app was already an SPA -- no pill reloads the document. The defect Unit 2 targets
 * is PERCEIVED continuity: until 2026-09-21 the dashboard carried its own hand-written
 * copy of the pill row (plus its own collapsed dropdown), so arriving on Home or Extras
 * swapped one nav implementation for another. Different element types, different active
 * state, no aria-current on one of them.
 *
 * This walks Home -> Caseload -> Organizations -> Boards -> Extras -> Updates by CLICKING,
 * never by goto (a goto would reload the document and prove nothing about in-app
 * navigation), and after each hop records:
 *   - did the document reload?  Detected with a window sentinel, NOT framenavigated,
 *     which also fires on pushState and so cannot tell the two apart.
 *   - is the nav still there, and is it the SAME implementation?
 *   - which pill is marked current, and does it match where we landed?
 *   - does the current pill carry aria-current, the thing the dashboard copy never set?
 *
 *   node scripts/pillnav-spa-continuity-qa.mjs --user lingolinq_admin --pass 'admin2025!'
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const args = cliArgs(process.argv);
const BASE = args.arg('--base', 'http://localhost:8184');
const USER = args.arg('--user', 'lingolinq_admin');
const PASS = args.arg('--pass', 'admin2025!');
const { browser, page } = await launch(args);

const SENTINEL = () => { window.__ll_spa_sentinel = true; };
const plant = () => page.evaluate(SENTINEL);
const survived = () => page.evaluate(() => window.__ll_spa_sentinel === true);

const snapshot = () => page.evaluate(() => {
  const vis = (el) => {
    if (!el) { return false; }
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getBoundingClientRect().height > 0;
  };
  const nav = document.querySelector('.md-pillnav');
  const pills = Array.from(document.querySelectorAll('.md-pillnav__pill')).filter(vis);
  const current = pills.find((p) => p.classList.contains('is-active') || p.classList.contains('active'));
  return {
    url: location.pathname + location.search,
    navPresent: vis(nav),
    // The shared component always carries --dashboard; the retired bespoke copy never did.
    navIsShared: !!(nav && nav.classList.contains('md-pillnav--dashboard')),
    labels: pills.map((p) => (p.textContent || '').trim().replace(/\s+/g, ' ')),
    current: current ? (current.textContent || '').trim().replace(/\s+/g, ' ') : null,
    currentTag: current ? current.tagName.toLowerCase() : null,
    currentAriaCurrent: current ? current.getAttribute('aria-current') : null
  };
});

async function hop(label) {
  const before = await survived();
  const pills = await page.$$('.md-pillnav__pill');
  let clicked = false;
  for (const el of pills) {
    const txt = await page.evaluate((e) => (e.textContent || '').trim(), el);
    if (new RegExp('^' + label, 'i').test(txt)) { await el.click(); clicked = true; break; }
  }
  if (!clicked) { console.log(`\n== ${label}: NO SUCH PILL (skipped)`); return null; }
  await new Promise((r) => setTimeout(r, 2600));
  const after = await survived();
  const s = await snapshot();
  const reloaded = before && !after;
  console.log(`\n== click "${label}" -> ${s.url}`);
  console.log(`   document reloaded: ${reloaded ? 'YES  <-- breaks SPA continuity' : 'no'}`);
  console.log(`   nav present: ${s.navPresent}   shared component: ${s.navIsShared}`);
  console.log(`   pills: ${s.labels.join(' | ')}`);
  console.log(`   current: ${s.current || '(none marked)'}  <${s.currentTag || '-'}> aria-current=${s.currentAriaCurrent || 'null'}`);
  if (!after) { await plant(); }
  return { label, ...s, reloaded };
}

await page.setViewport({ width: 1440, height: 900 });
await login(page, { BASE, USER, PASS });
await page.goto(`${BASE}/${USER}/home`, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await plant();
console.log('start:', JSON.stringify(await snapshot()));

const results = [];
for (const label of ['Caseload', 'Organizations', 'Boards', 'Extras', 'Updates', 'Home']) {
  const r = await hop(label);
  if (r) { results.push(r); }
}

console.log('\n=== SUMMARY ===');
const reloads = results.filter((r) => r.reloaded);
const lostNav = results.filter((r) => !r.navPresent);
const notShared = results.filter((r) => r.navPresent && !r.navIsShared);
const noCurrent = results.filter((r) => !r.current);
const noAria = results.filter((r) => r.current && !r.currentAriaCurrent);
console.log(`hops: ${results.length}`);
console.log(`document reloads: ${reloads.length} ${reloads.length ? '(' + reloads.map((r) => r.label).join(',') + ')' : ''}`);
console.log(`hops where the nav vanished: ${lostNav.length}`);
console.log(`hops rendering a NON-shared nav: ${notShared.length} ${notShared.map((r) => r.label).join(',')}`);
console.log(`hops with no pill marked current: ${noCurrent.length} ${noCurrent.map((r) => r.label).join(',')}`);
console.log(`hops whose current pill lacks aria-current: ${noAria.length} ${noAria.map((r) => r.label).join(',')}`);
await browser.close();
