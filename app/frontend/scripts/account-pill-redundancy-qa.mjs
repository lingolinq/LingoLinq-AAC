/*
 * Is the Account PILL redundant with the account RAIL on the modern home page?
 *
 * The dashboard gates its Account pill on
 *   showAccountPill = !supporter_role && effectiveLayout !== 'focused'
 * (components/dashboard/authenticated-view.js:134-136), while the shared nav gates its
 * own on a plain `{{#unless supporter_role}}` (components/user-pill-nav.hbs:65). So a
 * communicator is expected to SEE the pill on the dashboard in Gentle view and NOT in
 * Focused view -- while the rail, which carries its own Account row, renders on the home
 * tab in both. This reports what is actually on screen.
 *
 * Layout is switched by driving the real view switcher, because window.app_state does
 * not exist (the comment in services/app-state.js claiming an initializer sets it is
 * stale).
 *
 *   node scripts/account-pill-redundancy-qa.mjs --user luna_garcia --pass 'demo2025!'
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const args = cliArgs(process.argv);
const BASE = args.arg('--base', 'http://localhost:8184');
const USER = args.arg('--user', 'luna_garcia');
const PASS = args.arg('--pass', 'demo2025!');
const { browser, page } = await launch(args);

const probe = () => page.evaluate(() => {
  const vis = (el) => {
    if (!el) { return false; }
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getBoundingClientRect().height > 0;
  };
  const railRows = Array.from(document.querySelectorAll('.md-acct-rail__row'))
    .filter(vis)
    .map((el) => (el.textContent || '').trim().replace(/\s+/g, ' '));
  const pills = Array.from(document.querySelectorAll('.md-pillnav__pill'))
    .filter(vis)
    .map((el) => (el.textContent || '').trim().replace(/\s+/g, ' '));
  return {
    url: location.pathname + location.search,
    focused: document.body.classList.contains('ll-layout-focused'),
    railPresent: vis(document.querySelector('.md-acct-rail')),
    railHasAccount: railRows.some((t) => /^Account$/i.test(t)),
    railRows,
    pillRowPresent: vis(document.querySelector('.md-pillnav')),
    accountPillPresent: vis(document.querySelector('.md-pillnav__pill--account')),
    navbarAccountLink: (function() {
      // EXCLUDE the pill itself -- it is also an <a href=".../account">, so a naive
      // selector counts it and makes the navbar look like a fallback when it is not.
      const links = Array.from(document.querySelectorAll('a[href$="/account"]'))
        .filter((a) => !a.closest('.md-pillnav') && !a.closest('.md-pillnav-dropdown'));
      const shown = links.filter(vis);
      return {
        inDom: links.length,
        visible: shown.length,
        where: shown.map((a) => (a.className || a.parentElement.className || 'unknown').toString().slice(0, 40))
      };
    })(),
    pills
  };
});

function report(label, r) {
  console.log(`\n--- ${label} ---`);
  console.log(`  url=${r.url}  body.ll-layout-focused=${r.focused}`);
  console.log(`  RAIL present=${r.railPresent}  has Account row=${r.railHasAccount}`);
  console.log(`  PILL ROW present=${r.pillRowPresent}  Account PILL present=${r.accountPillPresent}`);
  console.log(`  pills: ${r.pills.join(' | ') || '(none)'}`);
  console.log(`  navbar Account link: inDom=${r.navbarAccountLink.inDom} visible=${r.navbarAccountLink.visible} ${r.navbarAccountLink.where.join(' / ')}`);
  if (r.railPresent) { console.log(`  rail: ${r.railRows.join(' | ')}`); }
  if (r.railHasAccount && r.accountPillPresent) {
    console.log('  >> BOTH an Account rail row AND an Account pill are on screen (redundant).');
  }
}

async function setLayout(style) {
  const trigger = await page.$('.ll-viewswitch__trigger');
  if (!trigger) { console.log(`  (no view switcher found; cannot select ${style})`); return false; }
  await trigger.click();
  await new Promise((r) => setTimeout(r, 700));
  const picked = await page.evaluate((want) => {
    const items = Array.from(document.querySelectorAll('button, a, [role="option"], [role="menuitem"]'));
    const hit = items.find((el) => new RegExp(want, 'i').test((el.textContent || '').trim()));
    if (hit) { hit.click(); return (hit.textContent || '').trim(); }
    return null;
  }, style);
  await new Promise((r) => setTimeout(r, 2500));
  console.log(`  (view switcher -> ${picked || 'NOT FOUND'})`);
  return !!picked;
}

await page.setViewport({ width: 1440, height: 900 });
await login(page, { BASE, USER, PASS });

await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));
report('DASHBOARD ROOT "/" as it loads', await probe());

await setLayout('Gentle');
report('HOME in GENTLE view', await probe());

await setLayout('Focused');
report('HOME in FOCUSED view', await probe());

// A page that shows the shared nav and has NO rail.
await page.goto(`${BASE}/${USER}/boards`, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
report('BOARDS (shared nav, no rail expected)', await probe());


// A communicator with a home board is redirected off "/" on login entry
// (routes/index.js:131), so the dashboard is only reachable by IN-APP navigation.
// Click the Home pill from Boards and probe what the home page actually shows.
const homePill = await page.$$('.md-pillnav__pill');
for (const el of homePill) {
  const txt = (await page.evaluate((e) => (e.textContent || '').trim(), el));
  if (/^Home$/i.test(txt)) { await el.click(); break; }
}
await new Promise((r) => setTimeout(r, 3000));
report('HOME reached by clicking the Home pill (communicator)', await probe());

await setLayout('Gentle');
report('HOME in GENTLE view (communicator)', await probe());

await setLayout('Focused');
report('HOME in FOCUSED view (communicator)', await probe());


// The dashboard component ALSO renders on user.extras (templates/user/extras.hbs:13
// passes @initialActiveTab="extras"), where activeTab != "home" so the rail does NOT
// render. That is the page most at risk from removing the Account pill. It must be
// reached by CLICKING -- a direct goto hits the same home-board redirect.
await setLayout('Gentle');
const pills2 = await page.$$('.md-pillnav__pill');
for (const el of pills2) {
  const txt = await page.evaluate((e) => (e.textContent || '').trim(), el);
  if (/^Extras$/i.test(txt)) { await el.click(); break; }
}
await new Promise((r) => setTimeout(r, 3000));
report('EXTRAS via pill, GENTLE (dashboard nav, no rail expected)', await probe());

await browser.close();
