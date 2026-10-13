/*
 * IS THE PILL NAV THE HOME SECTION'S NAV, OR THE WHOLE APP'S?
 *
 * Requested 2026-09-21: the pill nav is a sub-navigation of the Home destination, not global
 * chrome. It should render on Home and the destinations the pill nav itself offers, and be
 * absent on the account-section pages the RAIL owns (Account, Goals, Logs-from-the-rail,
 * Profile, Reports, Settings, Subscription, Supervising). Arriving at Updates from the pill
 * nav must leave the rail's HOME row lit, not its Logs row -- that arrival is still Home.
 *
 * A unit test cannot answer any of this. `activeRow` is one half of the highlight; the other
 * half is <LinkTo>'s own class, and the two disagreeing is the exact defect
 * learnings-archive/2026-09.md records for 2026-09-21 ("A nav can announce one thing and
 * highlight another, and only a browser will tell you"). So this reads the RENDERED page:
 * which row carries `.is-active`, which carries `aria-current`, and whether the nav is there.
 *
 * It also records the vertical metrics, because hiding the nav changes them: the shell's
 * 112px top padding (app.scss, `.ll-appshell .md-shell`) exists ONLY to clear the floating
 * nav, so on a page with no nav it would be clearance against nothing.
 *
 *   node scripts/home-section-nav-qa.mjs --user marcus_williams_slp --pass 'demo2025!'
 */
/* eslint-env node */
import { cliArgs, launch, login } from './qa-helpers.mjs';

const args = cliArgs(process.argv);
const BASE = args.BASE;
const USER = args.USER;
const { browser, page } = await launch(args);

/* The two groups this change is about, kept apart on purpose: the first is what the pill nav
   offers (it must KEEP the nav), the second is what the rail owns (it must LOSE it). */
const HOME_SECTION = [
  ['home', '/'],
  ['caseload', '/caseload'],
  ['boards', '/USER/boards'],
  ['extras', '/USER/extras'],
  ['updates (from the pill)', '/USER/logs?type=note&nav=home']
];
const ACCOUNT_SECTION = [
  ['account', '/USER'],
  ['logs (from the rail)', '/USER/logs'],
  ['goals', '/USER/goals'],
  ['reports', '/USER/stats'],
  ['settings', '/USER/preferences']
];

const probe = () => page.evaluate(() => {
  const vis = (el) => {
    if (!el) { return false; }
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getBoundingClientRect().height > 0;
  };
  const text = (el) => (el ? (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28) : null);
  const nav = document.querySelector('.md-pillnav');
  const rail = document.querySelector('.md-acct-rail');
  const shell = document.querySelector('.ll-appshell .md-shell');
  const homenav = document.querySelector('.md-workspace--homenav');
  const activePill = document.querySelector('.md-pillnav__pill.is-active');
  return {
    url: location.pathname + location.search,
    navPresent: vis(nav),
    navLabels: nav ? Array.from(nav.querySelectorAll('.md-pillnav__pill')).map((p) => text(p)) : [],
    activePill: text(activePill),
    railPresent: vis(rail),
    // WHAT THE USER SEES lit, and what a screen reader is told. Read separately so the two
    // can be compared rather than assumed equal.
    railActive: text(document.querySelector('.md-acct-rail__row.is-active')),
    railAriaCurrent: text(document.querySelector('.md-acct-rail__row[aria-current="page"]')),
    shellPaddingTop: shell ? getComputedStyle(shell).paddingTop : null,
    shellTop: shell ? Math.round(shell.getBoundingClientRect().top) : null,
    // The first thing the page actually draws inside the shell: what the padding is FOR.
    firstContentTop: shell && shell.firstElementChild
      ? Math.round(shell.firstElementChild.getBoundingClientRect().top) : null,
    homenavPaddingTop: homenav ? getComputedStyle(homenav).paddingTop : null,
    /* `.md-main` is what the homenav padding actually moves: it sits INSIDE `.md-workspace`,
       so `firstContentTop` above (the shell's own first child) cannot see it. Compared across
       the two logs arrivals it says whether the 64px is still needed or is now double-counted
       on top of the shell's nav clearance. */
    mainTop: document.querySelector('.md-main')
      ? Math.round(document.querySelector('.md-main').getBoundingClientRect().top) : null
  };
});

async function visit(label, path, userName) {
  const url = BASE + path.replace('USER', userName);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  // The chrome is rendered by the application controller, so it is present as soon as the
  // route settles; a missing rail after this wait is a real absence, not a race.
  await page.waitForSelector('.ll-appshell', { timeout: 20000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 900));
  const res = await probe();
  return { label, ...res };
}

await login(page, args);
// The signed-in user's own `user_name`, so the `user.*` paths address the right person.
const userName = await page.evaluate(() => {
  const link = document.querySelector('.md-acct-rail__row[href*="/"]');
  const m = link && link.getAttribute('href').match(/^\/([^/?]+)/);
  return m ? m[1] : null;
});
const name = userName || USER;

const rows = [];
for (const [label, path] of HOME_SECTION) { rows.push(await visit('HOME  ' + label, path, name)); }
for (const [label, path] of ACCOUNT_SECTION) { rows.push(await visit('ACCT  ' + label, path, name)); }

console.log('user_name: ' + name + '\n');
for (const r of rows) {
  console.log(r.label.padEnd(26) + r.url);
  console.log('    nav: ' + (r.navPresent ? 'SHOWN active=' + r.activePill : 'absent') +
    '   rail: ' + (r.railPresent ? 'shown' : 'ABSENT') +
    '   lit=' + r.railActive + '   aria=' + r.railAriaCurrent);
  console.log('    shell top=' + r.shellTop + ' pad=' + r.shellPaddingTop +
    ' firstContent=' + r.firstContentTop + ' main=' + r.mainTop +
    (r.homenavPaddingTop ? '   homenav pad=' + r.homenavPaddingTop : ''));
}
console.log('\npill labels: ' + JSON.stringify(rows[0].navLabels));

/* THE UPDATES ROUND TRIP. Reading the Updates list and opening one of them is the most likely
   thing to do on that page, and `user.log` is a SIBLING route (router.js:142), so the query
   param that records the arrival is dropped unless something carries it. If it is not carried,
   the whole nav unmounts on that click and the page jumps by the clearance difference -- and
   again, in reverse, on Back. Clicked rather than deep-linked, because a deep link cannot show
   what the click does to a nav that is supposed to persist. */
console.log('\n--- Updates round trip (click, not deep link) ---');
await page.goto(BASE + '/' + name + '/logs?type=note&nav=home', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 900));
const listState = await probe();
const entry = await page.$('a[href*="/logs/"]');
if (!entry) {
  console.log('  no log entry to open (this account has no notes) -- round trip not exercised');
} else {
  await entry.click();
  await new Promise((r) => setTimeout(r, 1500));
  const detail = await probe();
  await page.goBack({ waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1200));
  const back = await probe();
  for (const [label, r] of [['list  ', listState], ['detail', detail], ['back  ', back]]) {
    console.log('  ' + label + ' ' + r.url);
    console.log('         nav: ' + (r.navPresent ? 'SHOWN active=' + r.activePill : 'absent') +
      '   lit=' + r.railActive + '   shell pad=' + r.shellPaddingTop + '   main=' + r.mainTop);
  }
}

await browser.close();
