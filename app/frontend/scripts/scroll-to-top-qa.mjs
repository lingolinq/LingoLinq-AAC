/*
 * Does the app actually scroll to the top on every in-app navigation?
 *
 * routes/application.js:179 guards its scroll-to-top with `skip_scroll_to_top`, an
 * appState flag that NO code anywhere has ever set to true (verified over all git
 * history). So the guard is inert and the scroll should always run. Before deleting the
 * dead guard we want observed evidence, not just a read of the source.
 *
 * Measures BOTH scrollers: window and #content (the app's inner scroll container).
 * Navigation is always by CLICKING a real link -- a page.goto() between steps destroys
 * controller state and would prove nothing about in-app transitions.
 *
 *   node scripts/scroll-to-top-qa.mjs --user lingolinq_admin --pass 'admin2025!'
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const args = cliArgs(process.argv);
const BASE = args.arg('--base', 'http://localhost:8184');
const USER = args.arg('--user', 'lingolinq_admin');
const PASS = args.arg('--pass', 'admin2025!');
const { browser, page } = await launch(args);

/* The app does not use one fixed scroller: some routes scroll the window, some scroll
   #content, some scroll an inner workspace div. Assuming #content produced two
   inconclusive steps on the first run, so DISCOVER the real scroller instead: every
   element that actually overflows, plus the window. */
const readScroll = () => page.evaluate(() => {
  const c = document.getElementById('content');
  let maxOther = 0, maxOtherSel = null;
  document.querySelectorAll('div,main,section').forEach((el) => {
    if (el.id === 'content') { return; }
    if (el.scrollHeight - el.clientHeight > 40 && el.scrollTop > maxOther) {
      maxOther = el.scrollTop;
      maxOtherSel = el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(/\s+/)[0] : '');
    }
  });
  return {
    win: Math.round(window.scrollY || document.documentElement.scrollTop || 0),
    content: c ? Math.round(c.scrollTop) : null,
    other: Math.round(maxOther),
    otherSel: maxOtherSel,
    route: (window.location.pathname || '')
  };
});

// Push the window, #content, and every overflowing inner element to the bottom.
const scrollDown = () => page.evaluate(() => {
  window.scrollTo(0, 100000);
  const c = document.getElementById('content');
  if (c) { c.scrollTop = 100000; }
  document.querySelectorAll('div,main,section').forEach((el) => {
    if (el.scrollHeight - el.clientHeight > 40) { el.scrollTop = 100000; }
  });
  return null;
});

const results = [];
function record(step, before, after) {
  const moved = (before.win > 20 || (before.content || 0) > 20 || (before.other || 0) > 20);
  const reset = after.win <= 5 && (after.content === null || after.content <= 5) && (after.other || 0) <= 5;
  results.push({ step, before, after, scrollable: moved, resetToTop: reset });
  const verdict = !moved ? 'NOT-SCROLLABLE (inconclusive)' : (reset ? 'RESET-TO-TOP' : 'DID NOT RESET');
  console.log(`${step}\n    before win=${before.win} content=${before.content} other=${before.other}${before.otherSel ? '(' + before.otherSel + ')' : ''} | after win=${after.win} content=${after.content} other=${after.other}  => ${verdict}`);
}

await page.setViewport({ width: 1280, height: 560 });
await login(page, { BASE, USER, PASS });
const u = USER;

// Land on a long page.
await page.goto(`${BASE}/${u}/logs`, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise(r => setTimeout(r, 2500));

async function clickAndMeasure(label, selector) {
  await scrollDown();
  await new Promise(r => setTimeout(r, 400));
  const before = await readScroll();
  const el = await page.$(selector);
  if (!el) { console.log(`${label}\n    SKIPPED - selector not found: ${selector}`); return; }
  await el.click();
  await new Promise(r => setTimeout(r, 2000));
  const after = await readScroll();
  record(label, before, after);
}

// 1. In-page filter link (same route, query-param change).
await clickAndMeasure('1. Logs -> "Show Only Messages" (same route, QP change)',
  'a[href*="type=note"]');

// 2. Cross-route nav via the account rail.
await clickAndMeasure('2. Logs -> another account page (cross-route)',
  '.ll-acct-rail a, .md-acct-rail a, nav a[href*="/badges"], a[href*="/badges"]');

// 3. Nav to a third page to confirm it is not a one-off.
await clickAndMeasure('3. -> a further account page (cross-route)',
  'a[href*="/goals"], a[href*="/stats"]');

console.log('\n=== SUMMARY ===');
const conclusive = results.filter(r => r.scrollable);
console.log(`steps run: ${results.length}, conclusive (page was actually scrolled): ${conclusive.length}`);
console.log(`reset to top: ${conclusive.filter(r => r.resetToTop).length} / ${conclusive.length}`);
if (conclusive.length && conclusive.every(r => r.resetToTop)) {
  console.log('VERDICT: every conclusive in-app navigation reset the page to the top.');
} else if (!conclusive.length) {
  console.log('VERDICT: INCONCLUSIVE - no step managed to scroll the page first.');
} else {
  console.log('VERDICT: at least one navigation did NOT reset to top.');
}
await browser.close();
